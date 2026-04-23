import { apiUrl } from '../../api'
import type { AiRecognitionQuotaResponse, AiSpecRecognitionResponse, ApiErrorDetail } from './types'

async function parseApiError(response: Response): Promise<string> {
  let detail: unknown = null
  try {
    const payload = (await response.json()) as { detail?: unknown }
    detail = payload.detail
  } catch {
    return `請求失敗（HTTP ${response.status}）`
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  if (detail && typeof detail === 'object') {
    const typed = detail as ApiErrorDetail
    if (typeof typed.message === 'string' && typed.message.trim()) {
      return typed.message
    }
  }
  return `請求失敗（HTTP ${response.status}）`
}

function normalizeQuotaPayload(payload: Partial<AiRecognitionQuotaResponse>): AiRecognitionQuotaResponse {
  return {
    enabled: Boolean(payload.enabled),
    provider: payload.provider || '',
    model: payload.model || '',
    quota: {
      status: payload.quota?.status || 'unknown',
      limit: payload.quota?.limit ?? null,
      remaining: payload.quota?.remaining ?? null,
      reset_at: payload.quota?.reset_at ?? null,
      source: payload.quota?.source ?? null,
    },
    message: payload.message || null,
  }
}

export async function fetchAiSpecRecognitionQuota(): Promise<AiRecognitionQuotaResponse> {
  const response = await fetch(apiUrl('/api/ai/spec-recognition/quota'))
  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }
  const payload = (await response.json()) as Partial<AiRecognitionQuotaResponse>
  return normalizeQuotaPayload(payload)
}

export async function recognizeItemSpecFromImage(file: File): Promise<AiSpecRecognitionResponse> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(apiUrl('/api/ai/spec-recognition'), {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const payload = (await response.json()) as Partial<AiSpecRecognitionResponse>
  return {
    recognized_fields: {
      name: payload.recognized_fields?.name || '',
      model: payload.recognized_fields?.model || '',
      specification: payload.recognized_fields?.specification || '',
    },
    raw_text_excerpt: payload.raw_text_excerpt || '',
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter((item): item is string => typeof item === 'string') : [],
    quota: {
      status: payload.quota?.status || 'unknown',
      limit: payload.quota?.limit ?? null,
      remaining: payload.quota?.remaining ?? null,
      reset_at: payload.quota?.reset_at ?? null,
      source: payload.quota?.source ?? null,
    },
  }
}
