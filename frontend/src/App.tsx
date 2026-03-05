import './App.css'
import { TopNav } from './components/TopNav'
import { DashboardPage } from './components/pages/DashboardPage'
import { InventoryListPage } from './components/pages/InventoryListPage'
import { UploadPage } from './components/pages/UploadPage'

function App() {
  const pathname = window.location.pathname
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'
  const isInventoryPage = pathname === '/inventory'

  return (
    <main className="dashboard-page">
      <TopNav pathname={pathname} />

      {isDashboardPage ? <DashboardPage /> : null}
      {isInventoryPage ? <InventoryListPage /> : null}
      {isUploadPage ? <UploadPage /> : null}

      {!isDashboardPage && !isUploadPage && !isInventoryPage ? (
        <section className="dashboard-header">
          <h1>找不到頁面</h1>
          <p className="subtitle">請使用上方導覽前往 Dashboard、財產清單或上傳頁面。</p>
        </section>
      ) : null}
    </main>
  )
}

export default App
