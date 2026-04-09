import { useCallback, useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import type { DonationRequest, InventoryItem } from './types'

type DonationLine = {
  item_id: number | ''
  quantity: number
  note: string
}

const FIXED_DONOR = '固定捐贈人'
const FIXED_DEPARTMENT = '固定單位'
const fieldClass = 'rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-[hsl(var(--primary))] px-3 py-2.5 font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--primary-disabled))] disabled:text-[hsl(var(--primary-foreground))]'
const emptyLine = (): DonationLine => ({ item_id: '', quantity: 1, note: '' })
const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
})

type DonationPageProps = {
  requestId?: number
}

export function DonationPage({ requestId }: DonationPageProps) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')

  const [donor, setDonor] = useState(FIXED_DONOR)
  const [department, setDepartment] = useState(FIXED_DEPARTMENT)
  const [recipient, setRecipient] = useState('')
  const [purpose, setPurpose] = useState('')
  const [donationDate, setDonationDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<DonationLine[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const isEditing = Number.isInteger(requestId)

  const loadInventoryItems = useCallback(async () => {
    setLoadError('')
    try {
      const itemsResponse = await fetch(apiUrl('/api/items?include_donated=true'))
      if (!itemsResponse.ok) {
        throw new Error('無法載入資料')
      }
      const itemsPayload = (await itemsResponse.json()) as InventoryItem[]
      setInventoryItems(itemsPayload)
    } catch {
      setLoadError('目前無法讀取捐贈資料，請稍後重試。')
    }
  }, [])

  useEffect(() => {
    void loadInventoryItems()
  }, [loadInventoryItems])

  useEffect(() => {
    if (!isEditing || !requestId) {
      return
    }

    const loadRequest = async () => {
      setLoadError('')
      try {
        const response = await fetch(apiUrl(`/api/donations/${requestId}`))
        if (!response.ok) {
          throw new Error('無法載入捐贈單')
        }

        const payload = (await response.json()) as DonationRequest
        setDonor(payload.donor || FIXED_DONOR)
        setDepartment(payload.department || FIXED_DEPARTMENT)
        setRecipient(payload.recipient ?? '')
        setPurpose(payload.purpose ?? '')
        setDonationDate(payload.donation_date ?? '')
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
        setLoadError('目前無法讀取捐贈單資料，請稍後重試。')
      }
    }

    void loadRequest()
  }, [isEditing, requestId])

  const itemOptions = useMemo(() => {
    if (!isEditing || !requestId) {
      return inventoryItems.filter((item) => !item.donated_at)
    }

    return inventoryItems.filter((item) => {
      if (!item.donated_at) {
        return true
      }
      return item.donation_request_id === requestId
    })
  }, [inventoryItems, isEditing, requestId])

  const handleLineChange = (index: number, patch: Partial<DonationLine>) => {
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
    if (!recipient.trim()) {
      void toast.fire({ icon: 'error', title: '請填寫受贈對象。' })
      return
    }
    if (!validateLines()) {
      void toast.fire({ icon: 'error', title: '請確認每筆捐贈品項已選擇品項且數量大於 0。' })
      return
    }

    setSubmitting(true)
    setLoadError('')

    try {
      const response = await fetch(apiUrl(isEditing && requestId ? `/api/donations/${requestId}` : '/api/donations'), {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor,
          department,
          recipient,
          purpose,
          donation_date: donationDate,
          memo,
          items: lines.map((line) => ({
            item_id: line.item_id,
            quantity: line.quantity,
            note: line.note,
          })),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? '建立失敗')
      }

      await response.json()
      if (isEditing) {
        void toast.fire({ icon: 'success', title: '捐贈單已更新。' })
      } else {
        setDonor(FIXED_DONOR)
        setDepartment(FIXED_DEPARTMENT)
        setRecipient('')
        setPurpose('')
        setDonationDate('')
        setMemo('')
        setLines([emptyLine()])
        void toast.fire({ icon: 'success', title: '捐贈單已建立。' })
      }
      void loadInventoryItems()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({
        icon: 'error',
        title: message || (isEditing ? '更新捐贈單失敗，請稍後再試。' : '建立捐贈單失敗，請稍後再試。'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section className="rounded-2xl bg-[hsl(var(--card))] p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h2 className="mt-0 text-lg font-bold">{isEditing ? '編輯捐贈單' : '新增捐贈單'}</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-2 font-bold">
              <span className="inline-flex items-center gap-1">
                受贈對象
                <span className="text-red-600">*</span>
              </span>
              <input className={fieldClass} value={recipient} onChange={(event) => setRecipient(event.target.value)} />
            </label>
            <label className="grid gap-2 font-bold">
              捐贈日期
              <input className={fieldClass} type="date" value={donationDate} onChange={(event) => setDonationDate(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-2 font-bold">
            用途
            <input className={fieldClass} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </label>
          <label className="grid gap-2 font-bold">
            備註
            <input className={fieldClass} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-bold">捐贈品項</h3>
          </div>

          <div className="mt-3 grid gap-3">
            {lines.map((line, index) => (
              <div key={`donation-line-${index}`} className="grid gap-2 rounded-xl border border-[hsl(var(--border))] p-4 md:grid-cols-[2fr,1fr,2fr,auto]">
                <label className="grid gap-2 font-bold">
                  品項
                  <select
                    className={fieldClass}
                    value={line.item_id}
                    onChange={(event) => handleLineChange(index, { item_id: event.target.value ? Number(event.target.value) : '' })}
                  >
                    <option value="">請選擇品項</option>
                    {itemOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {`${item.name || '未命名'} ${item.model ? `(${item.model})` : ''} ${item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn ? `｜${item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn}` : ''}`.trim()}
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
                    className="cursor-pointer rounded-[10px] border border-[hsl(var(--border))] px-3 py-2.5 text-sm font-bold text-slate-600"
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
            <button className={buttonClass} type="button" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? (isEditing ? '更新中...' : '建立中...') : (isEditing ? '更新捐贈單' : '建立捐贈單')}
            </button>
          </div>
        </div>
      </section>

      {loadError ? <p className="rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}
    </>
  )
}
