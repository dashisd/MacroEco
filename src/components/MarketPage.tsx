import { useEffect, useMemo, useState } from 'react'
import type { DashboardState } from '../hooks/useDashboardData'
import type { useEtfData } from '../hooks/useEtfData'
import { MACRO_TOGGLE_PRESET_IDS } from '../lib/categories'
import { SeriesChart } from './SeriesChart'
import { SeriesDetailModal } from './SeriesDetailModal'
import { SeriesToggles } from './SeriesToggles'
import { MarketDataSection } from './MarketDataSection'
import { SparklineCard } from './SparklineCard'
import { SparklineSlots } from './SparklineSlots'

type EtfState = ReturnType<typeof useEtfData>

const KPI_IDS = ['sp500', 'nasdaq', 'dji', 't10y2y'] as const

type ModalTarget = { source: 'macro' | 'etf'; id: string }

interface Props {
  d: DashboardState
  etf: EtfState
  onFocusIndicator: (id: string | null) => void
}

export function MarketPage({ d, etf, onFocusIndicator }: Props) {
  const [modal, setModal] = useState<ModalTarget | null>(null)
  const ensureOhlc = d.ensureOhlc

  useEffect(() => {
    if (modal?.source === 'macro') void ensureOhlc(modal.id)
  }, [modal, ensureOhlc])

  const visibleObs = useMemo(() => {
    const best = new Map<string, (typeof d.observations)[number]>()
    for (const o of d.observations) {
      if (o.data_quality === 'NA' || o.actual == null) continue
      const prev = best.get(o.indicator_id)
      if (!prev) {
        best.set(o.indicator_id, o)
        continue
      }
      const newer =
        o.as_of > prev.as_of || (o.as_of === prev.as_of && (o.id ?? 0) > (prev.id ?? 0))
      if (newer) best.set(o.indicator_id, o)
    }
    return best
  }, [d.observations])

  const indById = useMemo(() => {
    const map = new Map(d.indicators.map((i) => [i.id, i]))
    return map
  }, [d.indicators])

  const kpiItems = KPI_IDS.flatMap((id) => {
    const observation = visibleObs.get(id)
    if (!observation) return []
    const ind = indById.get(id)
    return [
      {
        key: id,
        node: (
          <SparklineCard
            indicatorId={id}
            name={ind?.name ?? id}
            observation={observation}
            series={d.series}
            unit={observation.unit || ind?.unit}
            active={d.focusedIndicatorId === id || (modal?.source === 'macro' && modal.id === id)}
            onOpen={() => {
              onFocusIndicator(id)
              setModal({ source: 'macro', id })
            }}
          />
        ),
      },
    ]
  })

  const macroModalId = modal?.source === 'macro' ? modal.id : null
  const macroInd = macroModalId ? indById.get(macroModalId) : null
  const macroObs = macroModalId ? visibleObs.get(macroModalId) : null
  const macroOhlc = macroModalId ? (d.ohlcById[macroModalId] ?? []) : []
  const macroOhlcLoading =
    Boolean(macroModalId) &&
    (d.ohlcLoadingId === macroModalId ||
      (macroModalId != null && d.ohlcById[macroModalId] === undefined))

  const etfCard =
    modal?.source === 'etf'
      ? etf.groups.flatMap((group) => group.cards).find((card) => card.ticker === modal.id) ?? null
      : null

  const openMacro = (id: string) => {
    onFocusIndicator(id)
    setModal({ source: 'macro', id })
  }

  return (
    <>
      {d.error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          读取 Supabase 失败：{d.error}
        </div>
      ) : null}
      {etf.error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          读取 ETF 数据失败：{etf.error}
        </div>
      ) : null}

      <section aria-label="市场概览">
        {d.loading && kpiItems.length === 0 ? (
          <p className="text-sm text-slate-400">读数加载中…</p>
        ) : kpiItems.length === 0 ? (
          <p className="text-sm text-slate-500">该报告日暂无这四项读数。</p>
        ) : (
          <SparklineSlots items={kpiItems} />
        )}
      </section>

      <SeriesToggles
        availableIds={d.availableSeriesIds}
        enabledIds={d.enabledSeries}
        indicators={d.indicators}
        rangeDays={d.rangeDays}
        focusedId={d.focusedIndicatorId}
        activePresetId={d.activePresetId}
        presetIds={MACRO_TOGGLE_PRESET_IDS}
        onToggle={d.toggleSeries}
        onRangeChange={d.setRangeDays}
        onFocus={d.setFocusedIndicatorId}
        onApplyPreset={d.applySeriesPreset}
      />

      <SeriesChart
        series={d.series}
        enabledIds={d.enabledSeries}
        indicators={d.indicators}
        focusedId={d.focusedIndicatorId}
        loading={d.loading}
        onSeriesFocus={(id) => {
          d.setFocusedIndicatorId(id)
          if (id) {
            const match = d.notes.find((n) => n.indicator_id === id)
            d.setSelectedNoteId(match?.id ?? null)
          } else {
            d.setSelectedNoteId(null)
          }
        }}
      />

      <MarketDataSection
        observations={[...visibleObs.values()]}
        indicators={d.indicators}
        series={d.series}
        focusedId={d.focusedIndicatorId}
        etf={etf}
        activeId={modal?.id ?? null}
        onOpenMacro={openMacro}
        onOpenEtf={(ticker) => setModal({ source: 'etf', id: ticker })}
      />

      {macroModalId && macroInd ? (
        <SeriesDetailModal
          open
          onClose={() => setModal(null)}
          indicatorId={macroModalId}
          name={macroInd.name}
          unit={macroObs?.unit || macroInd.unit}
          ohlc={macroOhlc}
          ohlcLoading={macroOhlcLoading}
          series={d.series}
          lastValue={macroObs?.actual ?? null}
        />
      ) : null}

      {etfCard ? (
        <SeriesDetailModal
          open
          onClose={() => setModal(null)}
          indicatorId={etfCard.ticker}
          name={etfCard.name}
          unit="USD"
          ohlc={etfCard.ohlc}
          ohlcLoading={etf.loading && etfCard.ohlc.length === 0}
          series={etf.closeSeries}
          lastValue={etfCard.observation.actual}
        />
      ) : null}
    </>
  )
}
