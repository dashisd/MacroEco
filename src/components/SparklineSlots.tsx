import type { ReactNode } from 'react'

/** Same 4-up slot as LatestReadings chart groups and the former ETF board. */
export const SPARKLINE_SLOT_CLASS = 'w-[calc((100%-1.5rem)/4)] shrink-0'

export function SparklineSlots({
  items,
}: {
  items: { key: string; node: ReactNode }[]
}) {
  const rows: { key: string; node: ReactNode }[][] = []
  for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4))

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.map((item) => item.key).join('-')}
          className="flex flex-row flex-nowrap justify-start gap-2"
        >
          {row.map((item) => (
            <div key={item.key} className={SPARKLINE_SLOT_CLASS}>
              {item.node}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
