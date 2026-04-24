import { apiUrl } from '../../api'
import type { ApiErrorDetail, GeminiTokenSettingsResponse, GeminiTokenUpsertPayload } from './types'

async function parseApiError(response: Response, fallbackMessage: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null
  const detail = payload?.detail
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  if (detail && typeof detail === 'object') {
    const typed = detail as ApiErrorDetail
    if (typed.code === 'quota_exceeded') {
      return 'Gemini 配額不足，請先確認方案與 billing 後再綁定。'
    }
    if (typeof typed.message === 'string' && typed.message.trim()) {
      return typed.message
    }
  }
  return fallbackMessage
}

function normalizeTokenSettingsPayload(payload: Partial<GeminiTokenSettingsResponse>): GeminiTokenSettingsResponse {
  return {
    bound: Boolean(payload.bound),
    masked_token: payload.masked_token ?? null,
    provider: payload.provider || 'gemini',
    model: payload.model || '',
    available_models: Array.isArray(payload.available_models)
      ? payload.available_models.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    updated_at: payload.updated_at ?? null,
  }
}

export async function fetchGeminiTokenSettings(): Promise<GeminiTokenSettingsResponse> {
  const response = await fetch(apiUrl('/api/settings/ai/gemini-token'))
  if (!response.ok) {
    throw new Error(await parseApiError(response, '無法讀取 Gemini token 設定'))
  }
  const payload = (await response.json()) as Partial<GeminiTokenSettingsResponse>
  return normalizeTokenSettingsPayload(payload)
}

export async function upsertGeminiTokenSettings(payload: GeminiTokenUpsertPayload): Promise<GeminiTokenSettingsResponse> {
  const response = await fetch(apiUrl('/api/settings/ai/gemini-token'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await parseApiError(response, '儲存 Gemini token 失敗'))
  }
  const responsePayload = (await response.json()) as Partial<GeminiTokenSettingsResponse>
  return normalizeTokenSettingsPayload(responsePayload)
}

export async function deleteGeminiTokenSettings(): Promise<boolean> {
  const response = await fetch(apiUrl('/api/settings/ai/gemini-token'), { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(await parseApiError(response, '解除 Gemini token 綁定失敗'))
  }
  const payload = (await response.json()) as { deleted?: boolean }
  return Boolean(payload.deleted)
}
