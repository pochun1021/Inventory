import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { FilterBar } from '../ui/filter-bar'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { PageHeader } from '../ui/page-header'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import type { BorrowRequest, PaginatedResponse } from './types'

const statusLabelMap: Record<string, string> = {
  borrowed: '借出中',
  returned: '已歸還',
  overdue: '逾期',
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function readInitialState() {
  const params = new URLSearchParams(window.location.search)
  const statusParam = params.get('status')
  const status: 'all' | 'borrowed' | 'returned' | 'overdue' =
    statusParam === 'borrowed' || statusParam === 'returned' || statusParam === 'overdue' ? statusParam : 'all'

  return {
    keyword: params.get('keyword') ?? '',
    status,
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: parsePositiveInt(params.get('page_size'), 10),
  }
}

export function BorrowListPage() {
  const initialState = readInitialState()
  const [requests, setRequests] = useState<BorrowRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [keyword, setKeyword] = useState(initialState.keyword)
  const [statusFilter, setStatusFilter] = useState<'all' | 'borrowed' | 'returned' | 'overdue'>(initialState.status)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const params = new URLSearchParams()
    if (keyword.trim()) {
      params.set('keyword', keyword.trim())
    }
    if (statusFilter !== 'all') {
      params.set('status', statusFilter)
    }
    if (page !== 1) {
      params.set('page', String(page))
    }
    if (pageSize !== 10) {
      params.set('page_size', String(pageSize))
    }
    const queryString = params.toString()
    const url = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [keyword, statusFilter, page, pageSize])

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
        })
        if (keyword.trim()) {
          params.set('keyword', keyword.trim())
        }
        if (statusFilter !== 'all') {
          params.set('status', statusFilter)
        }

        const response = await fetch(apiUrl(`/api/borrows?${params.toString()}`))
        if (!response.ok) {
          throw new Error('無法載入借用清單')
        }
        const payload = (await response.json()) as PaginatedResponse<BorrowRequest>
        setRequests(payload.items)
        setTotal(payload.total)
        setTotalPages(payload.total_pages)
      } catch {
        setLoadError('目前無法讀取借用清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRequests()
  }, [keyword, statusFilter, page, pageSize])

  return (
    <>
      <PageHeader
        title="借用清單"
        description="追蹤借出、歸還與逾期狀態。"
        actions={
          <Link to="/borrows/new">
            <Button>
              <Plus className="size-4" />
              新增借用
            </Button>
          </Link>
        }
      />

      <SectionCard>
        <FilterBar className="xl:grid-cols-[2fr_1fr_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="borrow-search">關鍵字搜尋</Label>
            <Input
              id="borrow-search"
              type="search"
              placeholder="輸入借用人、品項、用途..."
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="borrow-status">狀態篩選</Label>
            <Select
              id="borrow-status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as 'all' | 'borrowed' | 'returned' | 'overdue')
                setPage(1)
              }}
            >
              <option value="all">全部狀態</option>
              <option value="borrowed">借出中</option>
              <option value="returned">已歸還</option>
              <option value="overdue">逾期</option>
            </Select>
          </div>
          <div className="flex items-end text-sm text-[hsl(var(--muted-foreground))]">共 {total} 筆資料</div>
        </FilterBar>

        {loading ? <p className="m-0 rounded-md bg-[hsl(var(--card-soft))] px-3 py-2 text-sm">資料載入中...</p> : null}
        {loadError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p> : null}

        {!loading && !loadError ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {['#', '借用日期', '借用人/單位', '用途', '歸還資訊', '品項', '備註'].map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-center text-[hsl(var(--muted-foreground))]" colSpan={7}>
                        目前沒有符合條件的借用單。
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <Link className="font-semibold text-blue-700 no-underline hover:underline" to="/borrows/$requestId" params={{ requestId: String(request.id) }}>
                            {request.id}
                          </Link>
                        </TableCell>
                        <TableCell>{request.borrow_date || '--'}</TableCell>
                        <TableCell>
                          <div className="font-semibold">{request.borrower || '--'}</div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">{request.department || ''}</div>
                        </TableCell>
                        <TableCell>{request.purpose || '--'}</TableCell>
                        <TableCell>
                          <div className="text-xs">預計：{request.due_date || '--'}</div>
                          <div className="text-xs">實際：{request.return_date || '--'}</div>
                          <Badge className="mt-1" variant="secondary">
                            {statusLabelMap[request.status] || request.status || '--'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-1">
                            {request.items.map((item) => (
                              <div key={item.id} className="text-xs">
                                {(item.item_name || `#${item.item_id}`)} x {item.quantity}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{request.memo || '--'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {requests.length === 0 ? (
                <p className="m-0 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                  目前沒有符合條件的借用單。
                </p>
              ) : (
                requests.map((request) => (
                  <article key={request.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <div className="flex items-center justify-between">
                      <Link className="font-semibold text-blue-700 no-underline" to="/borrows/$requestId" params={{ requestId: String(request.id) }}>
                        #{request.id}
                      </Link>
                      <Badge variant="secondary">{statusLabelMap[request.status] || request.status || '--'}</Badge>
                    </div>
                    <p className="mt-2 mb-0 text-sm font-semibold">{request.borrower || '--'}</p>
                    <p className="mt-0.5 mb-0 text-xs text-[hsl(var(--muted-foreground))]">{request.department || '--'}</p>
                    <p className="mt-2 mb-0 text-sm">借用：{request.borrow_date || '--'} / 歸還：{request.return_date || '--'}</p>
                    <p className="mt-2 mb-0 text-xs text-[hsl(var(--muted-foreground))]">
                      品項：{request.items.map((item) => `${item.item_name || `#${item.item_id}`} x ${item.quantity}`).join('，') || '--'}
                    </p>
                  </article>
                ))
              )}
            </div>

            <DataPagination
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize)
                setPage(1)
              }}
            />
          </>
        ) : null}
      </SectionCard>
    </>
  )
}
