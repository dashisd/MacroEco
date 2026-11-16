import { useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { MacroPage } from './components/MacroPage'
import { MarketPage } from './components/MarketPage'
import { MobileNav, Sidebar } from './components/Sidebar'
import { pageFromHash, type AppPage } from './lib/pages'
import { useDashboardData } from './hooks/useDashboardData'
import { ETF_TICKERS } from './lib/etf'
import { useEtfData } from './hooks/useEtfData'
import type { ReportNote } from './types/database'

export default function App() {
  const d = useDashboardData()
  const [page, setPage] = useState<AppPage>(() => pageFromHash(window.location.hash))
  const etf = useEtfData(page === 'market')

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#etf') {
        const url = new URL(window.location.href)
        url.hash = 'market'
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      }
      setPage(pageFromHash(window.location.hash))
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    document.title =
      page === 'macro' ? '宏观数据 · 美国宏观短期看板' : '市场追踪 · 美国宏观短期看板'
  }, [page])

  const handleSelectNote = (note: ReportNote) => {
    d.setSelectedNoteId(note.id)
    if (note.indicator_id) {
      d.setFocusedIndicatorId(note.indicator_id)
      if (!d.enabledSeries.includes(note.indicator_id)) {
        d.setEnabledSeries([...d.enabledSeries, note.indicator_id])
        d.setActivePresetId(null)
      }
    }
  }

  const clearLinkage = () => {
    d.setSelectedNoteId(null)
    d.setFocusedIndicatorId(null)
  }

  const focusIndicator = (id: string | null) => {
    d.setFocusedIndicatorId(id)
    if (id) {
      const match = d.notes.find((n) => n.indicator_id === id)
      d.setSelectedNoteId(match?.id ?? null)
      if (!d.enabledSeries.includes(id) && d.availableSeriesIds.includes(id)) {
        d.setEnabledSeries([...d.enabledSeries, id])
        d.setActivePresetId(null)
      }
    } else {
      d.setSelectedNoteId(null)
    }
  }

  const onMarket = page === 'market'
  const etfCountReady = !(etf.loading && etf.loadedTickers === 0)
  const statusDetail = onMarket
    ? etfCountReady
      ? `${d.indicatorCount} 指标 · ${etf.loadedTickers}/${ETF_TICKERS.length} 只 ETF`
      : `${d.indicatorCount} 指标`
    : null

  return (
    <div className="min-h-screen text-slate-100 lg:flex">
      <Sidebar page={page} />
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
          <MobileNav page={page} />
          <TopBar
            title={onMarket ? '市场追踪' : '宏观数据'}
            meta={d.activeMeta}
            metaList={d.metaList}
            reportDate={d.reportDate}
            indicatorCount={d.indicatorCount}
            statusDetail={statusDetail}
            loading={d.loading}
            connected={d.connected}
            error={d.error}
            onReportDateChange={d.setReportDate}
            onRefresh={() => {
              d.refresh()
              etf.refresh()
            }}
          />
        </div>

        <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6">
          {onMarket ? (
            <MarketPage d={d} etf={etf} onFocusIndicator={focusIndicator} />
          ) : (
            <MacroPage
              d={d}
              onSelectNote={handleSelectNote}
              onClear={clearLinkage}
              onFocusIndicator={focusIndicator}
            />
          )}

          <footer className="pb-6 text-center text-xs text-slate-600">
            只读 anon / publishable key · 写入由日更任务使用 service role · 时区
            Asia/Shanghai
          </footer>
        </main>
      </div>
    </div>
  )
}
