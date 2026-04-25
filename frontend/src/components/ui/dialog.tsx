import { createPortal } from 'react-dom'
import { useEffect } from 'react'

import { cn } from '../../lib/utils'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  actions?: React.ReactNode
  panelClassName?: string
  bodyClassName?: string
}

let activeDialogCount = 0
let previousBodyOverflow = ''

export function Dialog({ open, onClose, title, description, children, actions, panelClassName, bodyClassName }: DialogProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    if (activeDialogCount === 0) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    activeDialogCount += 1

    return () => {
      activeDialogCount = Math.max(activeDialogCount - 1, 0)
      if (activeDialogCount === 0) {
        document.body.style.overflow = previousBodyOverflow
      }
    }
  }, [open])

  if (!open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl', panelClassName)}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="m-0 text-base font-semibold text-[hsl(var(--foreground))]">{title}</h3>
        {description ? <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
        {children ? <div className={cn('mt-4 min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div> : null}
        {actions ? <div className="mt-5 flex justify-end gap-2">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
