import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { Indicator, SeriesPoint } from '../types/database'
import { SERIES_COLORS, SERIES_COLOR_FALLBACK } from '../types/database'

interface Props {
  series: SeriesPoint[]
  enabledIds: string[]
  indicators: Indicator[]
  focusedId: string | null
  loading: boolean
  asideHint?: string
  emptyHint?: string
  onSeriesFocus: (id: string | null) => void
}

const EPS = 1e-12
const MAG_RATIO = 2

/** YYYY-MM-DD → Sat/Sun (UTC noon to avoid TZ edge). */
function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}



/** Assign distinct colors for the current selection (avoid collisions). */
function resolveSeriesColors(ids: string[]): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  let fi = 0
  for (const id of ids) {
    let c = SERIES_COLORS[id]
    if (!c || used.has(c.toLowerCase())) {
      while (
        fi < SERIES_COLOR_FALLBACK.length &&
        used.has(SERIES_COLOR_FALLBACK[fi]!.toLowerCase())
      ) {
        fi += 1
      }
      c = SERIES_COLOR_FALLBACK[fi % SERIES_COLOR_FALLBACK.length]!
      fi += 1
    }
    used.add(c.toLowerCase())
    out.set(id, c)
  }
  return out
}

/** Line dash patterns — cycle when many series share an axis / similar hues. */
const LINE_DASHES: (number[] | undefined)[] = [
  undefined, // solid
  [8, 4],
  [3, 3],
  [10, 3, 2, 3],
  [2, 2],
  [12, 4, 2, 4, 2, 4],
]

function hexDist(a: string, b: string): number {
  const parse = (h: string) => {
    const s = h.replace('#', '')
    const n = s.length === 3 ? s[0]+s[0]+s[1]+s[1]+s[2]+s[2] : s
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
  }
  try {
    const [r1, g1, b1] = parse(a)
    const [r2, g2, b2] = parse(b)
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
  } catch {
    return 999
  }
}

/** If two colors are close (or many series), assign distinct dash patterns. */
function resolveLineDashes(ids: string[], colorOf: (id: string) => string): Map<string, number[] | undefined> {
  const out = new Map<string, number[] | undefined>()
  const SIM = 80 // RGB euclidean threshold
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    let dashIdx = 0
    // Prefer unique dash vs earlier series with similar color
    const usedNear = new Set<number>()
    for (let j = 0; j < i; j++) {
      const prev = ids[j]!
      if (hexDist(colorOf(id), colorOf(prev)) < SIM) {
        const prevDash = out.get(prev)
        const prevIdx = LINE_DASHES.findIndex(
          (d) => JSON.stringify(d) === JSON.stringify(prevDash),
        )
        usedNear.add(prevIdx < 0 ? 0 : prevIdx)
      }
    }
    while (usedNear.has(dashIdx) && dashIdx < LINE_DASHES.length - 1) dashIdx += 1
    // Also cycle by index when 4+ series for extra clarity
    if (ids.length >= 4 && dashIdx === 0 && i > 0) {
      dashIdx = i % LINE_DASHES.length
      while (usedNear.has(dashIdx) && dashIdx < LINE_DASHES.length - 1) dashIdx += 1
    }
    out.set(id, LINE_DASHES[dashIdx])
  }
  return out
}



function formatAxisValue(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (abs >= 100) return v.toLocaleString('en-US', { maximumFractionDigits: 1 })
  if (abs >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

function shortUnit(unit: string | null | undefined, id: string): string | undefined {
  if (!unit) {
    // Heuristic when DB unit missing
    if (['sp500', 'nasdaq', 'dji', 'vix', 'vixeq', 'dspx'].includes(id)) return '点'
    if (
      ['dgs2', 'dgs10', 'dgs30', 't10y2y', 't5yie', 't10yie', 'hy_oas', 'ig_oas', 'dfii10'].includes(
        id,
      )
    )
      return '%'
    return undefined
  }
  const u = unit.toLowerCase()
  if (u.includes('percent') || u === '%' || u.includes('%')) return '%'
  if (u.includes('index') || u.includes('point') || u.includes('点')) return '点'
  if (u.includes('usd') || u.includes('dollar') || u === '$') return unit
  return unit
}

function latestAbs(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) return Math.abs(v)
  }
  return null
}

