import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type FilterBarProps = {
  children: ReactNode
  className?: string
}

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn('mb-4 grid gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] p-3 md:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  )
}
