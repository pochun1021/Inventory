import { useEffect, useState } from 'react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { deleteGeminiTokenSettings, fetchGeminiTokenSettings, upsertGeminiTokenSettings } from './aiSettings'
import { formatDeleteErrorMessage, showDeleteErrorModal } from './deleteError'
import type { GeminiTokenSettingsResponse } from './types'

export function AiSettingsPage() {
  const [settings, setSettings] = useState<GeminiTokenSettingsResponse | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true)
      setErrorMessage('')
      try {
        const response = await fetchGeminiTokenSettings()
        setSettings(response)
        setSelectedModel(response.model || response.available_models[0] || '')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '無法讀取 Gemini token 設定。')
      } finally {
        setLoading(false)
      }
    }
    void loadSettings()
  }, [])

  const handleSave = async () => {
    const token = tokenInput.trim()
    if (!token) {
      setErrorMessage('Gemini token 不可為空。')
      setActionMessage('')
      return
    }
    if (!selectedModel.trim()) {
      setErrorMessage('請選擇 Gemini model。')
      setActionMessage('')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setActionMessage('')
    try {
      const response = await upsertGeminiTokenSettings({ token, model: selectedModel.trim() })
      setSettings(response)
      setSelectedModel(response.model || response.available_models[0] || '')
      setTokenInput('')
      setActionMessage('Gemini token 綁定成功。')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '儲存 Gemini token 失敗。')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setErrorMessage('')
    setActionMessage('')
    try {
      await deleteGeminiTokenSettings()
      setSettings((previous) =>
        previous
          ? {
              ...previous,
              bound: false,
              masked_token: null,
              available_models: previous.available_models,
              updated_at: null,
            }
          : {
              bound: false,
              masked_token: null,
              provider: 'gemini',
              model: selectedModel,
              available_models: [],
              updated_at: null,
            },
      )
      setActionMessage('Gemini token 已解除綁定。')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : formatDeleteErrorMessage('請稍後再試。', '請稍後再試。')
      await showDeleteErrorModal(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid gap-4">
      <SectionCard title="Gemini Token 綁定" description="設定 AI/OCR 規格辨識使用的 Gemini token。">
        <div className="grid gap-4">
          {loading ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">設定載入中...</p> : null}
          {!loading ? (
            <div className="grid gap-1 text-sm text-[hsl(var(--muted-foreground))]">
              <p className="m-0">{`Provider：${settings?.provider || 'gemini'}`}</p>
              <p className="m-0">{`Model：${settings?.model || '--'}`}</p>
              <p className="m-0">{`目前綁定：${settings?.bound ? '已綁定' : '未綁定'}`}</p>
              <p className="m-0">{`遮罩值：${settings?.masked_token || '--'}`}</p>
              <p className="m-0">{`最後更新：${settings?.updated_at || '--'}`}</p>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="gemini-model-select">Gemini Model</Label>
            <select
              id="gemini-model-select"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              className="h-10 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              disabled={loading || saving || deleting}
            >
              <option value="" disabled>
                請選擇模型
              </option>
              {(settings?.available_models || []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="gemini-token-input">Gemini Token</Label>
            <Input
              id="gemini-token-input"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="請輸入新的 Gemini token"
              disabled={loading || saving || deleting}
            />
            <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">儲存時會立即驗證 token，可用才會寫入。</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleSave()} disabled={loading || saving || deleting}>
              {saving ? '驗證與儲存中...' : '綁定 / 更新 Token'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={loading || saving || deleting || !settings?.bound}
            >
              {deleting ? '解除綁定中...' : '解除綁定'}
            </Button>
          </div>

          {errorMessage ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}
          {actionMessage ? <p className="m-0 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{actionMessage}</p> : null}
        </div>
      </SectionCard>
    </div>
  )
}
