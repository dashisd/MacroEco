/**
 * Pure rules for the five-series FRED board ingest.
 * No network, no secrets, no writes. The Edge Function applies this plan.
 *
 * Official series, mapped to indicator ids already on the board:
 *   DCOILWTICO   → wti
 *   BAMLH0A0HYM2 → hy_oas
 *   BAMLC0A0CM   → ig_oas
 *   T10Y2Y       → t10y2y
 *   T10YIE       → t10yie
 */

export const LOOKBACK_DAYS = 21
const NY_CLOSE_MINUTES = 16 * 60

export interface FredSeries {
  fredId: string
  indicatorId: string
  unit: string
}

/** The only series this job may write. Units match public.indicators. */
export const FRED_SERIES: readonly FredSeries[] = [
  { fredId: 'DCOILWTICO', indicatorId: 'wti', unit: 'USD/bbl' },
  { fredId: 'BAMLH0A0HYM2', indicatorId: 'hy_oas', unit: '%' },
  { fredId: 'BAMLC0A0CM', indicatorId: 'ig_oas', unit: '%' },
  { fredId: 'T10Y2Y', indicatorId: 't10y2y', unit: 'pp' },
  { fredId: 'T10YIE', indicatorId: 't10yie', unit: '%' },
]

/**
 * Series this job must never write. Nominal Treasury yields stay on WSJ closes.
 * ETF prices, vol, equity indexes, Brent, gold, and BTC stay on their own feeds.
 */
export const EXCLUDED_INDICATOR_IDS: readonly string[] = [
  'dgs2',
  'dgs10',
  'dgs30',
  'vix',
  'vixeq',
  'dspx',
  'vixeq_vix_ratio',
  'sp500',
  'nasdaq',
  'dji',
  'brent',
  'gold_comex',
  'btc',
  'SPY',
  'RSP',
  'QQQ',
  'IWM',
  'XLK',
  'XLF',
  'XLI',
  'XLE',
  'XLV',
  'XLP',
  'XLU',
  'XBI',
  'HYG',
  'LQD',
  'TLT',
  'SGOV',
  'SCHD',
  'MTUM',
  'QUAL',
  'ARKK',
  'spy_rsp',
  'qqq_spy',
  'iwm_spy',
  'xlk_xlf',
  'hyg_lqd',
]

const ALLOWED_IDS = new Set(FRED_SERIES.map((series) => series.indicatorId))
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const FRED_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

export function fredSeriesUrl(fredId: string): string {
  return `https://fred.stlouisfed.org/series/${fredId}`
}

/** FRED uses "." for a missing print. Blank and NA are missing too. 0 is a real print. */
export function parseFredValue(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '.' || trimmed.toUpperCase() === 'NA') return null
  if (!FRED_NUMBER.test(trimmed)) return null
  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) return null
  return trimmed
}

export function assertAllowedIndicator(indicatorId: string): void {
  if (!ALLOWED_IDS.has(indicatorId)) {
    throw new Error(`refusing to write indicator ${indicatorId}`)
  }
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: string
}

export function zonedParts(now: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  const bag = Object.fromEntries(fmt.formatToParts(now).map((part) => [part.type, part.value]))
  let hour = Number(bag.hour)
  if (hour === 24) hour = 0
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    weekday: bag.weekday ?? '',
  }
}

export function isoFromParts(parts: Pick<ZonedParts, 'year' | 'month' | 'day'>): string {
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return isoFromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  })
}

