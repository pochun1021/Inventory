import { type ReactNode, useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Boxes, ChevronDown, ClipboardList, FilePlus2, HandCoins, Handshake, LayoutDashboard, Logs, Menu, Upload, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type NavigationLink = {
  to: string
  label: string
  icon: ReactNode
  exact?: boolean
  isActive?: (pathname: string) => boolean
}

type NavigationSection = {
  title: string
  links: NavigationLink[]
}

const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    title: '總覽',
    links: [{ to: '/', label: 'Dashboard', icon: <LayoutDashboard className="size-4" />, exact: true }],
  },
  {
    title: '領用',
    links: [
      {
        to: '/issues',
        label: '領用清單',
        icon: <HandCoins className="size-4" />,
        isActive: (pathname) => pathname === '/issues' || /^\/issues\/\d+$/.test(pathname),
      },
      { to: '/issues/new', label: '新增領用', icon: <FilePlus2 className="size-4" />, exact: true },
    ],
  },
  {
    title: '借用',
    links: [
      {
        to: '/borrows',
        label: '借用清單',
        icon: <Handshake className="size-4" />,
        isActive: (pathname) => pathname === '/borrows' || /^\/borrows\/\d+$/.test(pathname),
      },
      { to: '/borrows/new', label: '新增借用', icon: <FilePlus2 className="size-4" />, exact: true },
    ],
  },
  {
    title: '捐贈',
    links: [
      {
        to: '/donations',
        label: '捐贈清單',
        icon: <ClipboardList className="size-4" />,
        isActive: (pathname) => pathname === '/donations' || /^\/donations\/\d+$/.test(pathname),
      },
      { to: '/donations/new', label: '新增捐贈', icon: <FilePlus2 className="size-4" />, exact: true },
    ],
  },
  {
    title: '資產',
    links: [
      {
        to: '/inventory',
        label: '財產清單',
        icon: <Boxes className="size-4" />,
        isActive: (pathname) => pathname === '/inventory' || /^\/inventory\/edit\/\d+$/.test(pathname),
      },
      { to: '/inventory/new', label: '新增庫存', icon: <ClipboardList className="size-4" />, exact: true },
      { to: '/upload', label: '批次上傳', icon: <Upload className="size-4" />, exact: true },
    ],
  },
  {
    title: '稽核',
    links: [{ to: '/logs', label: '日誌查詢', icon: <Logs className="size-4" />, exact: true }],
  },
]

type PageMeta = {
  title: string
  description: string
}

function resolvePageMeta(pathname: string): PageMeta {
  if (pathname === '/') {
    return { title: 'Dashboard', description: '資產管理整體狀態與近期活動' }
  }
  if (pathname === '/inventory') {
    return { title: '財產清單', description: '查詢、篩選與維護現有資產資料' }
  }
  if (pathname === '/inventory/new') {
    return { title: '新增庫存', description: '建立新的資產資料' }
  }
  if (/^\/inventory\/edit\/\d+$/.test(pathname)) {
    return { title: '編輯庫存', description: '更新既有資產資訊與狀態' }
  }
  if (pathname === '/issues') {
    return { title: '領用清單', description: '查看與管理領用申請紀錄' }
  }
  if (pathname === '/issues/new') {
    return { title: '新增領用', description: '建立新的領用申請單' }
  }
  if (/^\/issues\/\d+$/.test(pathname)) {
    return { title: '編輯領用', description: '更新指定領用申請資料' }
  }
  if (pathname === '/borrows') {
    return { title: '借用清單', description: '查看借用申請與歸還狀態' }
  }
  if (pathname === '/borrows/new') {
    return { title: '新增借用', description: '建立新的借用申請單' }
  }
  if (/^\/borrows\/\d+$/.test(pathname)) {
    return { title: '編輯借用', description: '更新借用單與歸還資訊' }
  }
  if (pathname === '/donations') {
    return { title: '捐贈清單', description: '查詢對外捐贈申請與品項' }
  }
  if (pathname === '/donations/new') {
    return { title: '新增捐贈', description: '建立新的捐贈申請單' }
  }
  if (/^\/donations\/\d+$/.test(pathname)) {
    return { title: '編輯捐贈', description: '更新捐贈申請內容' }
  }
  if (pathname === '/upload') {
    return { title: '批次上傳', description: '透過 xlsx 匯入資產資料' }
  }
  if (pathname === '/logs') {
    return { title: '日誌查詢', description: '檢視異動流水帳與操作日誌' }
  }

  return { title: '頁面', description: '系統頁面' }
}

