import { describe, expect, it } from 'vitest'

import { extractApiErrorMessage, formatDeleteErrorMessage } from './deleteError'

describe('deleteError helpers', () => {
  it('extracts string detail', () => {
    const message = extractApiErrorMessage({ detail: 'cannot delete parent item with active detached children' }, 'fallback')
    expect(message).toBe('cannot delete parent item with active detached children')
  })

  it('extracts nested detail.message', () => {
    const message = extractApiErrorMessage({ detail: { message: 'resource is referenced' } }, 'fallback')
    expect(message).toBe('resource is referenced')
  })

  it('uses fallback when payload has no detail', () => {
    const message = extractApiErrorMessage({ error: 'bad request' }, 'fallback')
    expect(message).toBe('fallback')
  })

  it('formats delete message with prefix once', () => {
    expect(formatDeleteErrorMessage('resource is referenced', '請稍後再試。')).toBe('無法刪除：resource is referenced')
    expect(formatDeleteErrorMessage('無法刪除：resource is referenced', '請稍後再試。')).toBe(
      '無法刪除：resource is referenced',
    )
  })
})
