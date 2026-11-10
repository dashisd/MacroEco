export type WindowLabel = '1w' | '2_4w'

export type NoteSection =
  | 'executive'
  | 'marginal'
  | 'observe'
  | 'market_structure'
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

export const DEFAULT_SERIES_IDS = [
  'sp500',
  'nasdaq',
] as const

export const SECTION_LABELS: Record<NoteSection, string> = {
  executive: 'Executive 结论',
  marginal: '重要边际变化',
  observe: '观察项（一句带过）',
  market_structure: '市场结构',
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
