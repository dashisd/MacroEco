import type { Indicator } from '../types/database'
import { SERIES_COLORS } from '../types/database'
import { SERIES_PRESETS } from '../lib/categories'

interface Props {
  availableIds: string[]
  enabledIds: string[]
  indicators: Indicator[]
  rangeDays: number
  focusedId: string | null
  activePresetId: string | null
  onToggle: (id: string) => void
  onRangeChange: (days: number) => void
  onFocus: (id: string | null) => void
  onApplyPreset: (presetId: string, ids: string[]) => void
}

const RANGES = [
  { days: 30, label: '1月' },
  { days: 90, label: '3月' },
  { days: 180, label: '6月' },
  { days: 365, label: '1年' },
  { days: 365 * 5, label: '5年' },
] as const

export function SeriesToggles({
  availableIds,
  enabledIds,
  indicators,
  rangeDays,
  focusedId,
  activePresetId,
  onToggle,
  onRangeChange,
  onFocus,
  onApplyPreset,
}: Props) {
  const nameOf = (id: string) =>
    indicators.find((i) => i.id === id)?.name ?? id.toUpperCase()

  const applyPreset = (presetId: string) => {
    if (presetId === 'all') {
      onApplyPreset('all', [...availableIds])
      return
    }
    const preset = SERIES_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const ids = preset.ids.filter((id) => availableIds.includes(id))
    onApplyPreset(presetId, ids)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-200">序列开关</h2>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => onRangeChange(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                rangeDays === r.days
                  ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="mr-1 self-center text-[11px] text-slate-500">类别</span>
        {SERIES_PRESETS.map((p) => {
          const count =
            p.id === 'all'
              ? availableIds.length
              : p.ids.filter((id) => availableIds.includes(id)).length
          const active = activePresetId === p.id
          return (
            <button
              key={p.id}
              type="button"
              disabled={count === 0 && p.id !== 'all'}
              onClick={() => applyPreset(p.id)}
              title={
                count === 0
                  ? '该类别暂无 series_1y 数据'
                  : `启用 ${count} 条可用序列`
              }
              className={`rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              {p.label}
              <span className="ml-1 text-[10px] text-slate-500">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {availableIds.length === 0 ? (
          <p className="text-xs text-slate-500">
            暂无序列数据（series_1y 为空）。指标目录已连接时可先看右侧说明。
          </p>
        ) : (
          availableIds.map((id) => {
            const on = enabledIds.includes(id)
            const color = SERIES_COLORS[id] ?? '#94a3b8'
            const focused = focusedId === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                onDoubleClick={() => onFocus(focused ? null : id)}
                title="单击开关；双击聚焦并联动解释"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  on
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-slate-800 bg-slate-950 text-slate-500'
                } ${focused ? 'ring-2 ring-cyan-400/60' : ''}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? color : '#475569' }}
                />
                {nameOf(id)}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
