import { useMemo } from 'react'
import type {
  EventFeedback,
  Indicator,
  NoteSection,
  ReportNote,
} from '../types/database'
import { SECTION_LABELS } from '../types/database'
import { NOTE_TAG_ORDER, parseCategoryTag } from '../lib/categories'

interface Props {
  notes: ReportNote[]
  events: EventFeedback[]
  indicators: Indicator[]
  selectedNoteId: string | null
  focusedIndicatorId: string | null
  loading: boolean
  onSelectNote: (note: ReportNote) => void
  onClear: () => void
}

const SECTION_ORDER: NoteSection[] = [
  'executive',
  'marginal',
  'market_structure',
  'observe',
  'data_gaps',
]

export function NotesPanel({
  notes,
  events,
  indicators,
  selectedNoteId,
  focusedIndicatorId,
  loading,
  onSelectNote,
  onClear,
}: Props) {
  const nameOf = (id: string | null) => {
    if (!id) return null
    return indicators.find((i) => i.id === id)?.name ?? id
  }

  const filtered = useMemo(() => {
    if (!focusedIndicatorId) return notes
    const linked = notes.filter((n) => n.indicator_id === focusedIndicatorId)
    return linked.length ? linked : notes
  }, [notes, focusedIndicatorId])

  const bySection = useMemo(() => {
    const map = new Map<string, ReportNote[]>()
    for (const n of filtered) {
      const key = n.section || 'executive'
      const list = map.get(key) ?? []
      list.push(n)
      map.set(key, list)
    }
    return map
  }, [filtered])

  const latestVerdict = (note: ReportNote) => {
    if (note.section !== 'marginal') return null
    const match = events.find((e) => e.as_of === note.report_date)
    return match?.verdict ?? null
  }

  return (
    <aside className="flex w-full flex-col rounded-2xl border border-slate-800 bg-slate-900/50 lg:w-[380px] xl:w-[420px]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-200">报告解释</h2>
        {(selectedNoteId || focusedIndicatorId) && (
          <button
            type="button"
            className="text-xs text-cyan-300 hover:underline"
            onClick={onClear}
          >
            清除联动
          </button>
        )}
      </div>

      <div
        className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4"
        style={{ maxHeight: 640 }}
      >
        {loading ? (
          <p className="text-sm text-slate-400">解释加载中…</p>
        ) : notes.length === 0 ? (
          <EmptyNotes />
        ) : (
          SECTION_ORDER.map((section) => {
            const list = bySection.get(section) ?? []
            if (!list.length) return null

            if (section === 'marginal') {
              return (
                <MarginalByTag
                  key={section}
                  list={list}
                  selectedNoteId={selectedNoteId}
                  focusedIndicatorId={focusedIndicatorId}
                  nameOf={nameOf}
                  latestVerdict={latestVerdict}
                  onSelectNote={onSelectNote}
                />
              )
            }

            return (
              <section key={section}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {SECTION_LABELS[section] ?? section}
                </h3>
                <ul className="space-y-2">
                  {list.map((note) => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      active={selectedNoteId === note.id}
                      linked={
                        focusedIndicatorId != null &&
                        note.indicator_id === focusedIndicatorId
                      }
                      verdict={null}
                      nameOf={nameOf}
                      onSelectNote={onSelectNote}
                    />
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </aside>
  )
}

function MarginalByTag({
  list,
  selectedNoteId,
  focusedIndicatorId,
  nameOf,
  latestVerdict,
  onSelectNote,
}: {
  list: ReportNote[]
  selectedNoteId: string | null
  focusedIndicatorId: string | null
  nameOf: (id: string | null) => string | null
  latestVerdict: (note: ReportNote) => string | null
  onSelectNote: (note: ReportNote) => void
}) {
  const tagged = list.map((n) => ({ note: n, ...parseCategoryTag(n.text) }))
  const hasTags = tagged.some((t) => t.tag)

  if (!hasTags) {
    return (
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {SECTION_LABELS.marginal}
        </h3>
        <ul className="space-y-2">
          {list.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              active={selectedNoteId === note.id}
              linked={
                focusedIndicatorId != null &&
                note.indicator_id === focusedIndicatorId
              }
              verdict={latestVerdict(note)}
              nameOf={nameOf}
              onSelectNote={onSelectNote}
            />
          ))}
        </ul>
      </section>
    )
  }

  const byTag = new Map<string, typeof tagged>()
  for (const t of tagged) {
    const key = t.tag ?? '其他'
    const arr = byTag.get(key) ?? []
    arr.push(t)
    byTag.set(key, arr)
  }

  const orderedKeys = [
    ...NOTE_TAG_ORDER.filter((k) => byTag.has(k)),
    ...[...byTag.keys()].filter((k) => !NOTE_TAG_ORDER.includes(k)),
  ]

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {SECTION_LABELS.marginal}
      </h3>
      <div className="space-y-3">
        {orderedKeys.map((tag) => {
          const items = byTag.get(tag) ?? []
          return (
            <div key={tag}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                  【{tag}】
                </span>
              </div>
              <ul className="space-y-2">
                {items.map(({ note, body }) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    displayText={body}
                    active={selectedNoteId === note.id}
                    linked={
                      focusedIndicatorId != null &&
                      note.indicator_id === focusedIndicatorId
                    }
                    verdict={latestVerdict(note)}
                    nameOf={nameOf}
                    onSelectNote={onSelectNote}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function NoteItem({
  note,
  displayText,
  active,
  linked,
  verdict,
  nameOf,
  onSelectNote,
}: {
  note: ReportNote
  displayText?: string
  active: boolean
  linked: boolean
  verdict: string | null
  nameOf: (id: string | null) => string | null
  onSelectNote: (note: ReportNote) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectNote(note)}
        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
          active || linked
            ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]'
            : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
        }`}
      >
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <ImportanceChip value={note.importance} />
          {verdict ? <VerdictChip value={verdict} /> : null}
          {note.indicator_id ? (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {nameOf(note.indicator_id)}
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-slate-200">
          {displayText ?? note.text}
        </p>
      </button>
    </li>
  )
}

function EmptyNotes() {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center">
      <p className="text-sm font-medium text-slate-300">暂无报告解释</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        `report_notes` / `report_meta` 为空属正常：日更管道写入后，这里会按板块展示
        Executive、边际变化（含正/负反馈）、市场结构与数据缺口，并与左侧图表联动。
      </p>
    </div>
  )
}

function ImportanceChip({ value }: { value: string | null }) {
  if (!value) return null
  const styles: Record<string, string> = {
    critical: 'bg-rose-500/20 text-rose-300',
    high: 'bg-amber-500/20 text-amber-300',
    normal: 'bg-slate-700/60 text-slate-300',
    low: 'bg-slate-800 text-slate-500',
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[value] ?? styles.normal}`}
    >
      {value}
    </span>
  )
}

function VerdictChip({ value }: { value: string }) {
  const styles: Record<string, string> = {
    正反馈: 'bg-emerald-500/20 text-emerald-300',
    负反馈: 'bg-rose-500/20 text-rose-300',
    NA: 'bg-slate-700 text-slate-400',
  }
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[value] ?? styles.NA}`}
    >
      {value}
    </span>
  )
}
