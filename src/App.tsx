import { useState } from 'react'
import { TopBar, type BoardModule } from './components/TopBar'
import { SummaryBanner } from './components/SummaryBanner'
import { SeriesToggles } from './components/SeriesToggles'
import { SeriesChart } from './components/SeriesChart'
import { NotesPanel } from './components/NotesPanel'
import { LatestReadings } from './components/LatestReadings'
import { EtfBoard } from './components/EtfBoard'
import { useDashboardData } from './hooks/useDashboardData'
import { useEtfData } from './hooks/useEtfData'
import type { ReportNote } from './types/database'

function initialModule(): BoardModule {
  if (typeof window === 'undefined') return 'macro'
  return window.location.hash === '#etf' ? 'etf' : 'macro'
}

export default function App() {
  const d = useDashboardData()
  const [module, setModule] = useState<BoardModule>(initialModule)
  const etf = useEtfData(module === 'etf')

  const onModuleChange = (next: BoardModule) => {
    setModule(next)
    const url = new URL(window.location.href)
    url.hash = next === 'etf' ? 'etf' : ''
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

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

  const etfMode = module === 'etf'

  return (
    <div className="min-h-screen text-slate-100">
      <TopBar
        module={module}
        onModuleChange={onModuleChange}
        meta={d.activeMeta}
        metaList={d.metaList}
        reportDate={d.reportDate}
        indicatorCount={d.indicatorCount}
        etfAsOf={etf.asOf}
        statusDetail={etfMode ? `${etf.loadedTickers}/14 只 ETF` : null}
        loading={etfMode ? etf.loading : d.loading}
        connected={etfMode ? etf.connected : d.connected}
        error={etfMode ? etf.error : d.error}
        onReportDateChange={d.setReportDate}
        onRefresh={() => {
          d.refresh()
          etf.refresh()
        }}
      />

      <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6">
        {etfMode && etf.error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            读取 ETF 数据失败：{etf.error}
          </div>
        ) : null}
        {!etfMode && d.error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            读取 Supabase 失败：{d.error}
          </div>
        ) : null}

        {etfMode ? (
          <EtfBoard etf={etf} />
        ) : (
          <>
            <SummaryBanner summary={d.activeMeta?.summary} loading={d.loading} />

            <LatestReadings
              observations={d.observations}
              indicators={d.indicators}
              series={d.series}
              ohlcById={d.ohlcById}
              ohlcLoadingId={d.ohlcLoadingId}
              ensureOhlc={d.ensureOhlc}
              reportDate={d.reportDate}
              loading={d.loading}
              focusedId={d.focusedIndicatorId}
              onFocusIndicator={(id) => {
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
              }}
            />

            <SeriesToggles
              availableIds={d.availableSeriesIds}
              enabledIds={d.enabledSeries}
              indicators={d.indicators}
              rangeDays={d.rangeDays}
              focusedId={d.focusedIndicatorId}
              activePresetId={d.activePresetId}
              onToggle={d.toggleSeries}
              onRangeChange={d.setRangeDays}
              onFocus={d.setFocusedIndicatorId}
              onApplyPreset={d.applySeriesPreset}
            />

            <div className="flex flex-col gap-4 lg:flex-row">
              <SeriesChart
                series={d.series}
                enabledIds={d.enabledSeries}
                indicators={d.indicators}
                focusedId={d.focusedIndicatorId}
                loading={d.loading}
                onSeriesFocus={(id) => {
                  d.setFocusedIndicatorId(id)
                  if (id) {
                    const match = d.notes.find((n) => n.indicator_id === id)
                    d.setSelectedNoteId(match?.id ?? null)
                  } else {
                    d.setSelectedNoteId(null)
                  }
                }}
              />
              <NotesPanel
                notes={d.notes}
                events={d.events}
                indicators={d.indicators}
                selectedNoteId={d.selectedNoteId}
                focusedIndicatorId={d.focusedIndicatorId}
                loading={d.loading}
                onSelectNote={handleSelectNote}
                onClear={clearLinkage}
              />
            </div>
          </>
        )}

        <footer className="pb-6 text-center text-xs text-slate-600">
          只读 anon / publishable key · 写入由日更任务使用 service role · 时区
          Asia/Shanghai
        </footer>
      </main>
    </div>
  )
}
