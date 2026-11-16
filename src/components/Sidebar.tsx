import { APP_NAV, type AppPage } from '../lib/pages'

function NavLink({
  page,
  item,
  className,
}: {
  page: AppPage
  item: (typeof APP_NAV)[number]
  className: string
}) {
  const active = page === item.id
  return (
    <a
      href={item.hash}
      aria-current={active ? 'page' : undefined}
      className={`${className} ${
        active
          ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
      }`}
    >
      {item.label}
    </a>
  )
}

export function Sidebar({ page }: { page: AppPage }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950/80 lg:flex lg:self-start">
      <div className="px-4 pb-3 pt-4">
        <div className="text-sm font-semibold tracking-tight text-slate-50">美国宏观短期看板</div>
        <div className="mt-0.5 text-[11px] text-slate-500">US Short-term Macro</div>
      </div>
      <nav className="flex flex-col gap-1 px-2" aria-label="工作台">
        {APP_NAV.map((item) => (
          <NavLink
            key={item.id}
            page={page}
            item={item}
            className="rounded-lg px-3 py-2 text-sm transition"
          />
        ))}
      </nav>
    </aside>
  )
}

export function MobileNav({ page }: { page: AppPage }) {
  return (
    <nav
      className="flex gap-1 border-b border-slate-800/80 px-4 py-2 lg:hidden"
      aria-label="工作台"
    >
      {APP_NAV.map((item) => (
        <NavLink
          key={item.id}
          page={page}
          item={item}
          className="rounded-lg px-3 py-1.5 text-sm transition"
        />
      ))}
    </nav>
  )
}
