import { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import type {
  BorrowPickupCandidateItem,
  BorrowPickupLineCandidatePage,
  BorrowPickupLineSummary,
  BorrowPickupScanResolveResponse,
  BorrowRequest,
  BorrowReservationOption,
} from './types'

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

type ScanBuffer = {
  value: string
  lastTs: number
}

const SCAN_MAX_KEY_INTERVAL_MS = 45
const SCAN_MIN_LENGTH = 4
const MAX_BORROW_RESERVATION_DAYS = 30
const BORROW_STATUS_LABEL_MAP: Record<string, string> = {
  reserved: '已預約',
  borrowed: '借出中',
  returned: '已歸還',
  overdue: '逾期',
  expired: '預約失效',
  cancelled: '已取消',
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

function parseDateInput(value: string): Date | null {
  if (!value) {
    return null
  }
  const [year, month, day] = value.split('-').map((part) => Number(part))
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDateInput(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function BorrowPage({ requestId }: BorrowPageProps) {
  const [reservationOptions, setReservationOptions] = useState<BorrowReservationOption[]>([])
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [shortages, setShortages] = useState<ShortageRow[]>([])
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false)
  const [pickupLoading, setPickupLoading] = useState(false)
  const [pickupLines, setPickupLines] = useState<BorrowPickupLineSummary[]>([])
  const [pickupExpandedLineId, setPickupExpandedLineId] = useState<number | null>(null)
  const [pickupLineCandidates, setPickupLineCandidates] = useState<Record<number, BorrowPickupLineCandidatePage>>({})
  const [pickupLineCandidatesLoading, setPickupLineCandidatesLoading] = useState<Record<number, boolean>>({})
  const [pickupCandidateKeyword, setPickupCandidateKeyword] = useState('')
  const [pickupSelections, setPickupSelections] = useState<Record<number, number[]>>({})
  const [scanInputValue, setScanInputValue] = useState('')
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

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
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const scanBufferRef = useRef<ScanBuffer>({ value: '', lastTs: 0 })
  const isEditing = Number.isInteger(requestId)
  const statusLabel = BORROW_STATUS_LABEL_MAP[status] || status || '--'

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
    () => pickupLines.length > 0 && pickupLines.every((line) => (pickupSelections[line.line_id] ?? []).length === line.requested_qty),
    [pickupLines, pickupSelections],
  )

  useEffect(() => {
    if (!pickupDialogOpen) {
      return
    }
    const timerId = window.setTimeout(() => {
      scanInputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timerId)
  }, [pickupDialogOpen, pickupExpandedLineId])

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
    if (!borrowDate) {
      return '請填寫領用日。'
    }
    if (!dueDate) {
      return '請填寫預計歸還日期。'
    }
    if (borrowDate && dueDate && borrowDate > dueDate) {
      return '預計歸還日期不可早於領用日期。'
    }
    const borrowDateValue = parseDateInput(borrowDate)
    const dueDateValue = parseDateInput(dueDate)
    if (!borrowDateValue || !dueDateValue) {
      return '日期格式錯誤，請重新選擇。'
    }
    const days = Math.floor((dueDateValue.getTime() - borrowDateValue.getTime()) / (1000 * 60 * 60 * 24))
    if (days > MAX_BORROW_RESERVATION_DAYS) {
      return `借用預約不可超過 ${MAX_BORROW_RESERVATION_DAYS} 天。`
    }
    return null
  }

  const dueDateMax = useMemo(() => {
    const borrowDateValue = parseDateInput(borrowDate)
    if (!borrowDateValue) {
      return undefined
    }
    const maxDueDate = new Date(borrowDateValue)
    maxDueDate.setUTCDate(maxDueDate.getUTCDate() + MAX_BORROW_RESERVATION_DAYS)
    return formatDateInput(maxDueDate)
  }, [borrowDate])

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

  const getPickupLineById = (lineId: number) => pickupLines.find((line) => line.line_id === lineId)

  const getPickupSelectedQty = (lineId: number) => (pickupSelections[lineId] ?? []).length

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

  const isAnyLineSelectingItem = (itemId: number) => {
    return Object.values(pickupSelections).some((ids) => ids.includes(itemId))
  }

  const mergeLineCandidateItem = (lineId: number, item: BorrowPickupCandidateItem) => {
    setPickupLineCandidates((prev) => {
      const current = prev[lineId]
      if (!current) {
        return prev
      }
      if (current.items.some((candidate) => candidate.id === item.id)) {
        return prev
      }
      return {
        ...prev,
        [lineId]: {
          ...current,
          items: [item, ...current.items],
        },
      }
    })
  }

  const togglePickupSelection = (lineId: number, itemId: number) => {
    const line = getPickupLineById(lineId)
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
      if (Object.entries(prev).some(([rawLineId, ids]) => Number(rawLineId) !== lineId && ids.includes(itemId))) {
        return prev
      }
      return { ...prev, [lineId]: [...current, itemId] }
    })
  }

  const loadPickupLineCandidates = async (lineId: number, nextKeyword: string, nextPage: number) => {
    if (!requestId) {
      return
    }
    const params = new URLSearchParams({
      page: String(nextPage),
      page_size: '50',
    })
    if (nextKeyword.trim()) {
      params.set('keyword', nextKeyword.trim())
    }
    setPickupLineCandidatesLoading((prev) => ({ ...prev, [lineId]: true }))
    try {
      const response = await fetch(apiUrl(`/api/borrows/${requestId}/pickup-lines/${lineId}/candidates?${params.toString()}`))
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? '無法載入可領取候選清單')
      }
      const payload = (await response.json()) as BorrowPickupLineCandidatePage
      setPickupLineCandidates((prev) => ({ ...prev, [lineId]: payload }))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setScanFeedback({ type: 'error', message: message || '無法載入候選清單' })
    } finally {
      setPickupLineCandidatesLoading((prev) => ({ ...prev, [lineId]: false }))
    }
  }

  const handleExpandPickupLine = async (lineId: number) => {
    setPickupExpandedLineId(lineId)
    setPickupCandidateKeyword('')
    await loadPickupLineCandidates(lineId, '', 1)
  }

  const openPickupDialog = async () => {
    if (!requestId) {
      return
    }
    setFormError('')
    setShortages([])
    setPickupLoading(true)
    try {
      const response = await fetch(apiUrl(`/api/borrows/${requestId}/pickup-lines`))
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? '無法載入可領取編號')
      }
      const payload = (await response.json()) as BorrowPickupLineSummary[]
      if (payload.length === 0) {
        throw new Error('目前沒有可領取的預約品項')
      }
      setPickupLines(payload)
      setPickupExpandedLineId(payload[0].line_id)
      setPickupLineCandidates({})
      setPickupLineCandidatesLoading({})
      setPickupCandidateKeyword('')
      setPickupSelections(Object.fromEntries(payload.map((line) => [line.line_id, []])))
      setScanInputValue('')
      setScanFeedback(null)
      scanBufferRef.current = { value: '', lastTs: 0 }
      setPickupDialogOpen(true)
      await loadPickupLineCandidates(payload[0].line_id, '', 1)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({ icon: 'error', title: message || '無法載入可領取編號' })
    } finally {
      setPickupLoading(false)
    }
  }

  const applyScanCode = async (rawCode: string) => {
    const normalizedCode = rawCode.trim()
    if (!normalizedCode || !requestId) {
      return
    }
    setScanInputValue('')
    try {
      const response = await fetch(apiUrl(`/api/borrows/${requestId}/pickup-resolve-scan`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizedCode }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const detail = typeof payload?.detail === 'string' ? payload.detail : null
        throw new Error(detail ?? `查無條碼：${rawCode}`)
      }
      const payload = (await response.json()) as BorrowPickupScanResolveResponse
      if (isAnyLineSelectingItem(payload.item.id)) {
        setScanFeedback({ type: 'info', message: `條碼 ${rawCode} 已在領取清單中。` })
        return
      }

      const eligibleLineIdSet = new Set(payload.eligible_line_ids)
      const targetLine = pickupLines.find((line) => eligibleLineIdSet.has(line.line_id) && getPickupSelectedQty(line.line_id) < line.requested_qty)
      if (!targetLine) {
        setScanFeedback({ type: 'error', message: `條碼 ${rawCode} 對應的預約列已選滿。` })
        return
      }

      setPickupSelections((prev) => ({
        ...prev,
        [targetLine.line_id]: [...(prev[targetLine.line_id] ?? []), payload.item.id],
      }))
      setPickupExpandedLineId(targetLine.line_id)
      mergeLineCandidateItem(targetLine.line_id, payload.item)
      setScanFeedback({
        type: 'success',
        message: `已加入 ${targetLine.item_name} / ${targetLine.item_model}（${getPickupItemSerialLabel(payload.item)}）`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setScanFeedback({ type: 'error', message: message || `查無條碼：${rawCode}` })
    } finally {
      setScanInputValue('')
    }
  }

  const handleScanInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now()
    const buffer = scanBufferRef.current
    const key = event.key

    if (key === 'Enter') {
      event.preventDefault()
      const scanValue = buffer.value.length >= SCAN_MIN_LENGTH ? buffer.value : scanInputValue
      buffer.value = ''
      buffer.lastTs = 0
      void applyScanCode(scanValue)
      return
    }
    if (key.length !== 1) {
      return
    }
    if (buffer.lastTs > 0 && now - buffer.lastTs > SCAN_MAX_KEY_INTERVAL_MS) {
      buffer.value = key
    } else {
      buffer.value += key
    }
    buffer.lastTs = now
  }

  const closePickupDialog = () => {
    if (submitting) {
      return
    }
    setPickupDialogOpen(false)
    setPickupLines([])
    setPickupExpandedLineId(null)
    setPickupLineCandidates({})
    setPickupLineCandidatesLoading({})
    setPickupCandidateKeyword('')
    setPickupSelections({})
    setScanInputValue('')
    setScanFeedback(null)
    scanBufferRef.current = { value: '', lastTs: 0 }
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
          selections: pickupLines.map((line) => ({
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
      closePickupDialog()
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
            <Input type="date" value={borrowDate} required onChange={(event) => setBorrowDate(event.target.value)} disabled={!canEditReservation || submitting} />
          </div>
          <div className="grid gap-1.5">
            <Label>預計歸還</Label>
            <Input
              type="date"
              value={dueDate}
              required
              min={borrowDate || undefined}
              max={dueDateMax}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={!canEditReservation || submitting}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>狀態</Label>
            <Input value={statusLabel} disabled />
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
        onClose={closePickupDialog}
        title="確認借出編號"
        description="大量清單可先掃碼，再按列檢查。每個編號只能使用一次。"
        panelClassName="max-w-6xl h-[85vh] flex flex-col"
        bodyClassName="min-h-0 flex-1 overflow-hidden"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={closePickupDialog} disabled={submitting}>
              取消
            </Button>
            <Button type="button" onClick={() => void handlePickup()} disabled={submitting || !pickupSelectionComplete}>
              {submitting ? '處理中...' : '確認領取'}
            </Button>
          </>
        }
      >
        <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[320px,1fr]">
          <div className="min-h-0 rounded-md border border-[hsl(var(--border))] p-3">
            <p className="mt-0 mb-2 text-sm font-semibold">待領取品項</p>
            <div className="grid max-h-full gap-2 overflow-y-auto">
              {pickupLines.map((line) => {
                const selectedQty = getPickupSelectedQty(line.line_id)
                const isExpanded = pickupExpandedLineId === line.line_id
                return (
                  <button
                    key={line.line_id}
                    type="button"
                    className={`grid gap-1 rounded-md border p-2 text-left ${
                      isExpanded ? 'border-[hsl(var(--primary))] bg-[hsl(var(--card-soft))]' : 'border-[hsl(var(--border))]'
                    }`}
                    onClick={() => void handleExpandPickupLine(line.line_id)}
                  >
                    <span className="text-sm font-semibold">{line.item_name} / {line.item_model}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      已選 {selectedQty} / {line.requested_qty}，候選約 {line.candidate_count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid min-h-0 gap-3">
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <Label htmlFor="borrow-pickup-scan">掃碼輸入</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="borrow-pickup-scan"
                  ref={scanInputRef}
                  value={scanInputValue}
                  onChange={(event) => setScanInputValue(event.target.value)}
                  onKeyDown={handleScanInputKeyDown}
                  placeholder="掃描條碼後按 Enter"
                  disabled={submitting}
                />
                <Button type="button" variant="secondary" onClick={() => void applyScanCode(scanInputValue)} disabled={submitting || !scanInputValue.trim()}>
                  加入
                </Button>
              </div>
              {scanFeedback ? (
                <p className={`mt-2 mb-0 text-xs ${scanFeedback.type === 'success' ? 'text-green-700' : scanFeedback.type === 'error' ? 'text-red-700' : 'text-[hsl(var(--muted-foreground))]'}`}>
                  {scanFeedback.message}
                </p>
              ) : (
                <p className="mt-2 mb-0 text-xs text-[hsl(var(--muted-foreground))]">掃碼後會自動補到第一個尚未選滿的相符預約列。</p>
              )}
            </div>

            <div className="grid min-h-0 rounded-md border border-[hsl(var(--border))] p-3">
              {pickupExpandedLineId ? (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px] flex-1">
                      <Label>候選搜尋</Label>
                      <Input
                        value={pickupCandidateKeyword}
                        onChange={(event) => setPickupCandidateKeyword(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void loadPickupLineCandidates(pickupExpandedLineId, pickupCandidateKeyword, 1)
                          }
                        }}
                        placeholder="輸入編號關鍵字後 Enter"
                        disabled={submitting}
                      />
                    </div>
                    <Button type="button" variant="secondary" onClick={() => void loadPickupLineCandidates(pickupExpandedLineId, pickupCandidateKeyword, 1)} disabled={submitting}>
                      查詢
                    </Button>
                  </div>

                  <div className="mt-3 min-h-0 overflow-y-auto">
                    {pickupLineCandidatesLoading[pickupExpandedLineId] ? (
                      <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">候選載入中...</p>
                    ) : (
                      <>
                        {(pickupLineCandidates[pickupExpandedLineId]?.items ?? []).length === 0 ? (
                          <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">目前沒有候選資料。</p>
                        ) : (
                          (pickupLineCandidates[pickupExpandedLineId]?.items ?? []).map((candidate) => {
                            const checked = (pickupSelections[pickupExpandedLineId] ?? []).includes(candidate.id)
                            const disabled = !checked && getSelectedItemIdsExceptLine(pickupExpandedLineId).has(candidate.id)
                            return (
                              <label key={candidate.id} className="mb-1 flex items-center gap-2 rounded-sm text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled || submitting}
                                  onChange={() => togglePickupSelection(pickupExpandedLineId, candidate.id)}
                                />
                                <span>{getPickupItemSerialLabel(candidate)}</span>
                                <span className="text-xs text-[hsl(var(--muted-foreground))]">（ID: {candidate.id}）</span>
                              </label>
                            )
                          })
                        )}
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
                    <span>
                      第 {pickupLineCandidates[pickupExpandedLineId]?.page ?? 1} / {pickupLineCandidates[pickupExpandedLineId]?.total_pages ?? 1} 頁，
                      共 {pickupLineCandidates[pickupExpandedLineId]?.total ?? 0} 筆
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void loadPickupLineCandidates(
                            pickupExpandedLineId,
                            pickupCandidateKeyword,
                            Math.max((pickupLineCandidates[pickupExpandedLineId]?.page ?? 1) - 1, 1),
                          )
                        }
                        disabled={submitting || (pickupLineCandidates[pickupExpandedLineId]?.page ?? 1) <= 1}
                      >
                        上一頁
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void loadPickupLineCandidates(
                            pickupExpandedLineId,
                            pickupCandidateKeyword,
                            Math.min(
                              (pickupLineCandidates[pickupExpandedLineId]?.page ?? 1) + 1,
                              pickupLineCandidates[pickupExpandedLineId]?.total_pages ?? 1,
                            ),
                          )
                        }
                        disabled={
                          submitting
                          || (pickupLineCandidates[pickupExpandedLineId]?.page ?? 1) >= (pickupLineCandidates[pickupExpandedLineId]?.total_pages ?? 1)
                        }
                      >
                        下一頁
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">請先選擇左側預約列。</p>
              )}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
