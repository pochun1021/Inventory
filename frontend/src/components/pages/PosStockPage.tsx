import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import type { PosStockBalance, PosStockMovement } from './types'

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'
const tableHeaderClass = 'whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left'
const tableCellClass = 'border border-slate-200 p-2 text-left align-top break-words'

type EditingMap = Record<number, string>
type SavingMap = Record<number, boolean>

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
})

function toDisplayDatetime(value: string | null): string {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('zh-TW', { hour12: false })
  }

  return value
}

export function PosStockPage() {
  const [stockRows, setStockRows] = useState<PosStockBalance[]>([])
  const [movementRows, setMovementRows] = useState<PosStockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [editingValues, setEditingValues] = useState<EditingMap>({})
  const [savingMap, setSavingMap] = useState<SavingMap>({})

  const loadData = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [stockResponse, movementsResponse] = await Promise.all([
        fetch(apiUrl('/api/pos/stock')),
        fetch(apiUrl('/api/pos/stock-movements?limit=200')),
      ])

      if (!stockResponse.ok || !movementsResponse.ok) {
        throw new Error('無法載入 POS 庫存資料')
      }

      const stockPayload = (await stockResponse.json()) as PosStockBalance[]
      const movementPayload = (await movementsResponse.json()) as PosStockMovement[]

      setStockRows(stockPayload)
      setMovementRows(movementPayload)
      setEditingValues(
        stockPayload.reduce<EditingMap>((accumulator, row) => {
          accumulator[row.item_id] = String(row.quantity)
          return accumulator
        }, {})
      )
    } catch {
      setLoadError('目前無法讀取 POS 庫存資料，請稍後重試。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const filteredStockRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) {
      return stockRows
    }

    return stockRows.filter((row) => {
      const fields = [row.item_name, row.item_model, String(row.item_id)]
      return fields.some((field) => field.toLowerCase().includes(normalizedKeyword))
    })
  }, [keyword, stockRows])

  const handleUpdateStock = async (itemId: number) => {
    const rawValue = editingValues[itemId] ?? ''
    const quantity = Number(rawValue)
    if (!Number.isInteger(quantity) || quantity < 0) {
      void toast.fire({ icon: 'error', title: '庫存數量必須是大於等於 0 的整數。' })
      return
    }

    setSavingMap((previous) => ({ ...previous, [itemId]: true }))
    try {
      const response = await fetch(apiUrl(`/api/pos/stock/${itemId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })

      if (!response.ok) {
        throw new Error('庫存更新失敗')
      }

      const updatedRow = (await response.json()) as PosStockBalance
      setStockRows((previousRows) => previousRows.map((row) => (row.item_id === itemId ? updatedRow : row)))
      setEditingValues((previous) => ({ ...previous, [itemId]: String(updatedRow.quantity) }))
      void toast.fire({ icon: 'success', title: `品項 #${itemId} 庫存已更新。` })
      void loadData()
    } catch {
      void toast.fire({ icon: 'error', title: '更新庫存失敗，請稍後再試。' })
    } finally {
      setSavingMap((previous) => ({ ...previous, [itemId]: false }))
    }
  }

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">POS 庫存與台帳</h1>
        <p className="mt-2 text-slate-500">上半部可查詢與調整庫存，下半部顯示最近 200 筆庫存異動紀錄。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid gap-3 md:grid-cols-[2fr,auto] md:items-end">
          <label className="grid gap-2 font-bold">
            庫存關鍵字搜尋
            <input
              className={fieldClass}
              type="search"
              placeholder="輸入品名、型號或 item_id..."
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <button className={buttonClass} type="button" onClick={() => void loadData()} disabled={loading}>重新整理</button>
        </div>

        <p className="mt-1 text-[0.95rem] text-slate-600">共 {filteredStockRows.length} 筆庫存</p>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}

        {!loading && !loadError ? (
          <div className="w-full overflow-x-auto">
            <table className="mt-2 w-full table-auto border-collapse bg-white">
              <thead>
                <tr>
                  {['item_id', '品項', '型號', '目前庫存', '調整為', '操作'].map((header) => (
                    <th key={header} className={tableHeaderClass}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStockRows.length === 0 ? (
                  <tr>
                    <td className={`${tableCellClass} text-center text-slate-500`} colSpan={6}>查無符合條件的庫存資料。</td>
                  </tr>
                ) : (
                  filteredStockRows.map((row) => {
                    const isSaving = savingMap[row.item_id] ?? false
                    return (
                      <tr key={row.item_id}>
                        <td className={tableCellClass}>{row.item_id}</td>
                        <td className={tableCellClass}>{row.item_name || '--'}</td>
                        <td className={tableCellClass}>{row.item_model || '--'}</td>
                        <td className={`${tableCellClass} font-bold text-blue-700`}>{row.quantity}</td>
                        <td className={tableCellClass}>
                          <input
                            className={`${fieldClass} w-28`}
                            type="number"
                            min={0}
                            step={1}
                            value={editingValues[row.item_id] ?? ''}
                            onChange={(event) => setEditingValues((previous) => ({ ...previous, [row.item_id]: event.target.value }))}
                          />
                        </td>
                        <td className={tableCellClass}>
                          <button
                            className={buttonClass}
                            type="button"
                            onClick={() => void handleUpdateStock(row.item_id)}
                            disabled={isSaving}
                          >
                            {isSaving ? '更新中...' : '更新'}
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h2 className="mt-0 text-lg font-bold">庫存異動台帳</h2>
        <div className="w-full overflow-x-auto">
          <table className="mt-2 min-w-[980px] table-auto border-collapse bg-white">
            <thead>
              <tr>
                {['#', '時間', '訂單編號', 'item_id', '品項', 'delta', 'balance_after', 'reason', 'related'].map((header) => (
                  <th key={header} className={tableHeaderClass}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movementRows.length === 0 ? (
                <tr>
                  <td className={`${tableCellClass} text-center text-slate-500`} colSpan={9}>目前沒有庫存異動資料。</td>
                </tr>
              ) : (
                movementRows.map((movement) => (
                  <tr key={movement.id}>
                    <td className={tableCellClass}>{movement.id}</td>
                    <td className={tableCellClass}>{toDisplayDatetime(movement.created_at)}</td>
                    <td className={tableCellClass}>{movement.order_no || '--'}</td>
                    <td className={tableCellClass}>{movement.item_id}</td>
                    <td className={tableCellClass}>{movement.item_name || '--'}{movement.item_model ? ` (${movement.item_model})` : ''}</td>
                    <td className={`${tableCellClass} ${movement.delta < 0 ? 'text-red-700' : 'text-emerald-700'} font-bold`}>{movement.delta}</td>
                    <td className={`${tableCellClass} font-bold`}>{movement.balance_after}</td>
                    <td className={tableCellClass}>{movement.reason || '--'}</td>
                    <td className={tableCellClass}>
                      <div>{movement.related_type || '--'}</div>
                      <div className="text-xs text-slate-500">#{movement.related_id ?? '--'}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
