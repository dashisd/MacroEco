import { useState, type ReactNode } from 'react'
import type { useEtfData } from '../hooks/useEtfData'
import type { Indicator, Observation, SeriesPoint } from '../types/database'
import {
  DEFAULT_SERIES_IDS,
  EMERGING_MARKET_IDS,
  seriesDisplayName,
} from '../types/database'
import { SparklineCard } from './SparklineCard'
import { SparklineSlots } from './SparklineSlots'

type EtfState = ReturnType<typeof useEtfData>

type MacroSlot = { kind: 'macro'; id: string }
type EtfSlot = { kind: 'etf'; ticker: string }
type Slot = MacroSlot | EtfSlot

/** Slots that stay on screen as NA cards when the database has no print yet. */
const EMPTY_WHEN_MISSING = new Set<string>([...DEFAULT_SERIES_IDS, ...EMERGING_MARKET_IDS])

const TABS: { id: string; label: string; slots: Slot[] }[] = [
  {
    id: 'benchmarks',
    label: '大盘',
    slots: DEFAULT_SERIES_IDS.map((id) => ({ kind: 'macro', id })),
  },
  {
    id: 'treasuries',
    label: '国债',
    slots: [
      { kind: 'macro', id: 'dgs2' },
      { kind: 'macro', id: 'dgs10' },
      { kind: 'macro', id: 'dgs30' },
    ],
  },
  {
    id: 'credit',
    label: '信用',
    slots: [
      { kind: 'etf', ticker: 'HYG' },
      { kind: 'etf', ticker: 'LQD' },
      { kind: 'etf', ticker: 'TLT' },
      { kind: 'etf', ticker: 'SGOV' },
    ],
  },
  {
    id: 'market',
    label: '市场',
    slots: [
      { kind: 'etf', ticker: 'SPY' },
      { kind: 'etf', ticker: 'RSP' },
      { kind: 'etf', ticker: 'QQQ' },
      { kind: 'etf', ticker: 'IWM' },
      { kind: 'macro', id: 'wti' },
      { kind: 'macro', id: 'brent' },
      { kind: 'macro', id: 'gold_comex' },
      { kind: 'macro', id: 'btc' },
      { kind: 'macro', id: 'vix' },
      { kind: 'macro', id: 'vixeq' },
      { kind: 'macro', id: 'vixeq_vix_ratio' },
    ],
  },
  {
    id: 'emerging',
    label: '新兴市场',
    // Pair order, two pairs per row: JPY/日经, EUR/斯托克, HKD/恒生, CNY/沪深300.
    slots: EMERGING_MARKET_IDS.map((id) => ({ kind: 'macro', id })),
  },
  {
    id: 'sector',
    label: '行业 ETF',
    slots: ['XLK', 'XLF', 'XLI', 'XLE', 'XLV', 'XLP', 'XLU', 'XBI'].map((ticker) => ({
      kind: 'etf' as const,
      ticker,
    })),
  },
  {
    id: 'strategy',
    label: '策略 ETF',
    slots: ['SCHD', 'MTUM', 'QUAL', 'ARKK'].map((ticker) => ({
      kind: 'etf' as const,
      ticker,
    })),
  },
]

function hasPrint(observation: Observation | undefined): observation is Observation {
  return observation != null && observation.data_quality !== 'NA' && observation.actual != null
}

interface Props {
  observations: Observation[]
  indicators: Indicator[]
  series: SeriesPoint[]
  focusedId: string | null
  etf: EtfState
  activeId: string | null
  loading?: boolean
  onOpenMacro: (id: string) => void
  onOpenEtf: (ticker: string) => void
}

export function MarketDataSection({
  observations,
  indicators,
  series,
  focusedId,
  etf,
  activeId,
  loading = false,
  onOpenMacro,
  onOpenEtf,
}: Props) {
  const [tabId, setTabId] = useState(TABS[0]!.id)
  const tab = TABS.find((item) => item.id === tabId) ?? TABS[0]!

  const obsById = new Map(observations.map((o) => [o.indicator_id, o]))
  const indById = new Map(indicators.map((i) => [i.id, i]))
  const etfByTicker = new Map(
    etf.groups.flatMap((group) => group.cards.map((card) => [card.ticker, card] as const)),
  )

  const etfLoading = etf.loading && etf.loadedTickers === 0
  const items: { key: string; node: ReactNode }[] = []

  for (const slot of tab.slots) {
    if (slot.kind === 'macro') {
      const observation = obsById.get(slot.id)
      const ind = indById.get(slot.id)
      const name = seriesDisplayName(slot.id, ind?.name)
      if (!hasPrint(observation)) {
        // 大盘 waits for the first payload instead of flashing four NA cards.
        if (!EMPTY_WHEN_MISSING.has(slot.id) || (tab.id === 'benchmarks' && loading)) continue
        items.push({
          key: slot.id,
          node: (
            <SparklineCard
              indicatorId={slot.id}
              name={name}
              observation={null}
              series={series}
              active={focusedId === slot.id || activeId === slot.id}
              onOpen={() => onOpenMacro(slot.id)}
            />
          ),
        })
        continue
      }
      items.push({
        key: slot.id,
        node: (
          <SparklineCard
            indicatorId={slot.id}
            name={name}
            observation={observation}
            series={series}
            unit={observation.unit || ind?.unit}
            active={focusedId === slot.id || activeId === slot.id}
            onOpen={() => onOpenMacro(slot.id)}
          />
        ),
      })
      continue
    }

    const card = etfByTicker.get(slot.ticker)
    if (!card || !hasPrint(card.observation)) continue
    items.push({
      key: slot.ticker,
      node: (
        <SparklineCard
          indicatorId={card.ticker}
          name={card.name}
          observation={card.observation}
          series={etf.closeSeries}
          unit="USD"
          active={activeId === card.ticker}
          onOpen={() => onOpenEtf(card.ticker)}
        />
      ),
    })
  }

  const benchmarksPending = loading && tab.id === 'benchmarks' && items.length === 0
  const waitingForEtf = etfLoading && tab.slots.some((slot) => slot.kind === 'etf')

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-200">市场数据</h2>
        <p className="text-xs text-slate-500">近一年走势 · 点击卡片打开 K 线</p>
      </div>

      <div
        role="tablist"
        aria-label="市场数据"
        className="mb-3 inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-slate-700 bg-slate-900 p-0.5"
      >
        {TABS.map((item) => {
          const selected = item.id === tab.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`market-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`market-panel-${item.id}`}
              onClick={() => setTabId(item.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                selected
                  ? 'bg-cyan-500/20 text-cyan-200 shadow-sm ring-1 ring-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`market-panel-${tab.id}`}
        aria-labelledby={`market-tab-${tab.id}`}
      >
        {benchmarksPending || (waitingForEtf && items.length === 0) ? (
          <p className="text-sm text-slate-400">
            {benchmarksPending ? '读数加载中…' : '行情加载中…'}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">该分组暂无读数。</p>
        ) : (
          <>
            <SparklineSlots items={items} />
            {waitingForEtf ? (
              <p className="mt-2 text-xs text-slate-500">ETF 行情加载中…</p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
