/**
 * Upsert ~5y daily bars for the phase-1 US ETF universe into etf_prices,
 * then upsert the five relative-strength ratios into etf_ratio_series.
 *
 * Ratios use adj_close (total return). If adj_close is null, that leg falls
 * back to close and the ratio source is marked close_fallback. quality_flag
 * stays single_source in both cases: one free vendor, not cross-checked.
 * A missing print is skipped. This script never deletes rows.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ingest-etf.mjs
 *   node scripts/ingest-etf.mjs --dry-run
 *
 * URL falls back to VITE_SUPABASE_URL. A local .env is loaded only to fill
 * variables that are not already set. Secrets are never printed.
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const UNIVERSE = [
  ['SPY', 'SPDR S&P 500 ETF', 'broad', 'SSGA', 10],
  ['RSP', 'Invesco S&P 500 Equal Weight', 'broad', 'Invesco', 20],
  ['QQQ', 'Invesco QQQ', 'broad', 'Invesco', 30],
  ['IWM', 'iShares Russell 2000', 'broad', 'iShares', 40],
  ['XLK', 'Technology Select Sector SPDR', 'sector', 'SSGA', 50],
  ['XLF', 'Financial Select Sector SPDR', 'sector', 'SSGA', 60],
  ['XLI', 'Industrial Select Sector SPDR', 'sector', 'SSGA', 70],
  ['XLE', 'Energy Select Sector SPDR', 'sector', 'SSGA', 80],
  ['XLV', 'Health Care Select Sector SPDR', 'sector', 'SSGA', 90],
  ['XLP', 'Consumer Staples Select Sector SPDR', 'sector', 'SSGA', 100],
  ['XLU', 'Utilities Select Sector SPDR', 'sector', 'SSGA', 110],
  ['XBI', 'SPDR S&P Biotech ETF', 'sector', 'SSGA', 115],
  ['HYG', 'iShares iBoxx High Yield Corporate', 'credit_rates', 'iShares', 120],
  ['LQD', 'iShares iBoxx Investment Grade Corporate', 'credit_rates', 'iShares', 130],
  ['TLT', 'iShares 20+ Year Treasury Bond', 'credit_rates', 'iShares', 140],
  ['SGOV', 'iShares 0-3 Month Treasury Bond ETF', 'credit_rates', 'iShares', 145],
  ['SCHD', 'Schwab US Dividend Equity ETF', 'style_theme', 'Schwab', 160],
  ['MTUM', 'iShares MSCI USA Momentum Factor ETF', 'style_theme', 'iShares', 170],
  ['QUAL', 'iShares MSCI USA Quality Factor ETF', 'style_theme', 'iShares', 180],
  ['ARKK', 'ARK Innovation ETF', 'style_theme', 'ARK', 190],
]

const RATIOS = [
  ['spy_rsp', 'SPY', 'RSP'],
  ['qqq_spy', 'QQQ', 'SPY'],
  ['iwm_spy', 'IWM', 'SPY'],
  ['xlk_xlf', 'XLK', 'XLF'],
  ['hyg_lqd', 'HYG', 'LQD'],
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const dryRun = process.argv.includes('--dry-run')

function loadEnvFile() {
  const path = resolve('.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value
  }
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function addIsoDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function nyDate(unixSeconds) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(unixSeconds * 1000))
}

function num(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseNasdaqDate(text) {
  const [m, d, y] = String(text).split('/').map(Number)
  if (!y || !m || !d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function fetchYahoo(ticker, fromIso, toIso) {
  const period1 = Math.floor(Date.parse(`${fromIso}T00:00:00Z`) / 1000)
  const period2 = Math.floor(Date.parse(`${toIso}T00:00:00Z`) / 1000) + 86400
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}` +
    `?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true&events=div%7Csplit`
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`yahoo ${ticker} http ${res.status}`)
  const body = await res.json()
  const result = body?.chart?.result?.[0]
  if (!result) {
    const msg = body?.chart?.error?.description || 'empty chart'
    throw new Error(`yahoo ${ticker} ${msg}`)
  }
  const timestamps = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? []
  const bars = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = num(quote.close?.[i])
    const adjClose = num(adj[i])
    if (close == null && adjClose == null) continue
    bars.push({
      trade_date: nyDate(timestamps[i]),
      open: num(quote.open?.[i]),
      high: num(quote.high?.[i]),
      low: num(quote.low?.[i]),
      close,
      adj_close: adjClose,
      volume: num(quote.volume?.[i]),
    })
  }
  return bars
}

async function fetchNasdaqOnce(ticker, fromIso, toIso) {
  const url =
    `https://api.nasdaq.com/api/quote/${ticker}/historical` +
    `?assetclass=etf&fromdate=${fromIso}&todate=${toIso}&limit=10000`
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: 'https://www.nasdaq.com/',
    },
  })
  if (!res.ok) throw new Error(`nasdaq ${ticker} http ${res.status}`)
  const body = await res.json()
  const table = body?.data?.tradesTable
  const rows = table?.rows
  if (!Array.isArray(rows)) throw new Error(`nasdaq ${ticker} missing tradesTable`)
  return {
    total: Number(body?.data?.totalRecords ?? rows.length),
    bars: rows.map((row) => ({
      trade_date: parseNasdaqDate(row.date),
      open: num(row.open),
      high: num(row.high),
      low: num(row.low),
      close: num(row.close),
      adj_close: null,
      volume: num(row.volume),
    })).filter((bar) => bar.trade_date && (bar.close != null || bar.adj_close != null)),
  }
}

async function fetchNasdaq(ticker, fromIso, toIso, depth = 0) {
  const { total, bars } = await fetchNasdaqOnce(ticker, fromIso, toIso)
  if (bars.length >= total || fromIso >= toIso || depth > 6) return bars
  const start = Date.parse(`${fromIso}T00:00:00Z`)
  const end = Date.parse(`${toIso}T00:00:00Z`)
  const mid = new Date((start + end) / 2).toISOString().slice(0, 10)
  const left = await fetchNasdaq(ticker, fromIso, mid, depth + 1)
  const rightFrom = addIsoDays(mid, 1)
  if (rightFrom > toIso) return dedupeBars(left)
  const right = await fetchNasdaq(ticker, rightFrom, toIso, depth + 1)
  return dedupeBars([...left, ...right])
}

function dedupeBars(bars) {
  const byDate = new Map()
  for (const bar of bars) byDate.set(bar.trade_date, bar)
  return [...byDate.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
}

async function fetchTicker(ticker, fromIso, toIso) {
  try {
    const bars = dedupeBars(await fetchYahoo(ticker, fromIso, toIso))
    if (bars.length) return { source: 'yahoo', bars }
  } catch (err) {
    console.warn(`${ticker}: yahoo failed (${err instanceof Error ? err.message : err}); trying nasdaq`)
  }
  const bars = dedupeBars(await fetchNasdaq(ticker, fromIso, toIso))
  if (!bars.length) throw new Error(`no bars for ${ticker}`)
  return { source: 'nasdaq', bars }
}

function legLevel(bar) {
  if (!bar) return null
  if (bar.adj_close != null) return { value: bar.adj_close, adjusted: true }
  if (bar.close != null) return { value: bar.close, adjusted: false }
  return null
}

export function buildRatioRows(barsByTicker, nowIso) {
  const rows = []
  for (const [ratioId, numerator, denominator] of RATIOS) {
    const numMap = barsByTicker.get(numerator)
    const denMap = barsByTicker.get(denominator)
    if (!numMap || !denMap) continue
    for (const [tradeDate, numBar] of numMap) {
      const denBar = denMap.get(tradeDate)
      const numLeg = legLevel(numBar)
      const denLeg = legLevel(denBar)
      if (!numLeg || !denLeg || denLeg.value === 0) continue
      const adjusted = numLeg.adjusted && denLeg.adjusted
      rows.push({
        ratio_id: ratioId,
        trade_date: tradeDate,
        value: numLeg.value / denLeg.value,
        numerator_ticker: numerator,
        denominator_ticker: denominator,
        source: adjusted ? 'adj_close' : 'close_fallback',
        quality_flag: 'single_source',
        updated_at: nowIso,
      })
    }
  }
  return rows
}

function priceRows(ticker, source, bars, nowIso) {
  return bars.map((bar) => ({
    ticker,
    trade_date: bar.trade_date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    adj_close: bar.adj_close,
    volume: bar.volume,
    source,
    quality_flag: 'single_source',
    updated_at: nowIso,
  }))
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      out[index] = await fn(items[index], index)
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return out
}

async function upsertBatches(supabase, table, rows, onConflict) {
  const batch = 400
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
    console.log(`upserted ${table} ${Math.min(i + chunk.length, rows.length)}/${rows.length}`)
  }
}

loadEnvFile()

const fromIso = isoDaysAgo(365 * 5 + 10)
const toIso = new Date().toISOString().slice(0, 10)
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!dryRun && (!url || !key)) {
  console.error('Need SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const fetched = await mapPool(UNIVERSE, 4, async ([ticker]) => {
  try {
    const result = await fetchTicker(ticker, fromIso, toIso)
    const adj = result.bars.filter((bar) => bar.adj_close != null).length
    console.log(
      `${ticker} ${result.source} ${result.bars.length} bars ${result.bars[0]?.trade_date} → ${result.bars.at(-1)?.trade_date} adj ${adj}`,
    )
    return { ticker, ...result, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${ticker} failed: ${message}`)
    return { ticker, source: null, bars: [], error: message }
  }
})

const failures = fetched.filter((row) => row.error)
const barsByTicker = new Map(
  fetched.filter((row) => row.bars.length).map((row) => [row.ticker, new Map(row.bars.map((bar) => [bar.trade_date, bar]))]),
)
const nowIso = new Date().toISOString()
const ratios = buildRatioRows(barsByTicker, nowIso)
const prices = fetched.flatMap((row) =>
  row.bars.length ? priceRows(row.ticker, row.source, row.bars, nowIso) : [],
)

const byRatio = new Map()
for (const row of ratios) {
  const bucket = byRatio.get(row.ratio_id) ?? { n: 0, fallback: 0 }
  bucket.n += 1
  if (row.source === 'close_fallback') bucket.fallback += 1
  byRatio.set(row.ratio_id, bucket)
}
for (const [id, bucket] of byRatio) {
  console.log(`${id} ${bucket.n} ratios close_fallback ${bucket.fallback}`)
}

if (dryRun) {
  const sampleDate = fetched
    .flatMap((row) => row.bars.map((bar) => bar.trade_date))
    .sort()
    .at(-1)
  console.log(`dry-run sample ${sampleDate ?? 'none'}`)
  for (const row of ratios.filter((r) => r.trade_date === sampleDate)) {
    console.log(`  ${row.ratio_id} ${row.value} ${row.source}`)
  }
  console.log(`dry-run prices ${prices.length} ratios ${ratios.length} failures ${failures.length}`)
  process.exit(failures.length ? 1 : 0)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const universeRows = UNIVERSE.map(([ticker, name, group_id, issuer, sort_order]) => ({
  ticker,
  name,
  group_id,
  issuer,
  sort_order,
}))
const { error: universeError } = await supabase
  .from('etf_universe')
  .upsert(universeRows, { onConflict: 'ticker' })
if (universeError) throw new Error(`etf_universe upsert: ${universeError.message}`)
console.log(`upserted etf_universe ${universeRows.length}`)

await upsertBatches(supabase, 'etf_prices', prices, 'ticker,trade_date')
await upsertBatches(supabase, 'etf_ratio_series', ratios, 'ratio_id,trade_date')

if (failures.length) {
  console.error(`finished with ${failures.length} ticker failures; existing rows were left in place`)
  process.exit(1)
}
console.log('etf ingest complete')
