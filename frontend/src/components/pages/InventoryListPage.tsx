import { useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { apiUrl } from '../../api'
import type { InventoryItem } from './types'

const KIND_LABEL_MAP: Record<string, string> = {
  asset: '財產',
  item: '物品',
  other: '其他',
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const CHINESE_CHARACTER_REGEX = /[\u4e00-\u9fff]/
const fieldClass = 'rounded-[10px] border border-slate-300 bg-white px-3 py-2.5'
const buttonClass = 'cursor-pointer rounded-[10px] border-none bg-blue-600 px-3 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300'
const tableHeaderClass = 'whitespace-nowrap border border-slate-200 bg-slate-50 p-2 text-left'
const tableCellClass = 'border border-slate-200 p-2 text-left align-top break-words'

export function InventoryListPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [selectedKind, setSelectedKind] = useState('all')
  const [selectedCorrectionStatus, setSelectedCorrectionStatus] = useState<'all' | 'needs_fix'>('all')
  const [pageSize, setPageSize] = useState(10)
  const [customPageSize, setCustomPageSize] = useState('10')
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null)

  useEffect(() => {
    const loadItems = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch(apiUrl('/api/items'))
        if (!response.ok) {
          throw new Error('無法載入財產清單')
        }
        const payload = (await response.json()) as InventoryItem[]
        setItems(payload)
      } catch {
        setLoadError('目前無法讀取財產清單，請稍後重試。')
      } finally {
        setLoading(false)
      }
    }

    void loadItems()
  }, [])

  const toKindLabel = (kind: string) => {
    if (!kind) {
      return '--'
    }

    return KIND_LABEL_MAP[kind] ?? kind
  }

  const kindOptions = useMemo(() => {
    const uniqueKinds = new Set(items.map((item) => item.kind).filter((kind): kind is string => Boolean(kind?.trim())))
    return ['all', ...Array.from(uniqueKinds)]
  }, [items])

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const normalizeSearchValue = (value: unknown) => (typeof value === 'string' ? value : '').toLowerCase()
    const isNeedsFix = (item: InventoryItem) => {
      const propertyNumber = item.property_number?.trim() ?? ''
      return propertyNumber.length === 0 || CHINESE_CHARACTER_REGEX.test(propertyNumber)
    }

    return items.filter((item) => {
      const passesKindFilter = selectedKind === 'all' || item.kind === selectedKind
      if (!passesKindFilter) {
        return false
      }

      const passesCorrectionStatusFilter = selectedCorrectionStatus === 'all' || isNeedsFix(item)
      if (!passesCorrectionStatusFilter) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const searchFields = [item.property_number, item.name, item.model, item.location, item.keeper]
      return searchFields.some((field) => normalizeSearchValue(field).includes(normalizedKeyword))
    })
  }, [items, keyword, selectedKind, selectedCorrectionStatus])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredItems.slice(startIndex, startIndex + pageSize)
  }, [filteredItems, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [keyword, selectedKind, selectedCorrectionStatus, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handlePresetPageSize = (size: number) => {
    setPageSize(size)
    setCustomPageSize(String(size))
  }

  const handleCustomPageSize = () => {
    const nextSize = Number(customPageSize)
    if (!Number.isInteger(nextSize) || nextSize <= 0) {
      return
    }

    setPageSize(nextSize)
  }

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!item.id) {
      return
    }

    const result = await Swal.fire({
      title: '確認刪除',
      text: `確定要刪除財產「${item.name || item.property_number || item.id}」嗎？`,
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

      setItems((previousItems) => previousItems.filter((existingItem) => existingItem.id !== item.id))
      setActionMessage('財產資料已刪除。')
    } catch {
      setLoadError('刪除財產資料失敗，請稍後再試。')
    } finally {
      setDeletingItemId(null)
    }
  }

  return (
    <>
      <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <h1 className="mt-0">財產清單</h1>
        <p className="mt-2 text-slate-500">可依財產編號、品名、型號、放置地點或保管人快速查詢。</p>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
        <div className="mb-4 grid grid-cols-1 gap-2">
          <label htmlFor="search-input" className="font-bold">
            關鍵字搜尋
          </label>
          <input
            className={fieldClass}
            id="search-input"
            type="search"
            placeholder="輸入財產編號、品名、型號..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />

          <label htmlFor="kind-filter" className="font-bold">
            類別篩選
          </label>
          <select className={fieldClass} id="kind-filter" value={selectedKind} onChange={(event) => setSelectedKind(event.target.value)}>
            {kindOptions.map((kindValue) => (
              <option key={kindValue} value={kindValue}>
                {kindValue === 'all' ? '全部類別' : toKindLabel(kindValue)}
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
            onChange={(event) => setSelectedCorrectionStatus(event.target.value as 'all' | 'needs_fix')}
          >
            <option value="all">全部資料</option>
            <option value="needs_fix">僅顯示待修正資料</option>
          </select>

          <div className="grid gap-2">
            <span className="font-bold">每頁筆數</span>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PAGE_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`cursor-pointer rounded-[10px] border px-3 py-2 font-bold ${size === pageSize ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-300 bg-blue-100 text-blue-700'}`}
                  onClick={() => handlePresetPageSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                className={`${fieldClass} w-26`}
                type="number"
                min={1}
                value={customPageSize}
                onChange={(event) => setCustomPageSize(event.target.value)}
              />
              <button className={buttonClass} type="button" onClick={handleCustomPageSize}>
                套用
              </button>
            </div>
          </div>

          <p className="mt-1 text-[0.95rem] text-slate-600">共 {filteredItems.length} 筆資料</p>
          <p className="mt-1 text-[0.95rem] text-slate-600">
            第 {currentPage} / {totalPages} 頁
          </p>
        </div>

        {loading ? <p className="mt-0.5 rounded-[10px] px-3.5 py-3">資料載入中...</p> : null}
        {loadError ? <p className="mt-0.5 rounded-[10px] bg-red-50 px-3.5 py-3 text-red-700">{loadError}</p> : null}
        {actionMessage ? <p className="mt-0.5 rounded-[10px] bg-emerald-50 px-3.5 py-3 text-emerald-700">{actionMessage}</p> : null}

        {!loading && !loadError ? (
          <>
            <div className="w-full overflow-x-auto">
              <table className="mt-2 w-full table-fixed border-collapse bg-white">
                <thead>
                  <tr>
                    {['#', '類別', '財產編號', '品名', '型號', '規格', '單位', '購置日期', '放置地點', '保管人', '操作'].map((header) => (
                      <th key={header} className={tableHeaderClass}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="border border-slate-200 p-2 text-center text-slate-500">
                        查無符合條件的財產資料
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((item) => (
                      <tr key={item.id}>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          {item.id ? <a className="font-bold text-blue-700 no-underline hover:underline" href={`/inventory/edit/${item.id}`}>{item.id}</a> : '--'}
                        </td>
                        <td className={tableCellClass}>{toKindLabel(item.kind)}</td>
                        <td className={tableCellClass}>{item.property_number || '--'}</td>
                        <td className={tableCellClass}>{item.name || '--'}</td>
                        <td className={tableCellClass}>{item.model || '--'}</td>
                        <td className={tableCellClass}>{item.specification || '--'}</td>
                        <td className={tableCellClass}>{item.unit || '--'}</td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>{item.purchase_date ?? '--'}</td>
                        <td className={tableCellClass}>{item.location || '--'}</td>
                        <td className={tableCellClass}>{item.keeper || '--'}</td>
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

            {filteredItems.length > 0 ? (
              <div className="mt-3.5 flex items-center justify-end gap-3">
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  上一頁
                </button>
                <span>
                  目前第 {currentPage} 頁，共 {totalPages} 頁
                </span>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一頁
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  )
}
