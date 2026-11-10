import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { daysAgoIso } from '../lib/format'
import type {
  EventFeedback,
  Indicator,
  Observation,
  ReportMeta,
  ReportNote,
  SeriesPoint,
  OhlcBar,
  WindowLabel,
} from '../types/database'
import { DEFAULT_SERIES_IDS } from '../types/database'
import { SERIES_PRESETS } from '../lib/categories'
import { ETF_RATIO_ID_SET, etfRatioIndicators, fetchEtfRatioPoints } from '../lib/etf'

/** Sparkline pilots — always included in series_1y fetch (~5Y closes; cards slice 1Y). */
export const SPARKLINE_PILOT_IDS = [
  'dgs2',
  'dgs10',
  'dgs30',
  't10y2y',
  'vix',
  'vixeq',
  'vixeq_vix_ratio',
  'sp500',
  'nasdaq',
  'dji',
  'wti',
  'brent',
  'gold_comex',
  'btc',
] as const

/** OHLC lazy-fetch targets (rates + vix). */
export const OHLC_LAZY_IDS = new Set([
  'dgs2',
  'dgs10',
  'dgs30',
  't10y2y',
  'vix',
  'sp500',
  'nasdaq',
  'dji',
  'wti',
  'brent',
  'gold_comex',
  'btc',
])

const SERIES_PAGE = 1000
const OHLC_PAGE = 1000

async function fetchSeriesForIds(
  ids: string[],
  since: string,
): Promise<SeriesPoint[]> {
  if (!ids.length) return []
  const chunks = await Promise.all(
    ids.map(async (id) => {
      const rows: SeriesPoint[] = []
      for (let from = 0; ; from += SERIES_PAGE) {
        const page = await supabase
          .from('series_1y')
          .select('indicator_id,date,value')
          .eq('indicator_id', id)
          .gte('date', since)
          .order('date', { ascending: true })
          .range(from, from + SERIES_PAGE - 1)
        if (page.error) throw page.error
        const chunk = (page.data ?? []) as SeriesPoint[]
        rows.push(...chunk)
        if (chunk.length < SERIES_PAGE) break
        if (from + SERIES_PAGE > 20000) break
      }
      return rows
    }),
  )
  return chunks.flat()
}

async function fetchOhlcForId(id: string, since: string): Promise<OhlcBar[]> {
  const rows: OhlcBar[] = []
  for (let from = 0; ; from += OHLC_PAGE) {
    const page = await supabase
      .from('series_ohlc')
      .select('indicator_id,date,open,high,low,close,volume')
      .eq('indicator_id', id)
      .gte('date', since)
      .order('date', { ascending: true })
      .range(from, from + OHLC_PAGE - 1)
    if (page.error) throw page.error
    const chunk = (page.data ?? []) as OhlcBar[]
    rows.push(...chunk)
    if (chunk.length < OHLC_PAGE) break
    if (from + OHLC_PAGE > 20000) break
  }
  return rows
}

function dedupeObservations(rows: Observation[]): Observation[] {
  const best = new Map<string, Observation>()
  for (const o of rows) {
    if (!best.has(o.indicator_id)) best.set(o.indicator_id, o)
  }
  return [...best.values()]
}

export interface DashboardState {
  loading: boolean
  error: string | null
  connected: boolean
  indicators: Indicator[]
  indicatorCount: number
  metaList: ReportMeta[]
  activeMeta: ReportMeta | null
  notes: ReportNote[]
  events: EventFeedback[]
  observations: Observation[]
  series: SeriesPoint[]
  /** Flattened OHLC cache (all lazily loaded ids). */
  ohlc: OhlcBar[]
  ohlcById: Record<string, OhlcBar[]>
  ohlcLoadingId: string | null
  ensureOhlc: (indicatorId: string) => Promise<void>
  availableSeriesIds: string[]
  windowLabel: WindowLabel
  setWindowLabel: (w: WindowLabel) => void
  reportDate: string | null
  setReportDate: (d: string | null) => void
  rangeDays: number
  setRangeDays: (n: number) => void
  enabledSeries: string[]
  setEnabledSeries: (ids: string[]) => void
  toggleSeries: (id: string) => void
  activePresetId: string | null
  setActivePresetId: (id: string | null) => void
  applySeriesPreset: (presetId: string, ids: string[]) => void
  selectedNoteId: string | null
  setSelectedNoteId: (id: string | null) => void
  focusedIndicatorId: string | null
  setFocusedIndicatorId: (id: string | null) => void
  refresh: () => void
}

