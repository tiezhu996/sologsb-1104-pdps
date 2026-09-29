import type { Table } from 'dexie'
import { db } from './db'
import type { Diagram } from '../types/diagram'
import type { Furniture } from '../types/furniture'
import type { JointType } from '../types/jointType'
import type { Member } from '../types/member'
import type { DisassemblyStep } from '../types/step'
import type { JointVersion } from '../types/version'

type AnyTable = Table<unknown, string>

export const LIVE_TABLES: AnyTable[] = [
  db.joints,
  db.members,
  db.steps,
  db.diagrams,
  db.furniture,
]
const ALL_TABLES: AnyTable[] = LIVE_TABLES.concat(db.jointVersions)

const pendingDebounces = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 1500

function createVersionId(jointTypeId: string, versionNo: number): string {
  return `version-${jointTypeId}-${String(versionNo).padStart(4, '0')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface JointSnapshotData {
  joint: JointType
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  furniture: Furniture[]
}

/**
 * 读取类型完整快照。必须在 rw 事务回调中调用，保证读到同事务内
 * 刚写入的数据，并与版本记录原子提交。
 */
async function readSnapshotInTransaction(jointTypeId: string): Promise<JointSnapshotData> {
  const [joint, members, steps, diagrams, furniture] = await Promise.all([
    db.joints.get(jointTypeId),
    db.members.where('jointTypeId').equals(jointTypeId).toArray(),
    db.steps.where('jointTypeId').equals(jointTypeId).sortBy('seq'),
    db.diagrams.where('jointTypeId').equals(jointTypeId).toArray(),
    db.furniture.where('jointTypeId').equals(jointTypeId).toArray(),
  ])
  if (!joint) {
    throw new Error(`类型 ${jointTypeId} 不存在，无法建立版本档案`)
  }
  return { joint, members, steps, diagrams, furniture }
}

/**
 * 在（已包含业务写入的）事务里追加一条只增不改的版本记录。
 * 版本号按该类型已有版本数顺延，旧版本永不改动。
 */
export async function appendJointVersion(jointTypeId: string, note?: string): Promise<JointVersion> {
  const snapshot = await readSnapshotInTransaction(jointTypeId)
  const existing = await db.jointVersions.where('jointTypeId').equals(jointTypeId).count()
  const version: JointVersion = {
    id: createVersionId(jointTypeId, existing + 1),
    jointTypeId,
    versionNo: existing + 1,
    createdAt: new Date().toISOString(),
    note,
    ...snapshot,
  }
  await db.jointVersions.add(version)
  return version
}

/**
 * 把业务写入和版本快照放进同一个读写事务：业务先改数据，随后读快照并
 * 追加版本。任一步失败整个事务回滚，现状不变。
 */
export async function saveWithVersion<T>(
  jointTypeId: string,
  mutate: () => Promise<T>,
  note?: string,
): Promise<T> {
  return db.transaction('rw', ALL_TABLES, async () => {
    const result = await mutate()
    await appendJointVersion(jointTypeId, note)
    return result
  })
}

/**
 * 连续录入（如逐毫米修改尺寸）时合并为一次版本：停止操作一小段时间后
 * 才真正落一条快照，避免每个按键都产生一条版本记录。
 */
export function scheduleJointVersion(jointTypeId: string, note = '编辑保存'): void {
  const pending = pendingDebounces.get(jointTypeId)
  if (pending) clearTimeout(pending)
  const timer = setTimeout(() => {
    pendingDebounces.delete(jointTypeId)
    void db.transaction('rw', ALL_TABLES, async () => {
      await appendJointVersion(jointTypeId, note)
    }).catch((error: unknown) => {
      console.error('版本档案写入失败', error)
    })
  }, DEBOUNCE_MS)
  pendingDebounces.set(jointTypeId, timer)
}

export interface SnapshotIssues {
  ok: boolean
  reasons: string[]
}

/** 从内联 SVG 中取出 data-member-id 引用，用于校验构件是否还存在。 */
function extractSvgMemberIds(markup: string): string[] {
  const ids = new Set<string>()
  const pattern = /data-member-id\s*=\s*["']([^"']+)["']/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(markup)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  return Array.from(ids)
}

/**
 * 恢复前的引用完整性检查。出现下列任一情况即拒绝恢复并说明原因：
 * - 缺构件：热区或 SVG 源引用的构件已不存在
 * - 缺步骤图：示意图绑定的步序已不存在
 * - 步序重复：同一类型出现相同 seq
 * 另对跨类型混入、主键重复等脏数据一并拦截。
 */
export function validateSnapshot(version: JointVersion): SnapshotIssues {
  const reasons: string[] = []
  const expectedJointId = version.jointTypeId

  if (!version.joint || version.joint.id !== expectedJointId) {
    reasons.push(`缺少类型主记录：版本 ${version.versionNo} 未包含对应的榫卯类型文字`)
  }

  for (const member of version.members) {
    if (member.jointTypeId !== expectedJointId) {
      reasons.push(`构件「${member.name}」不属于当前类型，疑似其他类型资料混入`)
    }
  }
  for (const step of version.steps) {
    if (step.jointTypeId !== expectedJointId) {
      reasons.push(`第 ${step.seq} 步不属于当前类型，疑似其他类型资料混入`)
    }
  }
  for (const diagram of version.diagrams) {
    if (diagram.jointTypeId !== expectedJointId) {
      reasons.push(`示意图《${diagram.title}》不属于当前类型，疑似其他类型资料混入`)
    }
  }
  for (const item of version.furniture) {
    if (item.jointTypeId !== expectedJointId) {
      reasons.push(`家具关联「${item.name}」不属于当前类型，疑似其他类型资料混入`)
    }
  }

  const memberIds = new Set<string>()
  for (const member of version.members) {
    if (memberIds.has(member.id)) reasons.push(`构件主键重复：${member.id}`)
    memberIds.add(member.id)
  }
  const stepIds = new Set<string>()
  for (const step of version.steps) {
    if (stepIds.has(step.id)) reasons.push(`步序主键重复：${step.id}`)
    stepIds.add(step.id)
  }

  // 缺构件：示意图热区与内联 SVG 引用的构件必须仍在本版本构件清单中
  for (const diagram of version.diagrams) {
    const referenced = new Set<string>(diagram.hitAreas.map((area) => area.memberId))
    for (const memberId of extractSvgMemberIds(diagram.svgMarkup)) referenced.add(memberId)
    for (const memberId of referenced) {
      if (!memberIds.has(memberId)) {
        reasons.push(`缺构件：示意图《${diagram.title}》引用的构件 ${memberId} 在版本中不存在`)
      }
    }
    // 缺步骤图：示意图绑定的步骤必须仍在本版本步序中
    if (!stepIds.has(diagram.stepId)) {
      reasons.push(`缺步骤图：示意图《${diagram.title}》绑定的步序 ${diagram.stepId} 已不存在`)
    }
  }

  // 步序重复：同一类型不允许出现相同序号
  const seenSeq = new Map<number, number>()
  for (const step of version.steps) {
    const count = seenSeq.get(step.seq) ?? 0
    if (count === 1) reasons.push(`步序重复：第 ${step.seq} 步出现多条记录`)
    seenSeq.set(step.seq, count + 1)
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * 校验通过后，在单个读写事务内整体替换该类型的五张活表记录。
 * 版本档案表本身不参与写入：旧记录保持不变，恢复动作不产生伪版本。
 * 写入失败事务自动回滚，数据库维持现状。
 */
export async function restoreJointVersion(version: JointVersion): Promise<SnapshotIssues> {
  const issues = validateSnapshot(version)
  if (!issues.ok) return issues

  try {
    await db.transaction('rw', LIVE_TABLES, async () => {
      const jointTypeId = version.jointTypeId
      await db.furniture.where('jointTypeId').equals(jointTypeId).delete()
      await db.diagrams.where('jointTypeId').equals(jointTypeId).delete()
      await db.steps.where('jointTypeId').equals(jointTypeId).delete()
      await db.members.where('jointTypeId').equals(jointTypeId).delete()
      await db.joints.delete(jointTypeId)

      await db.joints.add(version.joint)
      if (version.members.length > 0) await db.members.bulkAdd(version.members)
      if (version.steps.length > 0) await db.steps.bulkAdd(version.steps)
      if (version.diagrams.length > 0) await db.diagrams.bulkAdd(version.diagrams)
      if (version.furniture.length > 0) await db.furniture.bulkAdd(version.furniture)
    })
    return { ok: true, reasons: [] }
  } catch (error) {
    console.error('恢复版本失败，已保持现状', error)
    return {
      ok: false,
      reasons: [`整体替换写入失败，数据库已保持现状：${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

/**
 * 旧库/手工数据兜底：若某类型没有任何版本记录，按当前内容自动补首次版本。
 * 通常由 Dexie version(3) 升级完成；这里覆盖升级后才出现的遗漏数据。
 */
let ensureRunning: Promise<void> | null = null

export async function ensureInitialVersions(): Promise<void> {
  if (ensureRunning) return ensureRunning
  ensureRunning = (async () => {
    await db.transaction('rw', ALL_TABLES, async () => {
      const joints = await db.joints.toArray()
      for (const joint of joints) {
        const count = await db.jointVersions.where('jointTypeId').equals(joint.id).count()
        if (count > 0) continue
        const snapshot = await readSnapshotInTransaction(joint.id)
        await db.jointVersions.add({
          id: createVersionId(joint.id, 1),
          jointTypeId: joint.id,
          versionNo: 1,
          createdAt: new Date().toISOString(),
          note: '打开旧记录时自动补首次版本',
          ...snapshot,
        })
      }
    })
  })().finally(() => {
    ensureRunning = null
  })
  return ensureRunning
}
