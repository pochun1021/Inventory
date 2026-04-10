import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { buildGroupedItemOptions } from './itemOptionGroups'
import type { BorrowRequest, InventoryItem, PaginatedResponse } from './types'

type BorrowLine = {
  item_id: number | ''
  quantity: number
  note: string
}

const emptyLine = (): BorrowLine => ({ item_id: '', quantity: 1, note: '' })
const GROUP_OPTION_PREFIX = '__group__:'
const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
})

type BorrowPageProps = {
  requestId?: number
}

export function BorrowPage({ requestId }: BorrowPageProps) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')

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
  const isEditing = Number.isInteger(requestId)

  useEffect(() => {
    const loadData = async () => {
      setLoadError('')
      try {
        const itemsResponse = await fetch(apiUrl('/api/items?page=1&page_size=100000'))
        if (!itemsResponse.ok) {
          throw new Error('無法載入資料')
        }
        const itemsPayload = (await itemsResponse.json()) as PaginatedResponse<InventoryItem>
        setInventoryItems(itemsPayload.items)
      } catch {
        setLoadError('目前無法讀取借用資料，請稍後重試。')
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
        const response = await fetch(apiUrl(`/api/borrows/${requestId}`))
        if (!response.ok) {
          throw new Error('無法載入借用單')
        }

        const payload = (await response.json()) as BorrowRequest
        setBorrower(payload.borrower ?? '')
        setDepartment(payload.department ?? '')
        setPurpose(payload.purpose ?? '')
        setBorrowDate(payload.borrow_date ?? '')
        setDueDate(payload.due_date ?? '')
        setReturnDate(payload.return_date ?? '')
        setStatus(payload.status ?? 'borrowed')
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
        setLoadError('目前無法讀取借用單資料，請稍後重試。')
      }
    }

    void loadRequest()
  }, [isEditing, requestId])

  const selectedItemIds = useMemo(
    () => new Set(lines.map((line) => line.item_id).filter((itemId): itemId is number => itemId !== '')),
    [lines],
  )

  const selectableItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      if (item.asset_status === '0') {
        return true
      }
      return isEditing && selectedItemIds.has(item.id)
    })
  }, [inventoryItems, isEditing, selectedItemIds])

  const itemOptionGroups = useMemo(() => buildGroupedItemOptions(selectableItems), [selectableItems])

  const handleLineChange = (index: number, patch: Partial<BorrowLine>) => {
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

  const getLineValidationError = () => {
    if (lines.length === 0) {
      return '請至少新增一筆借用品項。'
    }
    if (!lines.every((line) => line.item_id !== '' && line.quantity === 1)) {
      return '單件模式下，每筆借用品項數量必須為 1。'
    }
    const pickedIds = lines.map((line) => line.item_id).filter((itemId): itemId is number => itemId !== '')
    if (new Set(pickedIds).size !== pickedIds.length) {
      return '同一張借用單不可重複選取同一品項。'
    }
    return null
  }

  const normalizeDate = (value: string) => (value ? value : null)

  const handleSubmit = async () => {
    const validationError = getLineValidationError()
    if (validationError) {
      void toast.fire({ icon: 'error', title: validationError })
      return
    }

    setSubmitting(true)
    setLoadError('')

    try {
      const response = await fetch(apiUrl(isEditing && requestId ? `/api/borrows/${requestId}` : '/api/borrows'), {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrower,
          department,
          purpose,
          borrow_date: normalizeDate(borrowDate),
          due_date: normalizeDate(dueDate),
          return_date: normalizeDate(returnDate),
          status,
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
        void toast.fire({ icon: 'success', title: '借用單已更新。' })
      } else {
        setBorrower('')
        setDepartment('')
        setPurpose('')
        setBorrowDate('')
        setDueDate('')
        setReturnDate('')
        setStatus('borrowed')
        setMemo('')
        setLines([emptyLine()])
        void toast.fire({ icon: 'success', title: '借用單已建立。' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({
        icon: 'error',
        title: message || (isEditing ? '更新借用單失敗，請稍後再試。' : '建立借用單失敗，請稍後再試。'),
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
              <Label>借用人</Label>
              <Input value={borrower} onChange={(event) => setBorrower(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>單位</Label>
              <Input value={department} onChange={(event) => setDepartment(event.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>用途</Label>
              <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>借用日期</Label>
              <Input type="date" value={borrowDate} onChange={(event) => setBorrowDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>預計歸還</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>實際歸還</Label>
              <Input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>狀態</Label>
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="borrowed">借出中</option>
                <option value="returned">已歸還</option>
                <option value="overdue">逾期</option>
              </Select>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>備註</Label>
              <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="借用品項">
          <div className="grid gap-3">
            {lines.map((line, index) => {
              const selectedByOtherLines = new Set(
                lines
                  .filter((_, idx) => idx !== index)
                  .map((itemLine) => itemLine.item_id)
                  .filter((itemId): itemId is number => itemId !== ''),
              )
              return (
              <article key={`borrow-line-${index}`} className="grid gap-2 rounded-lg border border-[hsl(var(--border))] p-3 md:grid-cols-[2fr,1fr,2fr,auto]">
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
                        <option key={option.value} value={option.value} disabled={selectedByOtherLines.has(option.value)}>
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
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              新增品項
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? (isEditing ? '更新中...' : '建立中...') : (isEditing ? '更新借用單' : '建立借用單')}
            </Button>
          </div>
          {loadError ? <p className="mt-3 mb-0 text-sm text-red-600">{loadError}</p> : null}
        </SectionCard>
      </div>
  )
}
