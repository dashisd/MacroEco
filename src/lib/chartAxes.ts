/**
 * Shared-chart Y axes.
 *
 * Magnitude is the latest absolute value (same metric as the dual-axis rule).
 * `MAG_RATIO` (2) is the only scale threshold:
 * - max/min below 2 → one axis
 * - otherwise series are bucketed with `round(log10)`, and a single split at
 *   the largest bucket gap yields two axes (indices vs 10Y–2Y on the default
 *   大盘 chart, including Dow, which sits just over 2× Nasdaq)
 *
 * A third axis is added only when at least two of those bucket boundaries are
 * also at least half a decade apart — the ±0.5 radius `Math.round(log10)`
 * already uses. That is still the 2× rule (half a decade is about 3.2×, so
 * every third-axis gap is >2×) and it does not fire for a pair that merely
 * straddles a bucket edge. VIX vs 10Y–2Y and VIX vs 10Y breakeven both clear
 * it, so each of those three bands gets its own scale.
 *
 * There is no fourth axis. With three or more half-decade gaps, the two widest
 * ratios are the cuts and the leftover buckets join the nearer side.
 */

const EPS = 1e-12
export const MAG_RATIO = 2
/** Rounding radius of `Math.round(log10)`. Ratio >= 10^0.5. */
const LOG_BUCKET_RADIUS = 0.5

export type AxisAssignment = {
  axisCount: 1 | 2 | 3
  yIndex: Map<string, number>
  /** Representative series color per axis index. */
  axisColor: string[]
}

type Scale = { id: string; abs: number; log: number }

type Boundary = { index: number; keyGap: number; ratio: number }

function latestAbs(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) return Math.abs(v)
  }
  return null
}

function bucketScales(scales: Scale[]): Map<number, Scale[]> {
  const buckets = new Map<number, Scale[]>()
  for (const s of scales) {
    const key = Math.round(s.log)
    const arr = buckets.get(key) ?? []
    arr.push(s)
    buckets.set(key, arr)
  }
  return buckets
}

/** True when neighboring buckets are far enough apart to be their own scale group. */
export function isWideScaleGap(ratio: number): boolean {
  return ratio >= MAG_RATIO && Math.log10(ratio) >= LOG_BUCKET_RADIUS
}

function boundariesOf(buckets: Map<number, Scale[]>, keys: number[]): Boundary[] {
  const out: Boundary[] = []
  for (let i = 0; i < keys.length - 1; i++) {
    const low = buckets.get(keys[i]!) ?? []
    const high = buckets.get(keys[i + 1]!) ?? []
    const lowMax = Math.max(...low.map((s) => s.abs))
    const highMin = Math.min(...high.map((s) => s.abs))
    const ratio = highMin / Math.max(lowMax, EPS)
    out.push({ index: i, keyGap: keys[i + 1]! - keys[i]!, ratio })
  }
  return out
}

function colorFor(
  scales: Scale[],
  yIndex: Map<string, number>,
  axis: number,
  colorOf: (id: string) => string,
): string {
  const member = scales.find((s) => yIndex.get(s.id) === axis)
  return colorOf(member?.id ?? scales[0]!.id)
}

/** Legacy dual split: largest round(log10) gap, or a median split inside one bucket. */
function assignTwoAxes(
  ids: string[],
  scales: Scale[],
  colorOf: (id: string) => string,
): AxisAssignment {
  const buckets = bucketScales(scales)
  const keys = [...buckets.keys()].sort((a, b) => a - b)
  const yIndex = new Map<string, number>()

  if (keys.length < 2) {
    const sorted = [...scales].sort((a, b) => a.abs - b.abs)
    const mid = Math.floor(sorted.length / 2)
    const lowIds = new Set(sorted.slice(0, mid).map((s) => s.id))
    for (const s of scales) yIndex.set(s.id, lowIds.has(s.id) ? 1 : 0)
  } else {
    let splitAfter = 0
    let bestGap = -1
    for (let i = 0; i < keys.length - 1; i++) {
      const gap = keys[i + 1]! - keys[i]!
      if (gap > bestGap) {
        bestGap = gap
        splitAfter = i
      }
    }
    const lowKeySet = new Set(keys.slice(0, splitAfter + 1))
    for (const s of scales) {
      const key = Math.round(s.log)
      yIndex.set(s.id, lowKeySet.has(key) ? 1 : 0)
    }
  }

  for (const id of ids) if (!yIndex.has(id)) yIndex.set(id, 0)
  return {
    axisCount: 2,
    yIndex,
    axisColor: [colorFor(scales, yIndex, 0, colorOf), colorFor(scales, yIndex, 1, colorOf)],
  }
}

