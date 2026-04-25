import { apiUrl } from '../../api'
import type {
  AiRecognitionQuotaResponse,
  AiSpecRecognitionBatchResponse,
  AiSpecRecognitionResponse,
  ApiErrorDetail,
} from './types'

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

export async function recognizeItemSpecFromImages(files: File[]): Promise<AiSpecRecognitionBatchResponse> {
  const body = new FormData()
  for (const file of files) {
    body.append('files', file)
  }
  const response = await fetch(apiUrl('/api/ai/spec-recognition/batch'), {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  const payload = (await response.json()) as Partial<AiSpecRecognitionBatchResponse>
  const toFieldSource = (value: unknown) => {
    if (!value || typeof value !== 'object') {
      return null
    }
    const source = value as Partial<{ index: number; filename: string; confidence: number }>
    return {
      index: Number.isFinite(source.index) ? Number(source.index) : 0,
      filename: typeof source.filename === 'string' ? source.filename : '',
      confidence: typeof source.confidence === 'number' ? source.confidence : 0,
    }
  }
  return {
    merged_fields: {
      name: payload.merged_fields?.name || '',
      model: payload.merged_fields?.model || '',
      specification: payload.merged_fields?.specification || '',
    },
    field_sources: {
      name: toFieldSource(payload.field_sources?.name),
      model: toFieldSource(payload.field_sources?.model),
      specification: toFieldSource(payload.field_sources?.specification),
    },
    results: Array.isArray(payload.results)
      ? payload.results.map((row) => ({
          index: Number.isFinite(row.index) ? Number(row.index) : 0,
          filename: typeof row.filename === 'string' ? row.filename : '',
          recognized_fields: {
            name: row.recognized_fields?.name || '',
            model: row.recognized_fields?.model || '',
            specification: row.recognized_fields?.specification || '',
          },
          field_confidence: {
            name: typeof row.field_confidence?.name === 'number' ? row.field_confidence.name : 0,
            model: typeof row.field_confidence?.model === 'number' ? row.field_confidence.model : 0,
            specification: typeof row.field_confidence?.specification === 'number' ? row.field_confidence.specification : 0,
          },
          raw_text_excerpt: typeof row.raw_text_excerpt === 'string' ? row.raw_text_excerpt : '',
          warnings: Array.isArray(row.warnings) ? row.warnings.filter((item): item is string => typeof item === 'string') : [],
          retry_used: Boolean(row.retry_used),
        }))
      : [],
    failed_files: Array.isArray(payload.failed_files)
      ? payload.failed_files.map((row) => ({
          index: Number.isFinite(row.index) ? Number(row.index) : 0,
          filename: typeof row.filename === 'string' ? row.filename : '',
          code: typeof row.code === 'string' ? row.code : '',
          message: typeof row.message === 'string' ? row.message : '',
        }))
      : [],
    summary: {
      total: Number.isFinite(payload.summary?.total) ? Number(payload.summary?.total) : 0,
      succeeded: Number.isFinite(payload.summary?.succeeded) ? Number(payload.summary?.succeeded) : 0,
      failed: Number.isFinite(payload.summary?.failed) ? Number(payload.summary?.failed) : 0,
    },
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
