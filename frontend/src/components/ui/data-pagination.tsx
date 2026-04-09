import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

type PageToken = number | 'ellipsis'

type DataPaginationProps = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  pageSizeOptions?: number[]
  allowCustomPageSize?: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (nextPageSize: number) => void
}

const defaultPageSizeOptions = [10, 20, 50, 100]

function buildPageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const left = Math.max(2, currentPage - 1)
  const right = Math.min(totalPages - 1, currentPage + 1)
  const pages = new Set<number>([1, totalPages, left, currentPage, right])
  const sorted = Array.from(pages).sort((a, b) => a - b)

  const tokens: PageToken[] = []
  for (let index = 0; index < sorted.length; index += 1) {
    const value = sorted[index]
    const previousValue = sorted[index - 1]
    if (index > 0 && previousValue + 1 < value) {
      tokens.push('ellipsis')
    }
    tokens.push(value)
  }
  return tokens
}

const iconButtonClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-sm font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-50'

const numberButtonClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-[hsl(var(--border))] px-2 text-sm font-semibold transition-colors'

export function DataPagination({
  page,
  pageSize,
  total,
  totalPages,
  pageSizeOptions = defaultPageSizeOptions,
  allowCustomPageSize = true,
  onPageChange,
  onPageSizeChange,
}: DataPaginationProps) {
  const [customSize, setCustomSize] = useState(String(pageSize))
  const pageTokens = useMemo(() => buildPageTokens(page, totalPages), [page, totalPages])

  useEffect(() => {
    setCustomSize(String(pageSize))
  }, [pageSize])

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = total === 0 ? 0 : Math.min(total, page * pageSize)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[hsl(var(--muted-foreground))]">每頁</span>
        <div className="flex flex-wrap items-center gap-1">
          {pageSizeOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`${numberButtonClass} ${option === pageSize ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'}`}
              onClick={() => {
                setCustomSize(String(option))
                onPageSizeChange(option)
              }}
            >
              {option}
            </button>
          ))}
        </div>
        {allowCustomPageSize ? (
          <div className="ml-1 flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={customSize}
              onChange={(event) => setCustomSize(event.target.value)}
              className="h-9 w-20 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-sm"
            />
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => {
                const next = Number(customSize)
                if (!Number.isInteger(next) || next <= 0) {
                  return
                }
                onPageSizeChange(next)
              }}
            >
              套用
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-[hsl(var(--muted-foreground))]">
          {start}-{end} / {total}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>

          {pageTokens.map((token, index) =>
            token === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="inline-flex h-9 min-w-9 items-center justify-center text-[hsl(var(--muted-foreground))]">
                <MoreHorizontal className="size-4" />
              </span>
            ) : (
              <button
                key={token}
                type="button"
                className={`${numberButtonClass} ${token === page ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]'}`}
                onClick={() => onPageChange(token)}
              >
                {token}
              </button>
            ),
          )}

          <button
            type="button"
            className={iconButtonClass}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
