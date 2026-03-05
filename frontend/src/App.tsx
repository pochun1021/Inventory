import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { UploadPanel } from './components/UploadPanel'
import { apiUrl } from './api'

type DashboardPayload = {
  status: string
  data: string
  items: number
  pendingFix: number
}

type InventoryItem = {
  id: number
  kind: string
  specification: string
  property_number: string
  name: string
  model: string
  unit: string
  purchase_date: string | null
  location: string
  memo: string
  keeper: string
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
          <h2>待修改資料</h2>
          <p className="stat-value">{dashboardData?.pendingFix ?? '--'}</p>
          <p className="stat-note">財產編號空值或包含中文</p>
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

function InventoryListPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    const loadItems = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch(apiUrl('/api/items'))
        if (!response.ok) {
          throw new Error('無法載入財產清單')
        }
        const payload = (await response.json()) as InventoryItem[]
        setItems(payload)
      } catch {
        setLoadError('目前無法讀取財產清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadItems()
  }, [])

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return items
    }

    const normalizeSearchValue = (value: unknown) => (typeof value === 'string' ? value : '').toLowerCase()

    return items.filter((item) => {
      const searchFields = [item.property_number, item.name, item.model, item.location, item.keeper]
      return searchFields.some((field) => normalizeSearchValue(field).includes(normalizedKeyword))
    })
  }, [items, keyword])

  return (
    <>
      <section className="dashboard-header">
        <h1>財產清單</h1>
        <p className="subtitle">可依財產編號、品名、型號、放置地點或保管人快速查詢。</p>
      </section>

      <section className="list-card">
        <div className="list-toolbar">
          <label htmlFor="search-input" className="search-label">
            關鍵字搜尋
          </label>
          <input
            id="search-input"
            type="search"
            placeholder="輸入財產編號、品名、型號..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <p className="list-count">共 {filteredItems.length} 筆資料</p>
        </div>

        {loading ? <p className="message">資料載入中...</p> : null}
        {loadError ? <p className="message error">{loadError}</p> : null}

        {!loading && !loadError ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>類型</th>
                  <th>財產編號</th>
                  <th>品名</th>
                  <th>型號</th>
                  <th>規格</th>
                  <th>單位</th>
                  <th>購置日期</th>
                  <th>放置地點</th>
                  <th>保管人</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-row">
                      查無符合條件的財產資料
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.kind || '--'}</td>
                      <td>{item.property_number || '--'}</td>
                      <td>{item.name || '--'}</td>
                      <td>{item.model || '--'}</td>
                      <td>{item.specification || '--'}</td>
                      <td>{item.unit || '--'}</td>
                      <td>{item.purchase_date ?? '--'}</td>
                      <td>{item.location || '--'}</td>
                      <td>{item.keeper || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}

function App() {
  const pathname = window.location.pathname
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'
  const isInventoryPage = pathname === '/inventory'

  return (
    <main className="dashboard-page">
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
