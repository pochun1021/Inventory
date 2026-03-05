import { useEffect, useState } from 'react'
import { apiUrl } from '../../api'
import type { DashboardPayload } from './types'

export function DashboardPage() {
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

