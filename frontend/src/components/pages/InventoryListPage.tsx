import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal, Plus } from 'lucide-react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { FilterBar } from '../ui/filter-bar'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Select } from '../ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { buildAssetStatusLabelMap, fetchAssetStatusOptions, toAssetStatusLabel } from './assetStatusLookup'
import type { InventoryItem, PaginatedResponse } from './types'

const ASSET_TYPE_LABEL_MAP: Record<string, string> = {
  '11': '財產',
  A1: '物品',
  A2: '其他',
}

const CHINESE_CHARACTER_REGEX = /[\u4e00-\u9fff]/
const SCAN_MAX_KEY_INTERVAL_MS = 45
const SCAN_MIN_LENGTH = 4

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
})

type ScanBuffer = {
  value: string
  lastTs: number
}

type InventorySortKey = 'id' | 'asset_type' | 'serial' | 'name' | 'specification' | 'location' | 'keeper' | 'asset_status'
type SortDirection = 'asc' | 'desc'

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

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return fallback
}

function parseSortDirection(value: string | null, fallback: SortDirection): SortDirection {
  return value === 'asc' || value === 'desc' ? value : fallback
}

function parseInventorySortKey(value: string | null, fallback: InventorySortKey): InventorySortKey {
  const allowed: InventorySortKey[] = ['id', 'asset_type', 'serial', 'name', 'specification', 'location', 'keeper', 'asset_status']
  return value && allowed.includes(value as InventorySortKey) ? (value as InventorySortKey) : fallback
}

function readInitialState() {
  const params = new URLSearchParams(window.location.search)
  const correctionParam = params.get('correction_status')
  const correctionStatus = correctionParam === 'needs_fix' ? correctionParam : 'all'

  return {
    keyword: params.get('keyword') ?? '',
    selectedAssetType: params.get('asset_type') ?? 'all',
    selectedAssetStatus: params.get('asset_status') ?? 'all',
    selectedLocation: params.get('location') ?? 'all',
    selectedKeeper: params.get('keeper') ?? 'all',
    selectedCorrectionStatus: correctionStatus as 'all' | 'needs_fix',
    showDonated: parseBoolean(params.get('include_donated'), false),
    sortBy: parseInventorySortKey(params.get('sort_by'), 'id'),
    sortDir: parseSortDirection(params.get('sort_dir'), 'desc'),
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: parsePositiveInt(params.get('page_size'), 10),
  }
}

