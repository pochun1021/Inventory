import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InventoryFormPage } from './InventoryFormPage'

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

function withCommonLookups(url: string): Response | null {
  if (url.endsWith('/api/lookups/asset-status')) {
    return jsonResponse([{ code: '0', description: '在庫' }])
  }
  if (url.endsWith('/api/lookups/condition-status')) {
    return jsonResponse([{ code: '0', description: '良好' }])
  }
  if (url.endsWith('/api/lookups/asset-category')) {
    return jsonResponse([{ name_code: '01', name_code2: '01', asset_category_name: '筆電', description: '一般' }])
  }
  return null
}

describe('InventoryFormPage AI recognition', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disables AI action when quota says feature disabled', async () => {
    setupFetchMock((url) => {
      const common = withCommonLookups(url)
      if (common) {
        return common
      }
      if (url.endsWith('/api/ai/spec-recognition/quota')) {
        return jsonResponse({
          enabled: false,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          quota: { status: 'unknown' },
          message: 'Gemini API key not configured',
        })
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<InventoryFormPage />)

    await screen.findByText('Gemini API key not configured')

    const runButton = screen.getByRole('button', { name: '執行 AI 辨識' })
    const fileInput = screen.getByLabelText('辨識圖片')
    expect(runButton).toBeDisabled()
    expect(fileInput).toBeDisabled()
  })

  it('fills and restores fields after recognition', async () => {
    const fetchMock = setupFetchMock((url, init) => {
      const common = withCommonLookups(url)
      if (common) {
        return common
      }
      if (url.endsWith('/api/ai/spec-recognition/quota')) {
        return jsonResponse({
          enabled: true,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          quota: { status: 'available', remaining: 1499 },
          message: null,
        })
      }
      if (url.endsWith('/api/ai/spec-recognition') && init?.method === 'POST') {
        return jsonResponse({
          recognized_fields: {
            name: '相機',
            model: 'EOS R6',
            specification: '20MP/4K',
          },
          raw_text_excerpt: 'Camera spec block',
          quota: { status: 'available', remaining: 1498 },
          warnings: ['model not confidently extracted'],
        })
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<InventoryFormPage />)

    const nameInput = await screen.findByLabelText('品名')
    const modelInput = screen.getByLabelText('型號')
    const specInput = screen.getByLabelText('規格')

    fireEvent.change(nameInput, { target: { value: '原本品名' } })
    fireEvent.change(modelInput, { target: { value: '原本型號' } })
    fireEvent.change(specInput, { target: { value: '原本規格' } })

    const file = new File(['img'], 'item.png', { type: 'image/png' })
    const fileInput = screen.getByLabelText('辨識圖片')
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: '執行 AI 辨識' }))

    await waitFor(() => {
      expect(screen.getByLabelText('品名')).toHaveValue('相機')
    })
    expect(screen.getByLabelText('型號')).toHaveValue('EOS R6')
    expect(screen.getByLabelText('規格')).toHaveValue('20MP/4K')
    expect(screen.getByText('提醒：model not confidently extracted')).toBeInTheDocument()
    expect(screen.getByText('OCR 摘要：Camera spec block')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '還原辨識前內容' }))

    expect(screen.getByLabelText('品名')).toHaveValue('原本品名')
    expect(screen.getByLabelText('型號')).toHaveValue('原本型號')
    expect(screen.getByLabelText('規格')).toHaveValue('原本規格')

    const calledRecognition = fetchMock.mock.calls.some(([input, init]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      return url.endsWith('/api/ai/spec-recognition') && init?.method === 'POST'
    })
    expect(calledRecognition).toBe(true)
  })

  it('shows API error and keeps current field values', async () => {
    setupFetchMock((url, init) => {
      const common = withCommonLookups(url)
      if (common) {
        return common
      }
      if (url.endsWith('/api/ai/spec-recognition/quota')) {
        return jsonResponse({
          enabled: true,
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          quota: { status: 'available', remaining: 1499 },
          message: null,
        })
      }
      if (url.endsWith('/api/ai/spec-recognition') && init?.method === 'POST') {
        return jsonResponse(
          {
            detail: {
              code: 'ocr_failed',
              message: '無法從圖片辨識出可用文字。',
            },
          },
          422,
        )
      }
      throw new Error(`Unhandled URL: ${url}`)
    })

    render(<InventoryFormPage />)

    const nameInput = await screen.findByLabelText('品名')
    const modelInput = screen.getByLabelText('型號')
    const specInput = screen.getByLabelText('規格')

    fireEvent.change(nameInput, { target: { value: '手動品名' } })
    fireEvent.change(modelInput, { target: { value: '手動型號' } })
    fireEvent.change(specInput, { target: { value: '手動規格' } })

    const file = new File(['img'], 'item.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('辨識圖片'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: '執行 AI 辨識' }))

    await screen.findByText('無法從圖片辨識出可用文字。')
    expect(screen.getByLabelText('品名')).toHaveValue('手動品名')
    expect(screen.getByLabelText('型號')).toHaveValue('手動型號')
    expect(screen.getByLabelText('規格')).toHaveValue('手動規格')
  })
})
