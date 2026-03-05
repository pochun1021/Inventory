type TopNavProps = {
  pathname: string
}

export function TopNav({ pathname }: TopNavProps) {
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'
  const isInventoryPage = pathname === '/inventory'

  return (
    <nav className="top-nav">
      <a className={isDashboardPage ? 'nav-link active' : 'nav-link'} href="/">
        Dashboard
      </a>
      <a className={isInventoryPage ? 'nav-link active' : 'nav-link'} href="/inventory">
        財產清單
      </a>
      <a className={isUploadPage ? 'nav-link active' : 'nav-link'} href="/upload">
        上傳頁面
      </a>
    </nav>
  )
}