export function InventoryListPage() {
  const initialState = readInitialState()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [assetTypeOptions, setAssetTypeOptions] = useState<string[]>(['all'])
  const [locationOptions, setLocationOptions] = useState<string[]>(['all'])
  const [keeperOptions, setKeeperOptions] = useState<string[]>(['all'])
  const [assetStatusLabelMap, setAssetStatusLabelMap] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState(initialState.keyword)
  const [selectedAssetType, setSelectedAssetType] = useState(initialState.selectedAssetType)
  const [selectedAssetStatus, setSelectedAssetStatus] = useState(initialState.selectedAssetStatus)
  const [selectedLocation, setSelectedLocation] = useState(initialState.selectedLocation)
  const [selectedKeeper, setSelectedKeeper] = useState(initialState.selectedKeeper)
  const [selectedCorrectionStatus, setSelectedCorrectionStatus] = useState<'all' | 'needs_fix'>(initialState.selectedCorrectionStatus)
  const [showDonated, setShowDonated] = useState(initialState.showDonated)
  const [sortBy, setSortBy] = useState<InventorySortKey>(initialState.sortBy)
  const [sortDir, setSortDir] = useState<SortDirection>(initialState.sortDir)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<InventoryItem | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const listRequestSeqRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const scanBufferRef = useRef<ScanBuffer>({ value: '', lastTs: 0 })
  const lastInputSourceRef = useRef<'manual' | 'scan'>('manual')
  const lastNotifiedScanKeywordRef = useRef('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (keyword.trim()) {
      params.set('keyword', keyword.trim())
    }
    if (selectedAssetType !== 'all') {
      params.set('asset_type', selectedAssetType)
    }
    if (selectedAssetStatus !== 'all') {
      params.set('asset_status', selectedAssetStatus)
    }
    if (selectedLocation !== 'all') {
      params.set('location', selectedLocation)
    }
    if (selectedKeeper !== 'all') {
      params.set('keeper', selectedKeeper)
    }
    if (selectedCorrectionStatus !== 'all') {
      params.set('correction_status', selectedCorrectionStatus)
    }
    if (showDonated) {
      params.set('include_donated', 'true')
    }
    if (sortBy !== 'id') {
      params.set('sort_by', sortBy)
    }
    if (sortDir !== 'desc') {
      params.set('sort_dir', sortDir)
    }
    if (page !== 1) {
      params.set('page', String(page))
    }
    if (pageSize !== 10) {
      params.set('page_size', String(pageSize))
    }
    const queryString = params.toString()
    const url = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [keyword, selectedAssetType, selectedAssetStatus, selectedLocation, selectedKeeper, selectedCorrectionStatus, showDonated, sortBy, sortDir, page, pageSize])

  useEffect(() => {
    const requestSeq = ++listRequestSeqRef.current
    const controller = new AbortController()

    const loadItems = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({
          page: '1',
          page_size: '100000',
          include_donated: String(showDonated),
          correction_status: selectedCorrectionStatus,
          sort_by: sortBy,
          sort_dir: sortDir,
        })
        if (keyword.trim()) {
          params.set('keyword', keyword.trim())
        }
        if (selectedAssetType !== 'all') {
          params.set('asset_type', selectedAssetType)
        }
        const response = await fetch(apiUrl(`/api/items?${params.toString()}`), {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('無法載入財產清單')
        }
        const payload = (await response.json()) as PaginatedResponse<InventoryItem>
        if (listRequestSeqRef.current !== requestSeq) {
          return
        }
        const rows = payload.items
        const toUniqueSortedOptions = (values: string[]) => {
          const uniqueValues = Array.from(new Set(values.filter((value) => value.trim())))
          uniqueValues.sort((left, right) => left.localeCompare(right, 'zh-TW', { sensitivity: 'base', numeric: true }))
          return ['all', ...uniqueValues]
        }

        setLocationOptions(toUniqueSortedOptions(rows.map((item) => item.location || '')))
        setKeeperOptions(toUniqueSortedOptions(rows.map((item) => item.keeper || '')))

        const filteredRows = rows.filter((item) => {
          if (selectedAssetStatus !== 'all' && item.asset_status !== selectedAssetStatus) {
            return false
          }
          if (selectedLocation !== 'all' && (item.location || '') !== selectedLocation) {
            return false
          }
          if (selectedKeeper !== 'all' && (item.keeper || '') !== selectedKeeper) {
            return false
          }
          return true
        })

        const filteredTotal = filteredRows.length
        const filteredTotalPages = filteredTotal > 0 ? Math.ceil(filteredTotal / pageSize) : 1
        const normalizedPage = Math.min(page, filteredTotalPages)
        if (normalizedPage !== page) {
          setPage(normalizedPage)
        }
        const startIndex = (normalizedPage - 1) * pageSize
        const pagedRows = filteredRows.slice(startIndex, startIndex + pageSize)

        setItems(pagedRows)
        setTotal(filteredTotal)
        setTotalPages(filteredTotalPages)
      } catch {
        if (controller.signal.aborted || listRequestSeqRef.current !== requestSeq) {
          return
        }
        setLoadError('目前無法讀取財產清單，請稍後重試。')
      } finally {
        if (listRequestSeqRef.current === requestSeq) {
          setLoading(false)
        }
      }
    }

    void loadItems()
    return () => {
      controller.abort()
    }
  }, [keyword, selectedAssetType, selectedAssetStatus, selectedLocation, selectedKeeper, selectedCorrectionStatus, showDonated, sortBy, sortDir, page, pageSize, reloadKey])

  useEffect(() => {
    const loadAssetTypes = async () => {
      try {
        const params = new URLSearchParams({
          page: '1',
          page_size: '100000',
          include_donated: String(showDonated),
        })
        const response = await fetch(apiUrl(`/api/items?${params.toString()}`))
        if (!response.ok) {
          throw new Error('無法載入資產類型')
        }
        const payload = (await response.json()) as PaginatedResponse<InventoryItem>
        const uniqueAssetTypes = new Set(payload.items.map((item) => item.asset_type).filter((assetType): assetType is string => Boolean(assetType?.trim())))
        setAssetTypeOptions(['all', ...Array.from(uniqueAssetTypes)])
      } catch {
        setAssetTypeOptions(['all'])
      }
    }

    void loadAssetTypes()
  }, [showDonated, reloadKey])

  useEffect(() => {
    let cancelled = false

    const loadAssetStatusOptions = async () => {
      try {
        const options = await fetchAssetStatusOptions()
        if (cancelled) {
          return
        }
        setAssetStatusLabelMap(buildAssetStatusLabelMap(options))
      } catch {
        if (!cancelled) {
          setAssetStatusLabelMap({})
        }
      }
    }

    void loadAssetStatusOptions()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (lastInputSourceRef.current !== 'scan') {
      return
    }
    const normalizedKeyword = keyword.trim()
    if (!normalizedKeyword || total > 0 || lastNotifiedScanKeywordRef.current === normalizedKeyword) {
      return
    }
    lastNotifiedScanKeywordRef.current = normalizedKeyword
    void toast.fire({ icon: 'error', title: '查無此財產編號。' })
  }, [keyword, total])

  const toAssetTypeLabel = (assetType: string) => {
    if (!assetType) {
      return '--'
    }

    return ASSET_TYPE_LABEL_MAP[assetType] ?? assetType
  }

  const getPrimarySerial = (item: InventoryItem) => {
    return item.n_property_sn || item.property_sn || item.n_item_sn || item.item_sn || ''
  }

  const sortableHeaders: Array<{ key: InventorySortKey; label: string }> = [
    { key: 'id', label: '#' },
    { key: 'asset_type', label: '資產類型' },
    { key: 'serial', label: '財產序號' },
    { key: 'name', label: '品名' },
    { key: 'specification', label: '型號' },
    { key: 'location', label: '放置地點' },
    { key: 'keeper', label: '保管人' },
    { key: 'asset_status', label: '資產狀態' },
  ]

  const handleSortChange = (nextSortBy: InventorySortKey) => {
    if (sortBy === nextSortBy) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(nextSortBy)
      setSortDir('asc')
    }
    setPage(1)
  }

  const confirmDeleteLabel =
    confirmDeleteItem ? confirmDeleteItem.name || getPrimarySerial(confirmDeleteItem) || String(confirmDeleteItem.id) : ''

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now()
    const buffer = scanBufferRef.current
    const key = event.key

    if (key === 'Enter') {
      if (buffer.value.length >= SCAN_MIN_LENGTH) {
        lastInputSourceRef.current = 'scan'
      }
      buffer.value = ''
      buffer.lastTs = 0
      return
    }

    if (key.length !== 1) {
      return
    }

    lastInputSourceRef.current = 'manual'
    if (buffer.lastTs > 0 && now - buffer.lastTs > SCAN_MAX_KEY_INTERVAL_MS) {
      buffer.value = key
    } else {
      buffer.value += key
    }
    buffer.lastTs = now
  }

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!item.id) {
      return
    }

    setLoadError('')
    setActionMessage('')
    setDeletingItemId(item.id)

    try {
      const response = await fetch(apiUrl(`/api/items/${item.id}`), {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('刪除失敗')
      }

      setActionMessage('財產資料已刪除。')
      setReloadKey((previous) => previous + 1)
      setConfirmDeleteItem(null)
    } catch {
      setLoadError('刪除財產資料失敗，請稍後再試。')
    } finally {
      setDeletingItemId(null)
    }
  }

  const correctionSummary = useMemo(() => {
    if (selectedCorrectionStatus !== 'needs_fix') {
      return null
    }
    const count = items.filter((item) => {
      const serial = getPrimarySerial(item).trim()
      return serial.length === 0 || CHINESE_CHARACTER_REGEX.test(serial)
    }).length
    return count
  }, [items, selectedCorrectionStatus])

  return (
    <>
      <div className="flex justify-end">
        <Link to="/inventory/new">
          <Button>
            <Plus className="size-4" />
            新增庫存
          </Button>
        </Link>
      </div>

      <SectionCard>
        <FilterBar className="xl:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="grid gap-1.5 xl:col-span-2">
            <Label htmlFor="search-input">關鍵字搜尋</Label>
            <Input
              id="search-input"
              ref={searchInputRef}
              type="search"
              placeholder="可輸入/掃描財產編號、品名、型號..."
              value={keyword}
              onKeyDown={handleSearchKeyDown}
              onChange={(event) => {
                if (lastInputSourceRef.current !== 'scan') {
                  lastInputSourceRef.current = 'manual'
                }
                setKeyword(event.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="asset-type-filter">資產類型篩選</Label>
            <Select
              id="asset-type-filter"
              value={selectedAssetType}
              onChange={(event) => {
                setSelectedAssetType(event.target.value)
                setPage(1)
              }}
            >
              {assetTypeOptions.map((assetTypeValue) => (
                <option key={assetTypeValue} value={assetTypeValue}>
                  {assetTypeValue === 'all' ? '全部類別' : toAssetTypeLabel(assetTypeValue)}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="correction-filter">待修正篩選</Label>
            <Select
              id="correction-filter"
              value={selectedCorrectionStatus}
              onChange={(event) => {
                setSelectedCorrectionStatus(event.target.value as 'all' | 'needs_fix')
                setPage(1)
              }}
            >
              <option value="all">全部資料</option>
              <option value="needs_fix">僅顯示待修正資料</option>
            </Select>
          </div>

          <div className="grid gap-2 xl:col-span-4">
            <Label>進階篩選</Label>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="asset-status-filter">資產狀態</Label>
                <Select
                  id="asset-status-filter"
                  value={selectedAssetStatus}
                  onChange={(event) => {
                    setSelectedAssetStatus(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="all">全部狀態</option>
                  {Object.entries(assetStatusLabelMap).map(([statusCode, statusLabel]) => (
                    <option key={statusCode} value={statusCode}>
                      {statusLabel}
                    </option>
                  ))}
                  {selectedAssetStatus !== 'all' && !(selectedAssetStatus in assetStatusLabelMap) ? (
                    <option value={selectedAssetStatus}>{selectedAssetStatus}</option>
                  ) : null}
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="location-filter">放置地點</Label>
                <Select
                  id="location-filter"
                  value={selectedLocation}
                  onChange={(event) => {
                    setSelectedLocation(event.target.value)
                    setPage(1)
                  }}
                >
                  {locationOptions.map((locationOption) => (
                    <option key={locationOption} value={locationOption}>
                      {locationOption === 'all' ? '全部地點' : locationOption}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="keeper-filter">保管人</Label>
                <Select
                  id="keeper-filter"
                  value={selectedKeeper}
                  onChange={(event) => {
                    setSelectedKeeper(event.target.value)
                    setPage(1)
                  }}
                >
                  {keeperOptions.map((keeperOption) => (
                    <option key={keeperOption} value={keeperOption}>
                      {keeperOption === 'all' ? '全部保管人' : keeperOption}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 xl:col-span-4">
            <Label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={showDonated}
                onChange={(event) => {
                  setShowDonated(event.target.checked)
                  setPage(1)
                }}
              />
              顯示已捐贈資料
            </Label>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              共 {total} 筆資料{correctionSummary !== null ? `，本頁待修正 ${correctionSummary} 筆` : ''}
            </div>
          </div>
        </FilterBar>

        {loading ? <p className="m-0 rounded-md bg-[hsl(var(--card-soft))] px-3 py-2 text-sm">資料載入中...</p> : null}
        {loadError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p> : null}
        {actionMessage ? <p className="m-0 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{actionMessage}</p> : null}

        {!loading && !loadError ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {sortableHeaders.map((header) => (
                      <TableHead key={header.key}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 bg-transparent p-0 text-left font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                          onClick={() => handleSortChange(header.key)}
                        >
                          {header.label}
                          <span className="text-xs">{sortBy === header.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </TableHead>
                    ))}
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell className="text-center text-[hsl(var(--muted-foreground))]" colSpan={9}>
                        查無符合條件的財產資料。
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.id ? (
                            <Link className="font-semibold text-blue-700 no-underline hover:underline" to="/inventory/edit/$itemId" params={{ itemId: String(item.id) }}>
                              {item.id}
                            </Link>
                          ) : (
                            '--'
                          )}
                        </TableCell>
                        <TableCell>{toAssetTypeLabel(item.asset_type)}</TableCell>
                        <TableCell>{getPrimarySerial(item) || '--'}</TableCell>
                        <TableCell>
                          <div className="font-semibold">{item.name || '--'}</div>
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">{item.model || '--'}</div>
                        </TableCell>
                        <TableCell>{item.specification || '--'}</TableCell>
                        <TableCell>{item.location || '--'}</TableCell>
                        <TableCell>{item.keeper || '--'}</TableCell>
                        <TableCell>{toAssetStatusLabel(item.asset_status, assetStatusLabelMap)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <Link
                                className="flex items-center rounded-sm px-2 py-1.5 text-sm text-[hsl(var(--foreground))] no-underline hover:bg-[hsl(var(--secondary))]"
                                to="/inventory/edit/$itemId"
                                params={{ itemId: String(item.id) }}
                              >
                                編輯
                              </Link>
                              <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDeleteItem(item)}>
                                刪除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 md:hidden">
              {items.length === 0 ? (
                <p className="m-0 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card-soft))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                  查無符合條件的財產資料。
                </p>
              ) : (
                items.map((item) => (
                  <article key={item.id} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <div className="flex items-center justify-between">
                      <p className="m-0 text-sm font-semibold">{item.name || '--'}</p>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">#{item.id}</span>
                    </div>
                    <p className="mt-1 mb-0 text-xs text-[hsl(var(--muted-foreground))]">{getPrimarySerial(item) || '--'}</p>
                    <p className="mt-2 mb-0 text-sm">類型：{toAssetTypeLabel(item.asset_type)}</p>
                    <p className="mt-1 mb-0 text-sm">地點：{item.location || '--'}</p>
                    <p className="mt-1 mb-0 text-sm">狀態：{toAssetStatusLabel(item.asset_status, assetStatusLabelMap)}</p>
                    <div className="mt-3 flex gap-2">
                      <Link className="flex-1" to="/inventory/edit/$itemId" params={{ itemId: String(item.id) }}>
                        <Button className="w-full" size="sm" variant="secondary">編輯</Button>
                      </Link>
                      <Button size="sm" variant="destructive" onClick={() => setConfirmDeleteItem(item)}>
                        刪除
                      </Button>
                    </div>
                  </article>
                ))
              )}
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

      <Dialog
        open={Boolean(confirmDeleteItem)}
        onClose={() => setConfirmDeleteItem(null)}
        title="確認刪除"
        description={`確定要刪除財產「${confirmDeleteLabel}」嗎？`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeleteItem(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteItem) {
                  void handleDeleteItem(confirmDeleteItem)
                }
              }}
              disabled={deletingItemId === confirmDeleteItem?.id}
            >
              {deletingItemId === confirmDeleteItem?.id ? '刪除中...' : '刪除'}
            </Button>
          </>
        }
      />
    </>
  )
}
