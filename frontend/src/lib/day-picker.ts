import type { Matcher } from 'react-day-picker'

export function buildDayPickerDisabledMatchers(minDate: Date | null, maxDate: Date | null): Matcher[] {
  const matchers: Matcher[] = []
  if (minDate) {
    matchers.push({ before: minDate })
  }
  if (maxDate) {
    matchers.push({ after: maxDate })
  }
  return matchers
}
