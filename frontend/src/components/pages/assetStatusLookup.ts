import { apiUrl } from '../../api'
import type { AssetStatusOption } from './types'

export async function fetchAssetStatusOptions(): Promise<AssetStatusOption[]> {
  const response = await fetch(apiUrl('/api/lookups/asset-status'))
  if (!response.ok) {
    throw new Error('failed to load asset status options')
  }
  const payload = (await response.json()) as AssetStatusOption[]
  return payload.filter((option) => Boolean(option?.code?.trim()))
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
