/**
 * Scheduled FRED ingest for five board series.
 *
 * pg_cron + pg_net POST this function. Fetching FRED happens here, not in SQL.
 * Writes use the platform-injected secret key (ctx.supabaseAdmin). FRED_API_KEY
 * is an Edge Function secret. Neither value is read from the repo.
 *
 * Upsert only. A missing FRED print (".") skips the series_1y write and marks
 * the target trade_date observation NA, unless that observation already holds
 * a real OK/REVISED print. Rows are never deleted. report_meta is not written.
 * The 10:00 and 14:00 Asia/Shanghai runs exit before any write when the
 * trade_date already has all five series.
 */
import { withSupabase } from 'npm:@supabase/server@1'
import {
  FRED_SERIES,
  type FredPoint,
  type FredSeries,
  type ObservationRow,
  type SeriesRow,
  assertAllowedIndicator,
  fredWindow,
  gate,
  planSeries,
  shanghaiHour,
  shouldKeepExistingPrint,
  shouldSkipIfComplete,
  targetTradeDate,
} from './logic.ts'

const FRED_OBSERVATIONS = 'https://api.stlouisfed.org/fred/series/observations'

function safeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : fallback
  if (/api_key|stlouisfed|supabase\.co|bearer/i.test(message)) return fallback
  return message
}

interface IngestBody {
  slot?: string | null
  skipIfComplete?: boolean | null
}

function readBody(raw: unknown): IngestBody | Response {
  if (raw == null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return Response.json({ error: 'expected a JSON object' }, { status: 400 })
  }
  const record = raw as Record<string, unknown>
  const slot = typeof record.slot === 'string' ? record.slot : null
  const skipIfComplete =
    typeof record.skip_if_complete === 'boolean' ? record.skip_if_complete : null
  return { slot, skipIfComplete }
}

async function fetchFred(
  series: FredSeries,
  start: string,
  end: string,
  apiKey: string,
): Promise<FredPoint[]> {
  const url = new URL(FRED_OBSERVATIONS)
  url.searchParams.set('series_id', series.fredId)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('observation_start', start)
  url.searchParams.set('observation_end', end)
  url.searchParams.set('sort_order', 'asc')

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error(`FRED ${series.fredId} request failed`)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`FRED ${series.fredId} HTTP ${response.status}`)
  }
  const payload = (await response.json()) as { observations?: FredPoint[] }
  if (!Array.isArray(payload.observations)) {
    throw new Error(`FRED ${series.fredId} missing observations`)
  }
  return payload.observations.map((point) => ({
    date: String(point.date ?? ''),
    value: String(point.value ?? ''),
  }))
}

async function upsertSeries(
  admin: { from: (table: string) => any },
  rows: SeriesRow[],
): Promise<void> {
  if (!rows.length) return
  for (const row of rows) assertAllowedIndicator(row.indicator_id)
  const { error } = await admin.from('series_1y').upsert(rows, {
    onConflict: 'indicator_id,date',
  })
  if (error) throw new Error(`series_1y upsert: ${error.message}`)
}

async function upsertObservations(
  admin: { from: (table: string) => any },
  rows: ObservationRow[],
): Promise<void> {
  if (!rows.length) return
  for (const row of rows) assertAllowedIndicator(row.indicator_id)
  const { error } = await admin.from('observations').upsert(rows, {
    onConflict: 'indicator_id,as_of,reference_period',
  })
  if (error) throw new Error(`observations upsert: ${error.message}`)
}

async function markMissing(
  admin: { from: (table: string) => any },
  row: ObservationRow,
): Promise<'na' | 'kept_existing'> {
  assertAllowedIndicator(row.indicator_id)
  const { data, error } = await admin
    .from('observations')
    .select('actual,data_quality')
    .eq('indicator_id', row.indicator_id)
    .eq('as_of', row.as_of)
    .eq('reference_period', row.reference_period)
    .maybeSingle()
  if (error) throw new Error(`observations read: ${error.message}`)
  if (shouldKeepExistingPrint(data)) return 'kept_existing'
  await upsertObservations(admin, [row])
  return 'na'
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'expected POST' }, { status: 405 })
    }

    let parsed: unknown = null
    const text = await req.text()
    if (text.trim()) {
      try {
        parsed = JSON.parse(text)
      } catch {
        return Response.json({ error: 'invalid JSON' }, { status: 400 })
      }
    }
    const body = readBody(parsed)
    if (body instanceof Response) return body

    const apiKey = Deno.env.get('FRED_API_KEY')
    if (!apiKey) {
      return Response.json({ error: 'FRED_API_KEY is not set' }, { status: 500 })
    }

    const now = new Date()
    const tradeDate = targetTradeDate(now)
    const skipRequested = shouldSkipIfComplete({
      slot: body.slot,
      skipIfComplete: body.skipIfComplete,
      shanghaiHour: shanghaiHour(now),
    })

    if (skipRequested) {
      const { data, error } = await ctx.supabaseAdmin
        .from('series_1y')
        .select('indicator_id')
        .eq('date', tradeDate)
        .in(
          'indicator_id',
          FRED_SERIES.map((series) => series.indicatorId),
        )
        .not('value', 'is', null)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      const present = (data ?? []).map((row: { indicator_id: string }) => row.indicator_id)
      if (gate(true, present) === 'skip') {
        return Response.json({
          ok: true,
          skipped: true,
          wrote: false,
          reason: 'trade_date_complete',
          trade_date: tradeDate,
          slot: body.slot,
        })
      }
    }

    const window = fredWindow(now, tradeDate)
    const fetched = await Promise.all(
      FRED_SERIES.map(async (series) => {
        try {
          const points = await fetchFred(series, window.start, window.end, apiKey)
          return { series, points, error: null as string | null }
        } catch (err) {
          return { series, points: [] as FredPoint[], error: safeError(err, 'FRED request failed') }
        }
      }),
    )

    const failures = fetched.filter((item) => item.error)
    if (failures.length === FRED_SERIES.length) {
      return Response.json(
        {
          ok: false,
          trade_date: tradeDate,
          errors: failures.map((item) => ({
            indicator_id: item.series.indicatorId,
            error: item.error,
          })),
        },
        { status: 502 },
      )
    }

    const nowIso = now.toISOString()
    const seriesRows: SeriesRow[] = []
    const okObservations: ObservationRow[] = []
    const naObservations: ObservationRow[] = []
    for (const item of fetched) {
      if (item.error) continue
      const plan = planSeries(item.series, item.points, tradeDate, nowIso)
      seriesRows.push(...plan.seriesRows)
      if (plan.targetMissing) naObservations.push(plan.observation)
      else okObservations.push(plan.observation)
    }

    try {
      await upsertSeries(ctx.supabaseAdmin, seriesRows)
      await upsertObservations(ctx.supabaseAdmin, okObservations)
      const naResults: { indicator_id: string; result: 'na' | 'kept_existing' }[] = []
      for (const row of naObservations) {
        const result = await markMissing(ctx.supabaseAdmin, row)
        naResults.push({ indicator_id: row.indicator_id, result })
      }
      return Response.json({
        ok: true,
        skipped: false,
        wrote: true,
        trade_date: tradeDate,
        slot: body.slot,
        window,
        series_rows: seriesRows.length,
        observations_ok: okObservations.map((row) => row.indicator_id),
        observations_na: naResults,
        errors: failures.map((item) => ({
          indicator_id: item.series.indicatorId,
          error: item.error,
        })),
      })
    } catch (err) {
      return Response.json(
        { ok: false, trade_date: tradeDate, error: safeError(err, 'write failed') },
        { status: 500 },
      )
    }
  }),
}
