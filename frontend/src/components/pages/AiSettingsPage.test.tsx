import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AiSettingsPage } from './AiSettingsPage'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setupFetchMock(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AiSettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders bound status from API', async () => {
    setupFetchMock((url) => {
      if (url.endsWith('/api/settings/ai/gemini-token')) {
        return jsonResponse({
          bound: true,
          masked_token: 'AIza******7890',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          available_models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
          updated_at: '2026-04-24 16:00:00',
        })
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<AiSettingsPage />)

    await screen.findByText('目前綁定：已綁定')
    expect(screen.getByText('遮罩值：AIza******7890')).toBeInTheDocument()
  })

  it('updates token successfully', async () => {
    setupFetchMock((url, init) => {
      if (url.endsWith('/api/settings/ai/gemini-token') && (!init?.method || init.method === 'GET')) {
        return jsonResponse({
          bound: false,
          masked_token: null,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          available_models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
          updated_at: null,
        })
      }
      if (url.endsWith('/api/settings/ai/gemini-token') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        expect(body.model).toBe('gemini-2.5-flash-lite')
        return jsonResponse({
          bound: true,
          masked_token: 'AIza******7890',
          provider: 'gemini',
          model: 'gemini-2.5-flash-lite',
          available_models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
          updated_at: '2026-04-24 16:05:00',
        })
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<AiSettingsPage />)

    await screen.findByText('目前綁定：未綁定')
    fireEvent.change(screen.getByLabelText('Gemini Model'), { target: { value: 'gemini-2.5-flash-lite' } })
    fireEvent.change(screen.getByLabelText('Gemini Token'), { target: { value: 'AIza1234567890' } })
    fireEvent.click(screen.getByRole('button', { name: '綁定 / 更新 Token' }))

    await screen.findByText('Gemini token 綁定成功。')
    expect(screen.getByText('目前綁定：已綁定')).toBeInTheDocument()
    expect(screen.getByText('Model：gemini-2.5-flash-lite')).toBeInTheDocument()
  })

  it('unbinds token successfully', async () => {
    setupFetchMock((url, init) => {
      if (url.endsWith('/api/settings/ai/gemini-token') && (!init?.method || init.method === 'GET')) {
        return jsonResponse({
          bound: true,
          masked_token: 'AIza******7890',
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          available_models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
          updated_at: '2026-04-24 16:00:00',
        })
      }
      if (url.endsWith('/api/settings/ai/gemini-token') && init?.method === 'DELETE') {
        return jsonResponse({ deleted: true })
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<AiSettingsPage />)

    await screen.findByText('目前綁定：已綁定')
    fireEvent.click(screen.getByRole('button', { name: '解除綁定' }))

    await waitFor(() => {
      expect(screen.getByText('目前綁定：未綁定')).toBeInTheDocument()
    })
    expect(screen.getByText('Gemini token 已解除綁定。')).toBeInTheDocument()
  })

  it('shows quota exceeded message and keeps unbound state', async () => {
    setupFetchMock((url, init) => {
      if (url.endsWith('/api/settings/ai/gemini-token') && (!init?.method || init.method === 'GET')) {
        return jsonResponse({
          bound: false,
          masked_token: null,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          available_models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
          updated_at: null,
        })
      }
      if (url.endsWith('/api/settings/ai/gemini-token') && init?.method === 'PUT') {
        return jsonResponse(
          {
            detail: {
              code: 'quota_exceeded',
              message: 'You exceeded your current quota.',
            },
          },
          400,
        )
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<AiSettingsPage />)

    await screen.findByText('目前綁定：未綁定')
    fireEvent.change(screen.getByLabelText('Gemini Token'), { target: { value: 'AIza1234567890' } })
    fireEvent.click(screen.getByRole('button', { name: '綁定 / 更新 Token' }))

    await screen.findByText('Gemini 配額不足，請先確認方案與 billing 後再綁定。')
    expect(screen.getByText('目前綁定：未綁定')).toBeInTheDocument()
  })
})
