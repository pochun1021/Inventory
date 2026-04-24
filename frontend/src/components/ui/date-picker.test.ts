import { describe, expect, it } from 'vitest'
import { buildDayPickerDisabledMatchers } from '../../lib/day-picker'

describe('buildDayPickerDisabledMatchers', () => {
  it('uses inclusive min boundary by disabling only days before min', () => {
    const minDate = new Date(Date.UTC(2026, 3, 2))
    const matchers = buildDayPickerDisabledMatchers(minDate, null)
    expect(matchers).toHaveLength(1)
    expect(matchers[0]).toEqual({ before: minDate })
  })

  it('uses inclusive max boundary by disabling only days after max', () => {
    const maxDate = new Date(Date.UTC(2026, 4, 2))
    const matchers = buildDayPickerDisabledMatchers(null, maxDate)
    expect(matchers).toHaveLength(1)
    expect(matchers[0]).toEqual({ after: maxDate })
  })

  it('builds both boundaries when min and max exist', () => {
    const minDate = new Date(Date.UTC(2026, 3, 2))
    const maxDate = new Date(Date.UTC(2026, 4, 2))
    const matchers = buildDayPickerDisabledMatchers(minDate, maxDate)
    expect(matchers).toEqual([{ before: minDate }, { after: maxDate }])
  })
})
