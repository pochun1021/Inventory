import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import type { InventoryItem, IssueRequest } from './types'

type IssueLine = {
  item_id: number | ''
  quantity: number
  note: string
}

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'
const emptyLine = (): IssueLine => ({ item_id: '', quantity: 1, note: '' })
const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
})

type IssuePageProps = {
  requestId?: number
}

export function IssuePage({ requestId }: IssuePageProps) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')

  const [requester, setRequester] = useState('')
  const [department, setDepartment] = useState('')
  const [purpose, setPurpose] = useState('')
  const [requestDate, setRequestDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<IssueLine[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const isEditing = Number.isInteger(requestId)

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
        setLoadError('目前無法讀取領用資料，請稍後重試。')
      }
    }

    void loadData()
  }, [])

  useEffect(() => {
    if (!isEditing || !requestId) {
      return
    }

    const loadRequest = async () => {
      setLoadError('')
      try {
        const response = await fetch(apiUrl(`/api/issues/${requestId}`))
        if (!response.ok) {
          throw new Error('無法載入領用單')
        }

        const payload = (await response.json()) as IssueRequest
        setRequester(payload.requester ?? '')
        setDepartment(payload.department ?? '')
        setPurpose(payload.purpose ?? '')
        setRequestDate(payload.request_date ?? '')
        setMemo(payload.memo ?? '')
        setLines(
          payload.items.length > 0
            ? payload.items.map((item) => ({
              item_id: item.item_id,
              quantity: item.quantity,
              note: item.note ?? '',
            }))
            : [emptyLine()]
        )
      } catch {
        setLoadError('目前無法讀取領用單資料，請稍後重試。')
      }
    }

    void loadRequest()
  }, [isEditing, requestId])

  const itemOptions = useMemo(() => {
    return inventoryItems.map((item) => ({
      value: item.id,
      label: `${item.name || '未命名'} ${item.model ? `(${item.model})` : ''}`.trim(),
    }))
  }, [inventoryItems])

  const handleLineChange = (index: number, patch: Partial<IssueLine>) => {
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
      void toast.fire({ icon: 'error', title: '請確認每筆領用品項已選擇品項且數量大於 0。' })
      return
    }

    setSubmitting(true)
    setLoadError('')

    try {
      const response = await fetch(apiUrl(isEditing && requestId ? `/api/issues/${requestId}` : '/api/issues'), {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester,
          department,
          purpose,
          request_date: requestDate,
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
      if (isEditing) {
        void toast.fire({ icon: 'success', title: '領用單已更新。' })
      } else {
        setRequester('')
        setDepartment('')
        setPurpose('')
        setRequestDate('')
        setMemo('')
        setLines([emptyLine()])
        void toast.fire({ icon: 'success', title: '領用單已建立。' })
      }
    } catch {
      void toast.fire({ icon: 'error', title: isEditing ? '更新領用單失敗，請稍後再試。' : '建立領用單失敗，請稍後再試。' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">領用管理</h1>
        <p className="mt-2 text-slate-500">建立領用單，並可一次選擇多個品項。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h2 className="mt-0 text-lg font-bold">{isEditing ? '編輯領用單' : '新增領用單'}</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-2 font-bold">
              領用人
              <input className={fieldClass} value={requester} onChange={(event) => setRequester(event.target.value)} />
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
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-2 font-bold">
              領用日期
              <input className={fieldClass} type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} />
            </label>
            <label className="grid gap-2 font-bold">
              備註
              <input className={fieldClass} value={memo} onChange={(event) => setMemo(event.target.value)} />
            </label>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-bold">領用品項</h3>
          </div>

          <div className="mt-3 grid gap-3">
            {lines.map((line, index) => (
              <div key={`issue-line-${index}`} className="grid gap-2 rounded-xl border border-slate-200 p-4 md:grid-cols-[2fr,1fr,2fr,auto]">
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
              {submitting ? (isEditing ? '更新中...' : '建立中...') : (isEditing ? '更新領用單' : '建立領用單')}
            </button>
            {loadError ? <span className="text-sm text-red-600">{loadError}</span> : null}
          </div>
        </div>
      </section>

    </>
  )
}
