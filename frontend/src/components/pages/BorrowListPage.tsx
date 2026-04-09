import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import type { BorrowRequest, PaginatedResponse } from './types'

const fieldClass = 'rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5'
const tableHeaderClass = 'whitespace-nowrap border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-2 text-left'
const tableCellClass = 'border border-[hsl(var(--border))] p-2 text-left align-top break-words'
const statusClassMap: Record<string, string> = {
  borrowed: 'bg-amber-100 text-amber-800',
  returned: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
}

const getStatusBadgeClass = (status: string) =>
  statusClassMap[status] ?? 'bg-slate-100 text-slate-700'

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
  const status: 'all' | 'borrowed' | 'returned' | 'overdue' = statusParam === 'borrowed' || statusParam === 'returned' || statusParam === 'overdue' ? statusParam : 'all'

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
      <section className="rounded-2xl bg-[hsl(var(--card))] p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid gap-2">
          <label htmlFor="borrow-search" className="font-bold">
            關鍵字搜尋
          </label>
          <input
            className={fieldClass}
            id="borrow-search"
            type="search"
            placeholder="輸入借用人、品項、用途..."
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              setPage(1)
            }}
          />
          <label htmlFor="borrow-status" className="font-bold">
            狀態篩選
          </label>
          <select
            className={fieldClass}
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
          </select>
          <p className="mt-1 text-[0.95rem] text-slate-600">共 {total} 筆資料</p>
        </div>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}

        {!loading && !loadError ? (
          <>
            <div className="w-full overflow-x-auto">
              <table className="mt-2 w-full table-fixed border-collapse bg-[hsl(var(--card))]">
                <thead>
                  <tr>
                    {['#', '借用日期', '借用人/單位', '用途', '歸還/狀態', '品項', '備註'].map((header) => (
                      <th key={header} className={tableHeaderClass}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td className={`${tableCellClass} text-center text-slate-500`} colSpan={7}>
                        目前沒有符合條件的借用單。
                      </td>
                    </tr>
                  ) : (
                    requests.map((request) => (
                      <tr key={request.id}>
                        <td className={tableCellClass}>
                          <Link className="font-bold text-blue-700 no-underline" to="/borrows/$requestId" params={{ requestId: String(request.id) }}>
                            {request.id}
                          </Link>
                        </td>
                        <td className={tableCellClass}>{request.borrow_date || '--'}</td>
                        <td className={tableCellClass}>
                          <div className="font-bold">{request.borrower || '--'}</div>
                          <div className="text-sm text-slate-500">{request.department || ''}</div>
                        </td>
                        <td className={tableCellClass}>{request.purpose || '--'}</td>
                        <td className={tableCellClass}>
                          <div className="text-sm">預計：{request.due_date || '--'}</div>
                          <div className="text-sm">實際：{request.return_date || '--'}</div>
                          <div
                            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${getStatusBadgeClass(request.status)}`}
                          >
                            {request.status}
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="grid gap-1">
                            {request.items.map((item) => (
                              <div key={item.id} className="text-sm">
                                {(item.item_name || `#${item.item_id}`)} x {item.quantity}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className={tableCellClass}>{request.memo || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
      </section>
    </>
  )
}
