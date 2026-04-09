import { type ReactNode, createContext, useContext, useMemo, useState } from 'react'

import { cn } from '../../lib/utils'

type TabsContextType = {
  activeValue: string
  setActiveValue: (value: string) => void
}

const TabsContext = createContext<TabsContextType | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs')
  }
  return context
}

type TabsProps = {
  defaultValue: string
  children: ReactNode
  className?: string
}

export function Tabs({ defaultValue, children, className }: TabsProps) {
  const [activeValue, setActiveValue] = useState(defaultValue)
  const value = useMemo(() => ({ activeValue, setActiveValue }), [activeValue])

  return (
    <TabsContext.Provider value={value}>
      <div className={cn('grid gap-4', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('inline-flex w-fit items-center rounded-md bg-[hsl(var(--secondary))] p-1', className)} {...props} />
}

type TabsTriggerProps = React.ComponentProps<'button'> & {
  value: string
}

export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const { activeValue, setActiveValue } = useTabsContext()
  const isActive = activeValue === value

  return (
    <button
      type="button"
      onClick={() => setActiveValue(value)}
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-sm px-3 text-sm font-medium transition-colors',
        isActive
          ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm'
          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
        className,
      )}
      {...props}
    />
  )
}

type TabsContentProps = React.ComponentProps<'div'> & {
  value: string
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { activeValue } = useTabsContext()
  if (activeValue !== value) {
    return null
  }

  return <div className={cn('grid gap-4', className)} {...props} />
}
