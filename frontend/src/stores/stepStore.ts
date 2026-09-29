import { create } from 'zustand'
import type { DisassemblyStep } from '../types/step'
import { db } from '../utils/db'
import { saveWithVersion } from '../utils/versions'

interface StepState {
  steps: DisassemblyStep[]
  currentStepIndex: number
  loading: boolean
  loadSteps: (jointTypeId: string) => Promise<void>
  moveStep: (from: number, to: number) => Promise<void>
  setCurrentStep: (index: number) => void
}

export const useStepStore = create<StepState>((set, get) => ({
  steps: [],
  currentStepIndex: 0,
  loading: false,

  loadSteps: async (jointTypeId) => {
    set({ loading: true })
    try {
      const steps = await db.steps.where('jointTypeId').equals(jointTypeId).sortBy('seq')
      set((state) => ({
        steps,
        currentStepIndex: Math.min(state.currentStepIndex, Math.max(0, steps.length - 1)),
      }))
    } finally {
      set({ loading: false })
    }
  },

  moveStep: async (from, to) => {
    const ordered = [...get().steps].sort((a, b) => a.seq - b.seq)
    if (from < 0 || to < 0 || from >= ordered.length || to >= ordered.length || from === to) return
    const [moved] = ordered.splice(from, 1)
    if (!moved) return
    ordered.splice(to, 0, moved)
    const resequenced = ordered.map((step, index) => ({ ...step, seq: index + 1 }))
    const jointTypeId = moved.jointTypeId
    // 调序与版本快照同事务：落库失败则整体回滚，前端状态也不改动
    await saveWithVersion(jointTypeId, async () => {
      await db.steps.bulkPut(resequenced)
    }, '调整拆装步序')
    set({ steps: resequenced, currentStepIndex: to })
  },

  setCurrentStep: (index) => set({
    currentStepIndex: Math.max(0, index),
  }),
}))
