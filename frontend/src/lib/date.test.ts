import { describe, expect, it } from 'vitest'
import { formatIsoDate, formatIsoDateForDisplay, isIsoDateWithinRange, normalizeDateTextToIso, parseIsoDate } from './date'

describe('date helpers', () => {
  it('normalizes slash and dash input to ISO date', () => {
    expect(normalizeDateTextToIso('2026/04/24')).toBe('2026-04-24')
    expect(normalizeDateTextToIso('2026-04-24')).toBe('2026-04-24')
  })

  it('rejects impossible dates', () => {
    expect(normalizeDateTextToIso('2026/02/30')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
  })

  it('formats ISO date for display', () => {
    expect(formatIsoDateForDisplay('2026-04-24')).toBe('2026/04/24')
  })

  it('keeps the same local calendar day without timezone shift', () => {
    const pickedDate = new Date(2026, 3, 2)
    expect(formatIsoDate(pickedDate)).toBe('2026-04-02')
    const parsed = parseIsoDate('2026-04-02')
    expect(parsed).not.toBeNull()
    expect(formatIsoDate(parsed!)).toBe('2026-04-02')
  })

  it('validates ISO range boundaries', () => {
    expect(isIsoDateWithinRange('2026-04-24', '2026-04-01', '2026-04-30')).toBe(true)
    expect(isIsoDateWithinRange('2026-03-31', '2026-04-01', '2026-04-30')).toBe(false)
    expect(isIsoDateWithinRange('2026-05-01', '2026-04-01', '2026-04-30')).toBe(false)
  })
})
