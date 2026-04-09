import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type PageHeaderProps = {
  title: string
  description: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h2 className="m-0 text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{title}</h2>
        <p className="mt-1 mb-0 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
