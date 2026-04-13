import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import type { MovementLedgerEntry, OperationLogEntry, PaginatedResponse } from './types'

type LogTab = 'movements' | 'operations'
type LogScope = 'hot' | 'all'
type SortDirection = 'asc' | 'desc'

type MovementColumnKey = 'id' | 'created_at' | 'item' | 'status_change' | 'action' | 'entity' | 'entity_id' | 'operator'
type OperationColumnKey = 'id' | 'created_at' | 'action' | 'entity' | 'entity_id' | 'status' | 'detail'

type MovementColumnDef = {
  key: MovementColumnKey
  label: string
  render: (row: MovementLedgerEntry) => React.ReactNode
  cellClassName?: string
}

type OperationColumnDef = {
  key: OperationColumnKey
  label: string
  render: (row: OperationLogEntry) => React.ReactNode
  cellClassName?: string
}

function parseSortDirection(value: string | null, fallback: SortDirection): SortDirection {
  return value === 'asc' || value === 'desc' ? value : fallback
}

function parseMovementSortKey(value: string | null): MovementColumnKey | null {
  const allowed: MovementColumnKey[] = ['id', 'created_at', 'item', 'status_change', 'action', 'entity', 'entity_id', 'operator']
  return value && allowed.includes(value as MovementColumnKey) ? (value as MovementColumnKey) : null
}

function parseOperationSortKey(value: string | null): OperationColumnKey | null {
  const allowed: OperationColumnKey[] = ['id', 'created_at', 'action', 'entity', 'entity_id', 'status', 'detail']
  return value && allowed.includes(value as OperationColumnKey) ? (value as OperationColumnKey) : null
}

function readInitialSortState() {
  const params = new URLSearchParams(window.location.search)
  const sortBy = params.get('sort_by')
  return {
    movementSortBy: parseMovementSortKey(sortBy) ?? 'id',
    operationSortBy: parseOperationSortKey(sortBy) ?? 'id',
    sortDir: parseSortDirection(params.get('sort_dir'), 'desc'),
  }
}

const movementColumns: MovementColumnDef[] = [
  {
    key: 'id',
    label: '#',
    render: (row) => row.id,
  },
  {
    key: 'created_at',
    label: '時間',
    render: (row) => row.created_at || '--',
  },
  {
    key: 'item',
    label: '品項',
    render: (row) => (
      <>
        <div className="font-semibold">{row.item_name || `#${row.item_id}`}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">{row.item_model || ''}</div>
      </>
    ),
  },
  {
    key: 'status_change',
    label: '狀態變更',
    render: (row) => `${row.from_status || '--'} -> ${row.to_status || '--'}`,
  },
  {
    key: 'action',
    label: '動作',
    render: (row) => row.action || '--',
  },
  {
    key: 'entity',
    label: '實體',
    render: (row) => row.entity || '--',
  },
  {
    key: 'entity_id',
    label: '單據',
    render: (row) => row.entity_id ?? '--',
  },
  {
    key: 'operator',
    label: '操作者',
    render: (row) => row.operator || '--',
  },
]

const operationColumns: OperationColumnDef[] = [
  {
    key: 'id',
    label: '#',
    render: (row) => row.id,
  },
  {
    key: 'created_at',
    label: '時間',
    render: (row) => row.created_at || '--',
  },
  {
    key: 'action',
    label: '動作',
    render: (row) => row.action || '--',
  },
  {
    key: 'entity',
    label: '實體',
    render: (row) => row.entity || '--',
  },
  {
    key: 'entity_id',
    label: '單據',
    render: (row) => row.entity_id ?? '--',
  },
  {
    key: 'status',
    label: '狀態',
    render: (row) => row.status || '--',
  },
  {
    key: 'detail',
    label: '細節',
    cellClassName: 'max-w-[360px] truncate text-xs text-[hsl(var(--muted-foreground))]',
    render: (row) => safeJsonPreview(row.detail),
  },
]

function safeJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

