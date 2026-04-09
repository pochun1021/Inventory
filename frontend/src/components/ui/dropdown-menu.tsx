import * as React from 'react'

import { cn } from '../../lib/utils'

export function DropdownMenu({ className, ...props }: React.ComponentProps<'details'>) {
  return <details className={cn('relative', className)} {...props} />
}

export function DropdownMenuTrigger({ className, ...props }: React.ComponentProps<'summary'>) {
  return (
    <summary
      className={cn(
        'inline-flex h-9 cursor-pointer list-none items-center justify-center rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] px-3 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'absolute right-0 z-10 mt-2 min-w-32 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-lg',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]',
        className,
      )}
      {...props}
    />
  )
}
