import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CameraScannerDialog } from './camera-scanner-dialog'

const mocks = vi.hoisted(() => ({
  scannerStartMock: vi.fn(),
  scannerStopMock: vi.fn(),
  scannerClearMock: vi.fn(),
  scannerGetStateMock: vi.fn(),
  getCamerasMock: vi.fn(),
  successCallback: null as ((decodedText: string) => void) | null,
}))

vi.mock('html5-qrcode', () => {
  class MockHtml5Qrcode {
    static getCameras = mocks.getCamerasMock

    constructor() {}

    start = mocks.scannerStartMock.mockImplementation(
      async (_cameraConfig: unknown, _config: unknown, onSuccess: (decodedText: string) => void) => {
        mocks.successCallback = onSuccess
      },
    )
    stop = mocks.scannerStopMock
    clear = mocks.scannerClearMock
    getState = mocks.scannerGetStateMock
  }

  return {
    Html5Qrcode: MockHtml5Qrcode,
    Html5QrcodeScannerState: {
      NOT_STARTED: 1,
      SCANNING: 2,
      PAUSED: 3,
    },
    Html5QrcodeSupportedFormats: {
      QR_CODE: 0,
      CODE_128: 1,
      EAN_13: 2,
      EAN_8: 3,
    },
  }
})

describe('CameraScannerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.successCallback = null
    mocks.scannerGetStateMock.mockReturnValue(2)
    mocks.scannerStopMock.mockResolvedValue(undefined)
    mocks.scannerClearMock.mockImplementation(() => undefined)
    mocks.scannerStartMock.mockImplementation(async (...args: unknown[]) => {
      const onSuccess = args[2] as ((decodedText: string) => void) | undefined
      if (onSuccess) {
        mocks.successCallback = onSuccess
      }
    })
    mocks.getCamerasMock.mockResolvedValue([{ id: 'camera-1', label: 'Back Camera' }])
  })

  it('starts scanner when open and cleans up when closed', async () => {
    const onDetected = vi.fn()
    const onClose = vi.fn()
    const { rerender } = render(<CameraScannerDialog open={true} onClose={onClose} onDetected={onDetected} />)

    await waitFor(() => {
      expect(mocks.scannerStartMock).toHaveBeenCalledTimes(1)
      expect(mocks.scannerStartMock).toHaveBeenNthCalledWith(
        1,
        { deviceId: { exact: 'camera-1' } },
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
      )
    })

    rerender(<CameraScannerDialog open={false} onClose={onClose} onDetected={onDetected} />)

    await waitFor(() => {
      expect(mocks.scannerStopMock).toHaveBeenCalled()
      expect(mocks.scannerClearMock).toHaveBeenCalled()
    })
  })

  it('shows permission error message when camera permission is denied', async () => {
    mocks.scannerStartMock.mockImplementationOnce(async () => {
      throw new Error('NotAllowedError')
    })

    render(<CameraScannerDialog open={true} onClose={() => undefined} onDetected={() => undefined} />)

    expect(await screen.findByText('無法啟動相機，請確認已授權瀏覽器使用相機。')).toBeInTheDocument()
  })

  it('deduplicates same code within 2 seconds', async () => {
    let now = new Date('2026-04-25T00:00:00.000Z').getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const onDetected = vi.fn()

    render(<CameraScannerDialog open={true} onClose={() => undefined} onDetected={onDetected} />)

    await waitFor(() => {
      expect(mocks.scannerStartMock).toHaveBeenCalledTimes(1)
      expect(mocks.successCallback).not.toBeNull()
    })

    act(() => {
      mocks.successCallback?.('ABC-123')
      mocks.successCallback?.('ABC-123')
    })
    expect(onDetected).toHaveBeenCalledTimes(1)

    act(() => {
      now += 2100
      mocks.successCallback?.('ABC-123')
    })
    expect(onDetected).toHaveBeenCalledTimes(2)

    nowSpy.mockRestore()
  })

  it('supports manual camera switching with restart', async () => {
    mocks.getCamerasMock.mockResolvedValue([
      { id: 'cam-front', label: 'Front Camera' },
      { id: 'cam-rear', label: 'Rear Camera' },
    ])
    render(<CameraScannerDialog open={true} onClose={() => undefined} onDetected={() => undefined} />)

    await waitFor(() => {
      expect(mocks.scannerStartMock).toHaveBeenCalledTimes(1)
      expect(mocks.scannerStartMock).toHaveBeenNthCalledWith(
        1,
        { deviceId: { exact: 'cam-rear' } },
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
      )
    })

    const cameraSelect = screen.getByLabelText('鏡頭來源')
    fireEvent.change(cameraSelect, { target: { value: 'cam-front' } })

    await waitFor(() => {
      expect(mocks.scannerStopMock).toHaveBeenCalled()
      expect(mocks.scannerStartMock).toHaveBeenCalledTimes(2)
      expect(mocks.scannerStartMock).toHaveBeenNthCalledWith(
        2,
        { deviceId: { exact: 'cam-front' } },
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
      )
    })
  })

  it('auto closes on single mode but keeps open on continuous mode', async () => {
    const onClose = vi.fn()
    const onDetected = vi.fn()
    const { rerender } = render(<CameraScannerDialog open={true} onClose={onClose} onDetected={onDetected} />)

    await waitFor(() => {
      expect(mocks.successCallback).not.toBeNull()
    })

    act(() => {
      mocks.successCallback?.('ONE-001')
    })
    expect(onDetected).toHaveBeenCalledWith('ONE-001')
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(<CameraScannerDialog open={true} onClose={onClose} onDetected={onDetected} defaultMode="continuous" />)

    const modeSelect = screen.getByLabelText('掃描模式')
    fireEvent.change(modeSelect, { target: { value: 'continuous' } })

    act(() => {
      mocks.successCallback?.('TWO-002')
    })
    expect(onDetected).toHaveBeenCalledWith('TWO-002')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
