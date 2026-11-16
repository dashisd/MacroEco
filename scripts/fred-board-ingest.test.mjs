import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EXCLUDED_INDICATOR_IDS,
  FRED_SERIES,
  addIsoDays,
  assertAllowedIndicator,
  fredWindow,
  gate,
  isTradeDateComplete,
  parseFredValue,
  planSeries,
  previousWeekday,
  shouldKeepExistingPrint,
  shouldSkipIfComplete,
  targetTradeDate,
} from '../supabase/functions/fred-board-ingest/logic.ts'

const IDS = FRED_SERIES.map((series) => series.indicatorId)

test('allowlist is the five official board ids and nothing excluded', () => {
  assert.deepEqual(IDS, ['wti', 'hy_oas', 'ig_oas', 't10y2y', 't10yie'])
  assert.deepEqual(
    FRED_SERIES.map((series) => series.fredId),
    ['DCOILWTICO', 'BAMLH0A0HYM2', 'BAMLC0A0CM', 'T10Y2Y', 'T10YIE'],
  )
  for (const banned of EXCLUDED_INDICATOR_IDS) {
    assert.equal(IDS.includes(banned), false)
    assert.throws(() => assertAllowedIndicator(banned))
  }
  for (const id of ['dgs2', 'dgs10', 'dgs30']) assert.throws(() => assertAllowedIndicator(id))
})

test('missing FRED markers are not prints and zero is kept', () => {
  assert.equal(parseFredValue('.'), null)
  assert.equal(parseFredValue(''), null)
  assert.equal(parseFredValue('  NA '), null)
  assert.equal(parseFredValue('abc'), null)
  assert.equal(parseFredValue('1e2'), null)
  assert.equal(parseFredValue('4.08'), '4.08')
  assert.equal(parseFredValue('0'), '0')
  assert.equal(parseFredValue('-0.12'), '-0.12')
})

test('scheduled Shanghai clocks map to the completed New York session', () => {
  // Monday 08:00 / 10:00 / 14:00 Asia/Shanghai, November (EST).
  assert.equal(targetTradeDate(new Date('2026-11-16T00:00:00Z')), '2026-11-13')
  assert.equal(targetTradeDate(new Date('2026-11-16T02:00:00Z')), '2026-11-13')
  assert.equal(targetTradeDate(new Date('2026-11-16T06:00:00Z')), '2026-11-13')
  // Tuesday 08:00 is after Monday's close; Tuesday 14:00 is still before Tuesday's close.
  assert.equal(targetTradeDate(new Date('2026-11-17T00:00:00Z')), '2026-11-16')
  assert.equal(targetTradeDate(new Date('2026-11-17T06:00:00Z')), '2026-11-16')
  // Saturday slots stay on Friday.
  assert.equal(targetTradeDate(new Date('2026-11-21T00:00:00Z')), '2026-11-20')
  assert.equal(targetTradeDate(new Date('2026-11-21T06:00:00Z')), '2026-11-20')
  // July is EDT, so the same UTC clock still uses the New York close.
  assert.equal(targetTradeDate(new Date('2026-07-14T00:00:00Z')), '2026-07-13')
  assert.equal(targetTradeDate(new Date('2026-07-14T06:00:00Z')), '2026-07-13')
  // 16:00 local close, EST and EDT.
  assert.equal(targetTradeDate(new Date('2026-11-16T21:00:00Z')), '2026-11-16')
  assert.equal(targetTradeDate(new Date('2026-11-16T20:59:00Z')), '2026-11-13')
  assert.equal(targetTradeDate(new Date('2026-07-13T20:00:00Z')), '2026-07-13')
  assert.equal(targetTradeDate(new Date('2026-07-13T19:59:00Z')), '2026-07-10')
})

test('previous weekday skips Saturday and Sunday', () => {
  assert.equal(previousWeekday('2026-11-16'), '2026-11-13')
  assert.equal(previousWeekday('2026-11-15'), '2026-11-13')
  assert.equal(addIsoDays('2026-11-13', -21), '2026-10-23')
})

test('10:00 and 14:00 skip only when the trade date is already complete', () => {
  assert.equal(
    shouldSkipIfComplete({ slot: '08:00', skipIfComplete: false, shanghaiHour: 8 }),
    false,
  )
  assert.equal(
    shouldSkipIfComplete({ slot: '10:00', skipIfComplete: true, shanghaiHour: 10 }),
    true,
  )
  assert.equal(
    shouldSkipIfComplete({ slot: '14:00', skipIfComplete: true, shanghaiHour: 14 }),
    true,
  )
  assert.equal(shouldSkipIfComplete({ slot: '10:00', skipIfComplete: null, shanghaiHour: 8 }), true)
  assert.equal(gate(false, IDS), 'run')
  assert.equal(gate(true, IDS), 'skip')
  assert.equal(gate(true, IDS.slice(0, 4)), 'run')
  assert.equal(isTradeDateComplete(IDS), true)
})

