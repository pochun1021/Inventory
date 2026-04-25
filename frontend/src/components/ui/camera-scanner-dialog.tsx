import { useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from 'html5-qrcode'

import { Button } from './button'
import { Dialog } from './dialog'

type CameraScannerDialogProps = {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => Promise<void> | void
  title?: string
  description?: string
}

const DETECTION_DEDUP_WINDOW_MS = 2000

const READER_CONFIG = {
  fps: 10,
  formatsToSupport: [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
  ],
}

function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const normalized = raw.toLowerCase()

  if (normalized.includes('notallowederror') || normalized.includes('permission')) {
    return '無法啟動相機，請確認已授權瀏覽器使用相機。'
  }
  if (normalized.includes('notfounderror') || normalized.includes('no camera') || normalized.includes('camera not found')) {
    return '找不到可用相機，請改用條碼槍或手動輸入。'
  }
  return '相機啟動失敗，請稍後重試或改用手動輸入。'
}

async function stopScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) {
    return
  }
  const state = scanner.getState()
  if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
    try {
      await scanner.stop()
    } catch {
      // Best-effort cleanup.
    }
  }
  try {
    scanner.clear()
  } catch {
    // Best-effort cleanup.
  }
}

export function CameraScannerDialog({
  open,
  onClose,
  onDetected,
  title = '相機掃描',
  description = '將條碼置於框內，辨識後會自動帶入現有掃碼流程。',
}: CameraScannerDialogProps) {
  const elementId = useMemo(() => `camera-scanner-${Math.random().toString(36).slice(2, 10)}`, [])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastDetectedRef = useRef<{ code: string; ts: number } | null>(null)
  const onDetectedRef = useRef(onDetected)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    if (!open) {
      return
    }

    let active = true
    const scanner = new Html5Qrcode(elementId)
    scannerRef.current = scanner
    setLoading(true)
    setErrorMessage('')
    lastDetectedRef.current = null

    const start = async () => {
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (!active) {
          return
        }
        if (!Array.isArray(cameras) || cameras.length === 0) {
          throw new Error('camera not found')
        }

        try {
          await scanner.start(
            { facingMode: 'environment' },
            READER_CONFIG,
            (decodedText) => {
              const code = decodedText.trim()
              if (!code) {
                return
              }
              const now = Date.now()
              const last = lastDetectedRef.current
              if (last && last.code === code && now - last.ts < DETECTION_DEDUP_WINDOW_MS) {
                return
              }
              lastDetectedRef.current = { code, ts: now }
              void Promise.resolve(onDetectedRef.current(code))
            },
            () => undefined,
          )
        } catch (error) {
          const raw = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
          if (raw.includes('notallowederror') || raw.includes('permission')) {
            throw error
          }
          await scanner.start(
            { deviceId: { exact: cameras[0].id } },
            READER_CONFIG,
            (decodedText) => {
              const code = decodedText.trim()
              if (!code) {
                return
              }
              const now = Date.now()
              const last = lastDetectedRef.current
              if (last && last.code === code && now - last.ts < DETECTION_DEDUP_WINDOW_MS) {
                return
              }
              lastDetectedRef.current = { code, ts: now }
              void Promise.resolve(onDetectedRef.current(code))
            },
            () => undefined,
          )
        }
      } catch (error) {
        if (active) {
          setErrorMessage(toErrorMessage(error))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void start()

    return () => {
      active = false
      const currentScanner = scannerRef.current
      scannerRef.current = null
      void stopScanner(currentScanner)
    }
  }, [elementId, open])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      panelClassName="max-w-xl"
      actions={(
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            關閉
          </Button>
        </>
      )}
    >
      <div className="grid gap-2">
        <div id={elementId} className="min-h-[280px] overflow-hidden rounded-md border border-[hsl(var(--border))]" />
        {loading ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">相機啟動中...</p> : null}
        {errorMessage ? <p className="m-0 text-sm text-red-700">{errorMessage}</p> : null}
        {!errorMessage ? <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">若無法啟動，請改用現有條碼輸入欄位。</p> : null}
      </div>
    </Dialog>
  )
}
