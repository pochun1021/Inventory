import Swal from 'sweetalert2'

export function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }
    if (detail && typeof detail === 'object') {
      const nestedMessage = (detail as { message?: unknown }).message
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage
      }
    }
  }
  return fallback
}

export function formatDeleteErrorMessage(reason: string, fallback: string): string {
  const resolvedReason = reason.trim() || fallback
  if (resolvedReason.startsWith('無法刪除：')) {
    return resolvedReason
  }
  return `無法刪除：${resolvedReason}`
}

export async function toDeleteErrorMessage(response: Response, fallbackReason: string): Promise<string> {
  const payload = await response.json().catch(() => null)
  const reason = extractApiErrorMessage(payload, fallbackReason)
  return formatDeleteErrorMessage(reason, fallbackReason)
}

export async function showDeleteErrorModal(message: string): Promise<void> {
  await Swal.fire({
    icon: 'error',
    title: '刪除失敗',
    text: message,
    confirmButtonText: '知道了',
  })
}
