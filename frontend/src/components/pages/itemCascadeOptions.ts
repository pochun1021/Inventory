import type { InventoryItem } from './types'

export type StringOption = {
  value: string
  label: string
}

export type ItemOption = {
  value: number
  label: string
}

export const EMPTY_NAME_LABEL = '未命名'
export const EMPTY_MODEL_LABEL = '未填型號'

const LOCALE = 'zh-TW'
const COLLATOR_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' }

export function encodeSelectValue(value: string): string {
  return `v:${encodeURIComponent(value)}`
}

export function decodeSelectValue(value: string): string | null {
  if (!value || !value.startsWith('v:')) {
    return null
  }
  return decodeURIComponent(value.slice(2))
}

export function getItemNameValue(item: InventoryItem): string {
  return item.name ?? ''
}

export function getItemModelValue(item: InventoryItem): string {
  return item.model ?? ''
}

export function getItemSerialLabel(item: InventoryItem): string {
  return item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn || `ID ${item.id}`
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, LOCALE, COLLATOR_OPTIONS)
}

function displayLabel(value: string, emptyLabel: string): string {
  return value.trim() ? value : emptyLabel
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function buildNameOptions(items: InventoryItem[]): StringOption[] {
  return uniqueValues(items.map((item) => getItemNameValue(item)))
    .sort((left, right) => compareText(displayLabel(left, EMPTY_NAME_LABEL), displayLabel(right, EMPTY_NAME_LABEL)))
    .map((value) => ({ value, label: displayLabel(value, EMPTY_NAME_LABEL) }))
}

export function buildModelOptions(items: InventoryItem[], nameValue: string): StringOption[] {
  return uniqueValues(
    items.filter((item) => getItemNameValue(item) === nameValue).map((item) => getItemModelValue(item)),
  )
    .sort((left, right) => compareText(displayLabel(left, EMPTY_MODEL_LABEL), displayLabel(right, EMPTY_MODEL_LABEL)))
    .map((value) => ({ value, label: displayLabel(value, EMPTY_MODEL_LABEL) }))
}

export function buildItemOptions(items: InventoryItem[], nameValue: string, modelValue: string): ItemOption[] {
  return items
    .filter((item) => getItemNameValue(item) === nameValue && getItemModelValue(item) === modelValue)
    .sort((left, right) => {
      const serialDiff = compareText(getItemSerialLabel(left), getItemSerialLabel(right))
      if (serialDiff !== 0) {
        return serialDiff
      }
      return left.id - right.id
    })
    .map((item) => ({ value: item.id, label: `${getItemSerialLabel(item)}（ID ${item.id}）` }))
}
