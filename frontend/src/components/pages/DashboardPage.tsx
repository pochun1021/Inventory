import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
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
import { buildAssetStatusLabelMap, fetchAssetStatusOptions, toAssetStatusLabel } from './assetStatusLookup'
import type { BorrowRequest, DashboardPayload, DonationRequest, InventoryItem, IssueRequest } from './types'
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

type StatusDistribution = {
  code: string
  label: string
  count: number
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path))
  if (!response.ok) {
    throw new Error(`failed request for ${path}`)
  }
  return (await response.json()) as T
}

function parseDateValue(dateString: string | null | undefined): number {
  if (!dateString) {
    return 0
  }
  const parsedDate = Date.parse(dateString)
  return Number.isNaN(parsedDate) ? 0 : parsedDate
}

function summarizeItems(itemCount: number): string {
  return itemCount > 0 ? `${itemCount} 項品類` : '無品項資料'
}

function toDisplayDate(dateString: string | null | undefined): string {
  return dateString?.trim() ? dateString : '--'
}

export function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [issues, setIssues] = useState<IssueRequest[]>([])
  const [borrows, setBorrows] = useState<BorrowRequest[]>([])
  const [donations, setDonations] = useState<DonationRequest[]>([])
  const [assetStatusLabelMap, setAssetStatusLabelMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const [dashboardPayload, inventoryPayload, issuePayload, borrowPayload, donationPayload] = await Promise.all([
          fetchJson<DashboardPayload>('/api/data'),
          fetchJson<InventoryItem[]>('/api/items?include_donated=true'),
          fetchJson<IssueRequest[]>('/api/issues'),
          fetchJson<BorrowRequest[]>('/api/borrows'),
          fetchJson<DonationRequest[]>('/api/donations'),
        ])

        setDashboardData(dashboardPayload)
        setItems(inventoryPayload)
        setIssues(issuePayload)
        setBorrows(borrowPayload)
        setDonations(donationPayload)
      } catch {
        setLoadError('目前無法完整讀取 Dashboard，請稍後再試。')
      } finally {
        setLoading(false)
      }
    }

    void loadDashboard()
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadAssetStatusLabels = async () => {
      try {
        const options = await fetchAssetStatusOptions()
        if (!cancelled) {
          setAssetStatusLabelMap(buildAssetStatusLabelMap(options))
        }
      } catch {
        if (!cancelled) {
          setAssetStatusLabelMap({})
        }
      }
    }

    void loadAssetStatusLabels()
    return () => {
      cancelled = true
    }
  }, [])

  const statusDistribution = useMemo<StatusDistribution[]>(() => {
    const groupedCounts = new Map<string, number>()
    for (const item of items) {
      const statusCode = item.asset_status?.trim() || 'unknown'
      groupedCounts.set(statusCode, (groupedCounts.get(statusCode) ?? 0) + 1)
    }

    return Array.from(groupedCounts.entries())
      .map(([code, count]) => ({
        code,
        label: toAssetStatusLabel(code, assetStatusLabelMap),
        count,
      }))
      .sort((left, right) => right.count - left.count)
  }, [assetStatusLabelMap, items])

  const recentActivities = useMemo<RecentActivity[]>(() => {
    const issueActivities = issues.map<RecentActivity>((request) => ({
      key: `issue-${request.id}`,
      type: '領用',
      dateLabel: toDisplayDate(request.request_date),
      dateValue: parseDateValue(request.request_date),
      actor: request.requester?.trim() || '未填寫',
      summary: summarizeItems(request.items.length),
      requestId: String(request.id),
    }))

    const borrowActivities = borrows.map<RecentActivity>((request) => ({
      key: `borrow-${request.id}`,
      type: '借用',
      dateLabel: toDisplayDate(request.borrow_date),
      dateValue: parseDateValue(request.borrow_date),
      actor: request.borrower?.trim() || '未填寫',
      summary: `${summarizeItems(request.items.length)} · ${request.status || '--'}`,
      requestId: String(request.id),
    }))

    const donationActivities = donations.map<RecentActivity>((request) => ({
      key: `donation-${request.id}`,
      type: '捐贈',
      dateLabel: toDisplayDate(request.donation_date),
      dateValue: parseDateValue(request.donation_date),
      actor: request.donor?.trim() || '未填寫',
      summary: summarizeItems(request.items.length),
      requestId: String(request.id),
    }))

    return [...issueActivities, ...borrowActivities, ...donationActivities]
      .sort((left, right) => {
        if (left.dateValue === right.dateValue) {
          return right.key.localeCompare(left.key)
        }
        return right.dateValue - left.dateValue
      })
      .slice(0, 8)
  }, [borrows, donations, issues])

  const pendingFixCount = dashboardData?.pendingFix ?? 0
  const totalRecords = issues.length + borrows.length + donations.length
  const overdueBorrowCount = borrows.filter((request) => request.status === 'overdue').length
  const donatedItemsCount = items.filter((item) => item.asset_status?.trim() === '3').length
  const maxStatusCount = statusDistribution[0]?.count ?? 1

  const kpiCards = [
    {
      label: '系統狀態',
      value: dashboardData?.status ?? '--',
      hint: '後端 API 回傳健康狀態',
      icon: <Server className="size-4 text-[hsl(var(--muted-foreground))]" />,
    },
    {
      label: '資產總數',
      value: String(dashboardData?.items ?? items.length),
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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>資產狀態分布</CardTitle>
                <CardDescription>依 `asset_status` 統計目前資產。</CardDescription>
              </div>
              <ChartNoAxesColumn className="size-4 text-[hsl(var(--muted-foreground))]" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">資料載入中...</p> : null}
            {!loading && statusDistribution.length === 0 ? (
              <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">目前沒有資產資料可統計。</p>
            ) : null}
            {!loading &&
              statusDistribution.map((item) => {
                const widthPercent = Math.max(8, Math.round((item.count / maxStatusCount) * 100))
                return (
                  <div key={item.code} className="grid gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.label}</span>
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

      <section className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>異常提醒</CardTitle>
            <CardDescription>優先處理可能造成資料錯誤或流程延遲的項目。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              待修正資產資料：<strong>{pendingFixCount}</strong> 筆
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              逾期借用：<strong>{overdueBorrowCount}</strong> 筆
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
              已捐贈狀態資產：<strong>{donatedItemsCount}</strong> 筆
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  )
}
