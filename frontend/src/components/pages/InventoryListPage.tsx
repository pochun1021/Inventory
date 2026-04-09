import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import { DataPagination } from '../ui/data-pagination'
import { buildAssetStatusLabelMap, fetchAssetStatusOptions, toAssetStatusLabel } from './assetStatusLookup'
import type { InventoryItem, PaginatedResponse } from './types'

const ASSET_TYPE_LABEL_MAP: Record<string, string> = {
  '11': '財產',
  A1: '物品',
  A2: '其他',
}

const CHINESE_CHARACTER_REGEX = /[\u4e00-\u9fff]/
const fieldClass = 'rounded-[10px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5'
const tableHeaderClass = 'whitespace-nowrap border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-2 text-left'
const tableCellClass = 'border border-[hsl(var(--border))] p-2 text-left align-top break-words'
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

function readInitialState() {
  const params = new URLSearchParams(window.location.search)
  const correctionParam = params.get('correction_status')
  const correctionStatus = correctionParam === 'needs_fix' ? correctionParam : 'all'

  return {
    keyword: params.get('keyword') ?? '',
    selectedAssetType: params.get('asset_type') ?? 'all',
    selectedCorrectionStatus: correctionStatus as 'all' | 'needs_fix',
    showDonated: parseBoolean(params.get('include_donated'), false),
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: parsePositiveInt(params.get('page_size'), 10),
  }
}

export function InventoryListPage() {
  const initialState = readInitialState()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [assetTypeOptions, setAssetTypeOptions] = useState<string[]>(['all'])
  const [assetStatusLabelMap, setAssetStatusLabelMap] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState(initialState.keyword)
  const [selectedAssetType, setSelectedAssetType] = useState(initialState.selectedAssetType)
  const [selectedCorrectionStatus, setSelectedCorrectionStatus] = useState<'all' | 'needs_fix'>(initialState.selectedCorrectionStatus)
  const [showDonated, setShowDonated] = useState(initialState.showDonated)
  const [page, setPage] = useState(initialState.page)
  const [pageSize, setPageSize] = useState(initialState.pageSize)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
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
    if (selectedCorrectionStatus !== 'all') {
      params.set('correction_status', selectedCorrectionStatus)
    }
    if (showDonated) {
      params.set('include_donated', 'true')
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
  }, [keyword, selectedAssetType, selectedCorrectionStatus, showDonated, page, pageSize])

  useEffect(() => {
    const loadItems = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(pageSize),
          include_donated: String(showDonated),
          correction_status: selectedCorrectionStatus,
        })
        if (keyword.trim()) {
          params.set('keyword', keyword.trim())
        }
        if (selectedAssetType !== 'all') {
          params.set('asset_type', selectedAssetType)
        }
        const response = await fetch(apiUrl(`/api/items?${params.toString()}`))
        if (!response.ok) {
          throw new Error('無法載入財產清單')
        }
        const payload = (await response.json()) as PaginatedResponse<InventoryItem>
        setItems(payload.items)
        setTotal(payload.total)
        setTotalPages(payload.total_pages)
      } catch {
        setLoadError('目前無法讀取財產清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadItems()
  }, [keyword, selectedAssetType, selectedCorrectionStatus, showDonated, page, pageSize, reloadKey])

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

    const result = await Swal.fire({
      title: '確認刪除',
      text: `確定要刪除財產「${item.name || getPrimarySerial(item) || item.id}」嗎？`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
    })

    if (!result.isConfirmed) {
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
      <section className="rounded-2xl bg-[hsl(var(--card))] p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid grid-cols-1 gap-2">
          <label htmlFor="search-input" className="font-bold">
            關鍵字搜尋
          </label>
          <input
            className={fieldClass}
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

          <label htmlFor="asset-type-filter" className="font-bold">
            資產類型篩選
          </label>
          <select
            className={fieldClass}
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
          </select>

          <label htmlFor="correction-filter" className="font-bold">
            待修正篩選
          </label>
          <select
            className={fieldClass}
            id="correction-filter"
            value={selectedCorrectionStatus}
            onChange={(event) => {
              setSelectedCorrectionStatus(event.target.value as 'all' | 'needs_fix')
              setPage(1)
            }}
          >
            <option value="all">全部資料</option>
            <option value="needs_fix">僅顯示待修正資料</option>
          </select>

          <label className="mt-1 inline-flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={showDonated}
              onChange={(event) => {
                setShowDonated(event.target.checked)
                setPage(1)
              }}
            />
            顯示已捐贈資料
          </label>

          <p className="mt-1 text-[0.95rem] text-slate-600">共 {total} 筆資料</p>
          {correctionSummary !== null ? <p className="mt-1 text-[0.95rem] text-slate-600">本頁待修正：{correctionSummary} 筆</p> : null}
        </div>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}
        {actionMessage ? <p className="mt-0.5 rounded-[10px] bg-emerald-50 px-3.5 py-3 text-emerald-700">{actionMessage}</p> : null}

        {!loading && !loadError ? (
          <>
            <div className="w-full overflow-x-auto">
              <table className="mt-2 w-full table-fixed border-collapse bg-[hsl(var(--card))]">
                <thead>
                  <tr>
                    {['#', '資產類型', '財產序號', '品名', '型號', '規格', '單位', '購置日期', '放置地點', '保管人', '資產狀態', '操作'].map((header) => (
                      <th key={header} className={tableHeaderClass}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="border border-[hsl(var(--border))] p-2 text-center text-slate-500">
                        查無符合條件的財產資料
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {item.id ? (
                            <Link
                              className="font-bold text-blue-700 no-underline hover:underline"
                              to="/inventory/edit/$itemId"
                              params={{ itemId: String(item.id) }}
                            >
                              {item.id}
                            </Link>
                          ) : (
                            '--'
                          )}
                        </td>
                        <td className={tableCellClass}>{toAssetTypeLabel(item.asset_type)}</td>
                        <td className={tableCellClass}>{getPrimarySerial(item) || '--'}</td>
                        <td className={tableCellClass}>{item.name || '--'}</td>
                        <td className={tableCellClass}>{item.model || '--'}</td>
                        <td className={tableCellClass}>{item.specification || '--'}</td>
                        <td className={tableCellClass}>{item.unit || '--'}</td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>{item.purchase_date ?? '--'}</td>
                        <td className={tableCellClass}>{item.location || '--'}</td>
                        <td className={tableCellClass}>{item.keeper || '--'}</td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                            {toAssetStatusLabel(item.asset_status, assetStatusLabelMap)}
                          </span>
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          <button
                            type="button"
                            className="cursor-pointer rounded-[10px] border-none bg-red-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-red-300"
                            onClick={() => void handleDeleteItem(item)}
                            disabled={deletingItemId === item.id}
                          >
                            {deletingItemId === item.id ? '刪除中...' : '刪除'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
      </section>
    </>
  )
}
