import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import type { DonationRequest, PaginatedResponse } from './types'

const fieldClass = 'rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5'
const tableHeaderClass = 'whitespace-nowrap border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-2 text-left'
const tableCellClass = 'border border-[hsl(var(--border))] p-2 text-left align-top break-words'

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

export function DonationListPage() {
  const initialState = readInitialState()
  const [requests, setRequests] = useState<DonationRequest[]>([])
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

        const response = await fetch(apiUrl(`/api/donations?${params.toString()}`))
        if (!response.ok) {
          throw new Error('無法載入捐贈清單')
        }
        const payload = (await response.json()) as PaginatedResponse<DonationRequest>
        setRequests(payload.items)
        setTotal(payload.total)
        setTotalPages(payload.total_pages)
      } catch {
        setLoadError('目前無法讀取捐贈清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRequests()
  }, [keyword, page, pageSize])

  return (
    <>
      <section className="rounded-2xl bg-[hsl(var(--card))] p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid gap-2">
          <label htmlFor="donation-search" className="font-bold">
            關鍵字搜尋
          </label>
          <input
            className={fieldClass}
            id="donation-search"
            type="search"
            placeholder="輸入捐贈人、受贈對象、品項..."
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              setPage(1)
            }}
          />
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
                    {['#', '捐贈日期', '捐贈人/單位', '受贈對象', '用途', '品項', '備註'].map((header) => (
                      <th key={header} className={tableHeaderClass}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td className={`${tableCellClass} text-center text-slate-500`} colSpan={7}>
                        目前沒有符合條件的捐贈單。
                      </td>
                    </tr>
                  ) : (
                    requests.map((request) => (
                      <tr key={request.id}>
                        <td className={tableCellClass}>
                          <Link className="font-bold text-blue-700 no-underline" to="/donations/$requestId" params={{ requestId: String(request.id) }}>
                            {request.id}
                          </Link>
                        </td>
                        <td className={tableCellClass}>{request.donation_date || '--'}</td>
                        <td className={tableCellClass}>
                          <div className="font-bold">{request.donor || '--'}</div>
                          <div className="text-sm text-slate-500">{request.department || ''}</div>
                        </td>
                        <td className={tableCellClass}>{request.recipient || '--'}</td>
                        <td className={tableCellClass}>{request.purpose || '--'}</td>
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
