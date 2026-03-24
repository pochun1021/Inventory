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
  donated_at?: string | null
  donation_request_id?: number | null
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

export type PosCheckoutItem = {
  item_id: number
  quantity: number
  unit_price: number
  discount: number
  note: string
}

export type PosOrderItem = {
  id: number
  item_id: number
  item_name: string
  item_model: string
  quantity: number
  unit_price: number
  discount: number
  line_total: number
  note: string
}

export type PosOrder = {
  id: number
  order_no: string
  order_type: string
  customer_name: string
  operator_name: string
  purpose: string
  request_ref_type: string
  request_ref_id: number | null
  subtotal: number
  discount_total: number
  total: number
  note: string
  created_at: string | null
  items: PosOrderItem[]
}

export type PosStockBalance = {
  item_id: number
  item_name: string
  item_model: string
  quantity: number
}

export type PosStockMovement = {
  id: number
  order_id: number
  order_no: string
  item_id: number
  item_name: string
  item_model: string
  delta: number
  balance_after: number
  reason: string
  related_type: string
  related_id: number | null
  created_at: string | null
}
