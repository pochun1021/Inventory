import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import type { InventoryItem } from './types'

const KIND_LABEL_MAP: Record<string, string> = {
  assets: '物品',
  supplies: '財產',
  other: '其他',
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export function InventoryListPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [selectedKind, setSelectedKind] = useState('all')
  const [pageSize, setPageSize] = useState(10)
  const [customPageSize, setCustomPageSize] = useState('10')
  const [currentPage, setCurrentPage] = useState(1)


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

    return items.filter((item) => {
      const passesKindFilter = selectedKind === 'all' || item.kind === selectedKind
      if (!passesKindFilter) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const searchFields = [item.property_number, item.name, item.model, item.location, item.keeper]
      return searchFields.some((field) => normalizeSearchValue(field).includes(normalizedKeyword))
    })
  }, [items, keyword, selectedKind])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredItems.slice(startIndex, startIndex + pageSize)
  }, [filteredItems, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [keyword, selectedKind, pageSize])

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

  return (
    <>
      <section className="dashboard-header">
        <h1>財產清單</h1>
        <p className="subtitle">可依財產編號、品名、型號、放置地點或保管人快速查詢。</p>
      </section>

      <section className="list-card">
        <div className="list-toolbar">
          <label htmlFor="search-input" className="search-label">
            關鍵字搜尋
          </label>
          <input
            id="search-input"
            type="search"
            placeholder="輸入財產編號、品名、型號..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />

          <label htmlFor="kind-filter" className="search-label">
            類別篩選
          </label>
          <select id="kind-filter" value={selectedKind} onChange={(event) => setSelectedKind(event.target.value)}>
            {kindOptions.map((kindValue) => (
              <option key={kindValue} value={kindValue}>
                {kindValue === 'all' ? '全部類別' : toKindLabel(kindValue)}
              </option>
            ))}
          </select>

          <div className="pagination-size-row">
            <span className="search-label">每頁筆數</span>
            <div className="pagination-size-options">
              {DEFAULT_PAGE_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className="page-size-button"
                  data-active={size === pageSize}
                  onClick={() => handlePresetPageSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="pagination-custom-input">
              <input
                type="number"
                min={1}
                value={customPageSize}
                onChange={(event) => setCustomPageSize(event.target.value)}
              />
              <button type="button" onClick={handleCustomPageSize}>
                套用
              </button>
            </div>
          </div>

          <p className="list-count">共 {filteredItems.length} 筆資料</p>
          <p className="list-count">
            第 {currentPage} / {totalPages} 頁
          </p>
        </div>

        {loading ? <p className="message">資料載入中...</p> : null}
        {loadError ? <p className="message error">{loadError}</p> : null}

        {!loading && !loadError ? (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>類別</th>
                    <th>財產編號</th>
                    <th>品名</th>
                    <th>型號</th>
                    <th>規格</th>
                    <th>單位</th>
                    <th>購置日期</th>
                    <th>放置地點</th>
                    <th>保管人</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty-row">
                        查無符合條件的財產資料
                      </td>
                    </tr>
                  ) : (
                    paginatedItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.id || '--'}</td>
                        <td>{toKindLabel(item.kind)}</td>
                        <td>{item.property_number || '--'}</td>
                        <td>{item.name || '--'}</td>
                        <td>{item.model || '--'}</td>
                        <td>{item.specification || '--'}</td>
                        <td>{item.unit || '--'}</td>
                        <td>{item.purchase_date ?? '--'}</td>
                        <td>{item.location || '--'}</td>
                        <td>{item.keeper || '--'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredItems.length > 0 ? (
              <div className="pagination-controls">
                <button
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
