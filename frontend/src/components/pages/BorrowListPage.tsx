import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import type { BorrowRequest } from './types'

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const tableHeaderClass = 'whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left'
const tableCellClass = 'border border-slate-200 p-2 text-left align-top break-words'
const statusClassMap: Record<string, string> = {
  borrowed: 'bg-amber-100 text-amber-800',
  returned: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700'
}

const getStatusBadgeClass = (status: string) =>
  statusClassMap[status] ?? 'bg-slate-100 text-slate-700'

export function BorrowListPage() {
  const [requests, setRequests] = useState<BorrowRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'borrowed' | 'returned' | 'overdue'>('all')

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch(apiUrl('/api/borrows'))
        if (!response.ok) {
          throw new Error('無法載入借用清單')
        }
        const payload = (await response.json()) as BorrowRequest[]
        setRequests(payload)
      } catch {
        setLoadError('目前無法讀取借用清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRequests()
  }, [])

  const filteredRequests = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase()

    return requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const itemMatches = request.items.some((item) =>
        normalize(item.item_name).includes(normalizedKeyword)
      )
      const fields = [request.borrower, request.department, request.purpose, request.memo, request.borrow_date]
      return itemMatches || fields.some((field) => normalize(field).includes(normalizedKeyword))
    })
  }, [keyword, requests, statusFilter])

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">借用清單</h1>
        <p className="mt-2 text-slate-500">可依借用人、品項、用途或狀態快速查詢。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
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
            onChange={(event) => setKeyword(event.target.value)}
          />
          <label htmlFor="borrow-status" className="font-bold">
            狀態篩選
          </label>
          <select
            className={fieldClass}
            id="borrow-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'borrowed' | 'returned' | 'overdue')}
          >
            <option value="all">全部狀態</option>
            <option value="borrowed">借出中</option>
            <option value="returned">已歸還</option>
            <option value="overdue">逾期</option>
          </select>
          <p className="mt-1 text-[0.95rem] text-slate-600">共 {filteredRequests.length} 筆資料</p>
        </div>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}

        {!loading && !loadError ? (
          <div className="w-full overflow-x-auto">
            <table className="mt-2 w-full table-fixed border-collapse bg-white">
              <thead>
                <tr>
                  {['#', '借用日期', '借用人/單位', '用途', '歸還/狀態', '品項', '備註'].map((header) => (
                    <th key={header} className={tableHeaderClass}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td className={`${tableCellClass} text-center text-slate-500`} colSpan={7}>
                      目前沒有符合條件的借用單。
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr key={request.id}>
                      <td className={tableCellClass}>
                        <a className="font-bold text-blue-700 no-underline" href={`/borrows/${request.id}`}>
                          {request.id}
                        </a>
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
        ) : null}
      </section>
    </>
  )
}
