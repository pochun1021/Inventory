import { cn } from '../../lib/utils'
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

export function DatePicker({ id, name, value, onChange, placeholder, disabled = false, required = false, min, max, className }: DatePickerProps) {
  return (
    <Input
      id={id}
      name={name}
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      min={min}
      max={max}
      className={cn(className)}
    />
  )
}
