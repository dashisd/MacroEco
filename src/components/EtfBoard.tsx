import { useState } from 'react'
import type { useEtfData } from '../hooks/useEtfData'
import { SeriesChart } from './SeriesChart'
import { SeriesDetailModal } from './SeriesDetailModal'
import { SeriesToggles } from './SeriesToggles'
import { SparklineCard } from './SparklineCard'

type EtfState = ReturnType<typeof useEtfData>

/** Same 4-up slot as macro chart groups in LatestReadings. */
const SLOT_CLASS = 'w-[calc((100%-1.5rem)/4)] shrink-0'

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

export function EtfBoard({ etf }: { etf: EtfState }) {
  const [modalTicker, setModalTicker] = useState<string | null>(null)
  const modal = modalTicker
    ? etf.groups.flatMap((g) => g.cards).find((card) => card.ticker === modalTicker) ?? null
    : null

  return (
    <>
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-200">ETF 行情</h2>
          <p className="text-xs text-slate-500">
            etf_prices · 近一年走势 · 点击卡片查看该 ETF 自身的 K 线与成交量
          </p>
        </div>

        {etf.loading && etf.loadedTickers === 0 ? (
          <p className="text-sm text-slate-400">行情加载中…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {etf.groups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5"
              >
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                  <span className="ml-2 font-normal text-slate-600">{group.cards.length}</span>
                </h3>
                <div className="flex flex-col gap-2">
                  {chunkRows(group.cards, 4).map((row, ri) => (
                    <div
                      key={`${group.id}-r${ri}`}
                      className="flex flex-row flex-nowrap justify-start gap-2"
                    >
                      {row.map((card) => (
                        <div key={card.ticker} className={SLOT_CLASS}>
                          <SparklineCard
                            indicatorId={card.ticker}
                            name={card.name}
                            observation={card.observation}
                            series={etf.closeSeries}
                            unit="USD"
                            active={modalTicker === card.ticker}
                            onOpen={() => setModalTicker(card.ticker)}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <SeriesToggles
        availableIds={etf.availableSeriesIds}
        enabledIds={etf.enabledSeries}
        indicators={etf.indicators}
        rangeDays={etf.rangeDays}
        focusedId={etf.focusedId}
        activePresetId={etf.activePresetId}
        presetIds={['etf_rs']}
        onToggle={etf.toggleSeries}
        onRangeChange={etf.setRangeDays}
        onFocus={etf.setFocusedId}
        onApplyPreset={etf.applySeriesPreset}
      />

      <SeriesChart
        series={etf.ratioSeries}
        enabledIds={etf.enabledSeries}
        indicators={etf.indicators}
        focusedId={etf.focusedId}
        loading={etf.ratioLoading && etf.ratioSeries.length === 0}
        asideHint="点击图例聚焦一条相对强弱"
        emptyHint="`etf_ratio_series` 尚无五条相对强弱。写入调整后收盘比值后显示在此，不会用 sp500 / nasdaq 代替 SPY / QQQ。"
        onSeriesFocus={etf.setFocusedId}
      />

      <p className="text-center text-[11px] text-slate-600">
        比值来自 etf_ratio_series（调整后收盘），只在浏览器里并入同框图，不写入 observations / series_1y。
      </p>

      {modal ? (
        <SeriesDetailModal
          open
          onClose={() => setModalTicker(null)}
          indicatorId={modal.ticker}
          name={modal.name}
          unit="USD"
          ohlc={modal.ohlc}
          ohlcLoading={etf.loading && modal.ohlc.length === 0}
          series={etf.closeSeries}
          lastValue={modal.observation.actual}
        />
      ) : null}
    </>
  )
}
