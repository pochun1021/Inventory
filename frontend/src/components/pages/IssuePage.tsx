import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { PageHeader } from '../ui/page-header'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import type { InventoryItem, IssueRequest, PaginatedResponse } from './types'

type IssueLine = {
  item_id: number | ''
  quantity: number
  note: string
}

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
            }))
            : [emptyLine()],
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
      label: `${item.name || '未命名'} ${item.model ? `(${item.model})` : ''} ${item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn ? `｜${item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn}` : ''}`.trim(),
    }))
  }, [inventoryItems])

  const handleLineChange = (index: number, patch: Partial<IssueLine>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)))
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
      <PageHeader
        title={isEditing ? '編輯領用單' : '新增領用單'}
        description="填寫領用人與品項資訊，建立領用交易。"
      />

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
              <Input type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>備註</Label>
              <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="領用品項">
          <div className="grid gap-3">
            {lines.map((line, index) => (
              <article key={`issue-line-${index}`} className="grid gap-2 rounded-lg border border-[hsl(var(--border))] p-3 md:grid-cols-[2fr,1fr,2fr,auto]">
                <div className="grid gap-1.5">
                  <Label>品項</Label>
                  <Select
                    value={line.item_id}
                    onChange={(event) => handleLineChange(index, { item_id: event.target.value ? Number(event.target.value) : '' })}
                  >
                    <option value="">請選擇品項</option>
                    {itemOptions.map((option) => (
                      <option key={option.value} value={option.value}>
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
                    value={line.quantity}
                    onChange={(event) => handleLineChange(index, { quantity: Number(event.target.value) })}
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
              {submitting ? (isEditing ? '更新中...' : '建立中...') : (isEditing ? '更新領用單' : '建立領用單')}
            </Button>
          </div>
          {loadError ? <p className="mt-3 mb-0 text-sm text-red-600">{loadError}</p> : null}
        </SectionCard>
      </div>
    </>
  )
}
