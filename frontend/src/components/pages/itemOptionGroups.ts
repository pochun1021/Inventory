import type { InventoryItem } from './types'

const ASSET_TYPE_LABEL_MAP: Record<string, string> = {
  '11': '財產 (11)',
  A1: '物品 (A1)',
  A2: '其他 (A2)',
}

const ASSET_TYPE_ORDER = ['11', 'A1', 'A2']

export type GroupedItemOption = {
  groupLabel: string
  options: Array<{
    value: number
    label: string
  }>
}

function itemDisplayLabel(item: InventoryItem): string {
  const serial = item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn
  return `${item.name || '未命名'} ${item.model ? `(${item.model})` : ''} ${serial ? `｜${serial}` : ''}`.trim()
}

function assetTypeSortRank(assetType: string): number {
  const rank = ASSET_TYPE_ORDER.indexOf(assetType)
  if (rank >= 0) {
    return rank
  }
  return ASSET_TYPE_ORDER.length
}

function assetTypeGroupLabel(assetType: string): string {
  const trimmed = assetType.trim()
  if (!trimmed) {
    return '未分類'
  }
  return ASSET_TYPE_LABEL_MAP[trimmed] || trimmed
}

function compareItems(left: InventoryItem, right: InventoryItem): number {
  const rankDiff = assetTypeSortRank(left.asset_type) - assetTypeSortRank(right.asset_type)
  if (rankDiff !== 0) {
    return rankDiff
  }

  const typeDiff = left.asset_type.localeCompare(right.asset_type, 'zh-TW', { numeric: true, sensitivity: 'base' })
  if (typeDiff !== 0) {
    return typeDiff
  }

  const leftName = left.name || ''
  const rightName = right.name || ''
  const nameDiff = leftName.localeCompare(rightName, 'zh-TW', { numeric: true, sensitivity: 'base' })
  if (nameDiff !== 0) {
    return nameDiff
  }

  const leftModel = left.model || ''
  const rightModel = right.model || ''
  const modelDiff = leftModel.localeCompare(rightModel, 'zh-TW', { numeric: true, sensitivity: 'base' })
  if (modelDiff !== 0) {
    return modelDiff
  }

  const leftSerial = left.n_property_sn || left.property_sn || left.n_item_sn || left.item_sn || ''
  const rightSerial = right.n_property_sn || right.property_sn || right.n_item_sn || right.item_sn || ''
  return leftSerial.localeCompare(rightSerial, 'zh-TW', { numeric: true, sensitivity: 'base' })
}

export function buildGroupedItemOptions(items: InventoryItem[]): GroupedItemOption[] {
  const sortedItems = [...items].sort(compareItems)
  const grouped = new Map<string, GroupedItemOption>()

  for (const item of sortedItems) {
    const groupLabel = assetTypeGroupLabel(item.asset_type)
    const existing = grouped.get(groupLabel)
    const option = { value: item.id, label: itemDisplayLabel(item) }
    if (!existing) {
      grouped.set(groupLabel, { groupLabel, options: [option] })
      continue
    }
    existing.options.push(option)
  }

  return Array.from(grouped.values())
}
