import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import type { PosOrder } from './types'

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const tableHeaderClass = 'whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left'
const tableCellClass = 'border border-slate-200 p-2 text-left align-top break-words'
const ORDER_TYPE_LABELS: Record<string, string> = {
  sale: '一般銷售',
  issue: '領用',
  borrow: '借用',
  issue_restock: '領用回補',
  borrow_return: '借用歸還',
}

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

function toOrderTypeLabel(type: string): string {
  const normalizedType = type.trim()
  if (!normalizedType) {
    return '--'
  }
  return ORDER_TYPE_LABELS[normalizedType] ?? normalizedType
}

export function PosOrdersPage() {
  const [orders, setOrders] = useState<PosOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedType, setSelectedType] = useState('all')

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch(apiUrl('/api/pos/orders'))
        if (!response.ok) {
          throw new Error('無法載入 POS 訂單')
        }
        const payload = (await response.json()) as PosOrder[]
        setOrders(payload)
      } catch {
        setLoadError('目前無法讀取 POS 訂單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadOrders()
  }, [])

  const typeOptions = useMemo(() => {
    const uniqueTypes = new Set(orders.map((order) => order.order_type).filter((type) => Boolean(type?.trim())))
    return ['all', ...Array.from(uniqueTypes)]
  }, [orders])

  const filteredOrders = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()

    return orders.filter((order) => {
      if (selectedType !== 'all' && order.order_type !== selectedType) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const fields = [
        order.order_no,
        order.customer_name,
        order.operator_name,
        order.purpose,
        order.note,
        order.request_ref_type,
      ]
      const inFields = fields.some((field) => (field ?? '').toLowerCase().includes(normalizedKeyword))
      const inItems = order.items.some((item) => {
        const itemFields = [item.item_name, item.item_model, item.note]
        return itemFields.some((field) => (field ?? '').toLowerCase().includes(normalizedKeyword))
      })

      return inFields || inItems
    })
  }, [keyword, orders, selectedType])

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">POS 訂單查詢</h1>
        <p className="mt-2 text-slate-500">可依訂單編號、客戶、操作人或品項快速查詢，並查看每筆訂單明細。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 font-bold">
            關鍵字搜尋
            <input
              className={fieldClass}
              type="search"
              placeholder="輸入訂單編號、客戶、品項..."
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>

          <label className="grid gap-2 font-bold">
            訂單型態
            <select className={fieldClass} value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? '全部型態' : toOrderTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-1 text-[0.95rem] text-slate-600">共 {filteredOrders.length} 筆資料</p>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}

        {!loading && !loadError ? (
          <div className="w-full overflow-x-auto">
            <table className="mt-2 w-full table-fixed border-collapse bg-white">
              <thead>
                <tr>
                  {['#', '訂單編號', '型態', '客戶/操作人', '時間', '金額', '關聯', '品項明細'].map((header) => (
                    <th key={header} className={tableHeaderClass}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td className={`${tableCellClass} text-center text-slate-500`} colSpan={8}>
                      查無符合條件的 POS 訂單。
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td className={tableCellClass}>{order.id}</td>
                      <td className={tableCellClass}>
                        <div className="font-bold text-blue-700">{order.order_no || '--'}</div>
                        <div className="text-xs text-slate-500">備註：{order.note || '--'}</div>
                      </td>
                      <td className={tableCellClass}>{toOrderTypeLabel(order.order_type)}</td>
                      <td className={tableCellClass}>
                        <div className="font-bold">{order.customer_name || '--'}</div>
                        <div className="text-xs text-slate-500">操作人：{order.operator_name || '--'}</div>
                        <div className="text-xs text-slate-500">單位：{order.purpose || '--'}</div>
                      </td>
                      <td className={tableCellClass}>{toDisplayDatetime(order.created_at)}</td>
                      <td className={tableCellClass}>
                        <div>小計：{order.subtotal.toFixed(2)}</div>
                        <div>折扣：{order.discount_total.toFixed(2)}</div>
                        <div className="font-bold text-blue-700">總計：{order.total.toFixed(2)}</div>
                      </td>
                      <td className={tableCellClass}>
                        <div>{order.request_ref_type || '--'}</div>
                        <div className="text-xs text-slate-500">#{order.request_ref_id ?? '--'}</div>
                      </td>
                      <td className={tableCellClass}>
                        <details>
                          <summary className="cursor-pointer text-sm font-bold text-blue-700">查看明細（{order.items.length}）</summary>
                          <div className="mt-2 grid gap-2">
                            {order.items.map((item) => (
                              <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                                <div className="font-bold">{item.item_name || `#${item.item_id}`}{item.item_model ? ` (${item.item_model})` : ''}</div>
                                <div>數量：{item.quantity}，單價：{item.unit_price.toFixed(2)}，折扣：{item.discount.toFixed(2)}</div>
                                <div className="font-bold">小計：{item.line_total.toFixed(2)}</div>
                                <div className="text-slate-500">備註：{item.note || '--'}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
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
