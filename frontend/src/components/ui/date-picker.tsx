import { CalendarDays } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { buildDayPickerDisabledMatchers } from '../../lib/day-picker'
import { cn } from '../../lib/utils'
import { formatIsoDate, formatIsoDateForDisplay, isIsoDateWithinRange, normalizeDateTextToIso, parseIsoDate } from '../../lib/date'
import { Button } from './button'
import { Input } from './input'

type DatePickerProps = {
  id?: string
  name?: string
  value: string
  onChange: (nextValue: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  min?: string
  max?: string
  className?: string
}

const DEFAULT_PLACEHOLDER = 'YYYY/MM/DD'
const VIEWPORT_PADDING = 8
const DESKTOP_PANEL_GAP = 6
const MOBILE_BREAKPOINT = '(max-width: 768px)'
const MIN_PANEL_HEIGHT = 220

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function DatePicker({
  id,
  name,
  value,
  onChange,
  placeholder = DEFAULT_PLACEHOLDER,
  disabled = false,
  required = false,
  min,
  max,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [isEditingInput, setIsEditingInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [hasInputError, setHasInputError] = useState(false)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(MOBILE_BREAKPOINT).matches
  })
  const [desktopPanelStyle, setDesktopPanelStyle] = useState<{
    top: number
    left: number
    maxHeight: number
    placement: 'top' | 'bottom'
  } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const selectedDate = useMemo(() => parseIsoDate(value), [value])
  const minDate = useMemo(() => (min ? parseIsoDate(min) : null), [min])
  const maxDate = useMemo(() => (max ? parseIsoDate(max) : null), [max])

  const disabledMatchers = useMemo(() => buildDayPickerDisabledMatchers(minDate, maxDate), [maxDate, minDate])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia(MOBILE_BREAKPOINT)
    const handleMediaChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    media.addEventListener('change', handleMediaChange)
    return () => {
      media.removeEventListener('change', handleMediaChange)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }
      const clickInsideTrigger = Boolean(rootRef.current?.contains(target))
      const clickInsidePanel = Boolean(panelRef.current?.contains(target))
      if (!clickInsideTrigger && !clickInsidePanel) {
        setOpen(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  useEffect(() => {
    if (!open || isMobile) {
      return
    }
    const updateDesktopPosition = () => {
      if (!rootRef.current || !panelRef.current) {
        return
      }
      const triggerRect = rootRef.current.getBoundingClientRect()
      const panelRect = panelRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      const panelWidth = Math.min(panelRect.width, viewportWidth - VIEWPORT_PADDING * 2)
      const panelHeight = Math.min(panelRect.height, viewportHeight - VIEWPORT_PADDING * 2)
      const spaceAbove = triggerRect.top - VIEWPORT_PADDING
      const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_PADDING

      let placement: 'top' | 'bottom' = 'bottom'
      if (spaceBelow < MIN_PANEL_HEIGHT && spaceAbove > spaceBelow) {
        placement = 'top'
      }
      if (spaceBelow < panelHeight && spaceAbove >= panelHeight) {
        placement = 'top'
      }

      const availableHeight = placement === 'top' ? spaceAbove : spaceBelow
      const boundedMaxHeight = Math.max(MIN_PANEL_HEIGHT, Math.floor(availableHeight))
      const targetHeight = Math.min(panelHeight, boundedMaxHeight)

      const top =
        placement === 'top'
          ? clamp(triggerRect.top - DESKTOP_PANEL_GAP - targetHeight, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - targetHeight)
          : clamp(triggerRect.bottom + DESKTOP_PANEL_GAP, VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - targetHeight)

      const left = clamp(triggerRect.left, VIEWPORT_PADDING, viewportWidth - VIEWPORT_PADDING - panelWidth)

      setDesktopPanelStyle({
        top,
        left,
        maxHeight: boundedMaxHeight,
        placement,
      })
    }

    const rafId = window.requestAnimationFrame(updateDesktopPosition)
    window.addEventListener('resize', updateDesktopPosition)
    window.addEventListener('scroll', updateDesktopPosition, true)
    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateDesktopPosition)
      window.removeEventListener('scroll', updateDesktopPosition, true)
    }
  }, [isMobile, open])

  const commitRawInput = (rawValue: string): boolean => {
    const normalizedIso = normalizeDateTextToIso(rawValue)
    if (!rawValue.trim()) {
      setHasInputError(false)
      onChange('')
      setInputValue('')
      return true
    }
    if (!normalizedIso || !isIsoDateWithinRange(normalizedIso, min, max)) {
      setHasInputError(true)
      return false
    }
    setHasInputError(false)
    onChange(normalizedIso)
    setInputValue(formatIsoDateForDisplay(normalizedIso))
    return true
  }

  const handleDaySelect = (date: Date | undefined) => {
    if (!date) {
      return
    }
    const nextIso = formatIsoDate(date)
    if (!isIsoDateWithinRange(nextIso, min, max)) {
      return
    }
    setHasInputError(false)
    onChange(nextIso)
    setInputValue(formatIsoDateForDisplay(nextIso))
    setIsEditingInput(false)
    setOpen(false)
  }

  const displayValue = isEditingInput ? inputValue : formatIsoDateForDisplay(value)

  const calendarPanel = (
    <>
      {isMobile ? (
        <>
          <div className="fixed inset-0 z-50 bg-black/35" onClick={() => setOpen(false)} aria-hidden />
          <div ref={panelRef} className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="m-0 text-sm font-semibold">選擇日期</p>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                關閉
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <DayPicker
                mode="single"
                selected={selectedDate ?? undefined}
                defaultMonth={selectedDate ?? minDate ?? undefined}
                onSelect={handleDaySelect}
                disabled={disabledMatchers}
              />
            </div>
          </div>
        </>
      ) : (
        <div
          ref={panelRef}
          className={cn(
            'fixed z-50 overflow-auto rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] p-3 shadow-lg',
            desktopPanelStyle?.placement === 'top' ? 'origin-bottom' : 'origin-top',
          )}
          style={{
            top: desktopPanelStyle?.top ?? 0,
            left: desktopPanelStyle?.left ?? 0,
            maxHeight: desktopPanelStyle?.maxHeight ?? undefined,
          }}
        >
          <DayPicker
            mode="single"
            selected={selectedDate ?? undefined}
            defaultMonth={selectedDate ?? minDate ?? undefined}
            onSelect={handleDaySelect}
            disabled={disabledMatchers}
          />
        </div>
      )}
    </>
  )

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <Input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={hasInputError}
        minLength={10}
        maxLength={10}
        className={cn('pr-11', hasInputError ? 'border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]' : undefined)}
        onFocus={() => {
          setIsEditingInput(true)
          setInputValue(formatIsoDateForDisplay(value))
        }}
        onChange={(event) => {
          setInputValue(event.target.value)
          if (hasInputError) {
            setHasInputError(false)
          }
        }}
        onBlur={() => {
          if (commitRawInput(inputValue)) {
            setIsEditingInput(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (commitRawInput(inputValue)) {
              setIsEditingInput(false)
            }
            setOpen(false)
          }
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="absolute top-1 right-1 h-8 w-8"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-label="開啟日期選擇"
      >
        <CalendarDays className="h-4 w-4" />
      </Button>
      {open && !disabled ? createPortal(calendarPanel, document.body) : null}
    </div>
  )
}
