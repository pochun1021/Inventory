import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import type { BorrowPickupCandidateItem, BorrowPickupCandidateLine, BorrowRequest, BorrowReservationOption } from './types'

type BorrowLine = {
  item_name: string
  item_model: string
  requested_qty: number
  note: string
  allocated_qty?: number
  allocated_item_ids?: number[]
  name_search: string
  model_search: string
}

type ShortageRow = {
  item_name: string
  item_model: string
  requested_qty: number
  available_qty: number
  shortage_qty: number
}

const emptyLine = (): BorrowLine => ({
  item_name: '',
  item_model: '',
  requested_qty: 1,
  note: '',
  name_search: '',
  model_search: '',
})

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

function parseShortages(detail: unknown): ShortageRow[] {
  if (!detail || typeof detail !== 'object') {
    return []
  }
  const parsed = detail as { shortages?: unknown }
  if (!Array.isArray(parsed.shortages)) {
    return []
  }
  return parsed.shortages
    .map((row) => {
      const candidate = row as Partial<ShortageRow>
      if (!candidate || typeof candidate !== 'object') {
        return null
      }
      return {
        item_name: typeof candidate.item_name === 'string' ? candidate.item_name : '',
        item_model: typeof candidate.item_model === 'string' ? candidate.item_model : '',
        requested_qty: Number(candidate.requested_qty ?? 0),
        available_qty: Number(candidate.available_qty ?? 0),
        shortage_qty: Number(candidate.shortage_qty ?? 0),
      }
    })
    .filter((row): row is ShortageRow => row !== null)
}

