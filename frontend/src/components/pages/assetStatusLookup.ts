import { apiUrl } from '../../api'
import type { AssetStatusOption } from './types'

type AssetStatusCreatePayload = {
  code: string
  description: string
}

type AssetStatusUpdatePayload = {
  code?: string
  description: string
}

async function toApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const payload = await response.json().catch(() => null)
  const detail = typeof payload?.detail === 'string' ? payload.detail : null
  return detail ?? fallbackMessage
}

export async function fetchAssetStatusOptions(): Promise<AssetStatusOption[]> {
  const response = await fetch(apiUrl('/api/lookups/asset-status'))
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '無法讀取資產狀態主檔'))
  }
  const payload = (await response.json()) as AssetStatusOption[]
  return payload.filter((option) => Boolean(option?.code?.trim()))
}

export async function createAssetStatusOption(payload: AssetStatusCreatePayload): Promise<AssetStatusOption> {
  const response = await fetch(apiUrl('/api/lookups/asset-status'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '新增資產狀態失敗'))
  }
  return (await response.json()) as AssetStatusOption
}

export async function updateAssetStatusOption(currentCode: string, payload: AssetStatusUpdatePayload): Promise<AssetStatusOption> {
  const response = await fetch(apiUrl(`/api/lookups/asset-status/${encodeURIComponent(currentCode)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '更新資產狀態失敗'))
  }
  return (await response.json()) as AssetStatusOption
}

export async function deleteAssetStatusOption(code: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/lookups/asset-status/${encodeURIComponent(code)}`), {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '刪除資產狀態失敗'))
  }
}

export function buildAssetStatusLabelMap(options: AssetStatusOption[]): Record<string, string> {
  return options.reduce<Record<string, string>>((accumulator, option) => {
    const code = option.code?.trim()
    if (!code) {
      return accumulator
    }
    accumulator[code] = option.description?.trim() || code
    return accumulator
  }, {})
}

export function toAssetStatusLabel(assetStatusCode: string, assetStatusLabelMap: Record<string, string>): string {
  const normalizedCode = assetStatusCode?.trim()
  if (!normalizedCode) {
    return '--'
  }
  return assetStatusLabelMap[normalizedCode] ?? normalizedCode
}
