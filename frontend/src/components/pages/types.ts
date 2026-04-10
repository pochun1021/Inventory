export type DashboardPayload = {
  status: string
  data: string
  items: number
  pendingFix: number
}

export type PaginatedResponse<T> = {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export type InventoryItem = {
  id: number
  asset_type: string
  asset_status: string
  key: string
  n_property_sn: string
  property_sn: string
  n_item_sn: string
  item_sn: string
  specification: string
  name: string
  name_code: string
  name_code2: string
  model: string
  unit: string
  count: number
  purchase_date: string | null
  due_date: string | null
  return_date: string | null
  location: string
  memo: string
  memo2: string
  keeper: string
  created_at: string | null
  created_by: string
  updated_at: string | null
  updated_by: string
  deleted_at: string | null
  deleted_by: string
  donated_at?: string | null
  donation_request_id?: number | null
}

export type AssetStatusOption = {
  code: string
  description: string
}

export type IssueItem = {
  id: number
  item_id: number
  quantity: number
  note: string
  item_name?: string | null
  item_model?: string | null
}

export type IssueRequest = {
  id: number
  requester: string
  department: string
  purpose: string
  request_date: string | null
  memo: string
  items: IssueItem[]
}

export type BorrowItem = {
  id: number
  item_id: number
  quantity: number
  note: string
  item_name?: string | null
  item_model?: string | null
}

export type BorrowRequest = {
  id: number
  borrower: string
  department: string
  purpose: string
  borrow_date: string | null
  due_date: string | null
  return_date: string | null
  status: string
  is_due_soon: boolean
  memo: string
  items: BorrowItem[]
}

export type DonationItem = {
  id: number
  item_id: number
  quantity: number
  note: string
  item_name?: string | null
  item_model?: string | null
}

export type DonationRequest = {
  id: number
  donor: string
  department: string
  recipient: string
  purpose: string
  donation_date: string | null
  memo: string
  items: DonationItem[]
}
