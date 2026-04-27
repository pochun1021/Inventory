import { apiUrl } from '../../api'
import { toDeleteErrorMessage } from './deleteError'
import type { ConditionStatusOption } from './types'

type ConditionStatusCreatePayload = {
  code: string
  description: string
}

type ConditionStatusUpdatePayload = {
  code?: string
  description: string
}

async function toApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const payload = await response.json().catch(() => null)
  const detail = typeof payload?.detail === 'string' ? payload.detail : null
  return detail ?? fallbackMessage
}

export async function fetchConditionStatusOptions(): Promise<ConditionStatusOption[]> {
  const response = await fetch(apiUrl('/api/lookups/condition-status'))
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '無法讀取物品狀況設定資料'))
  }
  const payload = (await response.json()) as ConditionStatusOption[]
  return payload.filter((option) => Boolean(option?.code?.trim()))
}

export async function createConditionStatusOption(payload: ConditionStatusCreatePayload): Promise<ConditionStatusOption> {
  const response = await fetch(apiUrl('/api/lookups/condition-status'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '新增物品狀況失敗'))
  }
  return (await response.json()) as ConditionStatusOption
}

export async function updateConditionStatusOption(
  currentCode: string,
  payload: ConditionStatusUpdatePayload,
): Promise<ConditionStatusOption> {
  const response = await fetch(apiUrl(`/api/lookups/condition-status/${encodeURIComponent(currentCode)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await toApiErrorMessage(response, '更新物品狀況失敗'))
  }
  return (await response.json()) as ConditionStatusOption
}

export async function deleteConditionStatusOption(code: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/lookups/condition-status/${encodeURIComponent(code)}`), {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await toDeleteErrorMessage(response, '請稍後再試。'))
  }
}
