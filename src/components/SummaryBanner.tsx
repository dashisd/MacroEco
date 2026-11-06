interface Props {
  summary: string | null | undefined
  loading?: boolean
}

export function SummaryBanner({ summary, loading }: Props) {
  if (loading && !summary) {
    return (
      <section className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-900/80 to-indigo-500/10 px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300/80">摘要</p>
        <p className="mt-1 text-sm text-slate-400">摘要加载中…</p>
      </section>
    )
  }

  if (!summary) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">摘要</p>
        <p className="mt-1 text-sm text-slate-500">
          暂无 executive 摘要（`report_meta.summary`）。日更写入后会显示在此。
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/12 via-slate-900/85 to-indigo-500/12 px-4 py-4 shadow-[0_0_40px_-20px_rgba(34,211,238,0.45)] sm:px-5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[16px] font-semibold tracking-wide text-cyan-200">
          摘要
        </span>
        <span className="text-[11px] text-slate-500">Executive · report_meta.summary</span>
      </div>
      <p className="text-[18px] leading-relaxed text-slate-100">{summary}</p>
    </section>
  )
}
