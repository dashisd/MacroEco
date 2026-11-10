import { useCallback, useEffect, useMemo, useState } from 'react'
import { daysAgoIso } from '../lib/format'
import { supabaseConfigured } from '../lib/supabase'
import {
  ETF_GROUP_ORDER,
  ETF_PRESET_ID,
  ETF_RATIO_IDS,
  ETF_TICKERS,
  etfPriceIndicators,
  etfRatioIndicators,
  fetchEtfPrices,
  fetchEtfRatioPoints,
  fetchEtfUniverse,
  latestObservation,
  mergeUniverse,
  pricesToOhlc,
  pricesToSeries,
  type EtfGroupId,
  type EtfPriceBar,
  type EtfUniverseRow,
} from '../lib/etf'
import type { Indicator, OhlcBar, Observation, SeriesPoint } from '../types/database'

export interface EtfCardModel {
  ticker: string
  name: string
  groupId: EtfGroupId
  observation: Observation
  ohlc: OhlcBar[]
}

export interface EtfGroupModel {
  id: EtfGroupId
  label: string
  cards: EtfCardModel[]
}

const PRICE_LOOKBACK_DAYS = 365 * 5 + 40

export function useEtfData(active: boolean) {
  const [loading, setLoading] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [ratioError, setRatioError] = useState<string | null>(null)
  const [ratioLoading, setRatioLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [universe, setUniverse] = useState<EtfUniverseRow[]>([])
  const [prices, setPrices] = useState<EtfPriceBar[]>([])
  const [ratioSeries, setRatioSeries] = useState<SeriesPoint[]>([])
  const [rangeDays, setRangeDays] = useState(365 * 5)
  const [enabledSeries, setEnabledSeries] = useState<string[]>([...ETF_RATIO_IDS])
  const [activePresetId, setActivePresetId] = useState<string | null>(ETF_PRESET_ID)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function loadPrices() {
      if (!supabaseConfigured) {
        setPriceError('未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
        setReady(true)
        setLoading(false)
        return
      }
      setLoading(true)
      setPriceError(null)
      try {
        const since = daysAgoIso(PRICE_LOOKBACK_DAYS)
        const [universeRows, priceRows] = await Promise.all([
          fetchEtfUniverse(),
          fetchEtfPrices(since),
        ])
        if (cancelled) return
        setUniverse(universeRows)
        setPrices(priceRows)
      } catch (err) {
        if (!cancelled) setPriceError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setReady(true)
        }
      }
    }

    void loadPrices()
    return () => {
      cancelled = true
    }
  }, [active, tick])

  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function loadRatios() {
      if (!supabaseConfigured) return
      setRatioLoading(true)
      setRatioError(null)
      try {
        const points = await fetchEtfRatioPoints(daysAgoIso(rangeDays))
        if (!cancelled) setRatioSeries(points)
      } catch (err) {
        if (!cancelled) setRatioError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setRatioLoading(false)
      }
    }

    void loadRatios()
    return () => {
      cancelled = true
    }
  }, [active, tick, rangeDays])

  const closeSeries = useMemo(() => pricesToSeries(prices), [prices])
  const ohlc = useMemo(() => pricesToOhlc(prices), [prices])

  const groups = useMemo<EtfGroupModel[]>(() => {
    const names = mergeUniverse(universe)
    const ohlcByTicker = new Map<string, OhlcBar[]>()
    for (const bar of ohlc) {
      const list = ohlcByTicker.get(bar.indicator_id) ?? []
      list.push(bar)
      ohlcByTicker.set(bar.indicator_id, list)
    }
    return ETF_GROUP_ORDER.map((group) => ({
      id: group.id,
      label: group.label,
      cards: names
        .filter((row) => row.group_id === group.id)
        .map((row) => ({
          ticker: row.ticker,
          name: row.name,
          groupId: row.group_id,
          observation: latestObservation(row.ticker, prices),
          ohlc: ohlcByTicker.get(row.ticker) ?? [],
        })),
    }))
  }, [universe, prices, ohlc])

  const indicators = useMemo<Indicator[]>(
    () => [...etfPriceIndicators(), ...etfRatioIndicators()],
    [],
  )

  const availableSeriesIds = [...ETF_TICKERS, ...ETF_RATIO_IDS]

  const chartSeries = useMemo(() => {
    const since = daysAgoIso(rangeDays)
    const closes = closeSeries.filter((point) => point.date >= since)
    return [...closes, ...ratioSeries]
  }, [closeSeries, ratioSeries, rangeDays])

  const asOf = useMemo(() => {
    let latest = ''
    for (const bar of prices) {
      if (bar.trade_date > latest && (bar.close != null || bar.adj_close != null)) {
        latest = bar.trade_date
      }
    }
    return latest || null
  }, [prices])

  const loadedTickers = useMemo(() => {
    const ids = new Set<string>()
    for (const bar of prices) {
      if (bar.close != null || bar.adj_close != null) ids.add(bar.ticker)
    }
    return ids.size
  }, [prices])

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
    loading: active && (!ready || loading),
    ratioLoading,
    error: priceError ?? ratioError,
    connected: supabaseConfigured && !(priceError ?? ratioError),
    groups,
    closeSeries,
    ratioSeries,
    chartSeries,
    indicators,
    availableSeriesIds,
    asOf,
    loadedTickers,
    rangeDays,
    setRangeDays,
    enabledSeries,
    setEnabledSeries,
    toggleSeries,
    activePresetId,
    setActivePresetId,
    applySeriesPreset,
    focusedId,
    setFocusedId,
    refresh,
  }
}
