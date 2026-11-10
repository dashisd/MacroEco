/** Chart series category presets (indicator ids). */
export const SERIES_PRESETS: { id: string; label: string; ids: string[] }[] = [
  {
    id: 'rates',
    label: '国债',
    ids: ['dgs2', 'dgs10', 'dgs30', 't10y2y', 'dfii10'],
  },
  {
    id: 'bei',
    label: '通胀预期',
    ids: ['t5yie', 't10yie'],
  },
  {
    id: 'pce_cpi',
    label: 'PCE·CPI相关序列',
    ids: ['cpi_yoy', 'cpi_core_yoy', 'pce_yoy', 'pce_core_yoy'],
  },
  {
    id: 'vol',
    label: '波动三件套',
    ids: ['vix', 'vixeq', 'vixeq_vix_ratio'],
  },
  {
    id: 'credit',
    label: '信用',
    ids: ['hy_oas', 'ig_oas'],
  },
  {
    id: 'market',
    label: '市场',
    ids: ['sp500', 'nasdaq', 'dji', 'wti', 'brent', 'gold_comex', 'btc'],
  },
  {
    id: 'etf_rs',
    label: 'ETF 相对强弱',
    ids: ['spy_rsp', 'qqq_spy', 'iwm_spy', 'xlk_xlf', 'hyg_lqd'],
  },
  {
    id: 'all',
    label: '全部',
    ids: [], // special: use all available
  },
]

/** Latest-readings panel groups (display order). */
export const READING_GROUPS: { id: string; label: string; match: (indicatorId: string, category: string | null) => boolean }[] = [
  {
    id: 'rates',
    label: '国债',
    match: (id, cat) =>
      ['dgs2', 'dgs10', 'dgs30', 't10y2y', 'dfii10', 'acmtp10'].includes(id) ||
      cat === 'rates',
  },
  {
    id: 'inflation',
    label: 'PCE/CPI',
    match: (id, cat) =>
      ['cpi_yoy', 'cpi_core_yoy', 'pce_yoy', 'pce_core_yoy', 't5yie', 't10yie'].includes(id) ||
      cat === 'inflation',
  },
  {
    id: 'labor',
    label: '就业',
    match: (id, cat) => ['unrate', 'payems'].includes(id) || cat === 'labor',
  },
  {
    id: 'fed',
    label: 'Fed&流动性',
    match: (id, cat) =>
      [
        'fed_funds_target_lower',
        'fed_funds_target_upper',
        'fomc_dissent_note',
        'fomc_vote',
        'tga',
        'wdtgal',
        'wresbal',
        'tga_close',
        'walcl',
        'on_rrp',
      ].includes(id) ||
      cat === 'fed' ||
      cat === 'liquidity',
  },
  {
    id: 'vol',
    label: '波动',
    match: (id, cat) => ['vix', 'vixeq', 'vixeq_vix_ratio'].includes(id) || (cat === 'vol' && id !== 'dspx'),
  },
  {
    id: 'market',
    label: '市场',
    match: (id, cat) =>
      ['sp500', 'nasdaq', 'dji', 'wti', 'brent', 'gold_comex', 'btc'].includes(id) ||
      cat === 'market',
  },
  {
    id: 'credit',
    label: '信用',
    match: (id, cat) => ['hy_oas', 'ig_oas'].includes(id) || cat === 'credit',
  },
]

/** Parse leading 【类别】 tag from note text. */
export function parseCategoryTag(text: string): { tag: string | null; body: string } {
  const m = text.match(/^【([^】]+)】\s*/)
  if (!m) return { tag: null, body: text }
  return { tag: m[1], body: text.slice(m[0].length) }
}

/** Preferred order for note category tags when grouping marginal notes. */
export const NOTE_TAG_ORDER = [
  '摘要',
  '混合反馈',
  'Fed&流动性',
  'Fed',
  '国债',
  '国债利差',
  'PCE',
  'CPI',
  '核心 CPI',
  '就业',
  '失业率',
  '政治→风险',
  '波动',
  '市场结构',
  '市场',
  'VIXEQ',
  'DSPX',
  '增长辅助',
  'QRA',
  '流动性',
  '信用',
  '缺口',
  '待发日历',
]
