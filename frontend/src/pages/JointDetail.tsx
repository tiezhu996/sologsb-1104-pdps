import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BlankPanel } from '../components/common/BlankPanel'
import { DifficultyTag } from '../components/common/DifficultyTag'
import { SizeField } from '../components/common/SizeField'
import { StepRail } from '../components/common/StepRail'
import { useStepOrder } from '../hooks/useStepOrder'
import { useDiagramStore } from '../stores/diagramStore'
import { useJointStore } from '../stores/jointStore'
import { useStepStore } from '../stores/stepStore'
import { useVersionStore } from '../stores/versionStore'
import type { JointVersion } from '../types/version'
import { checkTolerance, formatDimension } from '../utils/measure'
import { exportJointData, exportVersionData } from '../utils/export'
import { validateSnapshot, VersionIntegrityError } from '../utils/versionArchive'

export default function JointDetail() {
  const { id: idParam } = useParams()
  const id = idParam ?? ''
  const joints = useJointStore((state) => state.joints)
  const members = useJointStore((state) => state.members)
  const furniture = useJointStore((state) => state.furniture)
  const loading = useJointStore((state) => state.loading)
  const loadAll = useJointStore((state) => state.loadAll)
  const updateMemberDimensions = useJointStore((state) => state.updateMemberDimensions)
  const { steps, totalDurationSec, currentStepIndex, move, setCurrentStep } = useStepOrder(id)
  const versions = useVersionStore((state) => state.versions)
  const versionsLoading = useVersionStore((state) => state.loading)
  const loadVersions = useVersionStore((state) => state.loadVersions)
  const saveVersion = useVersionStore((state) => state.saveVersion)
  const restoreVersion = useVersionStore((state) => state.restoreVersion)

  const [versionNotice, setVersionNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [savingVersion, setSavingVersion] = useState(false)
  const [restoreCandidate, setRestoreCandidate] = useState<JointVersion | null>(null)
  const [restoreErrors, setRestoreErrors] = useState<string[]>([])
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (id) void loadVersions(id)
  }, [id, loadVersions])

  const handleSaveVersion = async () => {
    setSavingVersion(true)
    setVersionNotice(null)
    try {
      await saveVersion(id)
      setVersionNotice({
        kind: 'success',
        text: '已保存当前版本：文字、构件、步序、示意图与家具关系已整体封存，后续编辑不会改动旧记录。',
      })
    } catch {
      setVersionNotice({ kind: 'error', text: '版本保存失败，请重试；当前资料未受影响。' })
    } finally {
      setSavingVersion(false)
    }
  }

  const requestRestore = (version: JointVersion) => {
    const check = validateSnapshot(version.snapshot)
    setRestoreCandidate(version)
    setVersionNotice(null)
    if (check.ok) {
      setRestoreErrors([])
      setRestoreConfirmOpen(true)
    } else {
      setRestoreErrors(check.errors)
      setRestoreConfirmOpen(false)
    }
  }

  const cancelRestore = () => {
    setRestoreCandidate(null)
    setRestoreErrors([])
    setRestoreConfirmOpen(false)
  }

  const confirmRestore = async () => {
    if (!restoreCandidate) return
    setRestoring(true)
    setVersionNotice(null)
    try {
      await restoreVersion(restoreCandidate)
      await Promise.all([
        useJointStore.getState().loadAll(),
        useStepStore.getState().loadSteps(id),
        useDiagramStore.getState().loadDiagrams(id),
        loadVersions(id),
      ])
      setVersionNotice({ kind: 'success', text: `已整体替换为 v${restoreCandidate.versionNo} 的档案内容。` })
      cancelRestore()
    } catch (error) {
      if (error instanceof VersionIntegrityError) {
        setRestoreErrors(error.reasons)
        setRestoreConfirmOpen(false)
        setVersionNotice({ kind: 'error', text: '引用完整性校验未通过，已拒绝恢复并保持现状。' })
      } else {
        setVersionNotice({ kind: 'error', text: '写入失败，已保持现状，未改动任何记录。' })
      }
    } finally {
      setRestoring(false)
    }
  }

  const joint = joints.find((item) => item.id === id)
  const currentMembers = members
    .filter((member) => member.jointTypeId === id)
    .sort((a, b) => a.lengthMm - b.lengthMm)
  const currentFurniture = furniture.filter((item) => item.jointTypeId === id)

  if (!joint && !loading) {
    return (
      <div data-testid="detail-joint">
        <BlankPanel title="未找到这项榫卯" description="记录可能已被移除，请返回图鉴重新选择。" />
      </div>
    )
  }

  if (!joint) {
    return <div className="py-16 text-center text-sm text-stone-500" data-testid="detail-joint">正在读取木作数据…</div>
  }

  return (
    <div className="space-y-7" data-testid="detail-joint">
      <div>
        <Link to="/joints" className="inline-flex items-center gap-1.5 text-sm text-wood-700 hover:underline">
          <span aria-hidden="true">←</span> 返回图鉴总览
        </Link>
      </div>

      <section className="panel overflow-hidden">
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-start sm:p-8">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-wood-50" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-wood-100 bg-white px-3 py-1 text-xs text-wood-700">{joint.family}</span>
              <DifficultyTag difficulty={joint.difficulty} />
              <span className="text-xs text-stone-500">{joint.glueNeeded ? '建议配合胶合' : '可拆式干装'}</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-wood-900 sm:text-4xl">{joint.name} · 结构详情</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-600">{joint.strengthNote}</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            <Stat label="构件" value={currentMembers.length} unit="件" />
            <Stat label="步序" value={steps.length} unit="步" />
            <Stat label="演示" value={totalDurationSec} unit="秒" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-wood-100 bg-wood-50/60 px-6 py-4 sm:px-8">
          <Link className="primary-button" to={`/joints/${joint.id}/steps`}>编排拆装步序</Link>
          <Link className="secondary-button" to={`/joints/${joint.id}/diagram`}>进入示意图绘制台</Link>
          <button type="button" className="secondary-button" onClick={() => void exportJointData(joint.id, joint.name)}>导出当前类型</button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-wood-900">构件尺寸与公差</h2>
            <p className="mt-1 text-sm text-stone-500">按短料优先排列，可直接在毫米与寸之间切换录入。</p>
          </div>
          <span className="text-xs text-stone-500">基准间隙 0.20 mm，允许偏离 ±0.12 mm</span>
        </div>
        {currentMembers.length === 0 ? (
          <BlankPanel title="尚无构件记录" description="当前类型的构件尺寸仍待补充。" />
        ) : (
          <div className="panel overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
              <thead className="bg-wood-50 text-xs text-wood-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">构件</th>
                  <th className="px-4 py-3 font-semibold">归属</th>
                  <th className="px-4 py-3 font-semibold">纹理</th>
                  <th className="px-4 py-3 font-semibold">长</th>
                  <th className="px-4 py-3 font-semibold">宽</th>
                  <th className="px-4 py-3 font-semibold">厚</th>
                  <th className="px-4 py-3 font-semibold">配合校验</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {currentMembers.map((member) => {
                  const tolerance = checkTolerance(member.toleranceMm, 0.2, 0.12)
                  return (
                    <tr key={member.id} className="align-top">
                      <td className="px-4 py-4">
                        <strong className="block text-stone-900">{member.name}</strong>
                        <span className="mt-1 block max-w-52 text-xs leading-5 text-stone-500">{member.note}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-stone-600">{member.part}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-stone-600">{member.grainDir}</td>
                      <td className="w-32 px-3 py-3">
                        <SizeField
                          label={`${member.name}长度`}
                          valueMm={member.lengthMm}
                          toleranceMm={member.toleranceMm}
                          onChange={(value) => void updateMemberDimensions(member.id, {
                            lengthMm: value,
                            widthMm: member.widthMm,
                            thicknessMm: member.thicknessMm,
                            toleranceMm: member.toleranceMm,
                          })}
                        />
                      </td>
                      <td className="w-32 px-3 py-3">
                        <SizeField
                          label={`${member.name}宽度`}
                          valueMm={member.widthMm}
                          toleranceMm={member.toleranceMm}
                          onChange={(value) => void updateMemberDimensions(member.id, {
                            lengthMm: member.lengthMm,
                            widthMm: value,
                            thicknessMm: member.thicknessMm,
                            toleranceMm: member.toleranceMm,
                          })}
                        />
                      </td>
                      <td className="w-32 px-3 py-3">
                        <SizeField
                          label={`${member.name}厚度`}
                          valueMm={member.thicknessMm}
                          toleranceMm={member.toleranceMm}
                          onChange={(value) => void updateMemberDimensions(member.id, {
                            lengthMm: member.lengthMm,
                            widthMm: member.widthMm,
                            thicknessMm: value,
                            toleranceMm: member.toleranceMm,
                          })}
                        />
                      </td>
                      <td className="w-52 px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          tolerance.withinTolerance
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}>
                          {tolerance.withinTolerance ? '配合合适' : '需要修配'}
                        </span>
                        <p className="mt-2 text-xs leading-5 text-stone-500">{tolerance.message}</p>
                        <p className="mt-1 text-[11px] text-stone-400">登记公差 {formatDimension(member.toleranceMm, 'mm', 2)}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-5 sm:p-6" data-testid="version-archive">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-wood-900">版本档案</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
              保存时把当前文字、构件、步序、示意图与家具关系整体封存；恢复前先校验引用完整性，缺构件、缺步骤图或步序重复都会说明原因并拒绝，检查通过才整体替换，写入失败保持现状。
            </p>
          </div>
          <button type="button" className="primary-button" disabled={savingVersion} onClick={() => void handleSaveVersion()}>
            {savingVersion ? '保存中…' : '保存当前版本'}
          </button>
        </div>

        {versionNotice ? (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              versionNotice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
            role="status"
          >
            {versionNotice.text}
          </div>
        ) : null}

        {versionsLoading && versions.length === 0 ? (
          <p className="mt-5 text-sm text-stone-500">正在读取版本档案…</p>
        ) : versions.length === 0 ? (
          <div className="mt-5">
            <BlankPanel title="暂无版本档案" description="点击「保存当前版本」封存第一版资料；升级前的旧记录会在打开时自动补建首次版本。" />
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {versions.map((version) => {
              const snapshot = version.snapshot
              const counts = [
                `构件 ${snapshot.members.length}`,
                `步序 ${snapshot.steps.length}`,
                `示意图 ${snapshot.diagrams.length}`,
                `家具 ${snapshot.furniture.length}`,
              ]
              const isCandidate = restoreCandidate?.id === version.id
              return (
                <li key={version.id} className="rounded-xl border border-wood-100 bg-white px-4 py-4" data-testid="version-row">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wood-700 text-sm font-bold text-white">
                      v{version.versionNo}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-wood-900">{version.label}</p>
                      <p className="text-xs text-stone-500">{new Date(version.createdAt).toLocaleString('zh-CN')} 封存</p>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <button type="button" className="secondary-button" onClick={() => void exportVersionData(version)}>
                        导出此版本
                      </button>
                      <button type="button" className="primary-button" onClick={() => requestRestore(version)}>
                        恢复此版本
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                    {counts.map((count) => (
                      <span key={count} className="rounded-full bg-wood-50 px-2.5 py-1 text-wood-700">{count}</span>
                    ))}
                  </div>

                  {isCandidate && restoreErrors.length > 0 ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3" data-testid="version-restore-errors">
                      <p className="text-sm font-semibold text-rose-800">引用完整性校验未通过，已拒绝恢复并保持现状：</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-rose-700">
                        {restoreErrors.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <div className="mt-3 flex justify-end">
                        <button type="button" className="secondary-button" onClick={cancelRestore}>知道了</button>
                      </div>
                    </div>
                  ) : null}

                  {isCandidate && restoreConfirmOpen ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" data-testid="version-restore-confirm">
                      <p className="text-sm font-semibold text-amber-900">确认恢复到 v{version.versionNo}？</p>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        将用该版本封存的内容整体替换当前类型的文字、构件、步序、示意图与家具关系；当前未封存的改动会被覆盖。写入失败将保持现状，不会改动任何记录。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="primary-button" disabled={restoring} onClick={() => void confirmRestore()}>
                          {restoring ? '恢复中…' : '确认整体替换'}
                        </button>
                        <button type="button" className="secondary-button" disabled={restoring} onClick={cancelRestore}>取消</button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-wood-900">适用家具</h2>
            <p className="mt-1 text-sm text-stone-500">反查该榫卯在实际家具中的位置与承力作用。</p>
          </div>
          {currentFurniture.length === 0 ? (
            <BlankPanel title="尚未关联家具" description="可在家具反查页登记使用部位。" />
          ) : (
            <div className="space-y-3">
              {currentFurniture.map((item) => (
                <article key={item.id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-wood-900">{item.name}</h3>
                    <span className="rounded-full bg-wood-50 px-2.5 py-1 text-xs text-wood-700">{item.era}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-stone-700">{item.position}</p>
                  <p className="mt-2 text-xs leading-5 text-stone-500">{item.loadNote}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-wood-900">拆装步序</h2>
              <p className="mt-1 text-sm text-stone-500">点击步骤查看风险提醒，也可直接拖动调整顺序。</p>
            </div>
            <span className="text-xs text-wood-700">共 {totalDurationSec} 秒</span>
          </div>
          {steps.length === 0 ? (
            <BlankPanel title="尚无拆装步骤" description="进入步序编排页补充拆装动作。" />
          ) : (
            <StepRail steps={steps} currentIndex={currentStepIndex} onSelect={setCurrentStep} onMove={(from, to) => void move(from, to)} />
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl border border-wood-100 bg-white/90 px-3 py-3 text-center shadow-sm">
      <strong className="block text-xl text-wood-700">{value}</strong>
      <span className="mt-1 block text-[11px] text-stone-500">{label} · {unit}</span>
    </div>
  )
}
