import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { FilterBar } from '../ui/filter-bar'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import type { BorrowRequest, PaginatedResponse } from './types'

type BorrowSortKey = 'id' | 'borrow_date' | 'borrower' | 'purpose' | 'return_info' | 'items' | 'memo'
type SortDirection = 'asc' | 'desc'
type BorrowStatusFilter = 'all' | 'reserved' | 'borrowed' | 'returned' | 'overdue' | 'expired' | 'cancelled'

const statusLabelMap: Record<string, string> = {
  reserved: '已預約',
  borrowed: '借出中',
  returned: '已歸還',
  overdue: '逾期',
  expired: '預約失效',
  cancelled: '已取消',
}

const statusBadgeClassMap: Record<string, string> = {
  reserved: 'border-amber-200 bg-amber-100 text-amber-800',
  borrowed: 'border-sky-200 bg-sky-100 text-sky-800',
  returned: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  overdue: 'border-red-200 bg-red-100 text-red-800',
  expired: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
}

function getStatusBadgeClass(status: string): string {
  return statusBadgeClassMap[status] || 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'
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

function parseSortDirection(value: string | null, fallback: SortDirection): SortDirection {
  return value === 'asc' || value === 'desc' ? value : fallback
}

function parseBorrowSortKey(value: string | null, fallback: BorrowSortKey): BorrowSortKey {
  const allowed: BorrowSortKey[] = ['id', 'borrow_date', 'borrower', 'purpose', 'return_info', 'items', 'memo']
  return value && allowed.includes(value as BorrowSortKey) ? (value as BorrowSortKey) : fallback
}

function readInitialState() {
  const params = new URLSearchParams(window.location.search)
  const statusParam = params.get('status')
  const status: BorrowStatusFilter =
    statusParam === 'reserved'
    || statusParam === 'borrowed'
    || statusParam === 'returned'
    || statusParam === 'overdue'
    || statusParam === 'cancelled'
    || statusParam === 'expired'
      ? statusParam
      : 'all'

  return {
    keyword: params.get('keyword') ?? '',
    status,
    sortBy: parseBorrowSortKey(params.get('sort_by'), 'id'),
    sortDir: parseSortDirection(params.get('sort_dir'), 'desc'),
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
  const [statusFilter, setStatusFilter] = useState<BorrowStatusFilter>(initialState.status)
  const [sortBy, setSortBy] = useState<BorrowSortKey>(initialState.sortBy)
  const [sortDir, setSortDir] = useState<SortDirection>(initialState.sortDir)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const listRequestSeqRef = useRef(0)

  useEffect(() => {
    const params = new URLSearchParams()
    if (keyword.trim()) {
      params.set('keyword', keyword.trim())
    }
    if (statusFilter !== 'all') {
      params.set('status', statusFilter)
    }
    if (sortBy !== 'id') {
      params.set('sort_by', sortBy)
    }
    if (sortDir !== 'desc') {
      params.set('sort_dir', sortDir)
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
  }, [keyword, statusFilter, sortBy, sortDir, page, pageSize])

  useEffect(() => {
    const requestSeq = ++listRequestSeqRef.current
    const controller = new AbortController()

    const loadRequests = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
          sort_by: sortBy,
          sort_dir: sortDir,
        })
        if (keyword.trim()) {
          params.set('keyword', keyword.trim())
        }
        if (statusFilter !== 'all') {
          params.set('status', statusFilter)
        }

        const response = await fetch(apiUrl(`/api/borrows?${params.toString()}`), {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('無法載入借用清單')
        }
        const payload = (await response.json()) as PaginatedResponse<BorrowRequest>
        if (listRequestSeqRef.current !== requestSeq) {
          return
        }
        setRequests(payload.items)
        setTotal(payload.total)
        setTotalPages(payload.total_pages)
      } catch {
        if (controller.signal.aborted || listRequestSeqRef.current !== requestSeq) {
          return
        }
        setLoadError('目前無法讀取借用清單，請稍後重試。')
      } finally {
        if (listRequestSeqRef.current === requestSeq) {
          setLoading(false)
        }
      }
    }

    void loadRequests()
    return () => {
      controller.abort()
    }
  }, [keyword, statusFilter, sortBy, sortDir, page, pageSize])

  const sortableHeaders: Array<{ key: BorrowSortKey; label: string }> = [
    { key: 'id', label: '#' },
    { key: 'borrow_date', label: '借用日期' },
    { key: 'borrower', label: '借用人/單位' },
    { key: 'purpose', label: '用途' },
    { key: 'return_info', label: '歸還資訊' },
    { key: 'items', label: '品項' },
    { key: 'memo', label: '備註' },
  ]

  const handleSortChange = (nextSortBy: BorrowSortKey) => {
    if (sortBy === nextSortBy) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(nextSortBy)
      setSortDir('asc')
    }
    setPage(1)
  }

  return (
    <>
      <div className="flex justify-end">
        <Link to="/borrows/new">
          <Button>
            <Plus className="size-4" />
            新增借用
          </Button>
        </Link>
      </div>

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
                setStatusFilter(event.target.value as BorrowStatusFilter)
                setPage(1)
              }}
            >
              <option value="all">全部狀態</option>
              <option value="reserved">已預約</option>
              <option value="borrowed">借出中</option>
              <option value="returned">已歸還</option>
              <option value="overdue">逾期</option>
              <option value="expired">預約失效</option>
              <option value="cancelled">已取消</option>
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
                    {sortableHeaders.map((header) => (
                      <TableHead key={header.key}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 bg-transparent p-0 text-left font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                          onClick={() => handleSortChange(header.key)}
                        >
                          {header.label}
                          <span className="text-xs">{sortBy === header.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </TableHead>
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
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge className={getStatusBadgeClass(request.status)} variant="outline">
                              {statusLabelMap[request.status] || request.status || '--'}
                            </Badge>
                            {request.is_due_soon ? <Badge variant="outline">即將到期（3 天內）</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-1">
                            {request.request_lines.map((item) => (
                              <div key={item.id} className="text-xs">
                                {(item.item_name || `#${item.item_id || '--'}`)} / {item.item_model || '--'}：預約 {item.requested_qty}、已領取 {item.allocated_qty}
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
                      <div className="flex flex-wrap justify-end gap-1">
                        <Badge className={getStatusBadgeClass(request.status)} variant="outline">
                          {statusLabelMap[request.status] || request.status || '--'}
                        </Badge>
                        {request.is_due_soon ? <Badge variant="outline">即將到期（3 天內）</Badge> : null}
                      </div>
                    </div>
                    <p className="mt-2 mb-0 text-sm font-semibold">{request.borrower || '--'}</p>
                    <p className="mt-0.5 mb-0 text-xs text-[hsl(var(--muted-foreground))]">{request.department || '--'}</p>
                    <p className="mt-2 mb-0 text-sm">借用：{request.borrow_date || '--'} / 歸還：{request.return_date || '--'}</p>
                    <p className="mt-2 mb-0 text-xs text-[hsl(var(--muted-foreground))]">
                      品項：{request.request_lines.map((item) => `${item.item_name || `#${item.item_id || '--'}`} / ${item.item_model || '--'}（預約 ${item.requested_qty}、已領取 ${item.allocated_qty}）`).join('，') || '--'}
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
