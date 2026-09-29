import type { Diagram } from './diagram'
import type { Furniture } from './furniture'
import type { JointType } from './jointType'
import type { Member } from './member'
import type { DisassemblyStep } from './step'

/**
 * 类型详情的不可变版本档案：一次保存时把文字、构件、步序、
 * 示意图与家具关系整体快照下来，后续编辑只新增记录，不改动旧记录。
 */
export interface JointVersion {
  id: string
  jointTypeId: string
  versionNo: number
  createdAt: string
  note?: string
  joint: JointType
  members: Member[]
  steps: DisassemblyStep[]
  diagrams: Diagram[]
  furniture: Furniture[]
}