function latestValue(values: (number | null)[]): { index: number; value: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) return { index: i, value: v }
  }
  return null
}

/** Assign yAxisIndex by magnitude: if any pair differs by ≥2×, split into 2 right axes. */
function assignYAxes(
  ids: string[],
  dataById: Map<string, (number | null)[]>,
  colorOf: (id: string) => string,
): {
  axisCount: 1 | 2
  yIndex: Map<string, number>
  /** Representative color per axis index */
  axisColor: string[]
  /** Optional unit hint per axis (from first series in group) */
  axisUnit: (string | null)[]
} {
  const scales = ids
    .map((id) => {
      const abs = latestAbs(dataById.get(id) ?? [])
      return {
        id,
        abs: abs ?? 0,
        log: Math.log10(Math.max(abs ?? 0, EPS)),
      }
    })
    .filter((s) => s.abs > 0)

  const yIndex = new Map<string, number>()
  if (scales.length === 0) {
    for (const id of ids) yIndex.set(id, 0)
    return { axisCount: 1, yIndex, axisColor: ['#94a3b8'], axisUnit: [null] }
  }

  const absVals = scales.map((s) => s.abs)
  const ratio = Math.max(...absVals) / Math.min(...absVals)
  if (ratio < MAG_RATIO) {
    for (const id of ids) yIndex.set(id, 0)
    return {
      axisCount: 1,
      yIndex,
      axisColor: [colorOf(scales[0].id)],
      axisUnit: [null],
    }
  }

  // Bucket by round(log10); split at largest gap → low vs high magnitude groups
  const buckets = new Map<number, typeof scales>()
  for (const s of scales) {
    const key = Math.round(s.log)
    const arr = buckets.get(key) ?? []
    arr.push(s)
    buckets.set(key, arr)
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b)

  let splitAfter = 0
  if (keys.length >= 2) {
    let bestGap = -1
    for (let i = 0; i < keys.length - 1; i++) {
      const gap = keys[i + 1]! - keys[i]!
      if (gap > bestGap) {
        bestGap = gap
        splitAfter = i
      }
    }
  } else {
    // Single bucket but ratio ≥2 (edge): split by median abs
    const sorted = [...scales].sort((a, b) => a.abs - b.abs)
    const mid = Math.floor(sorted.length / 2)
    const lowIds = new Set(sorted.slice(0, mid).map((s) => s.id))
    for (const s of scales) {
      yIndex.set(s.id, lowIds.has(s.id) ? 1 : 0)
    }
    for (const id of ids) if (!yIndex.has(id)) yIndex.set(id, 0)
    const high = scales.filter((s) => yIndex.get(s.id) === 0)
    const low = scales.filter((s) => yIndex.get(s.id) === 1)
    return {
      axisCount: 2,
      yIndex,
      axisColor: [colorOf(high[0]?.id ?? scales[0].id), colorOf(low[0]?.id ?? scales[0].id)],
      axisUnit: [null, null],
    }
  }

  const lowKeySet = new Set(keys.slice(0, splitAfter + 1))
  // High magnitude → axis 0 (inner right); low magnitude → axis 1 (outer right)
  for (const s of scales) {
    const key = Math.round(s.log)
    yIndex.set(s.id, lowKeySet.has(key) ? 1 : 0)
  }
  for (const id of ids) if (!yIndex.has(id)) yIndex.set(id, 0)

  const high = scales.filter((s) => yIndex.get(s.id) === 0)
  const low = scales.filter((s) => yIndex.get(s.id) === 1)
  return {
    axisCount: 2,
    yIndex,
    axisColor: [
      colorOf(high[0]?.id ?? scales[0].id),
      colorOf(low[0]?.id ?? scales[0].id),
    ],
    axisUnit: [null, null],
  }
}