test('a missing source value skips the series row and marks that trade date NA', () => {
  const plan = planSeries(
    FRED_SERIES[1],
    [
      { date: '2026-11-12', value: '3.10' },
      { date: '2026-11-13', value: '.' },
    ],
    '2026-11-13',
    '2026-11-16T00:00:00.000Z',
  )
  assert.deepEqual(plan.seriesRows, [
    { indicator_id: 'hy_oas', date: '2026-11-12', value: '3.10' },
  ])
  assert.equal(plan.targetMissing, true)
  assert.equal(plan.observation.data_quality, 'NA')
  assert.equal(plan.observation.actual, null)
  assert.equal(plan.observation.as_of, '2026-11-13')
  assert.equal(plan.observation.reference_period, '2026-11-13')
  assert.equal(plan.observation.unit, '%')
})

test('a real print is upserted and does not invent OHLC or extra dates', () => {
  const plan = planSeries(
    FRED_SERIES[0],
    [
      { date: '2026-11-13', value: '59.50' },
      { date: '2026-11-14', value: '60.00' },
    ],
    '2026-11-13',
    '2026-11-16T00:00:00.000Z',
  )
  assert.deepEqual(plan.seriesRows, [
    { indicator_id: 'wti', date: '2026-11-13', value: '59.50' },
  ])
  assert.equal(plan.observation.data_quality, 'OK')
  assert.equal(plan.observation.actual, '59.50')
  assert.equal(plan.observation.source_url, 'https://fred.stlouisfed.org/series/DCOILWTICO')
  assert.equal('open' in plan.seriesRows[0], false)
})

test('an absent target date is NA and an existing OK print is kept', () => {
  const plan = planSeries(FRED_SERIES[3], [{ date: '2026-11-12', value: '0.37' }], '2026-11-13', 'now')
  assert.equal(plan.targetMissing, true)
  assert.equal(plan.observation.indicator_id, 't10y2y')
  assert.equal(plan.observation.unit, 'pp')
  assert.equal(shouldKeepExistingPrint({ actual: '0.37', data_quality: 'OK' }), true)
  assert.equal(shouldKeepExistingPrint({ actual: '0.37', data_quality: 'REVISED' }), true)
  assert.equal(shouldKeepExistingPrint({ actual: null, data_quality: 'OK' }), false)
  assert.equal(shouldKeepExistingPrint({ actual: null, data_quality: 'NA' }), false)
  assert.equal(shouldKeepExistingPrint(null), false)
})

test('lookback window ends on the New York calendar date', () => {
  const window = fredWindow(new Date('2026-11-17T00:00:00Z'), '2026-11-16')
  assert.equal(window.start, '2026-10-26')
  assert.equal(window.end, '2026-11-16')
})

function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

test('function and migration stay inside the five-series contract', () => {
  const fn = readFileSync(
    new URL('../supabase/functions/fred-board-ingest/index.ts', import.meta.url),
    'utf8',
  )
  const sql = readFileSync(
    new URL('../supabase/migrations/20261116093853_fred_board_ingest_schedule.sql', import.meta.url),
    'utf8',
  )
  const fnCode = codeOnly(fn)
  const sqlCode = codeOnly(sql)
  for (const source of [fnCode, sqlCode, fn, sql]) {
    assert.equal(/sb_secret_/.test(source), false)
    assert.equal(/service_role/.test(source), false)
    assert.equal(/skmicrenvtejngqbyoqs/.test(source), false)
    assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(source), false)
  }
  for (const source of [fnCode, sqlCode]) {
    assert.equal(/report_meta/.test(source), false)
    assert.equal(/report_notes/.test(source), false)
    assert.equal(/from\('etf_/.test(source), false)
    assert.equal(/series_ohlc/.test(source), false)
    assert.equal(/\bdelete\b/i.test(source), false)
    assert.equal(/cron\.unschedule/.test(source), false)
    assert.equal(/api\.stlouisfed\.org/.test(source) && source === sqlCode, false)
  }
  assert.equal(fnCode.includes("from('series_1y')"), true)
  assert.equal(fnCode.includes("from('observations')"), true)
  assert.equal(fn.includes('FRED_API_KEY'), true)
  assert.match(sqlCode, /create extension if not exists pg_cron with schema pg_catalog/i)
  assert.match(sqlCode, /create extension if not exists pg_net/i)
  assert.equal(sqlCode.match(/cron\.schedule\(/g)?.length, 3)
  assert.match(sql, /'0 0 \* \* 1-6'/)
  assert.match(sql, /'0 2 \* \* 1-6'/)
  assert.match(sql, /'0 6 \* \* 1-6'/)
  assert.match(sql, /'skip_if_complete', false/)
  assert.match(sql, /'skip_if_complete', true/)
  assert.equal((sql.match(/'skip_if_complete', true/g) ?? []).length, 2)
  assert.equal(/^\s*select vault\.create_secret/im.test(sql), false)
  assert.equal(/api\.stlouisfed\.org/.test(sqlCode), false)
})
