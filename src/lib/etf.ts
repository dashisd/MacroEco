import { supabase, supabaseConfigured } from './supabase'
import type { Indicator, OhlcBar, Observation, SeriesPoint } from '../types/database'

export type EtfGroupId = 'broad' | 'sector' | 'credit_rates' | 'style_theme'

export interface EtfCatalogEntry {
  ticker: string
  name: string
  group_id: EtfGroupId
  issuer: string
  sort_order: number
}

export interface EtfRatioDef {
  id: string
  label: string
  numerator: string
  denominator: string
}

/** Phase-1 universe. Matches supabase/migrations/001_etf_phase1_prices_and_ratios.sql. */
export const ETF_CATALOG: EtfCatalogEntry[] = [
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', group_id: 'broad', issuer: 'SSGA', sort_order: 10 },
  { ticker: 'RSP', name: 'Invesco S&P 500 Equal Weight', group_id: 'broad', issuer: 'Invesco', sort_order: 20 },
  { ticker: 'QQQ', name: 'Invesco QQQ', group_id: 'broad', issuer: 'Invesco', sort_order: 30 },
  { ticker: 'IWM', name: 'iShares Russell 2000', group_id: 'broad', issuer: 'iShares', sort_order: 40 },
  { ticker: 'XLK', name: 'Technology Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 50 },
  { ticker: 'XLF', name: 'Financial Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 60 },
  { ticker: 'XLI', name: 'Industrial Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 70 },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 80 },
  { ticker: 'XLV', name: 'Health Care Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 90 },
  { ticker: 'XLP', name: 'Consumer Staples Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 100 },
  { ticker: 'XLU', name: 'Utilities Select Sector SPDR', group_id: 'sector', issuer: 'SSGA', sort_order: 110 },
  { ticker: 'XBI', name: 'SPDR S&P Biotech ETF', group_id: 'sector', issuer: 'SSGA', sort_order: 115 },
  { ticker: 'HYG', name: 'iShares iBoxx High Yield Corporate', group_id: 'credit_rates', issuer: 'iShares', sort_order: 120 },
  { ticker: 'LQD', name: 'iShares iBoxx Investment Grade Corporate', group_id: 'credit_rates', issuer: 'iShares', sort_order: 130 },
  { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond', group_id: 'credit_rates', issuer: 'iShares', sort_order: 140 },
  { ticker: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', group_id: 'credit_rates', issuer: 'iShares', sort_order: 145 },
  { ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', group_id: 'style_theme', issuer: 'Schwab', sort_order: 160 },
  { ticker: 'MTUM', name: 'iShares MSCI USA Momentum Factor ETF', group_id: 'style_theme', issuer: 'iShares', sort_order: 170 },
  { ticker: 'QUAL', name: 'iShares MSCI USA Quality Factor ETF', group_id: 'style_theme', issuer: 'iShares', sort_order: 180 },
  { ticker: 'ARKK', name: 'ARK Innovation ETF', group_id: 'style_theme', issuer: 'ARK', sort_order: 190 },
]

export const ETF_GROUP_ORDER: { id: EtfGroupId; label: string }[] = [
  { id: 'broad', label: '宽基' },
  { id: 'sector', label: '行业' },
  { id: 'credit_rates', label: '信用·利率' },
  { id: 'style_theme', label: '风格·主题' },
]

/** Total-return ratios. Never substitute sp500 / nasdaq index series for SPY / QQQ. */
export const ETF_RATIOS: EtfRatioDef[] = [
  { id: 'spy_rsp', label: 'SPY/RSP', numerator: 'SPY', denominator: 'RSP' },
  { id: 'qqq_spy', label: 'QQQ/SPY', numerator: 'QQQ', denominator: 'SPY' },
  { id: 'iwm_spy', label: 'IWM/SPY', numerator: 'IWM', denominator: 'SPY' },
  { id: 'xlk_xlf', label: 'XLK/XLF', numerator: 'XLK', denominator: 'XLF' },
  { id: 'hyg_lqd', label: 'HYG/LQD', numerator: 'HYG', denominator: 'LQD' },
]

export const ETF_RATIO_IDS = ETF_RATIOS.map((r) => r.id)

export const ETF_RATIO_ID_SET = new Set(ETF_RATIO_IDS)

export const ETF_TICKERS = ETF_CATALOG.map((entry) => entry.ticker)

export const ETF_TICKER_SET = new Set(ETF_TICKERS)

export const ETF_PRESET_ID = 'etf_rs'

/** ETF page 序列开关. Macro keeps its own list and does not show these price groups. */
export const ETF_PAGE_PRESET_IDS = [
  'etf_rs',
  'etf_broad',
  'etf_sector',
  'etf_credit',
  'etf_style',
]

const PAGE = 1000

export function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function etfPriceIndicators(): Indicator[] {
  return ETF_CATALOG.map((entry) => ({
    id: entry.ticker,
    name: entry.ticker,
    category: 'etf_price',
    frequency: 'D',
    unit: 'USD',
    source_hint: 'etf_prices · close',
    created_at: null,
  }))
}

export function etfRatioIndicators(): Indicator[] {
  return ETF_RATIOS.map((r) => ({
    id: r.id,
    name: r.label,
    category: 'etf_ratio',
    frequency: 'D',
    unit: '比值',
    source_hint: 'etf_ratio_series · adj_close',
    created_at: null,
  }))
}

export interface EtfUniverseRow {
  ticker: string
  name: string
  group_id: EtfGroupId
  issuer: string | null
  sort_order: number
}

export interface EtfPriceBar {
  ticker: string
  trade_date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  adj_close: number | null
  volume: number | null
}

interface PricePayload {
  ticker: string
  trade_date: string
  open: unknown
  high: unknown
  low: unknown
  close: unknown
  adj_close: unknown
  volume: unknown
}

interface RatioPayload {
  ratio_id: string
  trade_date: string
  value: unknown
}

function isGroupId(value: string): value is EtfGroupId {
  return (
    value === 'broad' ||
    value === 'sector' ||
    value === 'credit_rates' ||
    value === 'style_theme'
  )
}

/** Catalog order, with live etf_universe names when the row exists. */
export function mergeUniverse(rows: EtfUniverseRow[]): EtfUniverseRow[] {
  const byTicker = new Map(rows.map((r) => [r.ticker, r]))
  return ETF_CATALOG.map((entry) => {
    const live = byTicker.get(entry.ticker)
    if (!live) {
      return {
        ticker: entry.ticker,
        name: entry.name,
        group_id: entry.group_id,
        issuer: entry.issuer,
        sort_order: entry.sort_order,
      }
    }
    return live
  }).sort((a, b) => a.sort_order - b.sort_order || a.ticker.localeCompare(b.ticker))
}

export async function fetchEtfUniverse(): Promise<EtfUniverseRow[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase
    .from('etf_universe')
    .select('ticker,name,group_id,issuer,sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  const rows: EtfUniverseRow[] = []
  for (const raw of data ?? []) {
    const group = String(raw.group_id ?? '')
    if (!isGroupId(group)) continue
    rows.push({
      ticker: String(raw.ticker),
      name: String(raw.name),
      group_id: group,
      issuer: raw.issuer == null ? null : String(raw.issuer),
      sort_order: asNumber(raw.sort_order) ?? 0,
    })
  }
  return rows
}

async function fetchTickerPrices(ticker: string, since: string): Promise<EtfPriceBar[]> {
  const rows: EtfPriceBar[] = []
  for (let from = 0; ; from += PAGE) {
    const page = await supabase
      .from('etf_prices')
      .select('ticker,trade_date,open,high,low,close,adj_close,volume')
      .eq('ticker', ticker)
      .gte('trade_date', since)
      .order('trade_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (page.error) throw new Error(page.error.message)
    const chunk = (page.data ?? []) as PricePayload[]
    for (const row of chunk) {
      rows.push({
        ticker: row.ticker,
        trade_date: row.trade_date,
        open: asNumber(row.open),
        high: asNumber(row.high),
        low: asNumber(row.low),
        close: asNumber(row.close),
        adj_close: asNumber(row.adj_close),
        volume: asNumber(row.volume),
      })
    }
    if (chunk.length < PAGE) break
    if (from + PAGE > 20000) break
  }
  return rows
}

export async function fetchEtfPrices(since: string): Promise<EtfPriceBar[]> {
  if (!supabaseConfigured) return []
  const chunks = await Promise.all(
    ETF_CATALOG.map((entry) => fetchTickerPrices(entry.ticker, since)),
  )
  return chunks.flat()
}

/** Read etf_ratio_series and shape it like a chart series. Does not write observations or series_1y. */
export async function fetchEtfRatioPoints(since: string): Promise<SeriesPoint[]> {
  if (!supabaseConfigured) return []
  const chunks = await Promise.all(
    ETF_RATIOS.map(async (ratio) => {
      const rows: SeriesPoint[] = []
      for (let from = 0; ; from += PAGE) {
        const page = await supabase
          .from('etf_ratio_series')
          .select('ratio_id,trade_date,value')
          .eq('ratio_id', ratio.id)
          .gte('trade_date', since)
          .order('trade_date', { ascending: true })
          .range(from, from + PAGE - 1)
        if (page.error) throw new Error(page.error.message)
        const chunk = (page.data ?? []) as RatioPayload[]
        for (const row of chunk) {
          const value = asNumber(row.value)
          if (value == null) continue
          rows.push({
            indicator_id: row.ratio_id,
            date: row.trade_date,
            value,
          })
        }
        if (chunk.length < PAGE) break
        if (from + PAGE > 20000) break
      }
      return rows
    }),
  )
  return chunks.flat()
}

export function priceLevel(bar: EtfPriceBar): number | null {
  return bar.close ?? bar.adj_close
}

export function pricesToSeries(bars: EtfPriceBar[]): SeriesPoint[] {
  const points: SeriesPoint[] = []
  for (const bar of bars) {
    const value = priceLevel(bar)
    if (value == null) continue
    points.push({ indicator_id: bar.ticker, date: bar.trade_date, value })
  }
  return points
}

export function pricesToOhlc(bars: EtfPriceBar[]): OhlcBar[] {
  const rows: OhlcBar[] = []
  for (const bar of bars) {
    const close = priceLevel(bar)
    if (close == null) continue
    rows.push({
      indicator_id: bar.ticker,
      date: bar.trade_date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close,
      volume: bar.volume,
    })
  }
  return rows
}

export function latestObservation(ticker: string, bars: EtfPriceBar[]): Observation {
  const priced = bars.filter((b) => b.ticker === ticker && priceLevel(b) != null)
  const last = priced[priced.length - 1]
  const actual = last ? priceLevel(last) : null
  return {
    id: ticker,
    indicator_id: ticker,
    as_of: last?.trade_date ?? '',
    reference_period: last?.trade_date ?? null,
    actual,
    unit: 'USD',
    source_url: null,
    evidence_grade: null,
    data_quality: actual == null ? 'NA' : null,
    created_at: null,
    updated_at: null,
  }
}