export function LogsPage() {
  const initialSort = readInitialSortState()
  const [tab, setTab] = useState<LogTab>('movements')
  const [scope, setScope] = useState<LogScope>('hot')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [itemId, setItemId] = useState('')
  const [entityId, setEntityId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [movementRows, setMovementRows] = useState<MovementLedgerEntry[]>([])
  const [operationRows, setOperationRows] = useState<OperationLogEntry[]>([])
  const [movementSortBy, setMovementSortBy] = useState<MovementColumnKey>(initialSort.movementSortBy)
  const [operationSortBy, setOperationSortBy] = useState<OperationColumnKey>(initialSort.operationSortBy)
  const [sortDir, setSortDir] = useState<SortDirection>(initialSort.sortDir)
  const [movementColumnVisibility, setMovementColumnVisibility] = useState<Record<MovementColumnKey, boolean>>({
    id: true,
    created_at: true,
    item: true,
    status_change: true,
    action: true,
    entity: true,
    entity_id: true,
    operator: true,
  })
  const [operationColumnVisibility, setOperationColumnVisibility] = useState<Record<OperationColumnKey, boolean>>({
    id: true,
    created_at: true,
    action: true,
    entity: true,
    entity_id: true,
    status: true,
    detail: true,
  })

  const endpoint = useMemo(() => (tab === 'movements' ? '/api/logs/movements' : '/api/logs/operations'), [tab])

  const hasActiveFilters = scope === 'all' || Boolean(startAt || endAt || action.trim() || entity.trim() || itemId.trim() || entityId.trim())

  const visibleMovementColumns = useMemo(
    () => movementColumns.filter((column) => movementColumnVisibility[column.key]),
    [movementColumnVisibility],
  )
  const visibleOperationColumns = useMemo(
    () => operationColumns.filter((column) => operationColumnVisibility[column.key]),
    [operationColumnVisibility],
  )

  const activeSortBy = tab === 'movements' ? movementSortBy : operationSortBy

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const currentSortBy = tab === 'movements' ? movementSortBy : operationSortBy
    if (currentSortBy !== 'id') {
      params.set('sort_by', currentSortBy)
    } else {
      params.delete('sort_by')
    }
    if (sortDir !== 'desc') {
      params.set('sort_dir', sortDir)
    } else {
      params.delete('sort_dir')
    }
    const queryString = params.toString()
    const url = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [tab, movementSortBy, operationSortBy, sortDir])

  function resetFilters() {
    setScope('hot')
    setStartAt('')
    setEndAt('')
    setAction('')
    setEntity('')
    setItemId('')
    setEntityId('')
    setPage(1)
  }

  function toggleMovementColumn(key: MovementColumnKey) {
    setMovementColumnVisibility((current) => {
      const visibleCount = Object.values(current).filter(Boolean).length
      if (current[key] && visibleCount === 1) {
        return current
      }
      return { ...current, [key]: !current[key] }
    })
  }

  function toggleOperationColumn(key: OperationColumnKey) {
    setOperationColumnVisibility((current) => {
      const visibleCount = Object.values(current).filter(Boolean).length
      if (current[key] && visibleCount === 1) {
        return current
      }
      return { ...current, [key]: !current[key] }
    })
  }

  useEffect(() => {
    const loadRows = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
          scope,
          sort_by: tab === 'movements' ? movementSortBy : operationSortBy,
          sort_dir: sortDir,
        })
        if (startAt) {
          params.set('start_at', startAt)
        }
        if (endAt) {
          params.set('end_at', endAt)
        }
        if (action.trim()) {
          params.set('action', action.trim())
        }
        if (entity.trim()) {
          params.set('entity', entity.trim())
        }
        if (itemId.trim()) {
          params.set('item_id', itemId.trim())
        }
        if (entityId.trim()) {
          params.set('entity_id', entityId.trim())
        }

        const response = await fetch(apiUrl(`${endpoint}?${params.toString()}`))
        if (!response.ok) {
          throw new Error('無法載入日誌資料')
        }

        if (tab === 'movements') {
          const payload = (await response.json()) as PaginatedResponse<MovementLedgerEntry>
          setMovementRows(payload.items)
          setTotal(payload.total)
          setTotalPages(payload.total_pages)
          return
        }

        const payload = (await response.json()) as PaginatedResponse<OperationLogEntry>
        setOperationRows(payload.items)
        setTotal(payload.total)
        setTotalPages(payload.total_pages)
      } catch {
        setLoadError('目前無法讀取日誌資料，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRows()
  }, [endpoint, tab, scope, startAt, endAt, action, entity, itemId, entityId, movementSortBy, operationSortBy, sortDir, page, pageSize])

  function handleSortChange(nextSortBy: MovementColumnKey | OperationColumnKey) {
    const isSameColumn = nextSortBy === activeSortBy
    if (tab === 'movements') {
      setMovementSortBy(nextSortBy as MovementColumnKey)
    } else {
      setOperationSortBy(nextSortBy as OperationColumnKey)
    }
    setSortDir((current) => (isSameColumn ? (current === 'asc' ? 'desc' : 'asc') : 'asc'))
    setPage(1)
  }

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={tab === 'movements' ? 'default' : 'secondary'}
            onClick={() => {
              setTab('movements')
              setPage(1)
            }}
          >
            異動流水帳
          </Button>
          <Button
            type="button"
            variant={tab === 'operations' ? 'default' : 'secondary'}
            onClick={() => {
              setTab('operations')
              setPage(1)
            }}
          >
            操作日誌
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">共 {total} 筆資料</span>
          <DropdownMenu>
            <DropdownMenuTrigger>欄位顯示</DropdownMenuTrigger>
            <DropdownMenuContent>
              {tab === 'movements'
                ? movementColumns.map((column) => (
                    <DropdownMenuItem key={column.key} onClick={() => toggleMovementColumn(column.key)}>
                      <span className="mr-2 inline-flex w-4 justify-center">{movementColumnVisibility[column.key] ? '✓' : ''}</span>
                      {column.label}
                    </DropdownMenuItem>
                  ))
                : operationColumns.map((column) => (
                    <DropdownMenuItem key={column.key} onClick={() => toggleOperationColumn(column.key)}>
                      <span className="mr-2 inline-flex w-4 justify-center">{operationColumnVisibility[column.key] ? '✓' : ''}</span>
                      {column.label}
                    </DropdownMenuItem>
                  ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" onClick={resetFilters} disabled={!hasActiveFilters}>
            重設篩選
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] p-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="logs-start-at">開始日期</Label>
          <Input
            id="logs-start-at"
            type="date"
            value={startAt}
            onChange={(event) => {
              setStartAt(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="logs-end-at">結束日期</Label>
          <Input
            id="logs-end-at"
            type="date"
            value={endAt}
            onChange={(event) => {
              setEndAt(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="logs-action">動作</Label>
          <Input
            id="logs-action"
            placeholder="create/update/delete/read"
            value={action}
            onChange={(event) => {
              setAction(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="logs-entity">實體</Label>
          <Input
            id="logs-entity"
            placeholder="issue_request / borrow_request ..."
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="logs-item-id">品項 ID</Label>
          <Input
            id="logs-item-id"
            type="number"
            min={1}
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="logs-entity-id">單據 ID</Label>
          <Input
            id="logs-entity-id"
            type="number"
            min={1}
            value={entityId}
            onChange={(event) => {
              setEntityId(event.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="grid gap-1.5">
          <Label>資料範圍</Label>
          <div className="inline-flex w-fit items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1">
            <Button
              type="button"
              size="sm"
              variant={scope === 'hot' ? 'default' : 'ghost'}
              onClick={() => {
                setScope('hot')
                setPage(1)
              }}
            >
              近期資料
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === 'all' ? 'default' : 'ghost'}
              onClick={() => {
                setScope('all')
                setPage(1)
              }}
            >
              含歷史資料
            </Button>
          </div>
        </div>

      </div>

      {loading ? <p className="m-0 rounded-md bg-[hsl(var(--card-soft))] px-3 py-2 text-sm">資料載入中...</p> : null}
      {loadError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p> : null}

      {!loading && !loadError ? (
        <>
          <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  {(tab === 'movements' ? visibleMovementColumns : visibleOperationColumns).map((column) => (
                    <TableHead key={column.key}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 bg-transparent p-0 text-left font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        onClick={() => handleSortChange(column.key)}
                      >
                        {column.label}
                        <span className="text-xs">{activeSortBy === column.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {(tab === 'movements' ? movementRows : operationRows).length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-[hsl(var(--muted-foreground))]"
                      colSpan={tab === 'movements' ? visibleMovementColumns.length : visibleOperationColumns.length}
                    >
                      {tab === 'movements' ? '目前沒有符合條件的異動流水帳。' : '目前沒有符合條件的操作日誌。'}
                    </TableCell>
                  </TableRow>
                ) : tab === 'movements' ? (
                  movementRows.map((row) => (
                    <TableRow key={row.id}>
                      {visibleMovementColumns.map((column) => (
                        <TableCell key={`${row.id}-${column.key}`} className={column.cellClassName}>
                          {column.render(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  operationRows.map((row) => (
                    <TableRow key={row.id}>
                      {visibleOperationColumns.map((column) => (
                        <TableCell key={`${row.id}-${column.key}`} className={column.cellClassName}>
                          {column.render(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <DataPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
        </>
      ) : null}
    </SectionCard>
  )
}