export function BorrowPage({ requestId }: BorrowPageProps) {
  const [reservationOptions, setReservationOptions] = useState<BorrowReservationOption[]>([])
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [shortages, setShortages] = useState<ShortageRow[]>([])
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false)
  const [pickupLoading, setPickupLoading] = useState(false)
  const [pickupCandidates, setPickupCandidates] = useState<BorrowPickupCandidateLine[]>([])
  const [pickupSelections, setPickupSelections] = useState<Record<number, number[]>>({})

  const [borrower, setBorrower] = useState('')
  const [department, setDepartment] = useState('')
  const [purpose, setPurpose] = useState('')
  const [borrowDate, setBorrowDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [status, setStatus] = useState('reserved')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<BorrowLine[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)
  const isEditing = Number.isInteger(requestId)

  const comboKeySet = useMemo(() => {
    const keys = new Set<string>()
    for (const option of reservationOptions) {
      keys.add(`${option.item_name}__${option.item_model}`)
    }
    return keys
  }, [reservationOptions])

  const nameOptions = useMemo(() => {
    const names = new Set<string>()
    for (const option of reservationOptions) {
      names.add(option.item_name)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [reservationOptions])

  const refreshReservationOptions = async () => {
    const searchParams = new URLSearchParams()
    if (isEditing && requestId) {
      searchParams.set('request_id', String(requestId))
    }
    const query = searchParams.toString()
    const response = await fetch(apiUrl(`/api/lookups/borrow-reservations${query ? `?${query}` : ''}`))
    if (!response.ok) {
      throw new Error('無法載入可預約品項')
    }
    const payload = (await response.json()) as BorrowReservationOption[]
    setReservationOptions(payload)
  }

  useEffect(() => {
    const loadOptions = async () => {
      try {
        await refreshReservationOptions()
      } catch {
        setLoadError('目前無法讀取可預約品項，請稍後重試。')
      }
    }
    void loadOptions()
  }, [isEditing, requestId])

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
        setStatus(payload.status ?? 'reserved')
        setMemo(payload.memo ?? '')
        setLines(
          payload.request_lines.length > 0
            ? payload.request_lines.map((line) => ({
                item_name: line.item_name ?? '',
                item_model: line.item_model ?? '',
                requested_qty: line.requested_qty,
                note: line.note ?? '',
                allocated_qty: line.allocated_qty,
                allocated_item_ids: line.allocated_item_ids,
                name_search: '',
                model_search: '',
              }))
            : [emptyLine()],
        )
      } catch {
        setLoadError('目前無法讀取借用單資料，請稍後重試。')
      }
    }

    void loadRequest()
  }, [isEditing, requestId])

  const canEditReservation = !isEditing || status === 'reserved' || status === 'expired'
  const canPickup = isEditing && (status === 'reserved' || status === 'expired')
  const canReturn = isEditing && (status === 'borrowed' || status === 'overdue')

  const totalRequestedQty = useMemo(
    () => lines.reduce((sum, line) => sum + Math.max(0, Number(line.requested_qty) || 0), 0),
    [lines],
  )
  const totalAllocatedQty = useMemo(
    () => lines.reduce((sum, line) => sum + Math.max(0, Number(line.allocated_qty) || 0), 0),
    [lines],
  )
  const pickupSelectionComplete = useMemo(
    () => pickupCandidates.every((line) => (pickupSelections[line.line_id] ?? []).length === line.requested_qty),
    [pickupCandidates, pickupSelections],
  )

  const getModelOptionsByName = (itemName: string, searchKeyword: string) => {
    const keyword = searchKeyword.trim().toLowerCase()
    return reservationOptions
      .filter((option) => option.item_name === itemName)
      .filter((option) => !keyword || option.item_model.toLowerCase().includes(keyword))
      .sort((a, b) => a.item_model.localeCompare(b.item_model))
  }

  const getFilteredNames = (searchKeyword: string) => {
    const keyword = searchKeyword.trim().toLowerCase()
    return nameOptions.filter((name) => !keyword || name.toLowerCase().includes(keyword))
  }

  const handleLineChange = (index: number, patch: Partial<BorrowLine>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)))
  }

  const handleNameChange = (index: number, nextName: string) => {
    const line = lines[index]
    const modelOptions = reservationOptions.filter((option) => option.item_name === nextName)
    const modelStillValid = modelOptions.some((option) => option.item_model === line.item_model)
    handleLineChange(index, {
      item_name: nextName,
      item_model: modelStillValid ? line.item_model : '',
      name_search: '',
      model_search: '',
    })
  }

  const getLineValidationError = () => {
    if (lines.length === 0) {
      return '請至少新增一筆預約品項。'
    }
    for (const line of lines) {
      if (!line.item_name.trim()) {
        return '請選擇品名。'
      }
      if (!line.item_model.trim()) {
        return '請選擇型號。'
      }
      if (!Number.isInteger(line.requested_qty) || line.requested_qty <= 0) {
        return '每筆預約數量需為正整數。'
      }
      if (!comboKeySet.has(`${line.item_name}__${line.item_model}`)) {
        return `品項 ${line.item_name} / ${line.item_model} 不在可選清單。`
      }
    }
    return null
  }

  const normalizeDate = (value: string) => (value ? value : null)

  const getDateValidationError = () => {
    if (borrowDate && dueDate && borrowDate > dueDate) {
      return '預計歸還日期不可早於領用日期。'
    }
    return null
  }

  const refreshCurrentRequest = async () => {
    if (!requestId) {
      return
    }
    const response = await fetch(apiUrl(`/api/borrows/${requestId}`))
    if (!response.ok) {
      return
    }
    const payload = (await response.json()) as BorrowRequest
    setReturnDate(payload.return_date ?? '')
    setStatus(payload.status ?? 'reserved')
    setLines(
      payload.request_lines.length > 0
        ? payload.request_lines.map((line) => ({
            item_name: line.item_name ?? '',
            item_model: line.item_model ?? '',
            requested_qty: line.requested_qty,
            note: line.note ?? '',
            allocated_qty: line.allocated_qty,
            allocated_item_ids: line.allocated_item_ids,
            name_search: '',
            model_search: '',
          }))
        : [emptyLine()],
    )
  }

  const getPickupItemSerialLabel = (candidate: BorrowPickupCandidateItem) => {
    return candidate.n_property_sn || candidate.property_sn || candidate.n_item_sn || candidate.item_sn || `ID ${candidate.id}`
  }

  const getSelectedItemIdsExceptLine = (lineId: number) => {
    const selectedIds = new Set<number>()
    Object.entries(pickupSelections).forEach(([rawLineId, itemIds]) => {
      if (Number(rawLineId) === lineId) {
        return
      }
      itemIds.forEach((itemId) => selectedIds.add(itemId))
    })
    return selectedIds
  }

  const togglePickupSelection = (lineId: number, itemId: number) => {
    const line = pickupCandidates.find((candidateLine) => candidateLine.line_id === lineId)
    if (!line) {
      return
    }
    setPickupSelections((prev) => {
      const current = prev[lineId] ?? []
      if (current.includes(itemId)) {
        return { ...prev, [lineId]: current.filter((id) => id !== itemId) }
      }
      if (current.length >= line.requested_qty) {
        return prev
      }
      return { ...prev, [lineId]: [...current, itemId] }
    })
  }

  const openPickupDialog = async () => {
    if (!requestId) {
      return
    }
    setFormError('')
    setShortages([])
    setPickupLoading(true)
    try {
      const response = await fetch(apiUrl(`/api/borrows/${requestId}/pickup-candidates`))
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? '無法載入可領取編號')
      }
      const payload = (await response.json()) as BorrowPickupCandidateLine[]
      if (payload.length === 0) {
        throw new Error('目前沒有可領取的預約品項')
      }
      setPickupCandidates(payload)
      setPickupSelections(Object.fromEntries(payload.map((line) => [line.line_id, []])))
      setPickupDialogOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({ icon: 'error', title: message || '無法載入可領取編號' })
    } finally {
      setPickupLoading(false)
    }
  }

  const handleSubmit = async () => {
    setFormError('')
    setShortages([])

    const validationError = getLineValidationError()
    if (validationError) {
      void toast.fire({ icon: 'error', title: validationError })
      return
    }
    const dateValidationError = getDateValidationError()
    if (dateValidationError) {
      void toast.fire({ icon: 'error', title: dateValidationError })
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
          memo,
          request_lines: lines.map((line) => ({
            item_name: line.item_name,
            item_model: line.item_model,
            requested_qty: Number(line.requested_qty),
            note: line.note,
          })),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = payload?.detail
        const shortageRows = parseShortages(detail)
        if (shortageRows.length > 0) {
          setFormError('可預約量不足，請調整預約內容。')
          setShortages(shortageRows)
          return
        }
        const detailText = typeof detail === 'string' ? detail : null
        throw new Error(detailText ?? (isEditing ? '更新預約失敗' : '建立預約失敗'))
      }

      await response.json()
      await refreshReservationOptions()
      if (isEditing) {
        void toast.fire({ icon: 'success', title: '借用預約已更新。' })
        await refreshCurrentRequest()
      } else {
        setBorrower('')
        setDepartment('')
        setPurpose('')
        setBorrowDate('')
        setDueDate('')
        setReturnDate('')
        setStatus('reserved')
        setMemo('')
        setLines([emptyLine()])
        void toast.fire({ icon: 'success', title: '借用預約已建立。' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({
        icon: 'error',
        title: message || (isEditing ? '更新預約失敗，請稍後再試。' : '建立預約失敗，請稍後再試。'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handlePickup = async () => {
    if (!requestId) {
      return
    }
    if (!pickupSelectionComplete) {
      void toast.fire({ icon: 'error', title: '請先完成每個品項的借出編號選擇。' })
      return
    }
    setFormError('')
    setShortages([])
    setSubmitting(true)
    try {
      const response = await fetch(apiUrl(`/api/borrows/${requestId}/pickup`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections: pickupCandidates.map((line) => ({
            line_id: line.line_id,
            item_ids: pickupSelections[line.line_id] ?? [],
          })),
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const shortageRows = parseShortages(payload?.detail)
        if (shortageRows.length > 0) {
          setFormError('可領取數量不足，請確認目前庫存。')
          setShortages(shortageRows)
          return
        }
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? '執行領取失敗')
      }
      await refreshReservationOptions()
      await refreshCurrentRequest()
      setPickupDialogOpen(false)
      setPickupCandidates([])
      setPickupSelections({})
      void toast.fire({ icon: 'success', title: '已完成領取並分配資產。' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({ icon: 'error', title: message || '執行領取失敗，請稍後再試。' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReturnAll = async () => {
    if (!requestId) {
      return
    }
    setFormError('')
    setShortages([])
    setSubmitting(true)
    try {
      const response = await fetch(apiUrl(`/api/borrows/${requestId}/return`), { method: 'POST' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? '全數歸還失敗')
      }
      await refreshReservationOptions()
      await refreshCurrentRequest()
      void toast.fire({ icon: 'success', title: '已完成全數歸還。' })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({ icon: 'error', title: message || '全數歸還失敗，請稍後再試。' })
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
            <Input value={borrower} onChange={(event) => setBorrower(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
          <div className="grid gap-1.5">
            <Label>單位</Label>
            <Input value={department} onChange={(event) => setDepartment(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>用途</Label>
            <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
          <div className="grid gap-1.5">
            <Label>領用日</Label>
            <Input type="date" value={borrowDate} onChange={(event) => setBorrowDate(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
          <div className="grid gap-1.5">
            <Label>預計歸還</Label>
            <Input type="date" value={dueDate} min={borrowDate || undefined} onChange={(event) => setDueDate(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
          <div className="grid gap-1.5">
            <Label>狀態</Label>
            <Input value={status || '--'} disabled />
          </div>
          <div className="grid gap-1.5">
            <Label>實際歸還</Label>
            <Input type="date" value={returnDate} disabled />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>備註</Label>
            <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="預約品項（品名 + 型號 + 數量）">
        <div className="grid gap-3">
          {lines.map((line, index) => {
            const filteredNames = getFilteredNames(line.name_search)
            const filteredModels = getModelOptionsByName(line.item_name, line.model_search)

            return (
              <article key={`borrow-line-${index}`} className="grid gap-2 rounded-lg border border-[hsl(var(--border))] p-3 md:grid-cols-[2fr,2fr,1fr,2fr,auto]">
                <div className="grid gap-1.5">
                  <Label>品名</Label>
                  <Input
                    placeholder="搜尋品名..."
                    value={line.name_search}
                    onChange={(event) => handleLineChange(index, { name_search: event.target.value })}
                    disabled={!canEditReservation || submitting}
                  />
                  <Select
                    value={line.item_name}
                    onChange={(event) => handleNameChange(index, event.target.value)}
                    disabled={!canEditReservation || submitting}
                  >
                    <option value="">請選擇品名</option>
                    {filteredNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>型號</Label>
                  <Input
                    placeholder="搜尋型號..."
                    value={line.model_search}
                    onChange={(event) => handleLineChange(index, { model_search: event.target.value })}
                    disabled={!canEditReservation || submitting || !line.item_name}
                  />
                  <Select
                    value={line.item_model}
                    onChange={(event) => handleLineChange(index, { item_model: event.target.value })}
                    disabled={!canEditReservation || submitting || !line.item_name}
                  >
                    <option value="">請選擇型號</option>
                    {filteredModels.map((option) => (
                      <option
                        key={`${option.item_name}__${option.item_model}`}
                        value={option.item_model}
                        disabled={!option.selectable && line.item_model !== option.item_model}
                      >
                        {`${option.item_model}（可預約 ${option.reservable_qty} / 在庫 ${option.available_qty} / 已預約 ${option.reserved_qty}）`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>預約數量</Label>
                  <Input
                    type="number"
                    min={1}
                    value={line.requested_qty}
                    onChange={(event) => handleLineChange(index, { requested_qty: Number(event.target.value) || 0 })}
                    disabled={!canEditReservation || submitting}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>備註</Label>
                  <Input value={line.note} onChange={(event) => handleLineChange(index, { note: event.target.value })} disabled={!canEditReservation || submitting} />
                  {isEditing ? (
                    <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">
                      已分配：{line.allocated_qty ?? 0} / {line.requested_qty}
                      {line.allocated_item_ids && line.allocated_item_ids.length > 0 ? `（ID: ${line.allocated_item_ids.join(', ')}）` : ''}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== index))}
                    disabled={!canEditReservation || submitting || lines.length <= 1}
                  >
                    移除
                  </Button>
                </div>
              </article>
            )
          })}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])} disabled={!canEditReservation || submitting}>
              新增品項
            </Button>
            <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">預約總數：{totalRequestedQty}；已分配總數：{totalAllocatedQty}</p>
          </div>
        </div>
      </SectionCard>

      {loadError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p> : null}
      {formError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="m-0 font-semibold">{formError}</p>
          {shortages.length > 0 ? (
            <ul className="mt-2 mb-0 list-disc pl-5">
              {shortages.map((row) => (
                <li key={`${row.item_name}-${row.item_model}`}>
                  {row.item_name} / {row.item_model}：需求 {row.requested_qty}，可用 {row.available_qty}，缺口 {row.shortage_qty}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || !canEditReservation}>
          {submitting ? '儲存中...' : isEditing ? '更新預約' : '建立預約'}
        </Button>
        {canPickup ? (
          <Button type="button" variant="secondary" onClick={() => void openPickupDialog()} disabled={submitting || pickupLoading}>
            {pickupLoading ? '載入中...' : '執行領取'}
          </Button>
        ) : null}
        {canReturn ? (
          <Button type="button" variant="secondary" onClick={() => void handleReturnAll()} disabled={submitting}>
            {submitting ? '處理中...' : '全數歸還'}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={pickupDialogOpen}
        onClose={() => {
          if (!submitting) {
            setPickupDialogOpen(false)
          }
        }}
        title="確認借出編號"
        description="請為每個預約品項指定實際借出的資產編號。每個編號只能使用一次。"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setPickupDialogOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="button" onClick={() => void handlePickup()} disabled={submitting || !pickupSelectionComplete}>
              {submitting ? '處理中...' : '確認領取'}
            </Button>
          </>
        }
      >
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
          {pickupCandidates.map((line) => {
            const selected = pickupSelections[line.line_id] ?? []
            const selectedByOtherLines = getSelectedItemIdsExceptLine(line.line_id)
            return (
              <div key={line.line_id} className="rounded-md border border-[hsl(var(--border))] p-3">
                <p className="m-0 text-sm font-semibold">
                  {line.item_name} / {line.item_model}
                </p>
                <p className="mt-1 mb-2 text-xs text-[hsl(var(--muted-foreground))]">
                  需選擇 {line.requested_qty} 個，目前已選 {selected.length} 個
                </p>
                <div className="grid gap-1">
                  {line.candidates.length === 0 ? (
                    <p className="m-0 text-xs text-red-700">目前無可領取資產。</p>
                  ) : (
                    line.candidates.map((candidate) => {
                      const checked = selected.includes(candidate.id)
                      const disabled = !checked && selectedByOtherLines.has(candidate.id)
                      return (
                        <label key={candidate.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled || submitting}
                            onChange={() => togglePickupSelection(line.line_id, candidate.id)}
                          />
                          <span>{getPickupItemSerialLabel(candidate)}</span>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">（ID: {candidate.id}）</span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Dialog>
    </div>
  )
}
