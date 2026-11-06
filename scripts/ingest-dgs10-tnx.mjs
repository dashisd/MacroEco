/**
 * Ingest WSJ/MarketWatch (or Yahoo ^TNX) OHLC CSV into series_ohlc + series_1y + observations.
 *
 * CSV columns: date,open,high,low,close[,volume][,source]
 *   or WSJ raw: Date, Open, High, Low, Close
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/ingest-dgs10-tnx.mjs [path/to/csv]
 *
 * Default path: data/dgs10_tnx_5y.csv
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const csvPath = resolve(process.argv[2] || 'data/dgs10_tnx_5y.csv')

if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idx = (names) => {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  const di = idx(['date'])
  const oi = idx(['open'])
  const hi = idx(['high'])
  const li = idx(['low'])
  const ci = idx(['close'])
  const vi = idx(['volume'])
  if (di < 0 || ci < 0) throw new Error('CSV needs date + close columns')

  const rows = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = line.split(',').map((c) => c.trim())
    let date = cols[di]
    // WSJ MM/DD/YY
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(date)) {
      const [m, d, y] = date.split('/').map(Number)
      const year = y < 100 ? 2000 + y : y
      date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    const num = (i) => {
      if (i < 0) return null
      const v = cols[i]
      if (v == null || v === '' || v === '.') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const close = num(ci)
    if (close == null) continue
    rows.push({
      indicator_id: 'dgs10',
      date,
      open: num(oi),
      high: num(hi),
      low: num(li),
      close,
      volume: num(vi),
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  return rows
}

const raw = readFileSync(csvPath, 'utf8')
const rows = parseCsv(raw)
console.log(`Parsed ${rows.length} rows from ${csvPath}: ${rows[0]?.date} → ${rows.at(-1)?.date}`)

const supabase = createClient(url, key)
const BATCH = 200

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const { error: e1 } = await supabase.from('series_ohlc').upsert(chunk, {
    onConflict: 'indicator_id,date',
  })
  if (e1) throw e1
  const closes = chunk.map(({ indicator_id, date, close }) => ({
    indicator_id,
    date,
    value: close,
  }))
  const { error: e2 } = await supabase.from('series_1y').upsert(closes, {
    onConflict: 'indicator_id,date',
  })
  if (e2) throw e2
  console.log(`upserted ${i + chunk.length}/${rows.length}`)
}

const last = rows.at(-1)
await supabase
  .from('indicators')
  .update({
    name: '10Y 国债收益率',
    source_hint: 'WSJ/MarketWatch TMUBMUSD10Y (market OHLC)',
  })
  .eq('id', 'dgs10')

const { data: metas } = await supabase.from('report_meta').select('report_date')
const dates = [...new Set((metas ?? []).map((m) => m.report_date))]
for (const as_of of dates) {
  const { error } = await supabase.from('observations').upsert(
    {
      indicator_id: 'dgs10',
      as_of,
      reference_period: last.date,
      actual: last.close,
      unit: '%',
      source_url: 'https://www.wsj.com/market-data/quotes/bond/BX/TMUBMUSD10Y',
      evidence_grade: 'E2',
      data_quality: 'OK',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'indicator_id,as_of,reference_period' },
  )
  if (error) console.warn('obs upsert', as_of, error.message)
}

console.log('Done. Latest close', last.close, 'on', last.date)
