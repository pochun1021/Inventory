import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import type { InventoryItem, PosOrder, PosStockBalance } from './types'

type CheckoutLine = {
  item_id: number | ''
  quantity: number
  unit_price: number
  discount: number
  note: string
}

type StockLookup = Record<number, number>

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'
const removeButtonClass = 'cursor-pointer rounded-[10px] border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50'
const emptyLine = (): CheckoutLine => ({ item_id: '', quantity: 1, unit_price: 0, discount: 0, note: '' })
const ORDER_TYPE_OPTIONS = [
  { value: 'sale', label: '一般銷售（扣庫）' },
  { value: 'issue', label: '領用（扣庫）' },
  { value: 'borrow', label: '借用（扣庫）' },
  { value: 'issue_restock', label: '領用回補（加庫）' },
  { value: 'borrow_return', label: '借用歸還（加庫）' },
] as const
const DECREASE_ORDER_TYPES = new Set(['sale', 'issue', 'borrow'])

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

export function PosCheckoutPage() {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [stockMap, setStockMap] = useState<StockLookup>({})
  const [loadError, setLoadError] = useState('')

  const [orderType, setOrderType] = useState<(typeof ORDER_TYPE_OPTIONS)[number]['value']>('sale')
  const [customerName, setCustomerName] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [department, setDepartment] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [borrowRequestId, setBorrowRequestId] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<CheckoutLine[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const [latestOrder, setLatestOrder] = useState<PosOrder | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoadError('')
      try {
        const [itemsResponse, stockResponse] = await Promise.all([
          fetch(apiUrl('/api/items')),
          fetch(apiUrl('/api/pos/stock')),
        ])

        if (!itemsResponse.ok || !stockResponse.ok) {
          throw new Error('無法載入 POS 初始資料')
        }

        const itemsPayload = (await itemsResponse.json()) as InventoryItem[]
        const stockPayload = (await stockResponse.json()) as PosStockBalance[]
        const nextStockMap = stockPayload.reduce<StockLookup>((accumulator, stock) => {
          accumulator[stock.item_id] = stock.quantity
          return accumulator
        }, {})

        setInventoryItems(itemsPayload)
        setStockMap(nextStockMap)
      } catch {
        setLoadError('目前無法讀取 POS 結帳資料，請稍後重試。')
      }
    }

    void loadData()
  }, [])

  const itemOptionMap = useMemo(() => {
    return inventoryItems.reduce<Record<number, InventoryItem>>((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {})
  }, [inventoryItems])

  const itemOptions = useMemo(() => {
    return inventoryItems.map((item) => {
      const stock = stockMap[item.id] ?? 0
      const title = `${item.name || '未命名'}${item.model ? ` (${item.model})` : ''}`
      return {
        value: item.id,
        label: `${title}｜庫存 ${stock}`,
      }
    })
  }, [inventoryItems, stockMap])

  const computedLines = useMemo(() => {
    return lines.map((line) => {
      const quantity = Number.isFinite(line.quantity) ? line.quantity : 0
      const unitPrice = Number.isFinite(line.unit_price) ? line.unit_price : 0
      const discount = Number.isFinite(line.discount) ? line.discount : 0
      const lineAmount = quantity * unitPrice
      const lineTotal = lineAmount - discount
      const stockQuantity = typeof line.item_id === 'number' ? stockMap[line.item_id] ?? 0 : 0

      return {
        ...line,
        lineAmount,
        lineTotal,
        stockQuantity,
      }
    })
  }, [lines, stockMap])

  const totals = useMemo(() => {
    return computedLines.reduce(
      (accumulator, line) => {
        accumulator.subtotal += line.lineAmount
        accumulator.discountTotal += line.discount
        accumulator.total += line.lineTotal
        return accumulator
      },
      { subtotal: 0, discountTotal: 0, total: 0 }
    )
  }, [computedLines])

  const handleLineChange = (index: number, patch: Partial<CheckoutLine>) => {
    setLines((previousLines) => previousLines.map((line, currentIndex) => (index === currentIndex ? { ...line, ...patch } : line)))
  }

  const handleAddLine = () => {
    setLines((previousLines) => [...previousLines, emptyLine()])
  }

  const handleRemoveLine = (index: number) => {
    setLines((previousLines) => previousLines.filter((_, currentIndex) => currentIndex !== index))
  }

  const validatePayload = (): boolean => {
    if (lines.length === 0) {
      return false
    }

    const linesValid = lines.every((line) => {
      if (line.item_id === '') {
        return false
      }
      if (line.quantity <= 0) {
        return false
      }
      if (line.unit_price < 0 || line.discount < 0) {
        return false
      }
      return line.discount <= line.quantity * line.unit_price
    })

    if (!linesValid) {
      return false
    }

    if (orderType === 'borrow_return' && borrowRequestId.trim() && Number(borrowRequestId) <= 0) {
      return false
    }

    return true
  }

  const handleSubmit = async () => {
    if (!validatePayload()) {
      void toast.fire({ icon: 'error', title: '請確認品項、數量與金額欄位格式正確。' })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        order_type: orderType,
        customer_name: customerName,
        operator_name: operatorName,
        department,
        purpose,
        note,
        due_date: orderType === 'borrow' ? dueDate || null : null,
        borrow_request_id: orderType === 'borrow_return' && borrowRequestId.trim() ? Number(borrowRequestId) : null,
        items: lines.map((line) => ({
          item_id: Number(line.item_id),
          quantity: line.quantity,
          unit_price: line.unit_price,
          discount: line.discount,
          note: line.note,
        })),
      }

      const response = await fetch(apiUrl('/api/pos/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('POS 建單失敗')
      }

      const createdOrder = (await response.json()) as PosOrder
      setLatestOrder(createdOrder)
      setLines([emptyLine()])
      setBorrowRequestId('')
      setDueDate('')
      setNote('')
      void toast.fire({ icon: 'success', title: `POS 訂單 ${createdOrder.order_no} 已建立。` })
    } catch {
      void toast.fire({ icon: 'error', title: 'POS 結帳失敗，請稍後再試。' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">POS 結帳台</h1>
        <p className="mt-2 text-slate-500">支援銷售、領用、借用、領用回補與借用歸還，送出後會同步寫入庫存台帳。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h2 className="mt-0 text-lg font-bold">訂單資訊</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 font-bold">
            訂單型態
            <select className={fieldClass} value={orderType} onChange={(event) => setOrderType(event.target.value as (typeof ORDER_TYPE_OPTIONS)[number]['value'])}>
              {ORDER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 font-bold">
            操作人
            <input className={fieldClass} value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="例：櫃台 A" />
          </label>

          <label className="grid gap-2 font-bold">
            客戶/對象
            <input className={fieldClass} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="例：王小明 / 行政課" />
          </label>

          <label className="grid gap-2 font-bold">
            單位
            <input className={fieldClass} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="例：總務處" />
          </label>

          <label className="grid gap-2 font-bold md:col-span-2">
            用途
            <input className={fieldClass} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="例：門市銷售 / 活動借用" />
          </label>

          {orderType === 'borrow' ? (
            <label className="grid gap-2 font-bold">
              預計歸還日
              <input className={fieldClass} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          ) : null}

          {orderType === 'borrow_return' ? (
            <label className="grid gap-2 font-bold">
              借用單 ID（可選）
              <input
                className={fieldClass}
                type="number"
                min={1}
                value={borrowRequestId}
                onChange={(event) => setBorrowRequestId(event.target.value)}
                placeholder="例：12"
              />
            </label>
          ) : null}

          <label className="grid gap-2 font-bold md:col-span-2">
            備註
            <input className={fieldClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可填寫補充資訊" />
          </label>
        </div>

        <div className="mt-7">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-bold">品項明細</h3>
            <button className={buttonClass} type="button" onClick={handleAddLine}>新增品項</button>
          </div>

          <div className="mt-3 grid gap-3">
            {computedLines.map((line, index) => {
              const selectedItem = typeof line.item_id === 'number' ? itemOptionMap[line.item_id] : null
              const stockWarning = DECREASE_ORDER_TYPES.has(orderType) && typeof line.item_id === 'number' && line.quantity > line.stockQuantity

              return (
                <div key={`pos-line-${index}`} className="grid gap-2 rounded-xl border border-slate-200 p-4 md:grid-cols-[2fr,1fr,1fr,1fr,2fr,auto]">
                  <label className="grid gap-2 font-bold md:col-span-2">
                    品項
                    <select
                      className={fieldClass}
                      value={line.item_id}
                      onChange={(event) => handleLineChange(index, { item_id: event.target.value ? Number(event.target.value) : '' })}
                    >
                      <option value="">請選擇品項</option>
                      {itemOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 font-bold">
                    數量
                    <input
                      className={fieldClass}
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) => handleLineChange(index, { quantity: Number(event.target.value) })}
                    />
                  </label>

                  <label className="grid gap-2 font-bold">
                    單價
                    <input
                      className={fieldClass}
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unit_price}
                      onChange={(event) => handleLineChange(index, { unit_price: Number(event.target.value) })}
                    />
                  </label>

                  <label className="grid gap-2 font-bold">
                    折扣
                    <input
                      className={fieldClass}
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.discount}
                      onChange={(event) => handleLineChange(index, { discount: Number(event.target.value) })}
                    />
                  </label>

                  <label className="grid gap-2 font-bold md:col-span-2">
                    備註
                    <input className={fieldClass} value={line.note} onChange={(event) => handleLineChange(index, { note: event.target.value })} />
                  </label>

                  <div className="grid content-end gap-2">
                    <div className="rounded-[10px] bg-slate-50 px-3 py-2 text-sm">
                      行小計：{line.lineTotal.toFixed(2)}
                    </div>
                    <button type="button" className={removeButtonClass} onClick={() => handleRemoveLine(index)} disabled={lines.length <= 1}>
                      移除
                    </button>
                  </div>

                  <div className="md:col-span-6">
                    <p className="m-0 text-sm text-slate-500">
                      {selectedItem ? `${selectedItem.name || '未命名'}${selectedItem.model ? ` (${selectedItem.model})` : ''}` : '尚未選擇品項'}
                      {' · '}
                      目前庫存 {line.stockQuantity}
                    </p>
                    {stockWarning ? <p className="m-0 mt-1 text-sm font-bold text-red-600">此筆數量超過目前庫存，送出時可能被後端拒絕。</p> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <p className="m-0">小計：<span className="font-bold">{totals.subtotal.toFixed(2)}</span></p>
          <p className="m-0">折扣：<span className="font-bold">{totals.discountTotal.toFixed(2)}</span></p>
          <p className="m-0">總計：<span className="text-lg font-bold text-blue-700">{totals.total.toFixed(2)}</span></p>
        </div>

        <div className="mt-6 flex justify-end">
          <button className={buttonClass} type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '送出中...' : '送出結帳'}
          </button>
        </div>

        {loadError ? <p className="mt-3 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}
      </section>

      {latestOrder ? (
        <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
          <h2 className="mt-0 text-lg font-bold">最近建立訂單</h2>
          <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p className="m-0">訂單編號：<span className="font-bold">{latestOrder.order_no}</span></p>
            <p className="m-0">訂單型態：<span className="font-bold">{latestOrder.order_type}</span></p>
            <p className="m-0">建立時間：<span className="font-bold">{toDisplayDatetime(latestOrder.created_at)}</span></p>
            <p className="m-0">總金額：<span className="font-bold text-blue-700">{latestOrder.total.toFixed(2)}</span></p>
          </div>
        </section>
      ) : null}
    </>
  )
}