type SidebarContentProps = {
  collapsible?: boolean
  onSelect?: () => void
}

function SidebarContent({ collapsible = false, onSelect }: SidebarContentProps) {
  const location = useLocation()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {}
    for (const section of NAVIGATION_SECTIONS) {
      initialState[section.title] = section.links.some((link) => {
        if (link.isActive) {
          return link.isActive(location.pathname)
        }
        if (link.exact) {
          return location.pathname === link.to
        }
        return location.pathname === link.to || location.pathname.startsWith(`${link.to}/`)
      })
    }
    return initialState
  })

  function toggleSection(title: string) {
    setExpandedSections((previousState) => ({
      ...previousState,
      [title]: !previousState[title],
    }))
  }

  return (
    <div className="flex h-full flex-col gap-6 px-3 pb-5 pt-4">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/70 px-4 py-3">
        <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[hsl(var(--muted-foreground))] uppercase">Inventory Hub</p>
        <p className="mt-1 mb-0 text-sm text-[hsl(var(--muted-foreground))]">Admin Console</p>
      </div>

      <div className="grid gap-5">
        {NAVIGATION_SECTIONS.map((section) => (
          <section key={section.title} className="grid gap-2">
            {collapsible ? (
              <button
                type="button"
                className="inline-flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs font-semibold tracking-[0.16em] text-[hsl(var(--muted-foreground))] uppercase hover:bg-[hsl(var(--secondary))]"
                onClick={() => toggleSection(section.title)}
                aria-expanded={expandedSections[section.title] ? 'true' : 'false'}
                aria-controls={`section-${section.title}`}
              >
                <span>{section.title}</span>
                <ChevronDown className={cn('size-4 transition-transform', expandedSections[section.title] && 'rotate-180')} />
              </button>
            ) : (
              <h2 className="px-2 text-xs font-semibold tracking-[0.16em] text-[hsl(var(--muted-foreground))] uppercase">{section.title}</h2>
            )}
            <div
              id={collapsible ? `section-${section.title}` : undefined}
              className={cn('grid gap-1', collapsible && !expandedSections[section.title] && 'hidden')}
            >
              {section.links.map((link) => {
                const isActive = link.isActive
                  ? link.isActive(location.pathname)
                  : link.exact
                    ? location.pathname === link.to
                    : location.pathname === link.to || location.pathname.startsWith(`${link.to}/`)

                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={onSelect}
                    className={cn(
                      'group inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[hsl(var(--muted-foreground))] no-underline transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] focus-visible:bg-[hsl(var(--secondary))] focus-visible:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--foreground))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar-background))]',
                      isActive &&
                        'bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] focus-visible:bg-[hsl(var(--secondary))] focus-visible:text-[hsl(var(--foreground))] focus-visible:ring-[hsl(var(--foreground))]',
                    )}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  const pageMeta = useMemo(() => resolvePageMeta(location.pathname), [location.pathname])

  return (
    <div className="relative min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[hsl(var(--border))] bg-[hsl(var(--sidebar-background))] lg:block">
          <SidebarContent />
        </aside>

        <div className="grid min-h-screen grid-rows-[auto_minmax(0,1fr)]">
          <header className="sticky top-0 z-20 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))/0.88] px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 md:gap-3">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[hsl(var(--foreground))] lg:hidden"
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu className="size-4" />
                </button>
                <div>
                  <h1 className="m-0 text-lg font-semibold md:text-xl">{pageMeta.title}</h1>
                  <p className="m-0 text-xs text-[hsl(var(--muted-foreground))] md:text-sm">{pageMeta.description}</p>
                </div>
              </div>
            </div>
          </header>

          <main className="overflow-y-auto px-4 pb-7 pt-5 md:px-6 md:pb-10">
            <div className="grid w-full gap-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/45 transition-opacity lg:hidden',
          isSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[280px] border-r border-[hsl(var(--border))] bg-[hsl(var(--sidebar-background))] shadow-2xl transition-transform lg:hidden',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[hsl(var(--muted-foreground))] uppercase">Navigation</p>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1.5"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
        <SidebarContent collapsible onSelect={() => setIsSidebarOpen(false)} />
      </aside>
    </div>
  )
}
