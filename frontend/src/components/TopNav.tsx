type TopNavProps = {
  pathname: string
}

const navLinkClass = 'rounded-full bg-blue-100 px-3.5 py-2 text-sm font-bold text-blue-700 no-underline'
const activeNavLinkClass = 'bg-blue-600 text-white'

export function TopNav({ pathname }: TopNavProps) {
  const isIssueEditPage = /^\/issues\/\d+$/.test(pathname)
  const isBorrowEditPage = /^\/borrows\/\d+$/.test(pathname)
  const isDonationEditPage = /^\/donations\/\d+$/.test(pathname)
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'
  const isIssueListPage = pathname === '/issues' || isIssueEditPage
  const isIssueCreatePage = pathname === '/issues/new'
  const isBorrowListPage = pathname === '/borrows' || isBorrowEditPage
  const isBorrowCreatePage = pathname === '/borrows/new'
  const isDonationListPage = pathname === '/donations' || isDonationEditPage
  const isDonationCreatePage = pathname === '/donations/new'
  const isInventoryPage = pathname === '/inventory'
  const isCreatePage = pathname === '/inventory/new'
  const isPosCheckoutPage = pathname === '/pos/checkout'
  const isPosOrdersPage = pathname === '/pos/orders'
  const isPosStockPage = pathname === '/pos/stock'

  return (
    <nav className="flex flex-wrap items-start gap-3">
      <a className={isDashboardPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/">
        Dashboard
      </a>
      <a className={isInventoryPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/inventory">
        財產清單
      </a>
      <a className={isCreatePage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/inventory/new">
        新增庫存
      </a>
      <a className={isPosCheckoutPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/pos/checkout">
        POS 結帳
      </a>
      <a className={isPosOrdersPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/pos/orders">
        POS 訂單
      </a>
      <a className={isPosStockPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/pos/stock">
        POS 庫存
      </a>
      <a className={isIssueListPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/issues">
        領用清單
      </a>
      <a className={isIssueCreatePage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/issues/new">
        新增領用
      </a>
      <a className={isBorrowListPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/borrows">
        借用清單
      </a>
      <a className={isBorrowCreatePage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/borrows/new">
        新增借用
      </a>
      <a className={isDonationListPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/donations">
        捐贈清單
      </a>
      <a className={isDonationCreatePage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/donations/new">
        新增捐贈
      </a>
      <a className={isUploadPage ? `${navLinkClass} ${activeNavLinkClass}` : navLinkClass} href="/upload">
        上傳頁面
      </a>
    </nav>
  )
}
