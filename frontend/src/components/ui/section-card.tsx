import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type SectionCardProps = {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}

export function SectionCard({ title, description, children, className }: SectionCardProps) {
  return (
    <section className={cn('rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm md:p-5', className)}>
      {title ? (
        <div className="mb-4">
          <h3 className="m-0 text-sm font-semibold text-[hsl(var(--foreground))]">{title}</h3>
          {description ? <p className="mt-1 mb-0 text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
