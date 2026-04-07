import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Boxes, Server } from 'lucide-react'
import { apiUrl } from '../../api'
import type { DashboardPayload } from './types'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Separator } from '../ui/separator'

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
      <Card className="border-0 bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl text-white">資產管理 Dashboard</CardTitle>
              <CardDescription className="mt-2 text-slate-200">此頁面僅顯示系統數據。</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-white/15 text-white">
              <Activity className="size-3.5" />
              系統摘要
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>系統狀態</CardTitle>
              <Server className="size-4 text-[hsl(var(--muted-foreground))]" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-3xl font-semibold text-[hsl(var(--primary))]">{dashboardData?.status ?? '讀取中...'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>資產總數</CardTitle>
              <Boxes className="size-4 text-[hsl(var(--muted-foreground))]" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-3xl font-semibold text-[hsl(var(--primary))]">{dashboardData?.items ?? '--'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>待修改資料</CardTitle>
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-3xl font-semibold text-[hsl(var(--primary))]">{dashboardData?.pendingFix ?? '--'}</p>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">財產編號空值或包含中文</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>後端訊息</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">{dashboardData?.data ?? '等待資料載入'}</p>
          </CardContent>
        </Card>
      </section>

      <Separator className="my-1" />

      {loadError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="m-0 text-sm text-red-700">{loadError}</p>
          </CardContent>
        </Card>
      ) : null}
    </>
  )
}