export function useDashboardData(): DashboardState {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [metaList, setMetaList] = useState<ReportMeta[]>([])
  const [notes, setNotes] = useState<ReportNote[]>([])
  const [events, setEvents] = useState<EventFeedback[]>([])
  const [observations, setObservations] = useState<Observation[]>([])
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [ohlcById, setOhlcById] = useState<Record<string, OhlcBar[]>>({})
  const [ohlcLoadingId, setOhlcLoadingId] = useState<string | null>(null)
  const [windowLabel, setWindowLabel] = useState<WindowLabel>('1w')
  const [reportDate, setReportDate] = useState<string | null>(null)
  const [rangeDays, setRangeDays] = useState(365 * 5)
  const [enabledSeries, setEnabledSeries] = useState<string[]>([...DEFAULT_SERIES_IDS])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [focusedIndicatorId, setFocusedIndicatorId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const seriesPresentRef = useRef(false)
  const ohlcInflight = useRef<Map<string, Promise<void>>>(new Map())
  const ohlcByIdRef = useRef(ohlcById)
  ohlcByIdRef.current = ohlcById

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  // enabledSeries key for deps (stable string)
  const enabledKey = useMemo(
    () => [...enabledSeries].sort().join(','),
    [enabledSeries],
  )

  // ——— Effect A: meta / notes / observations / indicators / events ———
  // Reloads when reportDate, windowLabel, or tick change. Does NOT touch series/OHLC.
  useEffect(() => {
    let cancelled = false

    async function loadMetaNotesObs() {
      if (!supabaseConfigured) {
        setError('未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
        setLoading(false)
        return
      }

      // Soft refresh: keep UI if series already present
      const soft = seriesPresentRef.current
      if (!soft) setLoading(true)
      setError(null)

      try {
        const [indRes, metaRes, eventsRes] = await Promise.all([
          supabase.from('indicators').select('*').order('id'),
          supabase
            .from('report_meta')
            .select('*')
            .order('report_date', { ascending: false })
            .limit(60),
          supabase
            .from('events_feedback')
            .select('*')
            .order('as_of', { ascending: false })
            .limit(100),
        ])

        if (indRes.error) throw indRes.error
        if (metaRes.error) throw metaRes.error
        if (eventsRes.error) throw eventsRes.error
        if (cancelled) return

        const inds = (indRes.data ?? []) as Indicator[]
        const metas = (metaRes.data ?? []) as ReportMeta[]
        setIndicators(inds)
        setMetaList(metas)
        setEvents((eventsRes.data ?? []) as EventFeedback[])

        const preferred =
          metas.find((m) => m.window_label === windowLabel) ?? metas[0] ?? null
        const nextDate = reportDate ?? preferred?.report_date ?? null
        if (!reportDate && nextDate) setReportDate(nextDate)

        const dateForNotes = nextDate
        if (dateForNotes) {
          const [notesRes, obsRes] = await Promise.all([
            supabase
              .from('report_notes')
              .select('*')
              .eq('report_date', dateForNotes)
              .order('sort_order', { ascending: true }),
            supabase
              .from('observations')
              .select('*')
              .order('as_of', { ascending: false })
              .limit(500),
          ])
          if (notesRes.error) throw notesRes.error
          if (obsRes.error) throw obsRes.error
          if (!cancelled) {
            setNotes((notesRes.data ?? []) as ReportNote[])
            setObservations(
              dedupeObservations((obsRes.data ?? []) as Observation[]),
            )
          }
        } else {
          setNotes([])
          setObservations([])
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
      // Cold-start loading is cleared by the series effect; soft notes/obs
      // refresh never blanked the UI.
    }

    void loadMetaNotesObs()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, reportDate, windowLabel])

  // ——— Effect B: series_1y + client-merged etf_ratio_series ———
  // Reloads when rangeDays / tick / enabled series change — NOT windowLabel.
  useEffect(() => {
    let cancelled = false

    async function loadSeries() {
      if (!supabaseConfigured) return

      const soft = seriesPresentRef.current
      if (!soft) setLoading(true)

      try {
        const since = daysAgoIso(rangeDays)
        // Pilots + defaults + current enables + all preset members (keeps toggles/presets populated
        // without a full-table series_1y scan). Parallel per-id paging.
        const presetIds = SERIES_PRESETS.flatMap((p) => p.ids)
        const neededIds = [
          ...new Set<string>([
            ...SPARKLINE_PILOT_IDS,
            ...DEFAULT_SERIES_IDS,
            ...enabledSeries,
            ...presetIds,
          ]),
        ].filter((id) => !ETF_RATIO_ID_SET.has(id))
        const seriesRows = await fetchSeriesForIds(neededIds, since)
        // ETF ratios stay in etf_ratio_series. Merge here so the shared preset
        // can draw them without writing observations or series_1y.
        let ratioPoints: SeriesPoint[] = []
        try {
          ratioPoints = await fetchEtfRatioPoints(since)
        } catch (ratioError) {
          if (!cancelled) {
            setError(ratioError instanceof Error ? ratioError.message : String(ratioError))
          }
        }
        if (cancelled) return
        const merged = [...seriesRows, ...ratioPoints]
        setSeries(merged)
        seriesPresentRef.current = merged.length > 0
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSeries()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, rangeDays, enabledKey])

  // ——— Lazy OHLC: fetch on demand, cache by id ———
  const ensureOhlc = useCallback(async (indicatorId: string) => {
    if (!supabaseConfigured) return
    if (!OHLC_LAZY_IDS.has(indicatorId)) {
      // Non-OHLC ids: cache empty so modal falls back to series line
      setOhlcById((prev) =>
        prev[indicatorId] !== undefined ? prev : { ...prev, [indicatorId]: [] },
      )
      return
    }
    if (ohlcByIdRef.current[indicatorId]) return

    const existing = ohlcInflight.current.get(indicatorId)
    if (existing) {
      await existing
      return
    }

    const job = (async () => {
      setOhlcLoadingId(indicatorId)
      try {
        const since = daysAgoIso(365 * 5 + 30)
        const rows = await fetchOhlcForId(indicatorId, since)
        setOhlcById((prev) => ({ ...prev, [indicatorId]: rows }))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setOhlcById((prev) => ({ ...prev, [indicatorId]: [] }))
      } finally {
        setOhlcLoadingId((cur) => (cur === indicatorId ? null : cur))
        ohlcInflight.current.delete(indicatorId)
      }
    })()

    ohlcInflight.current.set(indicatorId, job)
    await job
  }, [])

  const ohlc = useMemo(
    () => Object.values(ohlcById).flat(),
    [ohlcById],
  )

  const activeMeta = useMemo(() => {
    if (!metaList.length) return null
    const byDate = reportDate
      ? metaList.filter((m) => m.report_date === reportDate)
      : metaList
    return (
      byDate.find((m) => m.window_label === windowLabel) ??
      byDate[0] ??
      metaList[0] ??
      null
    )
  }, [metaList, reportDate, windowLabel])

  const indicatorsWithRatios = useMemo(() => {
    const seen = new Set(indicators.map((i) => i.id))
    const extra = etfRatioIndicators().filter((i) => !seen.has(i.id))
    return extra.length ? [...indicators, ...extra] : indicators
  }, [indicators])

  const availableSeriesIds = useMemo(() => {
    const fromData = new Set(series.map((s) => s.indicator_id))
    const defaults = DEFAULT_SERIES_IDS.filter((id) => fromData.has(id))
    const extras = [...fromData].filter(
      (id) =>
        !defaults.includes(id as (typeof DEFAULT_SERIES_IDS)[number]) &&
        !ETF_RATIO_ID_SET.has(id),
    )
    const ratios = [...ETF_RATIO_ID_SET].filter((id) => fromData.has(id))
    const ratioOrder = ['spy_rsp', 'qqq_spy', 'iwm_spy', 'xlk_xlf', 'hyg_lqd']
    ratios.sort((a, b) => ratioOrder.indexOf(a) - ratioOrder.indexOf(b))
    return [...defaults, ...extras.sort(), ...ratios]
  }, [series])

  const toggleSeries = useCallback((id: string) => {
    setActivePresetId(null)
    setEnabledSeries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const applySeriesPreset = useCallback((presetId: string, ids: string[]) => {
    setActivePresetId(presetId)
    setEnabledSeries(ids)
  }, [])

  return {
    loading,
    error,
    connected: supabaseConfigured && !error,
    indicators: indicatorsWithRatios,
    indicatorCount: indicators.length,
    metaList,
    activeMeta,
    notes,
    events,
    observations,
    series,
    ohlc,
    ohlcById,
    ohlcLoadingId,
    ensureOhlc,
    availableSeriesIds,
    windowLabel,
    setWindowLabel,
    reportDate: reportDate ?? activeMeta?.report_date ?? null,
    setReportDate,
    rangeDays,
    setRangeDays,
    enabledSeries,
    setEnabledSeries,
    toggleSeries,
    activePresetId,
    setActivePresetId,
    applySeriesPreset,
    selectedNoteId,
    setSelectedNoteId,
    focusedIndicatorId,
    setFocusedIndicatorId,
    refresh,
  }
}
