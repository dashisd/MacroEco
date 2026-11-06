/**
 * Demo seed helper — DOES NOT run against production without SERVICE ROLE.
 *
 * The browser app must NEVER contain the service_role key.
 * To seed sample series / notes for local UI demos:
 *
 *   SUPABASE_URL=https://skmicrenvtejngqbyoqs.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard → Settings → API> \
 *   node scripts/seed-demo.mjs
 *
 * This script exits unless SUPABASE_SERVICE_ROLE_KEY is set.
 * Prefer having the research agent / Edge Function write daily data instead.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error(
    'Refusing to seed: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never commit the key).',
  )
  console.error('Daily writes should come from the research bot / Edge Function pipeline.')
  process.exit(1)
}

const supabase = createClient(url, key)

const today = new Date().toISOString().slice(0, 10)

const { error: metaErr } = await supabase.from('report_meta').upsert({
  report_date: today,
  window_label: '1w',
  summary: 'Demo seed — replace with live research summary.',
  updated_at: new Date().toISOString(),
  source_agent: 'seed-demo.mjs',
})
if (metaErr) throw metaErr

const { error: notesErr } = await supabase.from('report_notes').insert([
  {
    report_date: today,
    section: 'executive',
    indicator_id: null,
    text: '演示：Executive 结论占位。日更接入后替换。',
    importance: 'high',
    sort_order: 1,
  },
  {
    report_date: today,
    section: 'market_structure',
    indicator_id: 'vix',
    text: '演示：点击本条应聚焦 VIX 序列。',
    importance: 'normal',
    sort_order: 2,
  },
])
if (notesErr) throw notesErr

console.log('Seeded report_meta + sample report_notes for', today)
console.log('Add series_1y rows separately from FRED/Cboe EOD feeds.')
