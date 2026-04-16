import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ChartNoAxesColumn,
  ClipboardList,
  HandCoins,
  Handshake,
  Server,
} from 'lucide-react'
import { apiUrl } from '../../api'
import type { DashboardPayload } from './types'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

type RecentActivity = {
  key: string
  type: '領用' | '借用' | '捐贈'
  dateLabel: string
  dateValue: number
  actor: string
  summary: string
  requestId: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path))
  if (!response.ok) {
    throw new Error(`failed request for ${path}`)
  }
  return (await response.json()) as T
}

export function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const dashboardPayload = await fetchJson<DashboardPayload>('/api/data')
        setDashboardData(dashboardPayload)
      } catch {
        setLoadError('目前無法完整讀取 Dashboard，請稍後再試。')
      } finally {
        setLoading(false)
      }
    }

    void loadDashboard()
  }, [])

  const itemCategoryDistribution = dashboardData?.itemCategoryDistribution ?? []
  const recentActivities: RecentActivity[] = dashboardData?.recentActivities ?? []

  const pendingFixCount = dashboardData?.pendingFix ?? 0
  const totalRecords = dashboardData?.totalRecords ?? 0
  const reservedBorrowCount = dashboardData?.reservedBorrowCount ?? 0
  const overdueBorrowCount = dashboardData?.overdueBorrowCount ?? 0
  const dueSoonBorrowCount = dashboardData?.dueSoonBorrowCount ?? 0
  const donatedItemsCount = dashboardData?.donatedItemsCount ?? 0
  const maxCategoryCount = itemCategoryDistribution[0]?.count ?? 1

  const kpiCards = [
    {
      label: '系統狀態',
      value: dashboardData?.status ?? '--',
      hint: '後端 API 回傳健康狀態',
      icon: <Server className="size-4 text-[hsl(var(--muted-foreground))]" />,
    },
    {
      label: '資產總數',
      value: String(dashboardData?.items ?? 0),
      hint: '含現有與已捐贈資產',
      icon: <Boxes className="size-4 text-[hsl(var(--muted-foreground))]" />,
    },
    {
      label: '待修正資料',
      value: String(pendingFixCount),
      hint: '財產編號空值或包含中文',
      icon: <AlertTriangle className="size-4 text-amber-500" />,
    },
    {
      label: '交易總筆數',
      value: String(totalRecords),
      hint: '領用、借用、捐贈合計',
      icon: <ClipboardList className="size-4 text-[hsl(var(--muted-foreground))]" />,
    },
  ]

  return (
    <>
      {loadError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="m-0 text-sm text-red-700">{loadError}</p>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {kpiCards.map((card) => (
          <Card key={card.label} className="border-[hsl(var(--border))] bg-[hsl(var(--card))/0.9]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>{card.label}</CardTitle>
                {card.icon}
              </div>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-3xl font-semibold text-[hsl(var(--foreground))]">{loading ? '...' : card.value}</p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>重點提醒</CardTitle>
                <CardDescription>優先處理可能造成資料錯誤或流程延遲的項目。</CardDescription>
              </div>
              <AlertTriangle className="size-5 text-[hsl(var(--muted-foreground))]" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
              待修正資產資料：<strong>{pendingFixCount}</strong> 筆
            </div>
            <div className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800">
              預約借用：<strong>{reservedBorrowCount}</strong> 筆
            </div>
            <div className="rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
              逾期借用：<strong>{overdueBorrowCount}</strong> 筆
            </div>
            <div className="rounded-lg border border-orange-300 bg-orange-100 px-3 py-2 text-sm font-medium text-orange-800">
              3 天內到期借用：<strong>{dueSoonBorrowCount}</strong> 筆
            </div>
            <div className="rounded-lg border border-sky-300 bg-sky-100 px-3 py-2 text-sm font-medium text-sky-800">
              已捐贈狀態資產：<strong>{donatedItemsCount}</strong> 筆
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>庫存物品種類分布</CardTitle>
                <CardDescription>依庫存中物品名稱統計（僅 `asset_status=0`）。</CardDescription>
              </div>
              <ChartNoAxesColumn className="size-4 text-[hsl(var(--muted-foreground))]" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">資料載入中...</p> : null}
            {!loading && itemCategoryDistribution.length === 0 ? (
              <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">目前沒有資產資料可統計。</p>
            ) : null}
            {!loading &&
              itemCategoryDistribution.map((item) => {
                const widthPercent = Math.max(8, Math.round((item.count / maxCategoryCount) * 100))
                return (
                  <div key={item.name} className="grid gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-[hsl(var(--muted-foreground))]">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[hsl(var(--secondary))]">
                      <div className="h-full rounded-full bg-[hsl(var(--primary))]" style={{ width: `${widthPercent}%` }} />
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>快速入口</CardTitle>
              <CardDescription>常用操作捷徑。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link to="/issues/new" className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm font-semibold text-[hsl(var(--secondary-foreground))] no-underline hover:bg-[hsl(var(--secondary))/0.8]">
                <HandCoins className="size-4" />
                新增領用單
              </Link>
              <Link to="/borrows/new" className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm font-semibold text-[hsl(var(--secondary-foreground))] no-underline hover:bg-[hsl(var(--secondary))/0.8]">
                <Handshake className="size-4" />
                新增借用單
              </Link>
              <Link to="/donations/new" className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm font-semibold text-[hsl(var(--secondary-foreground))] no-underline hover:bg-[hsl(var(--secondary))/0.8]">
                <ClipboardList className="size-4" />
                新增捐贈單
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>最近活動</CardTitle>
                  <CardDescription>最近 8 筆領用、借用、捐贈紀錄。</CardDescription>
                </div>
                <Badge variant="outline">{recentActivities.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {loading ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">資料載入中...</p> : null}
              {!loading && recentActivities.length === 0 ? (
                <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">目前沒有可顯示的活動紀錄。</p>
              ) : null}
              {!loading &&
                recentActivities.map((activity) => (
                  <Link
                    key={activity.key}
                    to={
                      activity.type === '領用'
                        ? '/issues/$requestId'
                        : activity.type === '借用'
                          ? '/borrows/$requestId'
                          : '/donations/$requestId'
                    }
                    params={{ requestId: activity.requestId }}
                    className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-2 no-underline transition-colors hover:bg-[hsl(var(--secondary))/0.75]"
                  >
                    <span className="inline-flex rounded-md bg-[hsl(var(--secondary))] px-2 py-1 text-xs font-semibold text-[hsl(var(--secondary-foreground))]">
                      {activity.type}
                    </span>
                    <div>
                      <p className="m-0 text-sm font-medium text-[hsl(var(--foreground))]">{activity.actor}</p>
                      <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">
                        {activity.dateLabel} · {activity.summary}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
