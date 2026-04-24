const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null
  }
  const match = value.match(ISO_DATE_PATTERN)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return null
  }
  return date
}

export function normalizeDateTextToIso(rawValue: string): string | null {
  const normalized = rawValue.trim().replaceAll('/', '-')
  if (!normalized) {
    return null
  }
  const parsed = parseIsoDate(normalized)
  if (!parsed) {
    return null
  }
  return formatIsoDate(parsed)
}

export function formatIsoDateForDisplay(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) {
    return value
  }
  return formatIsoDate(parsed).replaceAll('-', '/')
}

export function isIsoDateWithinRange(value: string, min?: string, max?: string): boolean {
  if (!value) {
    return true
  }
  if (min && value < min) {
    return false
  }
  if (max && value > max) {
    return false
  }
  return true
}
