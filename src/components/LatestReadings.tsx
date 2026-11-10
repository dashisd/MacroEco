import { useEffect, useMemo, useState } from 'react'
import type { Indicator, Observation, OhlcBar, SeriesPoint } from '../types/database'
import {
  READING_CHART_GROUP_IDS,
  READING_GROUPS,
  READING_ITEM_ORDER,
} from '../lib/categories'
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

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

function sortByPreferred(items: Observation[], groupId: string): Observation[] {
  const order = READING_ITEM_ORDER[groupId] ?? []
  const rank = new Map(order.map((id, i) => [id, i]))
  return items.slice().sort((a, b) => {
    const ra = rank.get(a.indicator_id) ?? 1000
    const rb = rank.get(b.indicator_id) ?? 1000
    if (ra !== rb) return ra - rb
    return a.indicator_id.localeCompare(b.indicator_id)
  })
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
      if (items.length) {
        groups.push({
          id: g.id,
          label: g.label,
          items: sortByPreferred(items, g.id),
        })
      }
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
          该报告日暂无 observations。日更写入后按国债 / 市场 / 波动等分类展示。
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {grouped.map((g) => {
            const chartGroup = READING_CHART_GROUP_IDS.has(g.id)
            const cols = chartGroup ? 4 : 6
            const rows = chunkRows(g.items, cols)
            const slotClass =
              cols === 4
                ? 'w-[calc((100%-1.5rem)/4)] shrink-0'
                : 'w-[calc((100%-2.5rem)/6)] shrink-0'

            return (
              <div
                key={g.id}
                className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5"
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {g.label}
                </h3>
                <div className="flex flex-col gap-2">
                  {rows.map((row, ri) => (
                    <div
                      key={`${g.id}-r${ri}`}
                      className="flex flex-row flex-nowrap justify-start gap-2"
                    >
                      {row.map((o) => {
                        const ind = indMap.get(o.indicator_id)
                        const active = focusedId === o.indicator_id
                        const isNa =
                          o.data_quality === 'NA' || o.actual == null
                        const useSpark =
                          chartGroup && SPARKLINE_PILOT_IDS.has(o.indicator_id)

                        if (useSpark) {
                          return (
                            <div key={o.id || o.indicator_id} className={slotClass}>
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
                            </div>
                          )
                        }

                        return (
                          <div key={o.id || o.indicator_id} className={slotClass}>
                            <button
                              type="button"
                              onClick={() =>
                                onFocusIndicator(active ? null : o.indicator_id)
                              }
                              className={`flex h-full w-full flex-col items-start justify-between gap-1 rounded-lg border px-2.5 py-2 text-left transition ${
                                active
                                  ? 'border-cyan-400/40 bg-cyan-500/15 ring-1 ring-cyan-400/40'
                                  : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/60'
                              }`}
                            >
                              <span className="min-w-0 w-full">
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
                                className={`font-mono text-sm tabular-nums ${
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
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
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
