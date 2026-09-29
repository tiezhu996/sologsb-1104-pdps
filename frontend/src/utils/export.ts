import type { JointVersion } from '../types/version'
import { db } from './db'

export interface MortiseExport {
  exportedAt: string
  joints: unknown[]
  members: unknown[]
  steps: unknown[]
  diagrams: unknown[]
  furniture: unknown[]
  versions: unknown[]
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, payload: unknown): void {
  downloadText(filename, JSON.stringify(payload, null, 2))
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function exportAllData(): Promise<void> {
  const [joints, members, steps, diagrams, furniture, versions] = await Promise.all([
    db.joints.toArray(),
    db.members.toArray(),
    db.steps.toArray(),
    db.diagrams.toArray(),
    db.furniture.toArray(),
    db.versions.toArray(),
  ])
  downloadJson(`榫卯图鉴-全部数据-${dateStamp()}.json`, {
    exportedAt: new Date().toISOString(),
    joints,
    members,
    steps,
    diagrams,
    furniture,
    versions,
  })
}

export async function exportJointData(jointTypeId: string, jointName: string): Promise<void> {
  // 单类资料严格按 jointTypeId 过滤，版本档案也只取本类型的，其他类型不能混入。
  const [joint, members, steps, diagrams, furniture, versions] = await Promise.all([
    db.joints.get(jointTypeId),
    db.members.where('jointTypeId').equals(jointTypeId).toArray(),
    db.steps.where('jointTypeId').equals(jointTypeId).toArray(),
    db.diagrams.where('jointTypeId').equals(jointTypeId).toArray(),
    db.furniture.where('jointTypeId').equals(jointTypeId).toArray(),
    db.versions.where('jointTypeId').equals(jointTypeId).toArray(),
  ])
  downloadJson(`榫卯图鉴-${jointName}-${dateStamp()}.json`, {
    exportedAt: new Date().toISOString(),
    joints: joint ? [joint] : [],
    members,
    steps,
    diagrams,
    furniture,
    versions,
  })
}

/** 导出某一个版本档案：自带版本号与封存快照，快照只含该类型资料。 */
export async function exportVersionData(version: JointVersion): Promise<void> {
  const joint = version.snapshot.joint
  downloadJson(`榫卯图鉴-${joint.name}-v${version.versionNo}-${dateStamp()}.json`, {
    exportedAt: new Date().toISOString(),
    archiveKind: 'joint-version',
    version: {
      id: version.id,
      jointTypeId: version.jointTypeId,
      versionNo: version.versionNo,
      label: version.label,
      createdAt: version.createdAt,
    },
    joints: [joint],
    members: version.snapshot.members,
    steps: version.snapshot.steps,
    diagrams: version.snapshot.diagrams,
    furniture: version.snapshot.furniture,
  })
}
