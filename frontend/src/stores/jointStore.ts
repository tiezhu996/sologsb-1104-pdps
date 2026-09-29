import { create } from 'zustand'
import type { Furniture, FurnitureName } from '../types/furniture'
import type { JointType } from '../types/jointType'
import type { Member } from '../types/member'
import { db, ensureSeedData } from '../utils/db'
import { ensureInitialVersions, saveWithVersion, scheduleJointVersion } from '../utils/versions'

export type JointDraft = Omit<JointType, 'id' | 'schemaRev'>
export type FurnitureDraft = Omit<Furniture, 'id' | 'schemaRev'>

interface JointState {
  joints: JointType[]
  members: Member[]
  furniture: Furniture[]
  stepCounts: Record<string, number>
  selectedJointId: string | null
  loading: boolean
  loadAll: () => Promise<void>
  addJoint: (draft: JointDraft) => Promise<JointType>
  addFurniture: (draft: FurnitureDraft) => Promise<Furniture>
  setSelectedJoint: (id: string) => void
  updateMemberDimensions: (
    memberId: string,
    dimensions: Pick<Member, 'lengthMm' | 'widthMm' | 'thicknessMm' | 'toleranceMm'>,
  ) => Promise<void>
  renameMember: (memberId: string, name: Member['name']) => Promise<void>
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useJointStore = create<JointState>((set, get) => ({
  joints: [],
  members: [],
  furniture: [],
  stepCounts: {},
  selectedJointId: null,
  loading: false,

  loadAll: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      await ensureSeedData()
      await ensureInitialVersions()
      const [joints, members, furniture, steps] = await Promise.all([
        db.joints.toArray(),
        db.members.toArray(),
        db.furniture.toArray(),
        db.steps.toArray(),
      ])
      const stepCounts = steps.reduce<Record<string, number>>((counts, step) => {
        counts[step.jointTypeId] = (counts[step.jointTypeId] ?? 0) + 1
        return counts
      }, {})
      const selectedJointId = get().selectedJointId
      set({
        joints: joints.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
        members,
        furniture,
        stepCounts,
        selectedJointId: selectedJointId && joints.some((joint) => joint.id === selectedJointId)
          ? selectedJointId
          : joints[0]?.id ?? null,
      })
    } finally {
      set({ loading: false })
    }
  },

  addJoint: async (draft) => {
    const joint: JointType = { ...draft, id: createId('joint'), schemaRev: 2 }
    // 新建类型时在同一事务内写入主记录与首次版本档案
    await saveWithVersion(joint.id, async () => {
      await db.joints.add(joint)
    }, '新建类型，首次版本')
    set((state) => ({
      joints: [...state.joints, joint].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      selectedJointId: joint.id,
      stepCounts: { ...state.stepCounts, [joint.id]: 0 },
    }))
    return joint
  },

  addFurniture: async (draft) => {
    const furniture: Furniture = { ...draft, id: createId('furniture'), schemaRev: 2 }
    // 家具关系属于类型资料，保存时整体记入版本，旧版本不变
    await saveWithVersion(furniture.jointTypeId, async () => {
      await db.furniture.add(furniture)
    }, '登记家具关联')
    set((state) => ({ furniture: [...state.furniture, furniture] }))
    return furniture
  },

  setSelectedJoint: (id) => set({ selectedJointId: id }),

  updateMemberDimensions: async (memberId, dimensions) => {
    const previous = await db.members.get(memberId)
    await db.members.update(memberId, dimensions)
    set((state) => ({
      members: state.members.map((member) => (
        member.id === memberId ? { ...member, ...dimensions } : member
      )),
    }))
    // 尺寸常被连续微调，停顿后合并落一条版本，避免每次按键都建档
    if (previous) scheduleJointVersion(previous.jointTypeId, '修改构件尺寸')
  },

  renameMember: async (memberId, name) => {
    const previous = await db.members.get(memberId)
    await db.members.update(memberId, { name })
    set((state) => ({
      members: state.members.map((member) => (
        member.id === memberId ? { ...member, name } : member
      )),
    }))
    if (previous) scheduleJointVersion(previous.jointTypeId, '修改构件名称')
  },
}))

export type { FurnitureName }
