import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Button } from '../ui/button'
import { DatePicker } from '../ui/date-picker'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { fetchAssetCategoryOptions } from './assetCategoryLookup'
import { fetchAiSpecRecognitionQuota, recognizeItemSpecFromImage } from './aiSpecRecognition'
import { fetchAssetStatusOptions } from './assetStatusLookup'
import { fetchConditionStatusOptions } from './conditionStatusLookup'
import type { AiRecognitionQuotaResponse, InventoryItem } from './types'

type InventoryFormPageProps = {
  itemId?: number
}

type InventoryFormData = {
  asset_type: string
  asset_status: string
  condition_status: string
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
  borrower: string
  start_date: string
}

const ASSET_TYPE_OPTIONS = [
  { value: '11', label: '財產 (11)' },
  { value: 'A1', label: '物品 (A1)' },
  { value: 'A2', label: '其他 (A2)' },
]
const DEFAULT_FORM_DATA: InventoryFormData = {
  asset_type: 'A2',
  asset_status: '0',
  condition_status: '0',
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
  borrower: '',
  start_date: '',
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
  return {
    ...formData,
    count: 1,
    purchase_date: formData.purchase_date || null,
    due_date: formData.due_date || null,
    return_date: formData.return_date || null,
    start_date: formData.start_date || null,
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
  const [conditionStatusOptions, setConditionStatusOptions] = useState<Array<{ value: string; label: string }>>([])
  const [assetCategoryOptions, setAssetCategoryOptions] = useState<
    Array<{ name_code: string; name_code2: string; asset_category_name: string; description: string }>
  >([])
  const [assetCategoryLoadError, setAssetCategoryLoadError] = useState('')
  const [aiQuotaPayload, setAiQuotaPayload] = useState<AiRecognitionQuotaResponse | null>(null)
  const [aiQuotaLoadError, setAiQuotaLoadError] = useState('')
  const [aiFile, setAiFile] = useState<File | null>(null)
  const [aiPending, setAiPending] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiWarnings, setAiWarnings] = useState<string[]>([])
  const [aiRawTextExcerpt, setAiRawTextExcerpt] = useState('')
  const [aiErrorMessage, setAiErrorMessage] = useState('')
  const [recognizedSnapshot, setRecognizedSnapshot] = useState<Pick<InventoryFormData, 'name' | 'model' | 'specification'> | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadLookupOptions = async () => {
      try {
        const [statusOptions, conditionOptions, categoryOptions] = await Promise.all([
          fetchAssetStatusOptions(),
          fetchConditionStatusOptions(),
          fetchAssetCategoryOptions(),
        ])
        if (cancelled) {
          return
        }
        setAssetStatusOptions(
          statusOptions.map((option) => ({
            value: option.code,
            label: `${option.description || option.code} (${option.code})`,
          })),
        )
        setConditionStatusOptions(
          conditionOptions.map((option) => ({
            value: option.code,
            label: `${option.description || option.code} (${option.code})`,
          })),
        )
        setAssetCategoryOptions(categoryOptions)
        setAssetCategoryLoadError('')
      } catch {
        if (!cancelled) {
          setAssetStatusOptions([])
          setConditionStatusOptions([])
          setAssetCategoryOptions([])
          setAssetCategoryLoadError('無法讀取分類設定資料，請稍後再試。')
        }
      }
    }

    void loadLookupOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadAiQuota = async () => {
      try {
        const payload = await fetchAiSpecRecognitionQuota()
        if (cancelled) {
          return
        }
        setAiQuotaPayload(payload)
        setAiQuotaLoadError('')
      } catch (error) {
        if (!cancelled) {
          setAiQuotaPayload(null)
          setAiQuotaLoadError(error instanceof Error ? error.message : '無法讀取 AI 功能狀態，請稍後再試。')
        }
      }
    }
    void loadAiQuota()
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
          condition_status: item.condition_status || '0',
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
          borrower: item.borrower || '',
          start_date: normalizeDateForInput(item.start_date),
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

  const nameCodeLabelMap = useMemo(() => {
    const labelMap = new Map<string, string>()
    for (const option of assetCategoryOptions) {
      if (!labelMap.has(option.name_code)) {
        const categoryName = option.asset_category_name?.trim()
        labelMap.set(option.name_code, categoryName ? `${option.name_code} (${categoryName})` : option.name_code)
      }
    }
    return labelMap
  }, [assetCategoryOptions])

  const nameCodeOptions = useMemo(
    () =>
      Array.from(nameCodeLabelMap.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-TW', { numeric: true, sensitivity: 'base' })),
    [nameCodeLabelMap],
  )

  const nameCode2Options = useMemo(
    () =>
      assetCategoryOptions
        .filter((option) => option.name_code === formData.name_code)
        .map((option) => ({
          value: option.name_code2,
          label: option.description?.trim() ? `${option.name_code2} (${option.description})` : option.name_code2,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-TW', { numeric: true, sensitivity: 'base' })),
    [assetCategoryOptions, formData.name_code],
  )

  const validNameCodePairSet = useMemo(
    () => new Set(assetCategoryOptions.map((option) => `${option.name_code}__${option.name_code2}`)),
    [assetCategoryOptions],
  )
  const isCategoryPairSelected = Boolean(formData.name_code.trim() && formData.name_code2.trim())
  const isCategoryPairValid = validNameCodePairSet.has(`${formData.name_code}__${formData.name_code2}`)

  const hasNameCodeOption = nameCodeOptions.some((option) => option.value === formData.name_code)
  const hasNameCode2Option = nameCode2Options.some((option) => option.value === formData.name_code2)
  const hasConditionStatusOption = conditionStatusOptions.some((option) => option.value === formData.condition_status)
  const aiEnabled = Boolean(aiQuotaPayload?.enabled)
  const aiQuotaRemainingLabel =
    aiQuotaPayload?.quota.remaining === null || aiQuotaPayload?.quota.remaining === undefined ? '未知' : String(aiQuotaPayload.quota.remaining)
  const canRunAiRecognition = aiEnabled && aiFile !== null && !aiPending

  const handleNameCodeChange = (value: string) => {
    setFormData((previousData) => {
      if (previousData.name_code === value) {
        return previousData
      }
      const hasNextNameCode2 = assetCategoryOptions.some(
        (option) => option.name_code === value && option.name_code2 === previousData.name_code2,
      )
      return {
        ...previousData,
        name_code: value,
        name_code2: hasNextNameCode2 ? previousData.name_code2 : '',
      }
    })
  }

  const handleAiFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setAiFile(file)
    setAiErrorMessage('')
    setAiMessage('')
    setAiWarnings([])
    setAiRawTextExcerpt('')
  }

  const handleRecognizeSpec = async () => {
    if (!canRunAiRecognition || !aiFile) {
      return
    }
    setAiPending(true)
    setAiErrorMessage('')
    setAiMessage('')
    setAiWarnings([])
    setAiRawTextExcerpt('')

    try {
      const response = await recognizeItemSpecFromImage(aiFile)
      setRecognizedSnapshot({
        name: formData.name,
        model: formData.model,
        specification: formData.specification,
      })
      setFormData((previousData) => ({
        ...previousData,
        name: response.recognized_fields.name,
        model: response.recognized_fields.model,
        specification: response.recognized_fields.specification,
      }))
      setAiWarnings(response.warnings)
      setAiRawTextExcerpt(response.raw_text_excerpt)
      setAiMessage('辨識完成，已覆寫品名、型號與規格欄位。')
      setAiQuotaPayload((previousPayload) => {
        if (!previousPayload) {
          return {
            enabled: true,
            provider: '',
            model: '',
            quota: response.quota,
            message: null,
          }
        }
        return {
          ...previousPayload,
          quota: response.quota,
        }
      })
    } catch (error) {
      setAiErrorMessage(error instanceof Error ? error.message : 'AI 辨識失敗，請稍後再試。')
    } finally {
      setAiPending(false)
    }
  }

  const handleRestoreRecognizedFields = () => {
    if (!recognizedSnapshot) {
      return
    }
    setFormData((previousData) => ({
      ...previousData,
      name: recognizedSnapshot.name,
      model: recognizedSnapshot.model,
      specification: recognizedSnapshot.specification,
    }))
    setRecognizedSnapshot(null)
    setAiMessage('已還原辨識前的欄位內容。')
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    if (assetCategoryLoadError || assetCategoryOptions.length === 0) {
      setErrorMessage('分類設定尚未就緒，暫時無法送出。')
      return
    }
    if (!isCategoryPairSelected) {
      setErrorMessage('請選擇主分類與次分類。')
      return
    }
    if (!isCategoryPairValid) {
      setErrorMessage('主分類與次分類不是合法組合，請重新選擇。')
      return
    }

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
      {loading ? <p className="mt-0 rounded-md bg-[hsl(var(--card-soft))] px-3 py-2 text-sm">資料載入中...</p> : null}
      {errorMessage ? <p className="mt-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-0 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p> : null}

      {!loading ? (
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <SectionCard>
            <h2 className="m-0 text-base font-semibold">識別資料</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="m-0 text-base font-semibold">狀態資料</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                <Label>物料狀況</Label>
                <Select value={formData.condition_status} onChange={(event) => handleInputChange('condition_status', event.target.value)}>
                  {conditionStatusOptions.map((conditionStatusOption) => (
                    <option key={conditionStatusOption.value} value={conditionStatusOption.value}>
                      {conditionStatusOption.label}
                    </option>
                  ))}
                  {!hasConditionStatusOption && formData.condition_status ? (
                    <option value={formData.condition_status}>{formData.condition_status}</option>
                  ) : null}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>數量</Label>
                <Input type="number" min={1} max={1} value={1} disabled />
                {loadedItem && loadedItem.count > 1 ? (
                  <p className="m-0 text-xs text-amber-700">此筆為歷史資料（count &gt; 1），目前單件模式僅允許新異動固定為 1。</p>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="m-0 text-base font-semibold">基本資料</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] p-3 md:col-span-2 xl:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-sm font-semibold">AI/OCR 規格辨識</p>
                  <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">
                    {`Provider: ${aiQuotaPayload?.provider || '--'} ｜ Model: ${aiQuotaPayload?.model || '--'} ｜ Remaining: ${aiQuotaRemainingLabel}`}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                  <div className="grid gap-1">
                    <Label htmlFor="ai-spec-image-file">辨識圖片</Label>
                    <Input
                      id="ai-spec-image-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAiFileChange}
                      disabled={!aiEnabled || aiPending}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="md:self-end"
                    disabled={!canRunAiRecognition}
                    onClick={() => void handleRecognizeSpec()}
                  >
                    {aiPending ? '辨識中...' : '執行 AI 辨識'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="md:self-end"
                    disabled={!recognizedSnapshot || aiPending}
                    onClick={handleRestoreRecognizedFields}
                  >
                    還原辨識前內容
                  </Button>
                </div>
                {aiQuotaLoadError ? <p className="m-0 text-xs text-red-700">{aiQuotaLoadError}</p> : null}
                {!aiEnabled && !aiQuotaLoadError ? (
                  <p className="m-0 text-xs text-amber-700">{aiQuotaPayload?.message || 'AI 功能尚未啟用，請改用手動填寫。'}</p>
                ) : null}
                {aiMessage ? <p className="m-0 text-xs text-emerald-700">{aiMessage}</p> : null}
                {aiErrorMessage ? <p className="m-0 text-xs text-red-700">{aiErrorMessage}</p> : null}
                {aiWarnings.length > 0 ? (
                  <p className="m-0 text-xs text-amber-700">{`提醒：${aiWarnings.join('；')}`}</p>
                ) : null}
                {aiRawTextExcerpt ? (
                  <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">{`OCR 摘要：${aiRawTextExcerpt}`}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inventory-name">品名</Label>
                <Input id="inventory-name" value={formData.name} onChange={(event) => handleInputChange('name', event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inventory-model">型號</Label>
                <Input id="inventory-model" value={formData.model} onChange={(event) => handleInputChange('model', event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inventory-specification">規格</Label>
                <Input
                  id="inventory-specification"
                  value={formData.specification}
                  onChange={(event) => handleInputChange('specification', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>單位</Label>
                <Input value={formData.unit} onChange={(event) => handleInputChange('unit', event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>購置日期</Label>
                <DatePicker value={formData.purchase_date} onChange={(value) => handleInputChange('purchase_date', value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>name_code</Label>
                <Select
                  value={formData.name_code}
                  onChange={(event) => handleNameCodeChange(event.target.value)}
                  disabled={Boolean(assetCategoryLoadError) || assetCategoryOptions.length === 0}
                >
                  <option value="">請選擇主分類</option>
                  {nameCodeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {!hasNameCodeOption && formData.name_code ? (
                    <option value={formData.name_code}>{`${formData.name_code}（目前值，不在設定清單）`}</option>
                  ) : null}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>name_code2</Label>
                <Select
                  value={formData.name_code2}
                  onChange={(event) => handleInputChange('name_code2', event.target.value)}
                  disabled={Boolean(assetCategoryLoadError) || !formData.name_code}
                >
                  <option value="">{formData.name_code ? '請選擇次分類' : '請先選擇主分類'}</option>
                  {nameCode2Options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {!hasNameCode2Option && formData.name_code2 ? (
                    <option value={formData.name_code2}>{`${formData.name_code2}（目前值，不在設定清單）`}</option>
                  ) : null}
                </Select>
              </div>
              {assetCategoryLoadError ? <p className="m-0 text-xs text-red-700">{assetCategoryLoadError}</p> : null}
              {isCategoryPairSelected && !isCategoryPairValid ? (
                <p className="m-0 text-xs text-amber-700">目前資料的主分類/次分類不在分類設定清單，請改為合法組合後再儲存。</p>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="m-0 text-base font-semibold">管理資料</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="grid gap-1.5">
                <Label>放置地點</Label>
                <Input value={formData.location} onChange={(event) => handleInputChange('location', event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>保管人</Label>
                <Input value={formData.keeper} onChange={(event) => handleInputChange('keeper', event.target.value)} />
              </div>
              <div className="grid gap-1.5 md:col-span-2 xl:col-span-3">
                <Label>memo</Label>
                <Textarea rows={4} value={formData.memo} onChange={(event) => handleInputChange('memo', event.target.value)} />
              </div>
              <div className="grid gap-1.5 md:col-span-2 xl:col-span-3">
                <Label>memo2</Label>
                <Textarea rows={4} value={formData.memo2} onChange={(event) => handleInputChange('memo2', event.target.value)} />
              </div>
            </div>
          </SectionCard>

          {isEditMode ? (
            <SectionCard>
              <h2 className="m-0 text-base font-semibold">借用資訊（唯讀）</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>借用人</Label>
                  <Input value={formData.borrower || '--'} readOnly disabled />
                </div>
                <div className="grid gap-1.5">
                  <Label>起始日期</Label>
                  <DatePicker value={formData.start_date} onChange={() => undefined} disabled placeholder="--" />
                </div>
                <div className="grid gap-1.5">
                  <Label>到期日</Label>
                  <DatePicker value={formData.due_date} onChange={() => undefined} disabled placeholder="--" />
                </div>
                <div className="grid gap-1.5">
                  <Label>歸還日</Label>
                  <DatePicker value={formData.return_date} onChange={() => undefined} disabled placeholder="--" />
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard>
            <h2 className="m-0 text-base font-semibold">異動紀錄</h2>
            <div className="mt-3">
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
            </div>
          </SectionCard>

          <SectionCard>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting || Boolean(assetCategoryLoadError)}>
                {submitButtonLabel}
              </Button>
            </div>
          </SectionCard>
        </form>
      ) : null}
    </>
  )
}
