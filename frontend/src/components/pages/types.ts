export type DashboardPayload = {
  status: string
  data: string
  items: number
  pendingFix: number
}

export type InventoryItem = {
  id: number
  kind: string
  specification: string
  property_number: string
  name: string
  model: string
  unit: string
  purchase_date: string | null
  location: string
  memo: string
  keeper: string
}

