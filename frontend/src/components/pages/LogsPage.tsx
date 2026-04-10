import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { Button } from '../ui/button'
import { FilterBar } from '../ui/filter-bar'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import type { MovementLedgerEntry, OperationLogEntry, PaginatedResponse } from './types'

type LogTab = 'movements' | 'operations'
type LogScope = 'hot' | 'all'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function parseInitialTab(value: string | null): LogTab {
  return value === 'operations' ? 'operations' : 'movements'
}

function parseInitialScope(value: string | null): LogScope {
  return value === 'all' ? 'all' : 'hot'
}

function readInitialState() {
  const params = new URLSearchParams(window.location.search)
  return {
    tab: parseInitialTab(params.get('tab')),
    scope: parseInitialScope(params.get('scope')),
    startAt: params.get('start_at') ?? '',
    endAt: params.get('end_at') ?? '',
    action: params.get('action') ?? '',
    entity: params.get('entity') ?? '',
    itemId: params.get('item_id') ?? '',
    entityId: params.get('entity_id') ?? '',
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: parsePositiveInt(params.get('page_size'), 10),
  }
}

function safeJsonPreview(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

export function LogsPage() {
  const initialState = readInitialState()
  const [tab, setTab] = useState<LogTab>(initialState.tab)
  const [scope, setScope] = useState<LogScope>(initialState.scope)
  const [startAt, setStartAt] = useState(initialState.startAt)
  const [endAt, setEndAt] = useState(initialState.endAt)
  const [action, setAction] = useState(initialState.action)
  const [entity, setEntity] = useState(initialState.entity)
  const [itemId, setItemId] = useState(initialState.itemId)
  const [entityId, setEntityId] = useState(initialState.entityId)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [movementRows, setMovementRows] = useState<MovementLedgerEntry[]>([])
  const [operationRows, setOperationRows] = useState<OperationLogEntry[]>([])

  const endpoint = useMemo(() => (tab === 'movements' ? '/api/logs/movements' : '/api/logs/operations'), [tab])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (scope !== 'hot') {
      params.set('scope', scope)
    }
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
    if (page !== 1) {
      params.set('page', String(page))
    }
    if (pageSize !== 10) {
      params.set('page_size', String(pageSize))
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }, [tab, scope, startAt, endAt, action, entity, itemId, entityId, page, pageSize])

  useEffect(() => {
    const loadRows = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
          scope,
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
        } else {
          const payload = (await response.json()) as PaginatedResponse<OperationLogEntry>
          setOperationRows(payload.items)
          setTotal(payload.total)
          setTotalPages(payload.total_pages)
        }
      } catch {
        setLoadError('目前無法讀取日誌資料，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadRows()
  }, [endpoint, tab, scope, startAt, endAt, action, entity, itemId, entityId, page, pageSize])

  return (
    <SectionCard>
      <div className="mb-4 flex flex-wrap gap-2">
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
          variant={scope === 'all' ? 'default' : 'secondary'}
          onClick={() => {
            setScope((current) => (current === 'hot' ? 'all' : 'hot'))
            setPage(1)
          }}
        >
          包含歷史資料
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

      <FilterBar className="xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
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
        <div className="flex items-end text-sm text-[hsl(var(--muted-foreground))]">共 {total} 筆資料</div>
      </FilterBar>

      {loading ? <p className="m-0 rounded-md bg-[hsl(var(--card-soft))] px-3 py-2 text-sm">資料載入中...</p> : null}
      {loadError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p> : null}

      {!loading && !loadError && tab === 'movements' ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {['#', '時間', '品項', '狀態變更', '動作', '實體', '單據', '操作者'].map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-center text-[hsl(var(--muted-foreground))]" colSpan={8}>
                      目前沒有符合條件的異動流水帳。
                    </TableCell>
                  </TableRow>
                ) : (
                  movementRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      <TableCell>{row.created_at || '--'}</TableCell>
                      <TableCell>
                        <div className="font-semibold">{row.item_name || `#${row.item_id}`}</div>
                        <div className="text-xs text-[hsl(var(--muted-foreground))]">{row.item_model || ''}</div>
                      </TableCell>
                      <TableCell>{`${row.from_status || '--'} -> ${row.to_status || '--'}`}</TableCell>
                      <TableCell>{row.action || '--'}</TableCell>
                      <TableCell>{row.entity || '--'}</TableCell>
                      <TableCell>{row.entity_id ?? '--'}</TableCell>
                      <TableCell>{row.operator || '--'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {movementRows.length === 0 ? (
              <p className="m-0 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                目前沒有符合條件的異動流水帳。
              </p>
            ) : (
              movementRows.map((row) => (
                <article key={row.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                  <p className="m-0 text-sm font-semibold">#{row.id}</p>
                  <p className="mt-1 mb-0 text-xs text-[hsl(var(--muted-foreground))]">{row.created_at || '--'}</p>
                  <p className="mt-2 mb-0 text-sm">
                    品項：{row.item_name || `#${row.item_id}`} {row.item_model ? `(${row.item_model})` : ''}
                  </p>
                  <p className="mt-1 mb-0 text-sm">狀態：{`${row.from_status || '--'} -> ${row.to_status || '--'}`}</p>
                  <p className="mt-1 mb-0 text-xs text-[hsl(var(--muted-foreground))]">
                    {row.action || '--'} / {row.entity || '--'} / #{row.entity_id ?? '--'} / {row.operator || '--'}
                  </p>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      {!loading && !loadError && tab === 'operations' ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {['#', '時間', '動作', '實體', '單據', '狀態', '細節'].map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {operationRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-center text-[hsl(var(--muted-foreground))]" colSpan={7}>
                      目前沒有符合條件的操作日誌。
                    </TableCell>
                  </TableRow>
                ) : (
                  operationRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      <TableCell>{row.created_at || '--'}</TableCell>
                      <TableCell>{row.action || '--'}</TableCell>
                      <TableCell>{row.entity || '--'}</TableCell>
                      <TableCell>{row.entity_id ?? '--'}</TableCell>
                      <TableCell>{row.status || '--'}</TableCell>
                      <TableCell className="max-w-[360px] truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {safeJsonPreview(row.detail)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {operationRows.length === 0 ? (
              <p className="m-0 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                目前沒有符合條件的操作日誌。
              </p>
            ) : (
              operationRows.map((row) => (
                <article key={row.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                  <p className="m-0 text-sm font-semibold">#{row.id}</p>
                  <p className="mt-1 mb-0 text-xs text-[hsl(var(--muted-foreground))]">{row.created_at || '--'}</p>
                  <p className="mt-2 mb-0 text-sm">
                    {row.action || '--'} / {row.entity || '--'} / #{row.entity_id ?? '--'}
                  </p>
                  <p className="mt-1 mb-0 text-xs text-[hsl(var(--muted-foreground))]">狀態：{row.status || '--'}</p>
                  <p className="mt-1 mb-0 break-all text-xs text-[hsl(var(--muted-foreground))]">{safeJsonPreview(row.detail)}</p>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      {!loading && !loadError ? (
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
      ) : null}
    </SectionCard>
  )
}
