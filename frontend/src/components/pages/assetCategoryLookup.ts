import { apiUrl } from '../../api'
import type { AssetCategoryOption } from './types'

export async function fetchAssetCategoryOptions(): Promise<AssetCategoryOption[]> {
  const response = await fetch(apiUrl('/api/lookups/asset-category'))
  if (!response.ok) {
    throw new Error('failed to load asset category options')
  }
  const payload = (await response.json()) as AssetCategoryOption[]
  return payload.filter((option) => Boolean(option?.name_code?.trim()) && Boolean(option?.name_code2?.trim()))
}
