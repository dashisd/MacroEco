import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { OhlcBar, SeriesPoint } from '../types/database'

export type ChartRange = '1D' | '1W' | '30D' | 'YTD' | '1Y' | '5Y'

const RANGES: ChartRange[] = ['1D', '1W', '30D', 'YTD', '1Y', '5Y']

interface Props {
  open: boolean
  onClose: () => void
  indicatorId: string
  name: string
  unit?: string | null
  ohlc: OhlcBar[]
  /** True while first OHLC fetch for this id is in flight */
  ohlcLoading?: boolean
  /** Fallback closes when OHLC empty */
  series: SeriesPoint[]
  lastValue?: number | null
}

function startDateForRange(range: ChartRange, latest: string | null): string | null {
  if (!latest) return null
  const end = new Date(latest + 'T00:00:00Z')
  const d = new Date(end)
  if (range === '1D') d.setUTCDate(d.getUTCDate() - 1)
  else if (range === '1W') d.setUTCDate(d.getUTCDate() - 7)
  else if (range === '30D') d.setUTCDate(d.getUTCDate() - 30)
  else if (range === '1Y') d.setUTCFullYear(d.getUTCFullYear() - 1)
  else if (range === '5Y') d.setUTCFullYear(d.getUTCFullYear() - 5)
  else if (range === 'YTD') return `${end.getUTCFullYear()}-01-01`
  return d.toISOString().slice(0, 10)
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

function fmtVol(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return '—'
  const v = Number(n)
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`
  return v.toLocaleString('en-US')
}

const VOL_PROXY: Record<string, string> = {
  dgs2: 'SHY ETF',
  dgs10: 'IEF ETF',
  dgs30: 'TLT ETF',
  t10y2y: 'IEF ETF',
}

export function SeriesDetailModal({
  open,
  onClose,
  indicatorId,
  name,
  unit,
  ohlc,
  ohlcLoading,
  series,
  lastValue,
}: Props) {
  const [range, setRange] = useState<ChartRange>('30D')
  const [fit, setFit] = useState(true)
  const [showVol, setShowVol] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const useCandle = useMemo(
    () => ohlc.some((b) => b.indicator_id === indicatorId && b.close != null && b.open != null),
    [ohlc, indicatorId],
  )

  const hasNativeVol = useMemo(
    () =>
      ohlc.some(
        (b) =>
          b.indicator_id === indicatorId &&
          b.volume != null &&
          Number(b.volume) > 0,
      ),
    [ohlc, indicatorId],
  )
  const allowVol = Boolean(VOL_PROXY[indicatorId]) || hasNativeVol

  const points = useMemo(() => {
    if (useCandle) {
      return ohlc
        .filter((b) => b.indicator_id === indicatorId && b.close != null)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((b) => ({
          date: b.date,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close as number,
          volume: b.volume ?? null,
        }))
    }
    return series
      .filter((s) => s.indicator_id === indicatorId && s.value != null)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({
        date: s.date,
        open: null as number | null,
        high: null as number | null,
        low: null as number | null,
        close: s.value as number,
        volume: null as number | null,
      }))
  }, [ohlc, series, indicatorId, useCandle])

  const filtered = useMemo(() => {
    if (!points.length) return []
    const latest = points[points.length - 1]?.date ?? null
    const start = startDateForRange(range, latest)
    if (!start) return points
    return points.filter((b) => b.date >= start)
  }, [points, range])

  const last = lastValue ?? filtered[filtered.length - 1]?.close ?? null
  const prev = filtered.length >= 2 ? filtered[filtered.length - 2]?.close ?? null : null
  const dayChg = last != null && prev != null ? last - prev : null
  const dayPct = dayChg != null && prev ? (dayChg / Math.abs(prev)) * 100 : null
  const up = dayChg != null ? dayChg >= 0 : true

  const hasVolume =
    allowVol && filtered.some((b) => b.volume != null && Number(b.volume) > 0)
  const volOn = allowVol && showVol && hasVolume

  const option = useMemo<EChartsOption>(() => {
    const dates = filtered.map((b) => b.date)
    const upColor = '#38bdf8'
    const downColor = '#f87171'

    const markLine =
      last != null
        ? {
            symbol: 'none' as const,
            label: {
              formatter: fmt(last),
              position: 'end' as const,
              color: '#e2e8f0',
              backgroundColor: 'rgba(15,23,42,0.85)',
              padding: [2, 4] as [number, number],
              borderRadius: 3,
            },
            lineStyle: { color: '#94a3b8', type: 'dashed' as const, width: 1 },
            data: [{ yAxis: last }],
          }
        : undefined

    const seriesOpt: EChartsOption['series'] = useCandle
      ? [
          {
            name: 'K',
            type: 'candlestick',
            data: filtered.map((b) => [
              b.open ?? b.close,
              b.close,
              b.low ?? b.close,
              b.high ?? b.close,
            ]),
            itemStyle: {
              color: upColor,
              color0: downColor,
              borderColor: upColor,
              borderColor0: downColor,
            },
            markLine,
          },
        ]
      : [
          {
            name: 'Close',
            type: 'line',
            data: filtered.map((b) => b.close),
            showSymbol: filtered.length <= 40,
            symbolSize: 6,
            lineStyle: { width: 2, color: upColor },
            itemStyle: { color: upColor },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(56,189,248,0.28)' },
                  { offset: 1, color: 'rgba(56,189,248,0.02)' },
                ],
              },
            },
            markLine,
          },
        ]

    if (volOn) {
      const volData = filtered.map((b) => {
        const o = b.open ?? b.close
        const upBar = b.close >= (o as number)
        const vol = b.volume != null && Number(b.volume) > 0 ? Number(b.volume) : null
        return {
          value: vol,
          itemStyle: {
            color: upBar ? 'rgba(56,189,248,0.45)' : 'rgba(248,113,113,0.45)',
          },
        }
      })
      seriesOpt.push({
        name: 'Vol',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volData,
      })
    }

    return {
      backgroundColor: 'transparent',
      animationDuration: 250,
      legend: { show: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(15,23,42,0.94)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params]
          const p = arr[0] as { dataIndex?: number }
          const i = p?.dataIndex ?? 0
          const b = filtered[i]
          if (!b) return ''
          if (useCandle) {
            return [
              `<div style="font-weight:600;margin-bottom:4px">${b.date}</div>`,
              `开 ${fmt(b.open)}　高 ${fmt(b.high)}`,
              `低 ${fmt(b.low)}　收 ${fmt(b.close)}`,
              b.volume != null && Number(b.volume) > 0 ? `量 ${fmtVol(Number(b.volume))}` : '',
            ]
              .filter(Boolean)
              .join('<br/>')
          }
          return [
            `<div style="font-weight:600;margin-bottom:4px">${b.date}</div>`,
            `收 ${fmt(b.close)}`,
          ].join('<br/>')
        },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: volOn
        ? [
            { left: 16, right: 56, top: 24, height: '62%' },
            { left: 16, right: 56, top: '78%', height: '14%' },
          ]
        : [{ left: 16, right: 56, top: 24, bottom: 36 }],
      xAxis: volOn
        ? [
            {
              type: 'category',
              data: dates,
              boundaryGap: useCandle,
              axisLine: { lineStyle: { color: '#334155' } },
              axisLabel: { show: false },
              splitLine: { show: false },
            },
            {
              type: 'category',
              gridIndex: 1,
              data: dates,
              boundaryGap: useCandle,
              axisLabel: { color: '#64748b', hideOverlap: true, fontSize: 10 },
              axisLine: { lineStyle: { color: '#334155' } },
            },
          ]
        : [
            {
              type: 'category',
              data: dates,
              boundaryGap: useCandle,
              axisLabel: { color: '#64748b', hideOverlap: true, fontSize: 11 },
              axisLine: { lineStyle: { color: '#334155' } },
            },
          ],
      yAxis: volOn
        ? [
            {
              scale: fit,
              axisLabel: { color: '#64748b', fontSize: 11 },
              splitLine: { lineStyle: { color: 'rgba(51,65,85,0.45)' } },
              position: 'right',
            },
            {
              scale: true,
              gridIndex: 1,
              axisLabel: { show: false },
              splitLine: { show: false },
            },
          ]
        : [
            {
              scale: fit,
              axisLabel: { color: '#64748b', fontSize: 11 },
              splitLine: { lineStyle: { color: 'rgba(51,65,85,0.45)' } },
              position: 'right',
            },
          ],
      dataZoom: [
        { type: 'inside', xAxisIndex: volOn ? [0, 1] : [0], start: 0, end: 100 },
      ],
      series: seriesOpt,
    }
  }, [filtered, last, fit, volOn, useCandle])

  if (!open) return null

  const prevClose = prev
  const dayHigh = filtered.length
    ? Math.max(...filtered.map((b) => Number(b.high ?? b.close)))
    : null
  const dayLow = filtered.length
    ? Math.min(...filtered.map((b) => Number(b.low ?? b.close)))
    : null
  // keep for line mode too

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1526] shadow-2xl shadow-cyan-950/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
          <div>
            <div className="text-[11px] text-slate-500">标的详情</div>
            <h2 className="text-lg font-semibold text-slate-50 sm:text-xl">
              {indicatorId.toUpperCase()} · {name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            关闭
          </button>
        </div>

        {ohlcLoading ? (
          <div className="px-4 pt-2 text-xs text-slate-500 sm:px-5">
            K 线数据加载中…
          </div>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3 sm:px-5">
          <div>
            <div className="font-mono text-3xl font-semibold tabular-nums text-slate-50 sm:text-4xl">
              {fmt(last)}
              {unit ? <span className="ml-1 text-base font-sans font-normal text-slate-500">{unit}</span> : null}
            </div>
            {dayChg != null && dayPct != null ? (
              <div
                className={`mt-1 text-sm font-medium tabular-nums ${
                  up ? 'text-cyan-300' : 'text-rose-300'
                }`}
              >
                {up ? '+' : ''}
                {fmt(dayChg, 3)} ({up ? '+' : ''}
                {fmt(dayPct)}%)
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-500">区间内点数 {filtered.length}</div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    range === r
                      ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/60'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setFit((v) => !v)}
                className={`rounded-md px-2 py-0.5 text-[11px] ${
                  fit ? 'bg-slate-800 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Fit
              </button>
              {allowVol ? (
                <button
                  type="button"
                  onClick={() => setShowVol((v) => !v)}
                  className={`rounded-md px-2 py-0.5 text-[11px] ${
                    showVol ? 'bg-slate-800 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Vol
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-[320px] flex-1 px-2 pb-2 pt-2 sm:px-3">
          {filtered.length === 0 ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
              该区间暂无数据
            </div>
          ) : (
            <ReactECharts
              option={option}
              style={{ height: 360, width: '100%' }}
              notMerge
              lazyUpdate
            />
          )}
        </div>

        <div className="border-t border-slate-800 px-4 py-3 sm:px-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            行情关键指标
          </div>
          <div className={`grid grid-cols-2 gap-3 text-sm ${allowVol ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
            <div>
              <div className="text-[11px] text-slate-500">昨收</div>
              <div className="font-mono tabular-nums text-slate-200">{fmt(prevClose)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">区间高低</div>
              <div className="font-mono tabular-nums text-slate-200">
                {fmt(dayLow)} – {fmt(dayHigh)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">点数</div>
              <div className="font-mono tabular-nums text-slate-200">{filtered.length}</div>
            </div>
            {allowVol ? (
              <div>
                <div className="text-[11px] text-slate-500">成交量</div>
                <div className="font-mono tabular-nums text-slate-200">
                  {fmtVol(filtered[filtered.length - 1]?.volume ?? null)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {VOL_PROXY[indicatorId]
                    ? `${VOL_PROXY[indicatorId]} 代理`
                    : '成交量'}
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-[11px] text-slate-500">图表</div>
              <div className="text-slate-200">{useCandle ? 'K 线' : '折线'}</div>
              <div className="text-[10px] text-slate-500">
                {allowVol
                  ? VOL_PROXY[indicatorId]
                    ? '量=国债 ETF'
                    : '量=成交量'
                  : '无成交量'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
