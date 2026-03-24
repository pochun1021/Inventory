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
