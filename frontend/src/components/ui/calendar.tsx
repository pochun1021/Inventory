import { DayPicker } from 'react-day-picker'

import { cn } from '../../lib/utils'

type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4 sm:flex-row',
        month: 'space-y-4',
        caption: 'relative flex items-center justify-center pt-1',
        month_caption: 'relative flex items-center justify-center pt-1',
        caption_label: 'text-sm font-semibold tracking-tight',
        dropdowns: 'flex items-center gap-2',
        dropdown_root: 'relative',
        dropdown:
          'h-8 rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] px-2 text-xs text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]',
        months_dropdown:
          'h-8 rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] px-2 text-xs text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]',
        years_dropdown:
          'h-8 rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] px-2 text-xs text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))]',
        nav: 'flex items-center gap-1',
        chevron: 'h-4 w-4',
        button_previous:
          'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-40',
        button_next:
          'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-40',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-10 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] md:w-9',
        week: 'mt-1 flex w-full',
        day: 'h-10 w-10 p-0 text-sm font-normal md:h-9 md:w-9',
        day_button:
          'h-10 w-10 rounded-md p-0 transition-colors hover:bg-[hsl(var(--secondary))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--card))] md:h-9 md:w-9',
        selected:
          'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:bg-[hsl(var(--primary-hover))] hover:text-[hsl(var(--primary-foreground))]',
        today: 'border border-[hsl(var(--ring))] bg-[hsl(var(--secondary))]/60',
        outside: 'text-[hsl(var(--muted-foreground))] opacity-55',
        disabled: 'cursor-not-allowed opacity-40',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  )
}

export { Calendar }
