import { useEffect, useState } from 'react'
import './App.css'
import { UploadPanel } from './components/UploadPanel'
import { apiUrl } from './api'

type DashboardPayload = {
  status: string
  data: string
  items: number
}

function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const response = await fetch(apiUrl('/api/data'))
        if (!response.ok) {
          throw new Error('無法載入儀表板資料')
        }
        const payload = (await response.json()) as DashboardPayload
        setDashboardData(payload)
      } catch {
        setLoadError('目前無法連線到後端，請稍後再試。')
      }
    }

    void loadDashboard()
  }, [])

  return (
    <>
      <section className="dashboard-header">
        <h1>資產管理 Dashboard</h1>
        <p className="subtitle">此頁面僅顯示系統數據。</p>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <h2>系統狀態</h2>
          <p className="stat-value">{dashboardData?.status ?? '讀取中...'}</p>
        </article>

        <article className="stat-card">
          <h2>資產總數</h2>
          <p className="stat-value">{dashboardData?.items ?? '--'}</p>
        </article>

        <article className="stat-card">
          <h2>後端訊息</h2>
          <p>{dashboardData?.data ?? '等待資料載入'}</p>
        </article>
      </section>

      {loadError ? <p className="message error">{loadError}</p> : null}
    </>
  )
}

function UploadPage() {
  return (
    <>
      <section className="dashboard-header">
        <h1>資產匯入</h1>
        <p className="subtitle">上傳畫面為獨立頁面，請在此進行 Excel 批次匯入。</p>
      </section>
      <UploadPanel />
    </>
  )
}

function App() {
  const pathname = window.location.pathname
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'

  return (
    <main className="dashboard-page">
      <nav className="top-nav">
        <a className={!isUploadPage ? 'nav-link active' : 'nav-link'} href="/">
          Dashboard
        </a>
        <a className={isUploadPage ? 'nav-link active' : 'nav-link'} href="/upload">
          上傳頁面
        </a>
      </nav>

      {isDashboardPage ? <DashboardPage /> : null}
      {isUploadPage ? <UploadPage /> : null}

      {!isDashboardPage && !isUploadPage ? (
        <section className="dashboard-header">
          <h1>找不到頁面</h1>
          <p className="subtitle">請使用上方導覽前往 Dashboard 或上傳頁面。</p>
        </section>
      ) : null}
    </main>
  )
}

export default App
