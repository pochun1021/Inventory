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
      <section className="dashboard-header">
        <h1>{isEditMode ? '修改財產資料' : '新增庫存資料'}</h1>
        <p className="subtitle">{isEditMode ? '可編輯現有財產資訊並儲存。' : '填寫下列欄位建立新的庫存資料。'}</p>
      </section>

      <section className="list-card">
        {loading ? <p className="message">資料載入中...</p> : null}
        {errorMessage ? <p className="message error">{errorMessage}</p> : null}
        {successMessage ? <p className="message success">{successMessage}</p> : null}

        {!loading ? (
          <form className="inventory-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              類別
              <select value={formData.kind} onChange={(event) => handleInputChange('kind', event.target.value)}>
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

            <label>
              財產編號
              <input
                type="text"
                value={formData.property_number}
                onChange={(event) => handleInputChange('property_number', event.target.value)}
              />
            </label>

            <label>
              品名
              <input type="text" value={formData.name} onChange={(event) => handleInputChange('name', event.target.value)} />
            </label>

            <label>
              型號
              <input type="text" value={formData.model} onChange={(event) => handleInputChange('model', event.target.value)} />
            </label>

            <label>
              規格
              <input
                type="text"
                value={formData.specification}
                onChange={(event) => handleInputChange('specification', event.target.value)}
              />
            </label>

            <label>
              單位
              <input type="text" value={formData.unit} onChange={(event) => handleInputChange('unit', event.target.value)} />
            </label>

            <label>
              購置日期
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(event) => handleInputChange('purchase_date', event.target.value)}
              />
            </label>

            <label>
              放置地點
              <input
                type="text"
                value={formData.location}
                onChange={(event) => handleInputChange('location', event.target.value)}
              />
            </label>

            <label>
              保管人
              <input
                type="text"
                value={formData.keeper}
                onChange={(event) => handleInputChange('keeper', event.target.value)}
              />
            </label>

            <label>
              備註
              <textarea
                value={formData.memo}
                onChange={(event) => handleInputChange('memo', event.target.value)}
                rows={4}
              />
            </label>

            <div className="inventory-form-actions">
              <button type="submit" disabled={submitting}>
                {submitButtonLabel}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </>
  )
}
