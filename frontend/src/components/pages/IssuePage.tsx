import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { CameraScannerDialog } from '../ui/camera-scanner-dialog'
import { DatePicker } from '../ui/date-picker'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import {
  EMPTY_MODEL_LABEL,
  EMPTY_NAME_LABEL,
  buildItemOptions,
  buildModelOptions,
  buildNameOptions,
  decodeSelectValue,
  encodeSelectValue,
  getItemModelValue,
  getItemNameValue,
  getItemSerialLabel,
} from './itemCascadeOptions'
import type { InventoryItem, IssueRequest, PaginatedResponse } from './types'

type IssueLine = {
  item_id: number | ''
  quantity: number
  note: string
  selected_name: string | null
  selected_model: string | null
}

const emptyLine = (): IssueLine => ({ item_id: '', quantity: 1, note: '', selected_name: null, selected_model: null })
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
  const [scanCode, setScanCode] = useState('')
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false)
  const [lines, setLines] = useState<IssueLine[]>([emptyLine()])
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
              selected_name: null,
              selected_model: null,
            }))
            : [emptyLine()],
        )
      } catch {
        setLoadError('目前無法讀取領用單資料，請稍後重試。')
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

  const nameOptions = useMemo(() => buildNameOptions(selectableItems), [selectableItems])
  const selectableItemIdSet = useMemo(() => new Set(selectableItems.map((item) => item.id)), [selectableItems])
  const selectableItemMap = useMemo(() => new Map(selectableItems.map((item) => [item.id, item])), [selectableItems])

  useEffect(() => {
    setLines((prev) => {
      let changed = false
      const next = prev.map((line) => {
        if (line.item_id === '') {
          return line
        }
        const item = selectableItemMap.get(line.item_id)
        if (!item) {
          return line
        }
        const selectedName = getItemNameValue(item)
        const selectedModel = getItemModelValue(item)
        if (line.selected_name === selectedName && line.selected_model === selectedModel) {
          return line
        }
        changed = true
        return { ...line, selected_name: selectedName, selected_model: selectedModel }
      })
      return changed ? next : prev
    })
  }, [selectableItemMap])

  const handleLineChange = (index: number, patch: Partial<IssueLine>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)))
  }

  const handleNameSelectChange = (index: number, rawValue: string) => {
    const decoded = decodeSelectValue(rawValue)
    if (decoded === null) {
      handleLineChange(index, { selected_name: null, selected_model: null, item_id: '' })
      return
    }
    handleLineChange(index, { selected_name: decoded, selected_model: null, item_id: '' })
  }

  const handleModelSelectChange = (index: number, rawValue: string) => {
    const decoded = decodeSelectValue(rawValue)
    if (decoded === null) {
      handleLineChange(index, { selected_model: null, item_id: '' })
      return
    }
    handleLineChange(index, { selected_model: decoded, item_id: '' })
  }

  const handleItemSelectChange = (index: number, rawValue: string) => {
    if (!rawValue) {
      handleLineChange(index, { item_id: '' })
      return
    }

    const itemId = Number(rawValue)
    if (!Number.isInteger(itemId)) {
      return
    }
    const item = selectableItemMap.get(itemId)
    if (!item) {
      return
    }
    handleLineChange(index, {
      item_id: itemId,
      selected_name: getItemNameValue(item),
      selected_model: getItemModelValue(item),
    })
  }

  const normalizeScanCode = (value: string) => value.trim().toLowerCase()

  const getScanMatchedItems = (rawCode: string) => {
    const normalizedCode = normalizeScanCode(rawCode)
    if (!normalizedCode) {
      return []
    }
    return inventoryItems.filter((item) => {
      const serialFields = [item.n_property_sn, item.property_sn, item.n_item_sn, item.item_sn]
      return serialFields.some((serial) => normalizeScanCode(serial) === normalizedCode)
    })
  }

  const assignScannedItem = (itemId: number) => {
    const matchedItem = inventoryItems.find((item) => item.id === itemId)
    const selectedName = matchedItem ? getItemNameValue(matchedItem) : null
    const selectedModel = matchedItem ? getItemModelValue(matchedItem) : null
    setLines((prev) => {
      const emptyIndex = prev.findIndex((line) => line.item_id === '')
      if (emptyIndex >= 0) {
        return prev.map((line, index) => (
          index === emptyIndex ? { ...line, item_id: itemId, selected_name: selectedName, selected_model: selectedModel } : line
        ))
      }
      return [...prev, { ...emptyLine(), item_id: itemId, selected_name: selectedName, selected_model: selectedModel }]
    })
  }

  const getItemScanOptionLabel = (item: InventoryItem) => {
    const base = `${item.name || EMPTY_NAME_LABEL} / ${item.model || EMPTY_MODEL_LABEL}（${getItemSerialLabel(item)}）`
    if (lines.some((line) => line.item_id === item.id)) {
      return `${base} [已在單內]`
    }
    if (!selectableItemIdSet.has(item.id)) {
      return `${base} [目前不可選]`
    }
    return base
  }

  const escapeHtml = (value: string) => {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  const pickMatchedItemFromDialog = async (rawCode: string, matchedItems: InventoryItem[]) => {
    const optionsHtml = matchedItems
      .map((item, index) => (
        `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;">` +
        `<input type="radio" name="issue-scan-item" value="${item.id}" ${index === 0 ? 'checked' : ''} style="margin-top:3px;" />` +
        `<span style="white-space:normal;word-break:break-word;text-align:left;">${escapeHtml(getItemScanOptionLabel(item))}</span>` +
        `</label>`
      ))
      .join('')
    const { isConfirmed, value } = await Swal.fire({
      title: '掃碼命中多筆，請選擇品項',
      width: '48rem',
      html:
        `<p style="margin:0 0 10px 0;text-align:left;font-size:18px;line-height:1.4;">條碼：<strong>${escapeHtml(rawCode)}</strong></p>` +
        `<div style="display:grid;gap:8px;max-height:320px;overflow-y:auto;padding-right:2px;">${optionsHtml}</div>`,
      showCancelButton: true,
      confirmButtonText: '加入品項',
      cancelButtonText: '取消',
      focusConfirm: false,
      preConfirm: () => {
        const selectedInput = document.querySelector('input[name="issue-scan-item"]:checked') as HTMLInputElement | null
        if (!selectedInput || !selectedInput.value) {
          Swal.showValidationMessage('請選擇一筆品項。')
          return null
        }
        const itemId = Number(selectedInput.value)
        if (!Number.isInteger(itemId)) {
          Swal.showValidationMessage('品項選擇無效，請重試。')
          return null
        }
        if (lines.some((line) => line.item_id === itemId)) {
          Swal.showValidationMessage('所選品項已在單內。')
          return null
        }
        if (!selectableItemIdSet.has(itemId)) {
          Swal.showValidationMessage('所選品項目前不可選。')
          return null
        }
        return itemId
      },
    })
    return isConfirmed && typeof value === 'number' ? value : null
  }

  const applyScanCode = async (rawCode: string) => {
    if (!rawCode) {
      return
    }
    const matchedItems = getScanMatchedItems(rawCode)

    if (matchedItems.length === 0) {
      void toast.fire({ icon: 'error', title: `查無條碼：${rawCode}` })
      return
    }

    const targetItemId = matchedItems.length > 1
      ? await pickMatchedItemFromDialog(rawCode, matchedItems)
      : matchedItems[0].id
    if (!targetItemId) {
      return
    }

    if (lines.some((line) => line.item_id === targetItemId)) {
      void toast.fire({ icon: 'info', title: `條碼 ${rawCode} 對應品項已在單內。` })
      return
    }
    if (!selectableItemIdSet.has(targetItemId)) {
      void toast.fire({ icon: 'error', title: `條碼 ${rawCode} 對應品項目前不可選。` })
      return
    }

    assignScannedItem(targetItemId)
    void toast.fire({ icon: 'success', title: `已透過條碼加入品項（${rawCode}）。` })
  }

  const handleApplyScanCode = async () => {
    const rawCode = scanCode.trim()
    setScanCode('')
    await applyScanCode(rawCode)
  }

  const getLineValidationError = () => {
    if (lines.length === 0) {
      return '請至少新增一筆領用品項。'
    }
    if (!lines.every((line) => line.item_id !== '' && line.quantity === 1)) {
      return '單件模式下，每筆領用品項數量必須為 1。'
    }
    const pickedIds = lines.map((line) => line.item_id).filter((itemId): itemId is number => itemId !== '')
    if (new Set(pickedIds).size !== pickedIds.length) {
      return '同一張領用單不可重複選取同一品項。'
    }
    return null
  }

  const handleSubmit = async () => {
    const validationError = getLineValidationError()
    if (validationError) {
      void toast.fire({ icon: 'error', title: validationError })
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
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      void toast.fire({
        icon: 'error',
        title: message || (isEditing ? '更新領用單失敗，請稍後再試。' : '建立領用單失敗，請稍後再試。'),
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
              <Label>領用人</Label>
              <Input value={requester} onChange={(event) => setRequester(event.target.value)} />
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
              <Label>領用日期</Label>
              <DatePicker value={requestDate} onChange={setRequestDate} />
            </div>
            <div className="grid gap-1.5">
              <Label>備註</Label>
              <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="領用品項">
          <div className="mb-3 grid gap-1.5">
            <Label htmlFor="issue-scan-code">掃碼加入品項</Label>
            <div className="flex gap-2">
              <Input
                id="issue-scan-code"
                value={scanCode}
                placeholder="請掃描或輸入條碼後按 Enter"
                onChange={(event) => setScanCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleApplyScanCode()
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={() => setCameraScannerOpen(true)} disabled={submitting}>
                相機掃描
              </Button>
            </div>
          </div>
          <div className="grid gap-3">
            {lines.map((line, index) => {
              const selectedByOtherLines = new Set(
                lines
                  .filter((_, idx) => idx !== index)
                  .map((itemLine) => itemLine.item_id)
                  .filter((itemId): itemId is number => itemId !== ''),
              )
              const modelOptions = line.selected_name === null ? [] : buildModelOptions(selectableItems, line.selected_name)
              const itemOptions =
                line.selected_name === null || line.selected_model === null
                  ? []
                  : buildItemOptions(selectableItems, line.selected_name, line.selected_model)
              return (
              <article key={`issue-line-${index}`} className="grid gap-2 rounded-lg border border-[hsl(var(--border))] p-3 md:grid-cols-[1.2fr,1.2fr,1.6fr,1fr,2fr,auto]">
                <div className="grid gap-1.5">
                  <Label>品名</Label>
                  <Select
                    value={line.selected_name === null ? '' : encodeSelectValue(line.selected_name)}
                    onChange={(event) => handleNameSelectChange(index, event.target.value)}
                  >
                    <option value="">請選擇品名</option>
                    {nameOptions.map((option) => (
                      <option key={`issue-name-${option.value || '__empty__'}`} value={encodeSelectValue(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>型號</Label>
                  <Select
                    value={line.selected_model === null ? '' : encodeSelectValue(line.selected_model)}
                    onChange={(event) => handleModelSelectChange(index, event.target.value)}
                    disabled={line.selected_name === null}
                  >
                    <option value="">請選擇型號</option>
                    {modelOptions.map((option) => (
                      <option key={`issue-model-${option.value || '__empty__'}`} value={encodeSelectValue(option.value)}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>編號</Label>
                  <Select
                    value={line.item_id === '' ? '' : String(line.item_id)}
                    onChange={(event) => handleItemSelectChange(index, event.target.value)}
                    disabled={line.selected_name === null || line.selected_model === null}
                  >
                    <option value="">請選擇編號</option>
                    {itemOptions.map((option) => (
                      <option key={`issue-item-${option.value}`} value={option.value} disabled={selectedByOtherLines.has(option.value)}>
                        {option.label}
                      </option>
                    ))}
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
              {submitting ? (isEditing ? '更新中...' : '建立中...') : (isEditing ? '更新領用單' : '建立領用單')}
            </Button>
          </div>
          {loadError ? <p className="mt-3 mb-0 text-sm text-red-600">{loadError}</p> : null}
        </SectionCard>
      <CameraScannerDialog
        open={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onDetected={(code) => {
          void applyScanCode(code)
        }}
        title="領用條碼相機掃描"
        description="掃到條碼後，會直接套用到領用品項。"
      />
    </div>
  )
}
