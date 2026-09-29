import { create } from 'zustand'
import type { JointVersion } from '../types/version'
import { db } from '../utils/db'
import { restoreJointVersion } from '../utils/versions'

interface VersionState {
  versions: JointVersion[]
  loading: boolean
  restoringId: string | null
  error: string[] | null
  successMessage: string | null
  loadVersions: (jointTypeId: string) => Promise<void>
  restoreVersion: (version: JointVersion) => Promise<boolean>
  clearMessages: () => void
}

export const useVersionStore = create<VersionState>((set, get) => ({
  versions: [],
  loading: false,
  restoringId: null,
  error: null,
  successMessage: null,

  loadVersions: async (jointTypeId) => {
    if (!jointTypeId) {
      set({ versions: [] })
      return
    }
    set({ loading: true })
    try {
      const versions = await db.jointVersions
        .where('jointTypeId')
        .equals(jointTypeId)
        .sortBy('versionNo')
      set({ versions: versions.reverse() })
    } finally {
      set({ loading: false })
    }
  },

  restoreVersion: async (version) => {
    set({ restoringId: version.id, error: null, successMessage: null })
    // 先在服务层完成引用完整性检查，再单事务整体替换；失败保持现状
    const issues = await restoreJointVersion(version)
    if (!issues.ok) {
      set({ restoringId: null, error: issues.reasons })
      return false
    }
    set({
      restoringId: null,
      successMessage: `已整体恢复到第 ${version.versionNo} 版（${formatVersionTime(version.createdAt)}），当前内容已替换。`,
    })
    return true
  },

  clearMessages: () => set({ error: null, successMessage: null }),
}))

export function formatVersionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
