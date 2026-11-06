import type { ReportMeta, WindowLabel } from '../types/database'
import { formatDateOnly, formatShanghai } from '../lib/format'

interface Props {
  meta: ReportMeta | null
  metaList: ReportMeta[]
  reportDate: string | null
  windowLabel: WindowLabel
  indicatorCount: number
  loading: boolean
  connected: boolean
  error: string | null
  onWindowChange: (w: WindowLabel) => void
  onReportDateChange: (d: string | null) => void
  onRefresh: () => void
}

export function TopBar({
  meta,
  metaList,
  reportDate,
  windowLabel,
  indicatorCount,
  loading,
  connected,
  error,
  onWindowChange,
  onReportDateChange,
  onRefresh,
}: Props) {
  const dates = [...new Set(metaList.map((m) => m.report_date))].sort().reverse()

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight text-slate-50 sm:text-[22px]">
              美国宏观短期看板
            </h1>
            <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-xs text-slate-400">
              US Short-term Macro
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            报告日{' '}
            <span className="font-medium text-slate-200">
              {formatDateOnly(reportDate ?? meta?.report_date)}
            </span>
            <span className="mx-2 text-slate-600">·</span>
            数据截至{' '}
            <span className="font-medium text-cyan-300/90">
              {formatShanghai(meta?.updated_at)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
            {(
              [
                { id: '1w' as const, label: '1周' },
                { id: '2_4w' as const, label: '2—4周' },
              ] as const
            ).map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => onWindowChange(w.id)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  windowLabel === w.id
                    ? 'bg-cyan-500/20 text-cyan-200 shadow-sm ring-1 ring-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-400/50"
            value={reportDate ?? ''}
            onChange={(e) => onReportDateChange(e.target.value || null)}
            disabled={!dates.length}
          >
            {!dates.length && <option value="">暂无报告日</option>}
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
          >
            刷新
          </button>

          <StatusChip
            loading={loading}
            connected={connected}
            error={error}
            indicatorCount={indicatorCount}
          />
        </div>
      </div>
    </header>
  )
}

function StatusChip({
  loading,
  connected,
  error,
  indicatorCount,
}: {
  loading: boolean
  connected: boolean
  error: string | null
  indicatorCount: number
}) {
  if (loading) {
    return (
      <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
        加载中…
      </span>
    )
  }
  if (error) {
    return (
      <span
        className="max-w-[220px] truncate rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-300"
        title={error}
      >
        连接失败
      </span>
    )
  }
  if (connected) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
        Supabase OK · {indicatorCount} 指标
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300">
      未配置
    </span>
  )
}
