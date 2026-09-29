import type { DisassemblyStep } from '../types/step'
import type { Diagram } from '../types/diagram'
import type { Furniture } from '../types/furniture'
import type { JointType } from '../types/jointType'
import type { IntegrityResult, JointSnapshot, JointVersion } from '../types/version'
import type { Member } from '../types/member'

export function createVersionId(): string {
  return `version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** 把类型文字、构件、步序、示意图与家具关系封存为同一份快照。 */
export function buildSnapshot(
  joint: JointType,
  members: Member[],
  steps: DisassemblyStep[],
  diagrams: Diagram[],
  furniture: Furniture[],
): JointSnapshot {
  return { joint, members, steps, diagrams, furniture }
}

export function formatVersionLabel(versionNo: number, createdAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${createdAt.getFullYear()}-${pad(createdAt.getMonth() + 1)}-${pad(createdAt.getDate())} `
    + `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`
  return `v${versionNo} · ${stamp}`
}

export function createVersionRecord(
  jointTypeId: string,
  versionNo: number,
  snapshot: JointSnapshot,
  options: { id?: string; label?: string; createdAt?: Date } = {},
): JointVersion {
  const createdAt = options.createdAt ?? new Date()
  return {
    id: options.id ?? createVersionId(),
    jointTypeId,
    versionNo,
    label: options.label?.trim() || formatVersionLabel(versionNo, createdAt),
    createdAt: createdAt.toISOString(),
    snapshot,
  }
}

/** 引用完整性校验未通过时抛出，携带逐条拒绝原因。 */
export class VersionIntegrityError extends Error {
  readonly reasons: string[]

  constructor(reasons: string[]) {
    super(reasons.join('；'))
    this.name = 'VersionIntegrityError'
    this.reasons = reasons
  }
}

/**
 * 恢复前的引用完整性校验。检查项：
 * 1. 快照主记录存在，且构件 / 步序 / 示意图 / 家具都只属于该类型（其他类型不能混入）；
 * 2. 示意图热区（hitAreas 与内联 SVG 的 data-member-id）引用的构件必须存在（缺构件则拒绝）；
 * 3. 每一步都必须绑定示意图，示意图绑定的步骤也必须存在（缺步骤图则拒绝）；
 * 4. 步序 seq 不得重复（步序重复则拒绝）。
 */
export function validateSnapshot(snapshot: JointSnapshot | undefined | null): IntegrityResult {
  const errors: string[] = []
  const joint = snapshot?.joint
  if (!snapshot || !joint?.id) {
    return { ok: false, errors: ['快照缺少榫卯类型主记录，无法恢复'] }
  }
  const jointId = joint.id

  const foreign: string[] = []
  for (const member of snapshot.members ?? []) {
    if (member.jointTypeId !== jointId) foreign.push(`构件「${member.name}」`)
  }
  for (const step of snapshot.steps ?? []) {
    if (step.jointTypeId !== jointId) foreign.push(`第 ${step.seq} 步`)
  }
  for (const diagram of snapshot.diagrams ?? []) {
    if (diagram.jointTypeId !== jointId) foreign.push(`示意图《${diagram.title}》`)
  }
  for (const item of snapshot.furniture ?? []) {
    if (item.jointTypeId !== jointId) foreign.push(`家具「${item.name}」`)
  }
  if (foreign.length > 0) {
    errors.push(`快照中混入了其他榫卯类型的记录：${foreign.join('、')}`)
  }

  if ((snapshot.members ?? []).length === 0) {
    errors.push('快照中没有任何构件记录，恢复会清空当前构件')
  }
  if ((snapshot.steps ?? []).length === 0) {
    errors.push('快照中没有任何步序记录，恢复会清空当前步序')
  }
  if ((snapshot.diagrams ?? []).length === 0) {
    errors.push('快照中没有任何示意图记录，恢复会清空当前示意图')
  }

  const memberIds = new Set((snapshot.members ?? []).map((member) => member.id))
  const stepIds = new Set((snapshot.steps ?? []).map((step) => step.id))

  for (const diagram of snapshot.diagrams ?? []) {
    const refs = new Set<string>()
    for (const area of diagram.hitAreas ?? []) {
      if (area.memberId) refs.add(area.memberId)
    }
    if (typeof DOMParser !== 'undefined' && diagram.svgMarkup) {
      try {
        const doc = new DOMParser().parseFromString(diagram.svgMarkup, 'image/svg+xml')
        doc.querySelectorAll('[data-member-id]').forEach((node) => {
          const ref = node.getAttribute('data-member-id')
          if (ref) refs.add(ref)
        })
      } catch {
        // SVG 源无法解析时以 hitAreas 为准
      }
    }
    for (const ref of refs) {
      if (!memberIds.has(ref)) {
        errors.push(`示意图《${diagram.title}》引用了快照中缺失的构件（${ref}）`)
      }
    }
    if (diagram.stepId && !stepIds.has(diagram.stepId)) {
      errors.push(`示意图《${diagram.title}》绑定了快照中不存在的步骤（${diagram.stepId}）`)
    }
  }

  const stepsWithDiagram = new Set((snapshot.diagrams ?? []).map((diagram) => diagram.stepId))
  for (const step of snapshot.steps ?? []) {
    if (!stepsWithDiagram.has(step.id)) {
      errors.push(`第 ${step.seq} 步（${step.action}·${step.direction}）缺少绑定的示意图`)
    }
  }

  const seqCounts = new Map<number, number>()
  for (const step of snapshot.steps ?? []) {
    seqCounts.set(step.seq, (seqCounts.get(step.seq) ?? 0) + 1)
  }
  for (const [seq, count] of seqCounts) {
    if (count > 1) errors.push(`步序 ${seq} 重复出现 ${count} 次`)
  }

  return { ok: errors.length === 0, errors }
}
