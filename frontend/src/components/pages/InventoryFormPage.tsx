import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { PageHeader } from '../ui/page-header'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Textarea } from '../ui/textarea'
import { fetchAssetStatusOptions } from './assetStatusLookup'
import type { InventoryItem } from './types'

type InventoryFormPageProps = {
  itemId?: number
}

type InventoryFormData = {
  asset_type: string
  asset_status: string
  key: string
  n_property_sn: string
  property_sn: string
  n_item_sn: string
  item_sn: string
  name: string
  name_code: string
  name_code2: string
  model: string
  specification: string
  unit: string
  count: number
  purchase_date: string
  due_date: string
  return_date: string
  location: string
  memo: string
  memo2: string
  keeper: string
}

const ASSET_TYPE_OPTIONS = [
  { value: '11', label: '財產 (11)' },
  { value: 'A1', label: '物品 (A1)' },
  { value: 'A2', label: '其他 (A2)' },
]

const DEFAULT_FORM_DATA: InventoryFormData = {
  asset_type: 'A2',
  asset_status: '0',
  key: '',
  n_property_sn: '',
  property_sn: '',
  n_item_sn: '',
  item_sn: '',
  name: '',
  name_code: '',
  name_code2: '',
  model: '',
  specification: '',
  unit: '',
  count: 1,
  purchase_date: '',
  due_date: '',
  return_date: '',
  location: '',
  memo: '',
  memo2: '',
  keeper: '',
}

function normalizeDateForInput(value: string | null): string {
  if (!value) {
    return ''
  }

  if (value.includes('/')) {
    return value.replaceAll('/', '-')
  }

  return value
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('zh-TW', { hour12: false })
  }

  return value
}

function toSubmitPayload(formData: InventoryFormData) {
  const normalizedCount = Number.isFinite(formData.count) && formData.count > 0 ? Math.floor(formData.count) : 1

  return {
    ...formData,
    count: normalizedCount,
    purchase_date: formData.purchase_date || null,
    due_date: formData.due_date || null,
    return_date: formData.return_date || null,
  }
}

