type TopNavProps = {
  pathname: string
}

const navLinkClass = 'rounded-full bg-blue-100 px-3.5 py-2 text-sm font-bold text-blue-700 no-underline'
const activeNavLinkClass = 'bg-blue-600 text-white'

export function TopNav({ pathname }: TopNavProps) {
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'
  const isInventoryPage = pathname === '/inventory'
  const isCreatePage = pathname === '/inventory/new'

  return (
    <nav className="flex items-start gap-3">
      <a className={isDashboardPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/">
        Dashboard
      </a>
      <a className={isInventoryPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/inventory">
        財產清單
      </a>
      <a className={isCreatePage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/inventory/new">
        新增庫存
      </a>
      <a className={isUploadPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/upload">
        上傳頁面
      </a>
    </nav>
  )
}
