import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import type { InventoryItem } from './types'

type InventoryFormPageProps = {
  itemId?: number
}

type InventoryFormData = {
  kind: string
  property_number: string
  name: string
  model: string
  specification: string
  unit: string
  purchase_date: string
  location: string
  keeper: string
  memo: string
}

const KIND_OPTIONS = [
  { value: 'assets', label: '物品' },
  { value: 'supplies', label: '財產' },
  { value: 'other', label: '其他' },
]

const DEFAULT_FORM_DATA: InventoryFormData = {
  kind: '',
  property_number: '',
  name: '',
  model: '',
  specification: '',
  unit: '',
  purchase_date: '',
  location: '',
  keeper: '',
  memo: '',
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

function toSubmitPayload(formData: InventoryFormData) {
  return {
    ...formData,
    purchase_date: formData.purchase_date || null,
  }
}

export function InventoryFormPage({ itemId }: InventoryFormPageProps) {
  const isEditMode = typeof itemId === 'number'
  const [formData, setFormData] = useState<InventoryFormData>(DEFAULT_FORM_DATA)
  const [loading, setLoading] = useState(isEditMode)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

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
        setFormData({
          kind: item.kind || '',
          property_number: item.property_number || '',
          name: item.name || '',
          model: item.model || '',
          specification: item.specification || '',
          unit: item.unit || '',
          purchase_date: normalizeDateForInput(item.purchase_date),
          location: item.location || '',
          keeper: item.keeper || '',
          memo: item.memo || '',
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
              類別
              <select className={fieldClass} value={formData.kind} onChange={(event) => handleInputChange('kind', event.target.value)}>
                <option value="">請選擇類別</option>
                {KIND_OPTIONS.map((kindOption) => (
                  <option key={kindOption.value} value={kindOption.value}>
                    {kindOption.label}
                  </option>
                ))}
                {!KIND_OPTIONS.some((kindOption) => kindOption.value === formData.kind) && formData.kind ? (
                  <option value={formData.kind}>{formData.kind}</option>
                ) : null}
              </select>
            </label>

            <label className={labelClass}>
              財產編號
              <input
                className={fieldClass}
                type="text"
                value={formData.property_number}
                onChange={(event) => handleInputChange('property_number', event.target.value)}
              />
            </label>

            <label className={labelClass}>
              品名
              <input className={fieldClass} type="text" value={formData.name} onChange={(event) => handleInputChange('name', event.target.value)} />
            </label>

            <label className={labelClass}>
              型號
              <input className={fieldClass} type="text" value={formData.model} onChange={(event) => handleInputChange('model', event.target.value)} />
            </label>

            <label className={labelClass}>
              規格
              <input
                className={fieldClass}
                type="text"
                value={formData.specification}
                onChange={(event) => handleInputChange('specification', event.target.value)}
              />
            </label>

            <label className={labelClass}>
              單位
              <input className={fieldClass} type="text" value={formData.unit} onChange={(event) => handleInputChange('unit', event.target.value)} />
            </label>

            <label className={labelClass}>
              購置日期
              <input
                className={fieldClass}
                type="date"
                value={formData.purchase_date}
                onChange={(event) => handleInputChange('purchase_date', event.target.value)}
              />
            </label>

            <label className={labelClass}>
              放置地點
              <input
                className={fieldClass}
                type="text"
                value={formData.location}
                onChange={(event) => handleInputChange('location', event.target.value)}
              />
            </label>

            <label className={labelClass}>
              保管人
              <input
                className={fieldClass}
                type="text"
                value={formData.keeper}
                onChange={(event) => handleInputChange('keeper', event.target.value)}
              />
            </label>

            <label className={`${labelClass} col-[1/-1]`}>
              備註
              <textarea
                className={`${fieldClass} resize-y`}
                value={formData.memo}
                onChange={(event) => handleInputChange('memo', event.target.value)}
                rows={4}
              />
            </label>

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
