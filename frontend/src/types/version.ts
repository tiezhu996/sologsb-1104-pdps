import type { DisassemblyStep } from './step'
import type { Diagram } from './diagram'
import type { Furniture } from './furniture'
import type { JointType } from './jointType'
import type { Member } from './member'

/**
 * 一个榫卯类型在某个封存时刻的完整资料快照。
 * 快照内的构件、步序、示意图与家具关系都只属于同一个榫卯类型，
 * 恢复时整体替换，避免分段修改互相污染。
 */
export interface JointSnapshot {
  joint: JointType
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  furniture: Furniture[]
}

/**
 * 榫卯类型的版本档案。版本记录一经写入不再被后续编辑改动，
 * 恢复操作只是把快照内容整体写回现行数据表。
 */
export interface JointVersion {
  id: string
  jointTypeId: string
  versionNo: number
  label: string
  createdAt: string
  snapshot: JointSnapshot
}

/** 恢复前引用完整性校验结果。 */
export interface IntegrityResult {
  ok: boolean
  /** 拒绝恢复的具体原因，面向操作人员逐条说明。 */
  errors: string[]
}
