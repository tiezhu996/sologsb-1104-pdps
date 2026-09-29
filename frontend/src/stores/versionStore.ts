import { create } from 'zustand'
import type { JointVersion } from '../types/version'
import { db } from '../utils/db'
import { buildSnapshot, createVersionRecord, VersionIntegrityError, validateSnapshot } from '../utils/versionArchive'

interface VersionState {
  versions: JointVersion[]
  loading: boolean
  loadVersions: (jointTypeId: string) => Promise<void>
  /** 把类型当前的文字、构件、步序、示意图与家具关系封存为一个新版本。 */
  saveVersion: (jointTypeId: string, note?: string) => Promise<JointVersion>
  /** 校验引用完整性后整体替换现行资料；校验不通过或写入失败都保持现状。 */
  restoreVersion: (version: JointVersion) => Promise<void>
}

export const useVersionStore = create<VersionState>((set, get) => ({
  versions: [],
  loading: false,

  loadVersions: async (jointTypeId) => {
    if (!jointTypeId) {
      set({ versions: [] })
      return
    }
    set({ loading: true })
    try {
      const versions = await db.versions.where('jointTypeId').equals(jointTypeId).sortBy('versionNo')
      set({ versions })
    } finally {
      set({ loading: false })
    }
  },

  saveVersion: async (jointTypeId, note) => {
    const [joint, members, steps, diagrams, furniture, existing] = await Promise.all([
      db.joints.get(jointTypeId),
      db.members.where('jointTypeId').equals(jointTypeId).toArray(),
      db.steps.where('jointTypeId').equals(jointTypeId).toArray(),
      db.diagrams.where('jointTypeId').equals(jointTypeId).toArray(),
      db.furniture.where('jointTypeId').equals(jointTypeId).toArray(),
      db.versions.where('jointTypeId').equals(jointTypeId).toArray(),
    ])
    if (!joint) throw new Error('榫卯类型不存在，无法保存版本')
    const versionNo = existing.reduce((max, item) => Math.max(max, item.versionNo), 0) + 1
    const snapshot = buildSnapshot(joint, members, steps, diagrams, furniture)
    const version = createVersionRecord(jointTypeId, versionNo, snapshot, { label: note })
    await db.versions.add(version)
    set({
      versions: [
        ...get().versions.filter((item) => item.jointTypeId !== jointTypeId),
        version,
      ].sort((a, b) => a.versionNo - b.versionNo),
    })
    return version
  },

  restoreVersion: async (version) => {
    const check = validateSnapshot(version.snapshot)
    if (!check.ok) throw new VersionIntegrityError(check.errors)

    const jointTypeId = version.jointTypeId
    try {
      await db.transaction('rw', [db.joints, db.members, db.steps, db.diagrams, db.furniture], async () => {
        await Promise.all([
          db.members.where('jointTypeId').equals(jointTypeId).delete(),
          db.steps.where('jointTypeId').equals(jointTypeId).delete(),
          db.diagrams.where('jointTypeId').equals(jointTypeId).delete(),
          db.furniture.where('jointTypeId').equals(jointTypeId).delete(),
        ])
        await db.joints.put(version.snapshot.joint)
        await db.members.bulkPut(version.snapshot.members)
        await db.steps.bulkPut(version.snapshot.steps)
        await db.diagrams.bulkPut(version.snapshot.diagrams)
        await db.furniture.bulkPut(version.snapshot.furniture)
      })
    } catch (error) {
      if (error instanceof VersionIntegrityError) throw error
      // 事务中止时 Dexie 已回滚，现行资料保持不变
      throw new Error(`写入失败，已保持现状：${error instanceof Error ? error.message : '未知错误'}`)
    }
  },
}))