export function InventoryFormPage({ itemId }: InventoryFormPageProps) {
  const isEditMode = typeof itemId === 'number'
  const [formData, setFormData] = useState<InventoryFormData>(DEFAULT_FORM_DATA)
  const [loadedItem, setLoadedItem] = useState<InventoryItem | null>(null)
  const [loading, setLoading] = useState(isEditMode)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [assetStatusOptions, setAssetStatusOptions] = useState<Array<{ value: string; label: string }>>([])

  useEffect(() => {
    let cancelled = false

    const loadAssetStatusOptions = async () => {
      try {
        const options = await fetchAssetStatusOptions()
        if (cancelled) {
          return
        }
        setAssetStatusOptions(
          options.map((option) => ({
            value: option.code,
            label: `${option.description || option.code} (${option.code})`,
          })),
        )
      } catch {
        if (!cancelled) {
          setAssetStatusOptions([])
        }
      }
    }

    void loadAssetStatusOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isEditMode || !itemId) {
      return
    }

    const loadItem = async () => {
      setLoading(true)
      setErrorMessage('')

      try {
        const response = await fetch(apiUrl(`/api/items/${itemId}`))
        if (!response.ok) {
          throw new Error('無法讀取資料')
        }

        const item = (await response.json()) as InventoryItem
        setLoadedItem(item)
        setFormData({
          asset_type: item.asset_type || 'A2',
          asset_status: item.asset_status || '0',
          key: item.key || '',
          n_property_sn: item.n_property_sn || '',
          property_sn: item.property_sn || '',
          n_item_sn: item.n_item_sn || '',
          item_sn: item.item_sn || '',
          name: item.name || '',
          name_code: item.name_code || '',
          name_code2: item.name_code2 || '',
          model: item.model || '',
          specification: item.specification || '',
          unit: item.unit || '',
          count: item.count > 0 ? item.count : 1,
          purchase_date: normalizeDateForInput(item.purchase_date),
          due_date: normalizeDateForInput(item.due_date),
          return_date: normalizeDateForInput(item.return_date),
          location: item.location || '',
          memo: item.memo || '',
          memo2: item.memo2 || '',
          keeper: item.keeper || '',
        })
      } catch {
        setErrorMessage('讀取財產資料失敗，請稍後再試。')
      } finally {
        setLoading(false)
      }
    }

    void loadItem()
  }, [isEditMode, itemId])

  const submitButtonLabel = useMemo(() => {
    if (submitting) {
      return isEditMode ? '儲存中...' : '新增中...'
    }

    return isEditMode ? '儲存修改' : '新增庫存'
  }, [isEditMode, submitting])

  const handleInputChange = (field: keyof InventoryFormData, value: string) => {
    setFormData((previousData) => ({
      ...previousData,
      [field]: value,
    }))
  }

  const handleCountChange = (value: string) => {
    const nextValue = Number(value)
    setFormData((previousData) => ({
      ...previousData,
      count: Number.isFinite(nextValue) ? nextValue : 0,
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setSubmitting(true)

    try {
      const response = await fetch(apiUrl(isEditMode ? `/api/items/${itemId}` : '/api/items'), {
        method: isEditMode ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toSubmitPayload(formData)),
      })

      if (!response.ok) {
        throw new Error('送出失敗')
      }

      const savedItem = (await response.json()) as InventoryItem
      setLoadedItem(savedItem)
      setSuccessMessage(isEditMode ? '財產資料已更新。' : '庫存資料新增成功。')

      if (!isEditMode && savedItem.id) {
        window.location.href = `/inventory/edit/${savedItem.id}`
      }
    } catch {
      setErrorMessage(isEditMode ? '更新財產資料失敗，請稍後再試。' : '新增庫存資料失敗，請稍後再試。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title={isEditMode ? '編輯庫存' : '新增庫存'}
        description="以分頁分區方式維護資產資料。"
      />

      {loading ? <p className="mt-0 rounded-md bg-[hsl(var(--card-soft))] px-3 py-2 text-sm">資料載入中...</p> : null}
      {errorMessage ? <p className="mt-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-0 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}

      {!loading ? (
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">基本資料</TabsTrigger>
              <TabsTrigger value="details">補充欄位</TabsTrigger>
              <TabsTrigger value="meta">異動紀錄</TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <SectionCard>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label>資產類型</Label>
                    <Select value={formData.asset_type} onChange={(event) => handleInputChange('asset_type', event.target.value)}>
                      {ASSET_TYPE_OPTIONS.map((assetTypeOption) => (
                        <option key={assetTypeOption.value} value={assetTypeOption.value}>
                          {assetTypeOption.label}
                        </option>
                      ))}
                      {!ASSET_TYPE_OPTIONS.some((assetTypeOption) => assetTypeOption.value === formData.asset_type) && formData.asset_type ? (
                        <option value={formData.asset_type}>{formData.asset_type}</option>
                      ) : null}
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label>資產狀態</Label>
                    <Select value={formData.asset_status} onChange={(event) => handleInputChange('asset_status', event.target.value)}>
                      {assetStatusOptions.map((statusOption) => (
                        <option key={statusOption.value} value={statusOption.value}>
                          {statusOption.label}
                        </option>
                      ))}
                      {!assetStatusOptions.some((statusOption) => statusOption.value === formData.asset_status) && formData.asset_status ? (
                        <option value={formData.asset_status}>{formData.asset_status}</option>
                      ) : null}
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label>Key</Label>
                    <Input value={formData.key} onChange={(event) => handleInputChange('key', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>n_property_sn</Label>
                    <Input value={formData.n_property_sn} onChange={(event) => handleInputChange('n_property_sn', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>property_sn</Label>
                    <Input value={formData.property_sn} onChange={(event) => handleInputChange('property_sn', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>n_item_sn</Label>
                    <Input value={formData.n_item_sn} onChange={(event) => handleInputChange('n_item_sn', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>item_sn</Label>
                    <Input value={formData.item_sn} onChange={(event) => handleInputChange('item_sn', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>品名</Label>
                    <Input value={formData.name} onChange={(event) => handleInputChange('name', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>型號</Label>
                    <Input value={formData.model} onChange={(event) => handleInputChange('model', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>規格</Label>
                    <Input value={formData.specification} onChange={(event) => handleInputChange('specification', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>單位</Label>
                    <Input value={formData.unit} onChange={(event) => handleInputChange('unit', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>數量</Label>
                    <Input type="number" min={1} value={formData.count} onChange={(event) => handleCountChange(event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>購置日期</Label>
                    <Input type="date" value={formData.purchase_date} onChange={(event) => handleInputChange('purchase_date', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>到期日</Label>
                    <Input type="date" value={formData.due_date} onChange={(event) => handleInputChange('due_date', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>歸還日</Label>
                    <Input type="date" value={formData.return_date} onChange={(event) => handleInputChange('return_date', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>放置地點</Label>
                    <Input value={formData.location} onChange={(event) => handleInputChange('location', event.target.value)} />
                  </div>

                  <div className="grid gap-1.5">
                    <Label>保管人</Label>
                    <Input value={formData.keeper} onChange={(event) => handleInputChange('keeper', event.target.value)} />
                  </div>
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="details">
              <SectionCard>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>name_code</Label>
                    <Input value={formData.name_code} onChange={(event) => handleInputChange('name_code', event.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>name_code2</Label>
                    <Input value={formData.name_code2} onChange={(event) => handleInputChange('name_code2', event.target.value)} />
                  </div>
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label>memo</Label>
                    <Textarea rows={4} value={formData.memo} onChange={(event) => handleInputChange('memo', event.target.value)} />
                  </div>
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label>memo2</Label>
                    <Textarea rows={4} value={formData.memo2} onChange={(event) => handleInputChange('memo2', event.target.value)} />
                  </div>
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="meta">
              <SectionCard>
                {loadedItem ? (
                  <div className="grid gap-2 rounded-md bg-[hsl(var(--card-soft))] p-3 text-sm text-[hsl(var(--muted-foreground))] md:grid-cols-2">
                    <div>建立時間：{formatDateTime(loadedItem.created_at)}</div>
                    <div>建立者：{loadedItem.created_by || '--'}</div>
                    <div>更新時間：{formatDateTime(loadedItem.updated_at)}</div>
                    <div>更新者：{loadedItem.updated_by || '--'}</div>
                    <div>刪除時間：{formatDateTime(loadedItem.deleted_at)}</div>
                    <div>刪除者：{loadedItem.deleted_by || '--'}</div>
                  </div>
                ) : (
                  <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">新增模式尚無異動紀錄。</p>
                )}
              </SectionCard>
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 z-10 flex justify-end rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-3 backdrop-blur">
            <Button type="submit" disabled={submitting}>{submitButtonLabel}</Button>
          </div>
        </form>
      ) : null}
    </>
  )
}
