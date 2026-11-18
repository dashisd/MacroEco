export type WindowLabel = '1w' | '2_4w'

export type NoteSection =
  | 'executive'
  | 'marginal'
  | 'observe'
  | 'market_structure'
  | 'market_narrative'
  | 'fupeng'
  | 'strategy_1w'
  | 'etf_flows'
  | 'data_gaps'

export type Importance = 'critical' | 'high' | 'normal' | 'low'

export type FeedbackVerdict = '正反馈' | '负反馈' | 'NA'

export interface Indicator {
  id: string
  name: string
  category: string | null
  frequency: string | null
  unit: string | null
  source_hint: string | null
  created_at: string | null
}

export interface Observation {
  id: string
  indicator_id: string
  as_of: string
  reference_period: string | null
  actual: number | null
  unit: string | null
  source_url: string | null
  evidence_grade: string | null
  data_quality: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SeriesPoint {
  indicator_id: string
  date: string
  value: number | null
}

export interface OhlcBar {
  indicator_id: string
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

export interface EventFeedback {
  event_id: string
  as_of: string
  event_type: string | null
  title: string | null
  market_reaction_json: Record<string, unknown> | null
  verdict: FeedbackVerdict | string | null
  evidence_grade: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ReportNote {
  id: string
  report_date: string
  section: NoteSection | string
  indicator_id: string | null
  text: string
  importance: Importance | string | null
  sort_order: number | null
  created_at: string | null
}

export interface ReportMeta {
  report_date: string
  window_label: WindowLabel | string
  summary: string | null
  updated_at: string | null
  source_agent: string | null
}

/** Home chart defaults: the same four series as the 市场追踪「大盘」cards. */
export const DEFAULT_SERIES_IDS = [
  'sp500',
  'nasdaq',
  'dji',
  't10y2y',
] as const

/**
 * FX + local-index pairs for the 新兴市场 tag, in card order.
 * The 4-up grid then places two pairs on each row.
 * These ids are not in the live database yet; cards render NA until ingest
 * writes observations and series_1y rows. USD/CNY is the yuan pair.
 */
export const EMERGING_MARKET_IDS = [
  'usd_jpy',
  'n225',
  'usd_eur',
  'stoxx50',
  'usd_hkd',
  'hsi',
  'usd_cny',
  'csi300',
] as const

export const SERIES_DISPLAY_NAMES: Record<(typeof EMERGING_MARKET_IDS)[number], string> = {
  usd_jpy: 'USD/JPY',
  n225: '日经225',
  usd_eur: 'USD/EUR',
  stoxx50: '斯托克欧洲50',
  usd_hkd: 'USD/HKD',
  hsi: '恒生指数',
  usd_cny: 'USD/CNY',
  csi300: '沪深300',
}

/** Indicator name from the database, then the frontend catalog, then the id. */
export function seriesDisplayName(id: string, indicatorName?: string | null): string {
  const fromDb = indicatorName?.trim()
  if (fromDb) return fromDb
  if (Object.prototype.hasOwnProperty.call(SERIES_DISPLAY_NAMES, id)) {
    return SERIES_DISPLAY_NAMES[id as keyof typeof SERIES_DISPLAY_NAMES]
  }
  return id.toUpperCase()
}

export const SECTION_LABELS: Record<NoteSection, string> = {
  executive: 'Executive 结论',
  marginal: '重要边际变化',
  observe: '观察项（一句带过）',
  market_structure: '市场结构',
  market_narrative: '市场叙述',
  fupeng: '付鹏结构',
  strategy_1w: '未来1周策略',
  etf_flows: 'ETF资金流',
  data_gaps: '数据缺口与卡点',
}

/** High-contrast colors for multi-series charts (dark theme). */
export const SERIES_COLORS: Record<string, string> = {
  // 市场
  sp500: '#3b82f6', // blue
  nasdaq: '#22c55e', // green
  dji: '#a855f7', // purple
  wti: '#ea580c', // deep orange
  brent: '#eab308', // yellow
  gold_comex: '#fbbf24', // gold
  btc: '#f97316', // bright orange
  // 新兴市场（FX + 本地指数，按卡片成对）
  usd_jpy: '#fb923c', // orange
  n225: '#c084fc', // purple
  usd_eur: '#34d399', // emerald
  stoxx50: '#60a5fa', // blue
  usd_hkd: '#22d3ee', // cyan
  hsi: '#e879f9', // fuchsia
  usd_cny: '#fde047', // yellow
  csi300: '#ff6b8a', // rose
  // 波动
  vix: '#ef4444', // red
  vixeq: '#06b6d4', // cyan
  dspx: '#8b5cf6', // violet
  vixeq_vix_ratio: '#d946ef', // fuchsia
  // 利率
  dgs2: '#84cc16', // lime
  dgs10: '#14b8a6', // teal
  dgs30: '#0ea5e9', // sky
  t10y2y: '#f43f5e', // rose
  dfii10: '#10b981', // emerald
  acmtp10: '#64748b', // slate
  // 信用
  hy_oas: '#ec4899', // pink
  ig_oas: '#c026d3', // magenta
  // ETF 行情（etf_prices close）
  SPY: '#2563eb',
  RSP: '#059669',
  QQQ: '#7c3aed',
  IWM: '#db2777',
  XLK: '#0284c7',
  XLF: '#ca8a04',
  XLI: '#0f766e',
  XLE: '#c2410c',
  XLV: '#be185d',
  XLP: '#4d7c0f',
  XLU: '#6366f1',
  XBI: '#e11d48',
  HYG: '#b45309',
  LQD: '#0e7490',
  TLT: '#9333ea',
  SGOV: '#65a30d',
  SCHD: '#0891b2',
  MTUM: '#f59e0b',
  QUAL: '#6d28d9',
  ARKK: '#b91c1c',
  XLY: '#ff8c42',
  XLC: '#c4b5fd',
  XLB: '#bef264',
  VPU: '#2a9d8f',
  VHT: '#f9a8d4',
  VTV: '#93c5fd',
  VT: '#6ee7b7',
  KBE: '#e9c46a',
  IGV: '#d8b4fe',
  VGT: '#7dd3fc',
  MAGS: '#ff4d6d',
  // ETF 相对强弱（etf_ratio_series，调整后收盘）
  spy_rsp: '#38bdf8',
  qqq_spy: '#a3e635',
  iwm_spy: '#fb7185',
  xlk_xlf: '#f472b6',
  hyg_lqd: '#fdba74',
}

/** Fallback palette when an id has no fixed color — spaced hues for dark bg. */
export const SERIES_COLOR_FALLBACK = [
  '#38bdf8',
  '#4ade80',
  '#f472b6',
  '#facc15',
  '#818cf8',
  '#2dd4bf',
  '#fb7185',
  '#a3e635',
  '#e879f9',
  '#fdba74',
]
