import { useEffect, useMemo, useState } from 'react'
import type { Indicator, Observation, OhlcBar, SeriesPoint } from '../types/database'
import { READING_GROUPS } from '../lib/categories'
import { SparklineCard } from './SparklineCard'
import { SeriesDetailModal } from './SeriesDetailModal'

interface Props {
  observations: Observation[]
  indicators: Indicator[]
  series: SeriesPoint[]
  ohlcById: Record<string, OhlcBar[]>
  ohlcLoadingId: string | null
  ensureOhlc: (indicatorId: string) => Promise<void>
  reportDate: string | null
  loading?: boolean
  focusedId: string | null
  onFocusIndicator: (id: string | null) => void
}

function formatActual(obs: Observation): string {
  if (obs.data_quality === 'NA' || obs.actual == null) return 'NA'
  const n = obs.actual
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(Math.abs(n) >= 100 ? 1 : 2)
}

const SPARKLINE_PILOT_IDS = new Set([
  'dgs2',
  'dgs10',
  'dgs30',
  't10y2y',
  'vix',
  'vixeq',
  'vixeq_vix_ratio',
  'sp500',
  'nasdaq',
  'dji',
  'wti',
  'brent',
  'gold_comex',
  'btc',
])
const HIDDEN_READING_IDS = new Set(['dspx'])

export function LatestReadings({
  observations,
  indicators,
  series,
  ohlcById,
  ohlcLoadingId,
  ensureOhlc,
  reportDate,
  loading,
  focusedId,
  onFocusIndicator,
}: Props) {
  const [modalId, setModalId] = useState<string | null>(null)

  // Lazy-fetch OHLC when detail modal opens
  useEffect(() => {
    if (!modalId) return
    void ensureOhlc(modalId)
  }, [modalId, ensureOhlc])

  const indMap = useMemo(() => {
    const m = new Map<string, Indicator>()
    for (const i of indicators) m.set(i.id, i)
    return m
  }, [indicators])

  const visible = useMemo(() => {
    const filtered = observations.filter(
      (o) =>
        o.data_quality !== 'NA' &&
        o.actual != null &&
        !HIDDEN_READING_IDS.has(o.indicator_id),
    )
    // One row per indicator: keep latest as_of (then highest id).
    const best = new Map<string, Observation>()
    for (const o of filtered) {
      const prev = best.get(o.indicator_id)
      if (!prev) {
        best.set(o.indicator_id, o)
        continue
      }
      const newer =
        o.as_of > prev.as_of || (o.as_of === prev.as_of && (o.id ?? 0) > (prev.id ?? 0))
      if (newer) best.set(o.indicator_id, o)
    }
    return [...best.values()]
  }, [observations])

  const grouped = useMemo(() => {
    const assigned = new Set<string>()
    const groups: { id: string; label: string; items: Observation[] }[] = []

    for (const g of READING_GROUPS) {
      const items = visible.filter((o) => {
        if (assigned.has(o.indicator_id)) return false
        const cat = indMap.get(o.indicator_id)?.category ?? null
        return g.match(o.indicator_id, cat)
      })
      for (const o of items) assigned.add(o.indicator_id)
      if (items.length) groups.push({ id: g.id, label: g.label, items })
    }

    const other = visible.filter((o) => !assigned.has(o.indicator_id))
    if (other.length) groups.push({ id: 'other', label: '其他', items: other })

    return groups
  }, [visible, indMap])

  const modalInd = modalId ? indMap.get(modalId) : null
  const modalObs = modalId
    ? visible.find((o) => o.indicator_id === modalId)
    : null
  const modalOhlc = modalId ? (ohlcById[modalId] ?? []) : []
  const modalOhlcLoading =
    Boolean(modalId) &&
    (ohlcLoadingId === modalId ||
      (modalId != null && ohlcById[modalId] === undefined))

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-200">最新读数</h2>
        <p className="text-xs text-slate-500">
          as_of {reportDate ?? '—'} · observations 快照
        </p>
      </div>

      {loading && visible.length === 0 ? (
        <p className="text-sm text-slate-400">读数加载中…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-500">
          该报告日暂无 observations。日更写入后按国债 / PCE·CPI / 就业等分类展示。
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {grouped.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5"
            >
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {g.label}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((o) => {
                  const ind = indMap.get(o.indicator_id)
                  const active = focusedId === o.indicator_id
                  const isNa =
                    o.data_quality === 'NA' || o.actual == null
                  const useSpark = SPARKLINE_PILOT_IDS.has(o.indicator_id)

                  if (useSpark) {
                    return (
                      <li key={o.id || o.indicator_id}>
                        <SparklineCard
                          indicatorId={o.indicator_id}
                          name={ind?.name ?? o.indicator_id}
                          observation={o}
                          series={series}
                          unit={o.unit || ind?.unit}
                          active={active}
                          onOpen={() => {
                            onFocusIndicator(o.indicator_id)
                            setModalId(o.indicator_id)
                          }}
                        />
                      </li>
                    )
                  }

                  return (
                    <li key={o.id || o.indicator_id}>
                      <button
                        type="button"
                        onClick={() =>
                          onFocusIndicator(active ? null : o.indicator_id)
                        }
                        className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                          active
                            ? 'bg-cyan-500/15 ring-1 ring-cyan-400/40'
                            : 'hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs text-slate-300">
                            {ind?.name ?? o.indicator_id}
                          </span>
                          {o.reference_period ? (
                            <span className="text-[10px] text-slate-600">
                              {o.reference_period}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 font-mono text-sm tabular-nums ${
                            isNa ? 'text-slate-500' : 'text-slate-100'
                          }`}
                        >
                          {formatActual(o)}
                          {!isNa && (o.unit || ind?.unit) ? (
                            <span className="ml-1 text-[10px] font-sans text-slate-500">
                              {o.unit || ind?.unit}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {modalId && modalInd ? (
        <SeriesDetailModal
          open
          onClose={() => setModalId(null)}
          indicatorId={modalId}
          name={modalInd.name}
          unit={modalObs?.unit || modalInd.unit}
          ohlc={modalOhlc}
          ohlcLoading={modalOhlcLoading}
          series={series}
          lastValue={modalObs?.actual ?? null}
        />
      ) : null}
    </section>
  )
}
