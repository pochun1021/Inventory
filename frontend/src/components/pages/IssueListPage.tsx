import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { Button } from '../ui/button'
import { FilterBar } from '../ui/filter-bar'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import type { IssueRequest, PaginatedResponse } from './types'

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
  return {
    keyword: params.get('keyword') ?? '',
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: parsePositiveInt(params.get('page_size'), 10),
  }
}

export function IssueListPage() {
  const initialState = readInitialState()
  const [requests, setRequests] = useState<IssueRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [keyword, setKeyword] = useState(initialState.keyword)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const params = new URLSearchParams()
    if (keyword.trim()) {
      params.set('keyword', keyword.trim())
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
  }, [keyword, page, pageSize])

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

        const response = await fetch(apiUrl(`/api/issues?${params.toString()}`))
        if (!response.ok) {
          throw new Error('無法載入領用清單')
        }
        const payload = (await response.json()) as PaginatedResponse<IssueRequest>
        setRequests(payload.items)
        setTotal(payload.total)
        setTotalPages(payload.total_pages)
      } catch {
        setLoadError('目前無法讀取領用清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRequests()
  }, [keyword, page, pageSize])

  return (
    <>
      <div className="flex justify-end">
        <Link to="/issues/new">
          <Button>
            <Plus className="size-4" />
            新增領用
          </Button>
        </Link>
      </div>

      <SectionCard>
        <FilterBar className="xl:grid-cols-[2fr_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="issue-search">關鍵字搜尋</Label>
            <Input
              id="issue-search"
              type="search"
              placeholder="輸入領用人、品項、用途..."
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
            />
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
                    {['#', '領用日期', '領用人/單位', '用途', '品項', '備註'].map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-center text-[hsl(var(--muted-foreground))]" colSpan={6}>
                        目前沒有符合條件的領用單。
                      </TableCell>
                    </TableRow>
                  ) : (
                    requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <Link className="font-semibold text-blue-700 no-underline hover:underline" to="/issues/$requestId" params={{ requestId: String(request.id) }}>
                            {request.id}
                          </Link>
                        </TableCell>
                        <TableCell>{request.request_date || '--'}</TableCell>
                        <TableCell>
                          <div className="font-semibold">{request.requester || '--'}</div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">{request.department || ''}</div>
                        </TableCell>
                        <TableCell>{request.purpose || '--'}</TableCell>
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
                  目前沒有符合條件的領用單。
                </p>
              ) : (
                requests.map((request) => (
                  <article key={request.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <div className="flex items-center justify-between">
                      <Link className="font-semibold text-blue-700 no-underline" to="/issues/$requestId" params={{ requestId: String(request.id) }}>
                        #{request.id}
                      </Link>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{request.request_date || '--'}</span>
                    </div>
                    <p className="mt-2 mb-0 text-sm font-semibold">{request.requester || '--'}</p>
                    <p className="mt-0.5 mb-0 text-xs text-[hsl(var(--muted-foreground))]">{request.department || '--'}</p>
                    <p className="mt-2 mb-0 text-sm">用途：{request.purpose || '--'}</p>
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