function isoWeekday(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function previousWeekday(iso: string): string {
  let cursor = addIsoDays(iso, -1)
  while (isoWeekday(cursor) === 0 || isoWeekday(cursor) === 6) {
    cursor = addIsoDays(cursor, -1)
  }
  return cursor
}

/**
 * Latest completed US cash session (America/New_York, 16:00 close).
 * Weekends and pre-close weekdays roll back to the previous weekday.
 * Holidays are not skipped: a holiday with no FRED print is a missing value.
 */
export function targetTradeDate(now: Date): string {
  const ny = zonedParts(now, 'America/New_York')
  const today = isoFromParts(ny)
  const minutes = ny.hour * 60 + ny.minute
  const weekend = ny.weekday === 'Sat' || ny.weekday === 'Sun'
  if (weekend || minutes < NY_CLOSE_MINUTES) return previousWeekday(today)
  return today
}

export function shanghaiHour(now: Date): number {
  return zonedParts(now, 'Asia/Shanghai').hour
}

export function fredWindow(now: Date, tradeDate: string): { start: string; end: string } {
  const ny = zonedParts(now, 'America/New_York')
  const end = isoFromParts(ny)
  const start = addIsoDays(tradeDate, -LOOKBACK_DAYS)
  return { start, end: end < start ? start : end }
}

/**
 * 10:00 and 14:00 Asia/Shanghai re-check a finished trade date and leave it alone.
 * 08:00 always attempts the write so a revision can land.
 * An explicit skip_if_complete boolean from the cron body wins.
 */
export function shouldSkipIfComplete(input: {
  slot?: string | null
  skipIfComplete?: boolean | null
  shanghaiHour: number
}): boolean {
  if (typeof input.skipIfComplete === 'boolean') return input.skipIfComplete
  if (input.slot === '10:00' || input.slot === '14:00') return true
  if (input.slot === '08:00') return false
  return input.shanghaiHour === 10 || input.shanghaiHour === 14
}

export function isTradeDateComplete(presentIndicatorIds: readonly string[]): boolean {
  const present = new Set(presentIndicatorIds)
  return FRED_SERIES.every((series) => present.has(series.indicatorId))
}

export function gate(skipRequested: boolean, presentIndicatorIds: readonly string[]): 'skip' | 'run' {
  if (skipRequested && isTradeDateComplete(presentIndicatorIds)) return 'skip'
  return 'run'
}

export interface FredPoint {
  date: string
  value: string
}

export interface SeriesRow {
  indicator_id: string
  date: string
  value: string
}

export interface ObservationRow {
  indicator_id: string
  as_of: string
  reference_period: string
  actual: string | null
  unit: string
  source_url: string
  evidence_grade: 'E1'
  data_quality: 'OK' | 'NA'
  updated_at: string
}

export interface SeriesPlan {
  seriesRows: SeriesRow[]
  observation: ObservationRow
  targetMissing: boolean
}

/**
 * Real FRED numbers become series_1y rows. "." / blank / NA do not.
 * The observation snapshot is only the target trade_date: OK with the print,
 * or NA when that date is absent. Older dates are not given observation rows.
 */
export function planSeries(
  series: FredSeries,
  points: readonly FredPoint[],
  tradeDate: string,
  nowIso: string,
): SeriesPlan {
  assertAllowedIndicator(series.indicatorId)
  const seriesRows: SeriesRow[] = []
  let sawTarget = false
  let targetValue: string | null = null

  for (const point of points) {
    if (!ISO_DATE.test(point.date) || point.date > tradeDate) continue
    const value = parseFredValue(point.value)
    if (point.date === tradeDate) {
      sawTarget = true
      targetValue = value
    }
    if (value == null) continue
    seriesRows.push({
      indicator_id: series.indicatorId,
      date: point.date,
      value,
    })
  }

  const targetMissing = !sawTarget || targetValue == null
  return {
    seriesRows,
    targetMissing,
    observation: {
      indicator_id: series.indicatorId,
      as_of: tradeDate,
      reference_period: tradeDate,
      actual: targetMissing ? null : targetValue,
      unit: series.unit,
      source_url: fredSeriesUrl(series.fredId),
      evidence_grade: 'E1',
      data_quality: targetMissing ? 'NA' : 'OK',
      updated_at: nowIso,
    },
  }
}

export function shouldKeepExistingPrint(existing: {
  actual: number | string | null
  data_quality: string | null
} | null): boolean {
  if (!existing || existing.actual == null || existing.actual === '') return false
  return existing.data_quality === 'OK' || existing.data_quality === 'REVISED'
}
