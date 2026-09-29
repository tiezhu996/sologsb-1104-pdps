import { db } from './db'

export interface MortiseExport {
  exportedAt: string
  joints: unknown[]
  members: unknown[]
  steps: unknown[]
  diagrams: unknown[]
  furniture: unknown[]
  jointVersions?: unknown[]
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

export async function exportAllData(): Promise<void> {
  const [joints, members, steps, diagrams, furniture, jointVersions] = await Promise.all([
    db.joints.toArray(),
    db.members.toArray(),
    db.steps.toArray(),
    db.diagrams.toArray(),
    db.furniture.toArray(),
    db.jointVersions.toArray(),
  ])
  downloadJson(`榫卯图鉴-全部数据-${new Date().toISOString().slice(0, 10)}.json`, {
    exportedAt: new Date().toISOString(),
    joints,
    members,
    steps,
    diagrams,
    furniture,
    jointVersions,
  })
}

export async function exportJointData(jointTypeId: string, jointName: string): Promise<void> {
  // 每个集合都以 jointTypeId 严格过滤，保证其他类型（含其版本）绝不混入
  const [joint, members, steps, diagrams, furniture, jointVersions] = await Promise.all([
    db.joints.get(jointTypeId),
    db.members.where('jointTypeId').equals(jointTypeId).toArray(),
    db.steps.where('jointTypeId').equals(jointTypeId).toArray(),
    db.diagrams.where('jointTypeId').equals(jointTypeId).toArray(),
    db.furniture.where('jointTypeId').equals(jointTypeId).toArray(),
    db.jointVersions.where('jointTypeId').equals(jointTypeId).toArray(),
  ])
  const orderedVersions = jointVersions.sort((a, b) => a.versionNo - b.versionNo)
  downloadJson(`榫卯图鉴-${jointName}-${new Date().toISOString().slice(0, 10)}.json`, {
    exportedAt: new Date().toISOString(),
    jointTypeId,
    joints: joint ? [joint] : [],
    members,
    steps: steps.sort((a, b) => a.seq - b.seq),
    diagrams,
    furniture,
    jointVersions: orderedVersions,
  })
}
