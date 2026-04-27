import { apiUrl } from '../../api'
import { toDeleteErrorMessage } from './deleteError'
import type { AssetCategoryOption } from './types'

type AssetCategoryCreatePayload = {
  name_code: string
  asset_category_name: string
  name_code2: string
  description: string
}

type AssetCategoryUpdatePayload = {
  name_code?: string
  asset_category_name: string
  name_code2?: string
  description: string
}

async function toApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const payload = await response.json().catch(() => null)
  const detail = typeof payload?.detail === 'string' ? payload.detail : null
  return detail ?? fallbackMessage
}

export async function fetchAssetCategoryOptions(): Promise<AssetCategoryOption[]> {
  const response = await fetch(apiUrl('/api/lookups/asset-category'))
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '無法讀取資產分類設定資料'))
  }
  const payload = (await response.json()) as AssetCategoryOption[]
  return payload.filter((option) => Boolean(option?.name_code?.trim()) && Boolean(option?.name_code2?.trim()))
}

export async function createAssetCategoryOption(payload: AssetCategoryCreatePayload): Promise<AssetCategoryOption> {
  const response = await fetch(apiUrl('/api/lookups/asset-category'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '新增資產分類失敗'))
  }
  return (await response.json()) as AssetCategoryOption
}

export async function updateAssetCategoryOption(
  currentNameCode: string,
  currentNameCode2: string,
  payload: AssetCategoryUpdatePayload,
): Promise<AssetCategoryOption> {
  const response = await fetch(
    apiUrl(`/api/lookups/asset-category/${encodeURIComponent(currentNameCode)}/${encodeURIComponent(currentNameCode2)}`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '更新資產分類失敗'))
  }
  return (await response.json()) as AssetCategoryOption
}

export async function deleteAssetCategoryOption(nameCode: string, nameCode2: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/lookups/asset-category/${encodeURIComponent(nameCode)}/${encodeURIComponent(nameCode2)}`), {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await toDeleteErrorMessage(response, '請稍後再試。'))
  }
}
