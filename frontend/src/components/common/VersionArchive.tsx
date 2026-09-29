import { useEffect, useState } from 'react'
import { useVersionStore, formatVersionTime } from '../../stores/versionStore'
import type { JointVersion } from '../../types/version'

interface VersionArchiveProps {
  jointId: string
  /** 恢复成功后回调，供页面重新拉取各活表数据 */
  onRestored: () => void
}

export function VersionArchive({ jointId, onRestored }: VersionArchiveProps) {
  const versions = useVersionStore((state) => state.versions)
  const loading = useVersionStore((state) => state.loading)
  const restoringId = useVersionStore((state) => state.restoringId)
  const error = useVersionStore((state) => state.error)
  const successMessage = useVersionStore((state) => state.successMessage)
  const loadVersions = useVersionStore((state) => state.loadVersions)
  const restoreVersion = useVersionStore((state) => state.restoreVersion)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    setExpandedId(null)
  }, [jointId])

  useEffect(() => {
    void loadVersions(jointId)
  }, [jointId, loadVersions])

  const handleRestore = async (version: JointVersion) => {
    const confirmed = window.confirm(
      `确定整体恢复到第 ${version.versionNo} 版吗？\n当前的文字、构件、步序、示意图与家具关系会被整版替换，旧版本记录保持不变。`,
    )
    if (!confirmed) return
    const ok = await restoreVersion(version)
    if (ok) {
      await loadVersions(jointId)
      onRestored()
    }
  }

  return (
    <section className="space-y-4" data-testid="version-archive">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-wood-900">版本档案</h2>
          <p className="mt-1 text-sm text-stone-500">
            每次保存都会整版记下文字、构件、步序、示意图与家具关系；旧记录只增不改，可校验后整体恢复。
          </p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-wood-50 px-3 py-1 text-xs text-wood-700">
          共 {versions.length} 个版本
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" data-testid="version-error" role="alert">
          <p className="font-semibold">引用完整性检查未通过，已拒绝恢复：</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {error.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" data-testid="version-success" role="status">
          {successMessage}
        </div>
      ) : null}

      {loading && versions.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-sm text-stone-500">正在读取版本档案…</div>
      ) : versions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-wood-100 bg-wood-50/70 px-6 py-8 text-center text-sm text-stone-500">
          该类型暂无版本记录，下次保存时会自动建立首次版本。
        </div>
      ) : (
        <ol className="space-y-3">
          {versions.map((version, index) => {
            const isLatest = index === 0
            const expanded = expandedId === version.id
            return (
              <li key={version.id} className="panel overflow-hidden" data-testid="version-row">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-wood-700 text-sm font-bold text-white">
                    v{version.versionNo}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-wood-900">第 {version.versionNo} 版</strong>
                      {isLatest ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] text-emerald-700">最新</span>
                      ) : null}
                      {version.note ? (
                        <span className="rounded-full bg-wood-50 px-2.5 py-0.5 text-[11px] text-wood-700">{version.note}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">归档时间：{formatVersionTime(version.createdAt)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <VersionCounts version={version} />
                    <button
                      type="button"
                      className="secondary-button !px-3 !py-1.5 text-xs"
                      onClick={() => setExpandedId(expanded ? null : version.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? '收起明细' : '查看明细'}
                    </button>
                    <button
                      type="button"
                      className="primary-button !px-3 !py-1.5 text-xs"
                      disabled={isLatest || restoringId !== null}
                      data-testid="restore-version"
                      onClick={() => void handleRestore(version)}
                    >
                      {restoringId === version.id ? '恢复中…' : '恢复此版'}
                    </button>
                  </div>
                </div>
                {expanded ? <VersionDetail version={version} /> : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function VersionCounts({ version }: { version: JointVersion }) {
  const items: Array<[string, number]> = [
    ['构件', version.members.length],
    ['步序', version.steps.length],
    ['示意图', version.diagrams.length],
    ['家具', version.furniture.length],
  ]
  return (
    <span className="hidden text-xs text-stone-500 sm:inline">
      {items.map(([label, count]) => `${label} ${count}`).join(' · ')}
    </span>
  )
}

function VersionDetail({ version }: { version: JointVersion }) {
  return (
    <div className="grid gap-4 border-t border-wood-100 bg-wood-50/40 p-5 lg:grid-cols-2">
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-wood-700">类型文字</p>
          <p className="mt-1 font-medium text-stone-800">
            {version.joint.name} · {version.joint.family} · {version.joint.difficulty}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-600">{version.joint.strengthNote}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-wood-700">构件清单</p>
          <ul className="mt-1 space-y-1 text-xs text-stone-600">
            {version.members.map((member) => (
              <li key={member.id}>
                {member.name}（{member.part}）{member.lengthMm}×{member.widthMm}×{member.thicknessMm} mm
              </li>
            ))}
            {version.members.length === 0 ? <li className="text-stone-400">无构件</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-wood-700">步序</p>
          <ol className="mt-1 space-y-1 text-xs text-stone-600">
            {version.steps.map((step) => (
              <li key={step.id}>第 {step.seq} 步 · {step.action} · {step.direction} · {step.tool}</li>
            ))}
            {version.steps.length === 0 ? <li className="text-stone-400">无步序</li> : null}
          </ol>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-xs font-semibold text-wood-700">示意图</p>
          <ul className="mt-1 space-y-1 text-xs text-stone-600">
            {version.diagrams.map((diagram) => (
              <li key={diagram.id}>
                《{diagram.title}》· {diagram.view} · 热区 {diagram.hitAreas.length} 处
              </li>
            ))}
            {version.diagrams.length === 0 ? <li className="text-stone-400">无示意图</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-wood-700">家具关系</p>
          <ul className="mt-1 space-y-1 text-xs text-stone-600">
            {version.furniture.map((item) => (
              <li key={item.id}>{item.name} · {item.era} · {item.position}</li>
            ))}
            {version.furniture.length === 0 ? <li className="text-stone-400">无家具关联</li> : null}
          </ul>
        </div>
      </div>
    </div>
  )
}