/**
 * Two widest half-decade cuts → three contiguous bands.
 * High band → axis 0 (inner right), middle → axis 1 (left), low → axis 2 (outer right).
 */
function assignThreeAxes(
  ids: string[],
  scales: Scale[],
  keys: number[],
  wide: Boundary[],
  colorOf: (id: string) => string,
): AxisAssignment {
  const ranked = [...wide].sort(
    (a, b) => b.ratio - a.ratio || b.keyGap - a.keyGap || a.index - b.index,
  )
  const cuts = ranked
    .slice(0, 2)
    .map((b) => b.index)
    .sort((a, b) => a - b)
  const c0 = cuts[0]!
  const c1 = cuts[1]!

  // Segment 0 is the lowest band, 2 the highest. Map onto axis slots.
  const axisOfSeg = [2, 1, 0] as const
  const yIndex = new Map<string, number>()
  const keyAxis = new Map<number, number>()
  keys.forEach((key, i) => {
    const seg = i <= c0 ? 0 : i <= c1 ? 1 : 2
    keyAxis.set(key, axisOfSeg[seg])
  })
  for (const s of scales) {
    const key = Math.round(s.log)
    yIndex.set(s.id, keyAxis.get(key) ?? 0)
  }
  for (const id of ids) if (!yIndex.has(id)) yIndex.set(id, 0)

  return {
    axisCount: 3,
    yIndex,
    axisColor: [0, 1, 2].map((axis) => colorFor(scales, yIndex, axis, colorOf)),
  }
}

export function assignYAxes(
  ids: string[],
  dataById: Map<string, (number | null)[]>,
  colorOf: (id: string) => string,
): AxisAssignment {
  const scales: Scale[] = ids
    .map((id) => {
      const abs = latestAbs(dataById.get(id) ?? [])
      return { id, abs: abs ?? 0, log: Math.log10(Math.max(abs ?? 0, EPS)) }
    })
    .filter((s) => s.abs > 0)

  const yIndex = new Map<string, number>()
  if (scales.length === 0) {
    for (const id of ids) yIndex.set(id, 0)
    return { axisCount: 1, yIndex, axisColor: ['#94a3b8'] }
  }

  const absVals = scales.map((s) => s.abs)
  const ratio = Math.max(...absVals) / Math.min(...absVals)
  if (ratio < MAG_RATIO) {
    for (const id of ids) yIndex.set(id, 0)
    return { axisCount: 1, yIndex, axisColor: [colorOf(scales[0]!.id)] }
  }

  const buckets = bucketScales(scales)
  const keys = [...buckets.keys()].sort((a, b) => a - b)
  if (keys.length < 2) return assignTwoAxes(ids, scales, colorOf)

  const boundaries = boundariesOf(buckets, keys)
  const wide = boundaries.filter((b) => isWideScaleGap(b.ratio))
  if (wide.length < 2) return assignTwoAxes(ids, scales, colorOf)
  return assignThreeAxes(ids, scales, keys, wide, colorOf)
}

export type AxisExtent = { min: number; max: number }

/**
 * Match ECharts' value-axis nice step (default splitNumber 5, round mode)
 * so `scaled` starts from the same window `scale: true` already draws.
 */
function niceStep(span: number): number {
  const val = span / 5
  if (!(val > 0) || !Number.isFinite(val)) return 1
  let exp = Math.floor(Math.log(val) / Math.LN10)
  if (val / 10 ** exp >= 10) exp += 1
  const exp10 = 10 ** exp
  const f = val / exp10
  const nf = f < 1.5 ? 1 : f < 2.5 ? 2 : f < 4 ? 3 : f < 7 ? 5 : 10
  return nf * exp10
}

function roundTo(n: number, decimals: number): number {
  const p = 10 ** decimals
  return Math.round(n * p) / p
}

/** Visible auto window: floor/ceil the data extent onto the nice step. */
export function niceAxisExtent(min: number, max: number): AxisExtent {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min, max }
  if (!(max > min)) {
    const pad = Math.max(Math.abs(min) * 0.05, 1e-6)
    return { min: min - pad, max: min + pad }
  }
  const interval = niceStep(max - min)
  const decimals = Math.min(12, Math.max(0, -Math.floor(Math.log10(interval))) + 2)
  let nmin = roundTo(Math.floor(min / interval + 1e-8) * interval, decimals)
  let nmax = roundTo(Math.ceil(max / interval - 1e-8) * interval, decimals)
  if (!(nmax > nmin)) {
    nmin = min
    nmax = max
  }
  return { min: nmin, max: nmax }
}

