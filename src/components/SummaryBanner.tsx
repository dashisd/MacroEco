interface Props {
  summary: string | null | undefined
  loading?: boolean
}

/** Prefer explicit newlines; else cue-based split so legacy single-block summaries still scan. */
export function splitSummaryParagraphs(summary: string): string[] {
  const trimmed = summary.trim()
  if (!trimmed) return []

  if (/\n/.test(trimmed)) {
    return trimmed
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const sentences =
    trimmed.match(/[^。！？]+[。！？]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [trimmed]
  if (sentences.length <= 2) return sentences

  const cue =
    /^(这主要是因为|短期一周|中短期|结构层面|今晚门禁|总的来说|验证重点|仓位)/
  const groups: string[] = []
  let buf: string[] = []

  const flush = () => {
    if (buf.length) {
      groups.push(buf.join(''))
      buf = []
    }
  }

  for (const s of sentences) {
    if (cue.test(s) && buf.length) flush()
    buf.push(s)
  }
  flush()

  // Merge adjacent short thematic pairs to ~4–5 paras (demo B rhythm)
  const merged: string[] = []
  for (let i = 0; i < groups.length; i++) {
    const cur = groups[i]
    const next = groups[i + 1]
    const curIsHorizon = /^短期一周/.test(cur)
    const nextIsMid = next != null && /^中短期/.test(next)
    const curIsStruct = /^结构层面/.test(cur)
    const nextIsGate = next != null && /^今晚门禁/.test(next)
    if ((curIsHorizon && nextIsMid) || (curIsStruct && nextIsGate)) {
      merged.push(cur + next)
      i++
      continue
    }
    merged.push(cur)
  }
  return merged
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

  const paragraphs = splitSummaryParagraphs(summary)
  const lastIdx = paragraphs.length - 1

  return (
    <section className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/12 via-slate-900/85 to-indigo-500/12 px-4 py-4 shadow-[0_0_40px_-20px_rgba(34,211,238,0.45)] sm:px-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[16px] font-semibold tracking-wide text-cyan-200">
          摘要
        </span>
        <span className="text-[11px] text-slate-500">多段 · report_meta.summary</span>
      </div>
      <div className="space-y-3">
        {paragraphs.map((p, i) => {
          const lead = paragraphs.length === 1 || i === 0 || i === lastIdx
          return (
            <p
              key={i}
              className={
                lead
                  ? 'text-[18px] font-semibold leading-relaxed text-white'
                  : 'text-[17px] leading-relaxed text-slate-300'
              }
            >
              {p}
            </p>
          )
        })}
      </div>
    </section>
  )
}
