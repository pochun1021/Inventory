import { useEffect, useState } from 'react'
import { apiUrl } from '../../api'
import type { DashboardPayload } from './types'

const cardClass = 'rounded-2xl bg-white shadow-[0_12px_30px_rgba(31,41,55,0.12)]'

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
      <section className={`${cardClass} px-7 py-6`}>
        <h1 className="mt-0">資產管理 Dashboard</h1>
        <p className="mt-2 text-slate-500">此頁面僅顯示系統數據。</p>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <article className={`${cardClass} p-5`}>
          <h2 className="mt-0">系統狀態</h2>
          <p className="m-0 text-[1.75rem] font-bold text-blue-700">{dashboardData?.status ?? '讀取中...'}</p>
        </article>

        <article className={`${cardClass} p-5`}>
          <h2 className="mt-0">資產總數</h2>
          <p className="m-0 text-[1.75rem] font-bold text-blue-700">{dashboardData?.items ?? '--'}</p>
        </article>

        <article className={`${cardClass} p-5`}>
          <h2 className="mt-0">待修改資料</h2>
          <p className="m-0 text-[1.75rem] font-bold text-blue-700">{dashboardData?.pendingFix ?? '--'}</p>
          <p className="mt-1.5 text-[0.92rem] text-slate-500">財產編號空值或包含中文</p>
        </article>

        <article className={`${cardClass} p-5`}>
          <h2 className="mt-0">後端訊息</h2>
          <p>{dashboardData?.data ?? '等待資料載入'}</p>
        </article>
      </section>

      {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}
    </>
  )
}
