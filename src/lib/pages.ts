export type AppPage = 'market' | 'macro'

export const APP_NAV: { id: AppPage; label: string; hash: string }[] = [
  { id: 'market', label: '美国市场', hash: '#market' },
  { id: 'macro', label: '宏观数据', hash: '#macro' },
]

export function pageFromHash(hash: string): AppPage {
  return hash === '#macro' ? 'macro' : 'market'
}
