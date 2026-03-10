import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import type { IssueRequest } from './types'

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const tableHeaderClass = 'whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left'
const tableCellClass = 'border border-slate-200 p-2 text-left align-top break-words'

export function IssueListPage() {
  const [requests, setRequests] = useState<IssueRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    const loadRequests = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch(apiUrl('/api/issues'))
        if (!response.ok) {
          throw new Error('無法載入領用清單')
        }
        const payload = (await response.json()) as IssueRequest[]
        setRequests(payload)
      } catch {
        setLoadError('目前無法讀取領用清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRequests()
  }, [])

  const filteredRequests = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return requests
    }

    const normalize = (value: string | null | undefined) => (value ?? '').toLowerCase()
    return requests.filter((request) => {
      const itemMatches = request.items.some((item) =>
        normalize(item.item_name).includes(normalizedKeyword)
      )
      const fields = [request.requester, request.department, request.purpose, request.memo, request.request_date]
      return itemMatches || fields.some((field) => normalize(field).includes(normalizedKeyword))
    })
  }, [keyword, requests])

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">領用清單</h1>
        <p className="mt-2 text-slate-500">可依領用人、單位、用途、品項快速查詢。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid gap-2">
          <label htmlFor="issue-search" className="font-bold">
            關鍵字搜尋
          </label>
          <input
            className={fieldClass}
            id="issue-search"
            type="search"
            placeholder="輸入領用人、品項、用途..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <p className="mt-1 text-[0.95rem] text-slate-600">共 {filteredRequests.length} 筆資料</p>
        </div>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}

        {!loading && !loadError ? (
          <div className="w-full overflow-x-auto">
            <table className="mt-2 w-full table-fixed border-collapse bg-white">
              <thead>
                <tr>
                  {['#', '領用日期', '領用人/單位', '用途', '品項', '備註'].map((header) => (
                    <th key={header} className={tableHeaderClass}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td className={`${tableCellClass} text-center text-slate-500`} colSpan={6}>
                      目前沒有符合條件的領用單。
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr key={request.id}>
                      <td className={tableCellClass}>{request.id}</td>
                      <td className={tableCellClass}>{request.request_date || '--'}</td>
                      <td className={tableCellClass}>
                        <div className="font-bold">{request.requester || '--'}</div>
                        <div className="text-sm text-slate-500">{request.department || ''}</div>
                      </td>
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
        ) : null}
      </section>
    </>
  )
}