function strictlyPositive(w: AxisExtent): boolean {
  return w.min > 0 && w.max > w.min
}

function strictlyNegative(w: AxisExtent): boolean {
  return w.max < 0 && w.min < w.max
}

/** max/min for a window that stays on one side of zero. */
function magnitudeRatio(w: AxisExtent): number | null {
  if (strictlyPositive(w)) return w.max / w.min
  if (strictlyNegative(w)) return Math.abs(w.min) / Math.abs(w.max)
  return null
}

/** Log-center `[low, high]` (both positive) so high/low becomes `target`. */
function expandPositive(low: number, high: number, target: number): AxisExtent {
  const ratio = high / low
  const use = Math.max(target, ratio)
  const g = Math.sqrt(low * high)
  const f = Math.sqrt(use)
  return { min: g / f, max: g * f }
}

/**
 * Zero-crossing window. A 1% move of the larger absolute end maps to the same
 * fraction of the axis as a 1% move on a log window of `target`. The window
 * only grows, so the series is not clipped and zero stays inside.
 */
function expandAcrossZero(w: AxisExtent, target: number): AxisExtent {
  const span = w.max - w.min
  const mid = (w.min + w.max) / 2
  const level = Math.max(Math.abs(w.min), Math.abs(w.max), EPS)
  const matched = level * Math.log(Math.max(target, 1 + 1e-6))
  const half = Math.max(span / 2, matched / 2)
  return { min: mid - half, max: mid + half }
}

function equalizeNonPositive(windows: (AxisExtent | null)[]): (AxisExtent | null)[] {
  let targetRel = 0
  for (const w of windows) {
    if (!w || !(w.max > w.min)) continue
    const level = Math.max(Math.abs(w.min), Math.abs(w.max), EPS)
    targetRel = Math.max(targetRel, (w.max - w.min) / level)
  }
  if (!(targetRel > 0)) return windows
  return windows.map((w) => {
    if (!w) return null
    const span = Math.max(w.max - w.min, 0)
    const mid = (w.min + w.max) / 2
    const level = Math.max(Math.abs(w.min), Math.abs(w.max), EPS)
    const half = Math.max(span / 2, (level * targetRel) / 2)
    return { min: mid - half, max: mid + half }
  })
}

/**
 * `scaled` windows. Each input is the raw data extent of one Y axis.
 * The target ratio is the largest max/min among axes whose auto (niced)
 * window — or, if nice-ticks dragged that window onto zero, whose data —
 * stays strictly positive or strictly negative. Smaller windows are expanded
 * around their log center until they share that ratio. The widest window is
 * left as drawn. Data always remains inside the window.
 */
export function scaledAxisWindows(
  dataExtents: (AxisExtent | null)[],
): (AxisExtent | null)[] {
  const niced = dataExtents.map((ext) =>
    ext && Number.isFinite(ext.min) && Number.isFinite(ext.max)
      ? niceAxisExtent(ext.min, ext.max)
      : null,
  )

  const ratios: number[] = []
  for (let i = 0; i < dataExtents.length; i++) {
    const data = dataExtents[i]
    const nice = niced[i]
    if (nice) {
      const r = magnitudeRatio(nice)
      if (r != null && r > 1) ratios.push(r)
    } else if (data) {
      const r = magnitudeRatio(data)
      if (r != null && r > 1) ratios.push(r)
    }
    if (data && nice && magnitudeRatio(nice) == null) {
      const r = magnitudeRatio(data)
      if (r != null && r > 1) ratios.push(r)
    }
  }
  const target = ratios.length ? Math.max(...ratios) : null
  if (target == null) return equalizeNonPositive(niced)

  return niced.map((nice, i) => {
    const data = dataExtents[i]
    if (!nice || !data) return null
    if (strictlyPositive(nice)) return expandPositive(nice.min, nice.max, target)
    if (strictlyNegative(nice)) {
      const w = expandPositive(Math.abs(nice.max), Math.abs(nice.min), target)
      return { min: -w.max, max: -w.min }
    }
    if (strictlyPositive(data)) return expandPositive(data.min, data.max, target)
    if (strictlyNegative(data)) {
      const w = expandPositive(Math.abs(data.max), Math.abs(data.min), target)
      return { min: -w.max, max: -w.min }
    }
    return expandAcrossZero(nice, target)
  })
}
