import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { Observation, SeriesPoint } from '../types/database'

interface Props {
  indicatorId: string
  name: string
  observation: Observation
  series: SeriesPoint[]
  unit?: string | null
  onOpen: () => void
  active?: boolean
}

function formatValue(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(1)
  return n.toFixed(2)
}

export function SparklineCard({
  indicatorId,
  name,
  observation,
  series,
  unit,
  onOpen,
  active,
}: Props) {
  const points = useMemo(() => {
    const rows = series
      .filter((s) => s.indicator_id === indicatorId && s.value != null)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    // Keep sparkline dense: last ~1 calendar year even if store holds 5Y
    if (!rows.length) return rows
    const lastDate = rows[rows.length - 1]!.date
    const cutoffMs = Date.parse(lastDate) - 365 * 24 * 60 * 60 * 1000
    const cutoff = new Date(cutoffMs).toISOString().slice(0, 10)
    const sliced = rows.filter((r) => r.date >= cutoff)
    return sliced.length >= 2 ? sliced : rows.slice(-252)
  }, [series, indicatorId])

  const first = points[0]?.value ?? null
  const last =
    observation.actual ?? points[points.length - 1]?.value ?? null
  const changePct =
    first != null && last != null && first !== 0
      ? ((last - first) / Math.abs(first)) * 100
      : null
  const up = changePct != null && changePct >= 0

  const option = useMemo<EChartsOption>(() => {
    const vals = points.map((p) => p.value as number)
    const color = up ? '#38bdf8' : '#f87171'
    return {
      animation: false,
      grid: { left: 0, right: 0, top: 4, bottom: 0 },
      xAxis: { type: 'category', show: false, data: points.map((p) => p.date) },
      yAxis: { type: 'value', show: false, scale: true },
      series: [
        {
          type: 'line',
          data: vals,
          showSymbol: false,
          symbol: 'circle',
          symbolSize: 6,
          endLabel: { show: false },
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: up ? 'rgba(56,189,248,0.45)' : 'rgba(248,113,113,0.4)' },
                { offset: 1, color: 'rgba(15,23,42,0)' },
              ],
            },
          },
          markPoint: vals.length
            ? {
                symbol: 'circle',
                symbolSize: 7,
                data: [{ coord: [points.length - 1, vals[vals.length - 1]], itemStyle: { color } }],
                label: { show: false },
              }
            : undefined,
        },
      ],
    }
  }, [points, up])

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
          : 'border-slate-700/80 bg-slate-950/60 hover:border-cyan-500/40 hover:bg-slate-900/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {indicatorId.toUpperCase()}
          </div>
          <div className="truncate text-sm font-semibold text-slate-50">{name}</div>
        </div>
        {changePct != null ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
              up
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            1年 {up ? '▲' : '▼'} {up ? '+' : ''}
            {changePct.toFixed(2)}%
          </span>
        ) : null}
      </div>

      <div className="h-[56px] w-full">
        {points.length >= 2 ? (
          <ReactECharts option={option} style={{ height: 56, width: '100%' }} opts={{ renderer: 'canvas' }} />
        ) : (
          <div className="flex h-full items-center text-[11px] text-slate-600">暂无近一年序列</div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-base tabular-nums text-slate-50">
          {formatValue(last)}
          {unit ? <span className="ml-1 font-sans text-[10px] text-slate-500">{unit}</span> : null}
        </div>
        <div className="text-[10px] text-slate-600">
          {observation.reference_period || observation.as_of}
        </div>
      </div>
    </button>
  )
}
