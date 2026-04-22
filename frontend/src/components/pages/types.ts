export type DashboardPayload = {
  status: string
  data: string
  items: number
  pendingFix: number
  totalRecords?: number
  reservedBorrowCount?: number
  overdueBorrowCount?: number
  dueSoonBorrowCount?: number
  donatedItemsCount?: number
  itemCategoryDistribution?: Array<{ name: string; count: number }>
  recentActivities?: Array<{
    key: string
    type: '領用' | '借用' | '捐贈'
    dateLabel: string
    dateValue: number
    actor: string
    summary: string
    requestId: string
  }>
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
  condition_status: string
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
  borrower: string
  start_date: string | null
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

export type AssetCategoryOption = {
  name_code: string
  asset_category_name: string
  name_code2: string
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
  item_id?: number | null
  quantity: number
  requested_qty: number
  allocated_qty: number
  allocated_item_ids: number[]
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
  request_lines: BorrowItem[]
}

export type BorrowReservationOption = {
  item_name: string
  item_model: string
  available_qty: number
  reserved_qty: number
  reservable_qty: number
  selectable: boolean
}

export type BorrowPickupCandidateItem = {
  id: number
  n_property_sn: string
  property_sn: string
  n_item_sn: string
  item_sn: string
}

export type BorrowPickupLineSummary = {
  line_id: number
  item_name: string
  item_model: string
  requested_qty: number
  allocated_qty: number
  remaining_qty: number
  candidate_count: number
}

export type BorrowPickupCandidateLine = {
  line_id: number
  item_name: string
  item_model: string
  requested_qty: number
  allocated_qty: number
  remaining_qty: number
  candidates: BorrowPickupCandidateItem[]
}

export type BorrowPickupLineCandidatePage = {
  line_id: number
  item_name: string
  item_model: string
  requested_qty: number
  allocated_qty: number
  remaining_qty: number
  items: BorrowPickupCandidateItem[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export type BorrowPickupScanResolveResponse = {
  item: BorrowPickupCandidateItem & {
    item_name: string
    item_model: string
  }
  eligible_line_ids: number[]
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

export type MovementLedgerEntry = {
  id: number
  item_id: number
  item_name: string
  item_model: string
  from_status: string
  to_status: string
  action: string
  entity: string
  entity_id?: number | null
  operator: string
  created_at: string
}

export type OperationLogEntry = {
  id: number
  action: string
  entity: string
  entity_id?: number | null
  status: string
  detail: Record<string, unknown>
  created_at: string
}
