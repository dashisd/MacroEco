import type { DashboardState } from '../hooks/useDashboardData'
import { MACRO_PAGE_GROUP_IDS, MARKET_PAGE_MACRO_IDS } from '../lib/categories'
import { ETF_TICKERS } from '../lib/etf'
import { LatestReadings } from './LatestReadings'
import { NotesPanel } from './NotesPanel'
import { SummaryBanner } from './SummaryBanner'
import type { ReportNote } from '../types/database'

interface Props {
  d: DashboardState
  onSelectNote: (note: ReportNote) => void
  onClear: () => void
  onFocusIndicator: (id: string | null) => void
}

const EXCLUDE_IDS = [...MARKET_PAGE_MACRO_IDS, ...ETF_TICKERS]

export function MacroPage({ d, onSelectNote, onClear, onFocusIndicator }: Props) {
  return (
    <>
      {d.error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          读取 Supabase 失败：{d.error}
        </div>
      ) : null}

      <SummaryBanner summary={d.activeMeta?.summary} loading={d.loading} />

      <NotesPanel
        notes={d.notes}
        events={d.events}
        indicators={d.indicators}
        selectedNoteId={d.selectedNoteId}
        focusedIndicatorId={d.focusedIndicatorId}
        loading={d.loading}
        onSelectNote={onSelectNote}
        onClear={onClear}
        layout="stack"
      />

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
        onFocusIndicator={onFocusIndicator}
        includeGroupIds={MACRO_PAGE_GROUP_IDS}
        excludeIndicatorIds={EXCLUDE_IDS}
      />
    </>
  )
}
