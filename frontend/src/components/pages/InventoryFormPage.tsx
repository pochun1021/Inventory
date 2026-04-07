import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
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

const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const labelClass = 'grid gap-1.5 font-semibold'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'

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
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">{isEditMode ? '修改財產資料' : '新增庫存資料'}</h1>
        <p className="mt-2 text-slate-500">{isEditMode ? '可編輯現有財產資訊並儲存。' : '填寫下列欄位建立新的庫存資料。'}</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {errorMessage ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{errorMessage}</p> : null}
        {successMessage ? <p className="mt-0.5 rounded-[10px] bg-emerald-50 px-3.5 py-3 text-emerald-700">{successMessage}</p> : null}

        {!loading ? (
          <form className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-4 gap-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
            <label className={labelClass}>
              資產類型
              <select className={fieldClass} value={formData.asset_type} onChange={(event) => handleInputChange('asset_type', event.target.value)}>
                {ASSET_TYPE_OPTIONS.map((assetTypeOption) => (
                  <option key={assetTypeOption.value} value={assetTypeOption.value}>
                    {assetTypeOption.label}
                  </option>
                ))}
                {!ASSET_TYPE_OPTIONS.some((assetTypeOption) => assetTypeOption.value === formData.asset_type) && formData.asset_type ? (
                  <option value={formData.asset_type}>{formData.asset_type}</option>
                ) : null}
              </select>
            </label>

            <label className={labelClass}>
              資產狀態
              <select className={fieldClass} value={formData.asset_status} onChange={(event) => handleInputChange('asset_status', event.target.value)}>
                {assetStatusOptions.map((statusOption) => (
                  <option key={statusOption.value} value={statusOption.value}>
                    {statusOption.label}
                  </option>
                ))}
                {!assetStatusOptions.some((statusOption) => statusOption.value === formData.asset_status) && formData.asset_status ? (
                  <option value={formData.asset_status}>{formData.asset_status}</option>
                ) : null}
              </select>
            </label>

            <label className={labelClass}>
              Key
              <input className={fieldClass} type="text" value={formData.key} onChange={(event) => handleInputChange('key', event.target.value)} />
            </label>

            <label className={labelClass}>
              n_property_sn
              <input className={fieldClass} type="text" value={formData.n_property_sn} onChange={(event) => handleInputChange('n_property_sn', event.target.value)} />
            </label>

            <label className={labelClass}>
              property_sn
              <input className={fieldClass} type="text" value={formData.property_sn} onChange={(event) => handleInputChange('property_sn', event.target.value)} />
            </label>

            <label className={labelClass}>
              n_item_sn
              <input className={fieldClass} type="text" value={formData.n_item_sn} onChange={(event) => handleInputChange('n_item_sn', event.target.value)} />
            </label>

            <label className={labelClass}>
              item_sn
              <input className={fieldClass} type="text" value={formData.item_sn} onChange={(event) => handleInputChange('item_sn', event.target.value)} />
            </label>

            <label className={labelClass}>
              品名
              <input className={fieldClass} type="text" value={formData.name} onChange={(event) => handleInputChange('name', event.target.value)} />
            </label>

            <label className={labelClass}>
              name_code
              <input className={fieldClass} type="text" value={formData.name_code} onChange={(event) => handleInputChange('name_code', event.target.value)} />
            </label>

            <label className={labelClass}>
              name_code2
              <input className={fieldClass} type="text" value={formData.name_code2} onChange={(event) => handleInputChange('name_code2', event.target.value)} />
            </label>

            <label className={labelClass}>
              型號
              <input className={fieldClass} type="text" value={formData.model} onChange={(event) => handleInputChange('model', event.target.value)} />
            </label>

            <label className={labelClass}>
              規格
              <input className={fieldClass} type="text" value={formData.specification} onChange={(event) => handleInputChange('specification', event.target.value)} />
            </label>

            <label className={labelClass}>
              單位
              <input className={fieldClass} type="text" value={formData.unit} onChange={(event) => handleInputChange('unit', event.target.value)} />
            </label>

            <label className={labelClass}>
              數量
              <input className={fieldClass} type="number" min={1} value={formData.count} onChange={(event) => handleCountChange(event.target.value)} />
            </label>

            <label className={labelClass}>
              購置日期
              <input className={fieldClass} type="date" value={formData.purchase_date} onChange={(event) => handleInputChange('purchase_date', event.target.value)} />
            </label>

            <label className={labelClass}>
              到期日
              <input className={fieldClass} type="date" value={formData.due_date} onChange={(event) => handleInputChange('due_date', event.target.value)} />
            </label>

            <label className={labelClass}>
              歸還日
              <input className={fieldClass} type="date" value={formData.return_date} onChange={(event) => handleInputChange('return_date', event.target.value)} />
            </label>

            <label className={labelClass}>
              放置地點
              <input className={fieldClass} type="text" value={formData.location} onChange={(event) => handleInputChange('location', event.target.value)} />
            </label>

            <label className={labelClass}>
              保管人
              <input className={fieldClass} type="text" value={formData.keeper} onChange={(event) => handleInputChange('keeper', event.target.value)} />
            </label>

            <label className={`${labelClass} col-[1/-1]`}>
              memo
              <textarea className={`${fieldClass} resize-y`} value={formData.memo} onChange={(event) => handleInputChange('memo', event.target.value)} rows={3} />
            </label>

            <label className={`${labelClass} col-[1/-1]`}>
              memo2
              <textarea className={`${fieldClass} resize-y`} value={formData.memo2} onChange={(event) => handleInputChange('memo2', event.target.value)} rows={3} />
            </label>

            {loadedItem ? (
              <div className="col-[1/-1] grid gap-2 rounded-[10px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                <div>建立時間：{formatDateTime(loadedItem.created_at)}</div>
                <div>建立者：{loadedItem.created_by || '--'}</div>
                <div>更新時間：{formatDateTime(loadedItem.updated_at)}</div>
                <div>更新者：{loadedItem.updated_by || '--'}</div>
                <div>刪除時間：{formatDateTime(loadedItem.deleted_at)}</div>
                <div>刪除者：{loadedItem.deleted_by || '--'}</div>
              </div>
            ) : null}

            <div className="col-[1/-1] flex justify-end">
              <button className={buttonClass} type="submit" disabled={submitting}>
                {submitButtonLabel}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </>
  )
}
