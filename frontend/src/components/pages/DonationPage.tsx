import { useCallback, useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { buildGroupedItemOptions } from './itemOptionGroups'
import type { DonationRequest, InventoryItem, PaginatedResponse } from './types'

type DonationLine = {
  item_id: number | ''
  quantity: number
  note: string
}

const FIXED_DONOR = '固定捐贈人'
const FIXED_DEPARTMENT = '固定單位'
const emptyLine = (): DonationLine => ({ item_id: '', quantity: 1, note: '' })
const GROUP_OPTION_PREFIX = '__group__:'
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
      const itemsResponse = await fetch(apiUrl('/api/items?include_donated=true&page=1&page_size=100000'))
      if (!itemsResponse.ok) {
        throw new Error('無法載入資料')
      }
      const itemsPayload = (await itemsResponse.json()) as PaginatedResponse<InventoryItem>
      setInventoryItems(itemsPayload.items)
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
            : [emptyLine()],
        )
      } catch {
        setLoadError('目前無法讀取捐贈單資料，請稍後重試。')
      }
    }

    void loadRequest()
  }, [isEditing, requestId])

  const selectableItems = useMemo(() => {
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

  const itemOptionGroups = useMemo(() => buildGroupedItemOptions(selectableItems), [selectableItems])

  const handleLineChange = (index: number, patch: Partial<DonationLine>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)))
  }

  const handleItemSelectChange = (index: number, rawValue: string) => {
    if (!rawValue) {
      handleLineChange(index, { item_id: '' })
      return
    }
    if (rawValue.startsWith(GROUP_OPTION_PREFIX)) {
      return
    }
    handleLineChange(index, { item_id: Number(rawValue) })
  }

  const validateLines = () => {
    if (lines.length === 0) {
      return false
    }
    return lines.every((line) => line.item_id !== '' && line.quantity === 1)
  }

  const handleSubmit = async () => {
    if (!recipient.trim()) {
      void toast.fire({ icon: 'error', title: '請填寫受贈對象。' })
      return
    }
    if (!validateLines()) {
      void toast.fire({ icon: 'error', title: '單件模式下，每筆捐贈品項數量必須為 1。' })
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
            quantity: 1,
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
    <div className="grid gap-4">
        <SectionCard title="基本資料">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>捐贈人</Label>
              <Input value={donor} onChange={(event) => setDonor(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>單位</Label>
              <Input value={department} onChange={(event) => setDepartment(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>受贈對象</Label>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>捐贈日期</Label>
              <Input type="date" value={donationDate} onChange={(event) => setDonationDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>用途</Label>
              <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>備註</Label>
              <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="捐贈品項">
          <div className="grid gap-3">
            {lines.map((line, index) => (
              <article key={`donation-line-${index}`} className="grid gap-2 rounded-lg border border-[hsl(var(--border))] p-3 md:grid-cols-[2fr,1fr,2fr,auto]">
                <div className="grid gap-1.5">
                  <Label>品項</Label>
                  <Select
                    value={line.item_id}
                    onChange={(event) => handleItemSelectChange(index, event.target.value)}
                  >
                    <option value="">請選擇品項</option>
                    {itemOptionGroups.flatMap((group) => [
                      <option
                        key={`group-${group.groupLabel}`}
                        value={`${GROUP_OPTION_PREFIX}${group.groupLabel}`}
                        style={{ color: 'hsl(var(--foreground))', fontWeight: 700 }}
                      >
                        {`==== ${group.groupLabel} ====`}
                      </option>,
                      ...group.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {`  ${option.label}`}
                        </option>
                      )),
                    ])}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>數量</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1}
                    value={1}
                    disabled
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>備註</Label>
                  <Input value={line.note} onChange={(event) => handleLineChange(index, { note: event.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="secondary" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== index))} disabled={lines.length <= 1}>
                    移除
                  </Button>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              新增品項
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? (isEditing ? '更新中...' : '建立中...') : (isEditing ? '更新捐贈單' : '建立捐贈單')}
            </Button>
          </div>
          {loadError ? <p className="mt-3 mb-0 text-sm text-red-600">{loadError}</p> : null}
        </SectionCard>
      </div>
  )
}