export function SeriesChart({
  series,
  enabledIds,
  indicators,
  focusedId,
  loading,
  asideHint = '点击图例可联动右侧解释',
  emptyHint = '`series_1y` 尚为空。日更写入后，默认展示 S&P 500 与 NASDAQ。当前已通过只读密钥连上 Supabase。',
  onSeriesFocus,
}: Props) {
  const nameOf = (id: string) =>
    indicators.find((i) => i.id === id)?.name ?? id.toUpperCase()
  const unitOf = (id: string) => indicators.find((i) => i.id === id)?.unit ?? null

  const option = useMemo<EChartsOption>(() => {
    const ids = enabledIds.filter((id) =>
      series.some((s) => s.indicator_id === id),
    )
    const colorMap = resolveSeriesColors(ids)
    const colorOf = (id: string) => colorMap.get(id) ?? '#94a3b8'
    const dashMap = resolveLineDashes(ids, colorOf)

    const dateSet = new Set<string>()
    for (const p of series) {
      if (ids.includes(p.indicator_id) && p.value != null && !isWeekend(p.date)) {
        dateSet.add(p.date)
      }
    }
    const dates = [...dateSet].sort()

    const dataById = new Map<string, (number | null)[]>()
    for (const id of ids) {
      const byDate = new Map(
        series
          .filter((s) => s.indicator_id === id)
          .map((s) => [s.date, s.value]),
      )
      dataById.set(
        id,
        dates.map((d) => {
          const v = byDate.get(d)
          return v === undefined ? null : v
        }),
      )
    }

    const { axisCount, yIndex, axisColor } = assignYAxes(ids, dataById, colorOf)

    // Prefer short unit from first series on each axis (点 / % style)
    const unitForAxis = (axisIdx: number): string | undefined => {
      const id = ids.find((i) => (yIndex.get(i) ?? 0) === axisIdx)
      return id ? shortUnit(unitOf(id), id) : undefined
    }

    const buildYAxis = (idx: number, dual: boolean) => {
      const color = axisColor[idx] ?? '#94a3b8'
      const unit = unitForAxis(idx)
      const isPrimary = idx === 0
      if (!dual) {
        return {
          type: 'value' as const,
          scale: true,
          name: unit,
          nameTextStyle: { color, fontSize: 11, padding: [0, 0, 0, 0] },
          position: 'left' as const,
          axisLabel: {
            color: '#94a3b8',
            formatter: (v: number) => formatAxisValue(v),
          },
          axisLine: { show: true, lineStyle: { color: '#475569' } },
          axisTick: { lineStyle: { color: '#475569' } },
          splitLine: { lineStyle: { color: 'rgba(51,65,85,0.55)' } },
        }
      }
      // Dual: both on the right — inner (0) + outer (1), colored by series group
      return {
        type: 'value' as const,
        scale: true,
        name: unit,
        nameLocation: 'end' as const,
        nameTextStyle: { color, fontSize: 11, align: 'left' as const },
        position: 'right' as const,
        offset: idx === 0 ? 0 : 56,
        axisLabel: {
          color,
          formatter: (v: number) => formatAxisValue(v),
        },
        axisLine: { show: true, lineStyle: { color, width: 1.5 } },
        axisTick: { lineStyle: { color } },
        splitLine: isPrimary
          ? { show: true, lineStyle: { color: 'rgba(51,65,85,0.55)' } }
          : { show: false },
      }
    }

    const yAxis =
      axisCount === 1
        ? buildYAxis(0, false)
        : [buildYAxis(0, true), buildYAxis(1, true)]

    const echartsSeries = ids.map((id) => {
      const data = dataById.get(id) ?? []
      const dimmed = focusedId != null && focusedId !== id
      const color = colorOf(id)
      const last = latestValue(data)
      const yi = yIndex.get(id) ?? 0

      return {
        name: nameOf(id),
        type: 'line' as const,
        yAxisIndex: axisCount === 2 ? yi : 0,
        showSymbol: false,
        smooth: 0.15,
        connectNulls: true,
        lineStyle: {
          width: focusedId === id ? 3 : 1.8,
          opacity: dimmed ? 0.18 : 1,
          color,
          type: (dashMap.get(id) ?? 'solid') as 'solid' | number[],
        },
        itemStyle: { color },
        emphasis: { focus: 'series' as const },
        data,
        id,
        // Latest value label near series end (toward the axis)
        endLabel: last
          ? {
              show: !dimmed,
              formatter: () => formatAxisValue(last.value),
              color: '#0f172a',
              backgroundColor: color ?? '#94a3b8',
              padding: [2, 5] as [number, number],
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 600 as const,
              distance: 8,
            }
          : undefined,
        markPoint: last
          ? {
              symbol: 'circle',
              symbolSize: 7,
              itemStyle: {
                color: color ?? '#94a3b8',
                borderColor: '#0f172a',
                borderWidth: 1,
              },
              label: { show: false },
              data: [
                {
                  name: 'last',
                  coord: [dates[last.index], last.value],
                  value: last.value,
                },
              ],
            }
          : undefined,
      }
    })

    const gridRight = axisCount === 2 ? 118 : 72
    const gridLeft = axisCount === 2 ? 28 : 52

    return {
      backgroundColor: 'transparent',
      animationDuration: 400,
      grid: { left: gridLeft, right: gridRight, top: 48, bottom: 48 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,0.92)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as {
            axisValue?: string
            marker?: string
            seriesName?: string
            data?: number | null
          }[]
          if (!items.length) return ''
          const head = items[0]?.axisValue ?? ''
          const lines = [`<div style="margin-bottom:4px">${head}</div>`]
          for (const it of items) {
            const v = it.data
            if (v == null || Number.isNaN(Number(v))) continue
            lines.push(
              `${it.marker ?? ''} ${it.seriesName ?? ''}&nbsp;&nbsp;<b>${formatAxisValue(Number(v))}</b>`,
            )
          }
          return lines.join('<br/>')
        },
      },
      legend: {
        top: 8,
        textStyle: { color: '#94a3b8' },
        inactiveColor: '#475569',
      },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLabel: { color: '#64748b', hideOverlap: true },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { show: false },
      },
      yAxis,
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        {
          type: 'slider',
          height: 18,
          bottom: 8,
          borderColor: '#334155',
          backgroundColor: 'rgba(15,23,42,0.5)',
          fillerColor: 'rgba(56,189,248,0.15)',
          handleStyle: { color: '#38bdf8' },
          textStyle: { color: '#64748b' },
        },
      ],
      series: echartsSeries,
    }
  }, [series, enabledIds, indicators, focusedId])

  const hasData = series.some(
    (s) => enabledIds.includes(s.indicator_id) && s.value != null,
  )

  return (
    <div className="flex min-h-[360px] flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-200">近5年多项数据同框</h2>
        {focusedId ? (
          <button
            type="button"
            className="text-xs text-cyan-300 hover:underline"
            onClick={() => onSeriesFocus(null)}
          >
            清除聚焦（{focusedId}）
          </button>
        ) : (
          <span className="text-xs text-slate-500">{asideHint}</span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          图表加载中…
        </div>
      ) : !hasData ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-slate-300">暂无时序数据</p>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">{emptyHint}</p>
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: 420, width: '100%' }}
          notMerge
          lazyUpdate
          onEvents={{
            legendselectchanged: (params: {
              name?: string
              selected?: Record<string, boolean>
            }) => {
              const name = params.name
              if (!name) return
              const id =
                indicators.find((i) => i.name === name)?.id ??
                enabledIds.find((x) => nameOf(x) === name) ??
                null
              if (id) onSeriesFocus(id)
            },
            click: (params: { seriesId?: string; seriesName?: string }) => {
              const id =
                (params.seriesId as string | undefined) ??
                indicators.find((i) => i.name === params.seriesName)?.id ??
                null
              onSeriesFocus(id)
            },
          }}
        />
      )}
    </div>
  )
}
