import type { ReportMeta } from '../types/database'
import { formatDateOnly, formatShanghai } from '../lib/format'

interface Props {
  title: string
  meta: ReportMeta | null
  metaList: ReportMeta[]
  reportDate: string | null
  indicatorCount: number
  statusDetail?: string | null
  loading: boolean
  connected: boolean
  error: string | null
  onReportDateChange: (d: string | null) => void
  onRefresh: () => void
}

export function TopBar({
  title,
  meta,
  metaList,
  reportDate,
  indicatorCount,
  statusDetail,
  loading,
  connected,
  error,
  onReportDateChange,
  onRefresh,
}: Props) {
  const dates = [...new Set(metaList.map((m) => m.report_date))].sort().reverse()

  return (
    <header>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight text-slate-50 sm:text-[22px]">
              {title}
            </h1>
            <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-200 ring-1 ring-cyan-400/40">
              近一周
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
          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-cyan-400/50"
            value={reportDate ?? ''}
            onChange={(e) => onReportDateChange(e.target.value || null)}
            disabled={!dates.length}
            aria-label="报告日"
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
            statusDetail={statusDetail}
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
  statusDetail,
}: {
  loading: boolean
  connected: boolean
  error: string | null
  indicatorCount: number
  statusDetail?: string | null
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
        Supabase OK · {statusDetail ?? `${indicatorCount} 指标`}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300">
      未配置
    </span>
  )
}
