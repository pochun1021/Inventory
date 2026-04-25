import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState, Html5QrcodeSupportedFormats } from 'html5-qrcode'

import { Button } from './button'
import { Dialog } from './dialog'
import { Label } from './label'
import { Select } from './select'

type ScanMode = 'single' | 'continuous'
type CameraDevice = {
  id: string
  label: string
}

type CameraScannerDialogProps = {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => Promise<void> | void
  title?: string
  description?: string
  defaultMode?: ScanMode
  allowModeSwitch?: boolean
  preferAutoCamera?: boolean
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
  if (normalized.includes('notreadableerror') || normalized.includes('trackstarterror') || normalized.includes('could not start video source')) {
    return '相機可能被其他程式占用，請關閉其他相機程式後重試。'
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
  defaultMode = 'single',
  allowModeSwitch = true,
  preferAutoCamera = true,
}: CameraScannerDialogProps) {
  const elementId = useMemo(() => `camera-scanner-${Math.random().toString(36).slice(2, 10)}`, [])
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [scanMode, setScanMode] = useState<ScanMode>(defaultMode)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastDetectedRef = useRef<{ code: string; ts: number } | null>(null)
  const onDetectedRef = useRef(onDetected)
  const scanModeRef = useRef<ScanMode>(defaultMode)
  const sessionRef = useRef(0)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    setScanMode(defaultMode)
  }, [defaultMode, open])

  useEffect(() => {
    scanModeRef.current = scanMode
  }, [scanMode])

  const pickPreferredCameraId = useCallback((devices: CameraDevice[]) => {
    const rearCamera = devices.find((device) => {
      const label = device.label.toLowerCase()
      return label.includes('back') || label.includes('rear') || label.includes('environment')
    })
    return (rearCamera ?? devices[0]).id
  }, [])

  const startScanner = useCallback(async ({
    scanner,
    devices,
    explicitCameraId,
  }: {
    scanner: Html5Qrcode
    devices: CameraDevice[]
    explicitCameraId?: string
  }) => {
    const preferredId = explicitCameraId || pickPreferredCameraId(devices)
    setSelectedCameraId(preferredId)

    const onSuccess = (decodedText: string) => {
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
      if (scanModeRef.current === 'single') {
        onClose()
      }
    }

    if (explicitCameraId) {
      await scanner.start({ deviceId: { exact: explicitCameraId } }, READER_CONFIG, onSuccess, () => undefined)
      return
    }

    if (preferAutoCamera && preferredId) {
      await scanner.start({ deviceId: { exact: preferredId } }, READER_CONFIG, onSuccess, () => undefined)
      return
    }

    try {
      await scanner.start({ facingMode: 'environment' }, READER_CONFIG, onSuccess, () => undefined)
    } catch {
      await scanner.start({ deviceId: { exact: preferredId } }, READER_CONFIG, onSuccess, () => undefined)
    }
  }, [onClose, pickPreferredCameraId, preferAutoCamera])

  const restartScanner = useCallback(async (explicitCameraId?: string) => {
    const scanner = scannerRef.current
    if (!scanner || !open) {
      return
    }
    const currentSession = ++sessionRef.current
    setLoading(true)
    setErrorMessage('')
    lastDetectedRef.current = null
    try {
      const devices = (await Html5Qrcode.getCameras()) as CameraDevice[]
      if (currentSession !== sessionRef.current) {
        return
      }
      if (!Array.isArray(devices) || devices.length === 0) {
        throw new Error('camera not found')
      }
      setCameras(devices)
      await stopScanner(scanner)
      await startScanner({ scanner, devices, explicitCameraId })
    } catch (error) {
      if (currentSession === sessionRef.current) {
        setErrorMessage(toErrorMessage(error))
      }
    } finally {
      if (currentSession === sessionRef.current) {
        setLoading(false)
      }
    }
  }, [open, startScanner])

  useEffect(() => {
    if (!open) {
      return
    }

    const scanner = new Html5Qrcode(elementId)
    scannerRef.current = scanner
    void restartScanner()

    return () => {
      sessionRef.current += 1
      setCameras([])
      setSelectedCameraId('')
      const currentScanner = scannerRef.current
      scannerRef.current = null
      void stopScanner(currentScanner)
    }
  }, [elementId, open, restartScanner])

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
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${elementId}-camera-select`}>鏡頭來源</Label>
            <Select
              id={`${elementId}-camera-select`}
              value={selectedCameraId}
              disabled={loading || cameras.length === 0}
              onChange={(event) => {
                const cameraId = event.target.value
                setSelectedCameraId(cameraId)
                void restartScanner(cameraId)
              }}
            >
              {cameras.length === 0 ? <option value="">無可用鏡頭</option> : null}
              {cameras.map((camera, index) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `鏡頭 ${index + 1}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${elementId}-mode-select`}>掃描模式</Label>
            <Select
              id={`${elementId}-mode-select`}
              value={scanMode}
              disabled={!allowModeSwitch}
              onChange={(event) => {
                setScanMode(event.target.value as ScanMode)
              }}
            >
              <option value="single">單次掃描（成功後關閉）</option>
              <option value="continuous">連續掃描（保持開啟）</option>
            </Select>
          </div>
        </div>
        <div id={elementId} className="min-h-[280px] overflow-hidden rounded-md border border-[hsl(var(--border))]" />
        {loading ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">相機啟動中...</p> : null}
        {errorMessage ? <p className="m-0 text-sm text-red-700">{errorMessage}</p> : null}
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]">
            若無法啟動，請改用現有條碼輸入欄位。
          </p>
          <Button type="button" variant="secondary" onClick={() => void restartScanner(selectedCameraId || undefined)} disabled={loading}>
            重新啟動相機
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
