import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import type { InventoryItem } from './types'

type BorrowLine = {
  item_id: number | ''
  quantity: number
  note: string
}

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'
const emptyLine = (): BorrowLine => ({ item_id: '', quantity: 1, note: '' })

export function BorrowPage() {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const [borrower, setBorrower] = useState('')
  const [department, setDepartment] = useState('')
  const [purpose, setPurpose] = useState('')
  const [borrowDate, setBorrowDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [status, setStatus] = useState('borrowed')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<BorrowLine[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      setLoadError('')
      try {
        const itemsResponse = await fetch(apiUrl('/api/items'))
        if (!itemsResponse.ok) {
          throw new Error('無法載入資料')
        }
        const itemsPayload = (await itemsResponse.json()) as InventoryItem[]
        setInventoryItems(itemsPayload)
      } catch {
        setLoadError('目前無法讀取借用資料，請稍後重試。')
      }
    }

    void loadData()
  }, [])

  const itemOptions = useMemo(() => {
    return inventoryItems.map((item) => ({
      value: item.id,
      label: `${item.name || '未命名'} ${item.model ? `(${item.model})` : ''}`.trim(),
    }))
  }, [inventoryItems])

  const handleLineChange = (index: number, patch: Partial<BorrowLine>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)))
  }

  const handleAddLine = () => {
    setLines((prev) => [...prev, emptyLine()])
  }

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index))
  }

  const validateLines = () => {
    if (lines.length === 0) {
      return false
    }
    return lines.every((line) => line.item_id !== '' && line.quantity > 0)
  }

  const handleSubmit = async () => {
    if (!validateLines()) {
      setActionMessage('')
      setLoadError('請確認每筆借用品項已選擇品項且數量大於 0。')
      return
    }

    setSubmitting(true)
    setLoadError('')
    setActionMessage('')

    try {
      const response = await fetch(apiUrl('/api/borrows'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower,
          department,
          purpose,
          borrow_date: borrowDate,
          due_date: dueDate,
          return_date: returnDate,
          status,
          memo,
          items: lines.map((line) => ({
            item_id: line.item_id,
            quantity: line.quantity,
            note: line.note,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error('建立失敗')
      }

      await response.json()
      setBorrower('')
      setDepartment('')
      setPurpose('')
      setBorrowDate('')
      setDueDate('')
      setReturnDate('')
      setStatus('borrowed')
      setMemo('')
      setLines([emptyLine()])
      setActionMessage('借用單已建立。')
    } catch {
      setLoadError('建立借用單失敗，請稍後再試。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">借用管理</h1>
        <p className="mt-2 text-slate-500">建立借用單，並可一次選擇多個品項。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h2 className="mt-0 text-lg font-bold">新增借用單</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-2 font-bold">
              借用人
              <input className={fieldClass} value={borrower} onChange={(event) => setBorrower(event.target.value)} />
            </label>
            <label className="grid gap-2 font-bold">
              單位
              <input className={fieldClass} value={department} onChange={(event) => setDepartment(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-2 font-bold">
            用途
            <input className={fieldClass} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </label>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="grid gap-2 font-bold">
              借用日期
              <input className={fieldClass} type="date" value={borrowDate} onChange={(event) => setBorrowDate(event.target.value)} />
            </label>
            <label className="grid gap-2 font-bold">
              預計歸還
              <input className={fieldClass} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <label className="grid gap-2 font-bold">
              實際歸還
              <input className={fieldClass} type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-2 font-bold">
              狀態
              <select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="borrowed">借出中</option>
                <option value="returned">已歸還</option>
                <option value="overdue">逾期</option>
              </select>
            </label>
            <label className="grid gap-2 font-bold">
              備註
              <input className={fieldClass} value={memo} onChange={(event) => setMemo(event.target.value)} />
            </label>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-bold">借用品項</h3>
          </div>

          <div className="mt-3 grid gap-3">
            {lines.map((line, index) => (
              <div key={`borrow-line-${index}`} className="grid gap-2 rounded-xl border border-slate-200 p-4 md:grid-cols-[2fr,1fr,2fr,auto]">
                <label className="grid gap-2 font-bold">
                  品項
                  <select
                    className={fieldClass}
                    value={line.item_id}
                    onChange={(event) => handleLineChange(index, { item_id: event.target.value ? Number(event.target.value) : '' })}
                  >
                    <option value="">請選擇品項</option>
                    {itemOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
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
                  備註
                  <input className={fieldClass} value={line.note} onChange={(event) => handleLineChange(index, { note: event.target.value })} />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="cursor-pointer rounded-[10px] border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-600"
                    onClick={() => handleRemoveLine(index)}
                    disabled={lines.length <= 1}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
            <button className={buttonClass} type="button" onClick={handleAddLine}>
              新增品項
            </button>
            <button className={buttonClass} type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '建立中...' : '建立借用單'}
            </button>
            {loadError ? <span className="text-sm text-red-600">{loadError}</span> : null}
            {actionMessage ? <span className="text-sm text-emerald-600">{actionMessage}</span> : null}
          </div>
        </div>
      </section>

    </>
  )
}
