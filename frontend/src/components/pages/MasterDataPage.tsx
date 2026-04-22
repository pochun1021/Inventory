import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SectionCard } from '../ui/section-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import {
  createAssetCategoryOption,
  deleteAssetCategoryOption,
  fetchAssetCategoryOptions,
  updateAssetCategoryOption,
} from './assetCategoryLookup'
import {
  createAssetStatusOption,
  deleteAssetStatusOption,
  fetchAssetStatusOptions,
  updateAssetStatusOption,
} from './assetStatusLookup'
import type { AssetCategoryOption, AssetStatusOption } from './types'

type AssetStatusDialogState = {
  open: boolean
  mode: 'create' | 'edit'
  originalCode: string
  code: string
  description: string
}

type AssetCategoryDialogState = {
  open: boolean
  mode: 'create' | 'edit'
  originalNameCode: string
  originalNameCode2: string
  name_code: string
  name_code2: string
  asset_category_name: string
  description: string
}

const emptyAssetStatusDialog = (): AssetStatusDialogState => ({
  open: false,
  mode: 'create',
  originalCode: '',
  code: '',
  description: '',
})

const emptyAssetCategoryDialog = (): AssetCategoryDialogState => ({
  open: false,
  mode: 'create',
  originalNameCode: '',
  originalNameCode2: '',
  name_code: '',
  name_code2: '',
  asset_category_name: '',
  description: '',
})

export function MasterDataPage() {
  const [assetStatuses, setAssetStatuses] = useState<AssetStatusOption[]>([])
  const [assetCategories, setAssetCategories] = useState<AssetCategoryOption[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [loadingCategory, setLoadingCategory] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [statusActionError, setStatusActionError] = useState('')
  const [categoryActionError, setCategoryActionError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingStatusCode, setDeletingStatusCode] = useState<string | null>(null)
  const [deletingCategory, setDeletingCategory] = useState<{ name_code: string; name_code2: string } | null>(null)
  const [statusDialog, setStatusDialog] = useState<AssetStatusDialogState>(emptyAssetStatusDialog())
  const [categoryDialog, setCategoryDialog] = useState<AssetCategoryDialogState>(emptyAssetCategoryDialog())

  const loadAssetStatuses = async () => {
    setLoadingStatus(true)
    setStatusError('')
    try {
      const rows = await fetchAssetStatusOptions()
      setAssetStatuses(rows.sort((left, right) => left.code.localeCompare(right.code, 'zh-TW', { numeric: true, sensitivity: 'base' })))
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : '無法讀取資產狀態主檔。')
    } finally {
      setLoadingStatus(false)
    }
  }

  const loadAssetCategories = async () => {
    setLoadingCategory(true)
    setCategoryError('')
    try {
      const rows = await fetchAssetCategoryOptions()
      setAssetCategories(
        rows.sort((left, right) => {
          const leftKey = `${left.name_code}-${left.name_code2}`
          const rightKey = `${right.name_code}-${right.name_code2}`
          return leftKey.localeCompare(rightKey, 'zh-TW', { numeric: true, sensitivity: 'base' })
        }),
      )
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : '無法讀取資產分類主檔。')
    } finally {
      setLoadingCategory(false)
    }
  }

  useEffect(() => {
    void loadAssetStatuses()
    void loadAssetCategories()
  }, [])

  const openCreateStatusDialog = () => {
    setStatusActionError('')
    setStatusDialog({
      open: true,
      mode: 'create',
      originalCode: '',
      code: '',
      description: '',
    })
  }

  const openEditStatusDialog = (row: AssetStatusOption) => {
    setStatusActionError('')
    setStatusDialog({
      open: true,
      mode: 'edit',
      originalCode: row.code,
      code: row.code,
      description: row.description || '',
    })
  }

  const closeStatusDialog = () => {
    if (savingStatus) {
      return
    }
    setStatusDialog(emptyAssetStatusDialog())
  }

  const submitStatusDialog = async () => {
    const code = statusDialog.code.trim()
    const description = statusDialog.description.trim()

    if (!code) {
      setStatusActionError('狀態碼為必填。')
      return
    }

    setSavingStatus(true)
    setStatusActionError('')
    try {
      if (statusDialog.mode === 'create') {
        await createAssetStatusOption({ code, description })
      } else {
        await updateAssetStatusOption(statusDialog.originalCode, { code, description })
      }
      setStatusDialog(emptyAssetStatusDialog())
      await loadAssetStatuses()
    } catch (error) {
      setStatusActionError(error instanceof Error ? error.message : '儲存資產狀態失敗。')
    } finally {
      setSavingStatus(false)
    }
  }

  const confirmDeleteStatus = (code: string) => {
    setStatusActionError('')
    setDeletingStatusCode(code)
  }

  const deleteStatus = async () => {
    if (!deletingStatusCode) {
      return
    }
    setSavingStatus(true)
    setStatusActionError('')
    try {
      await deleteAssetStatusOption(deletingStatusCode)
      setDeletingStatusCode(null)
      await loadAssetStatuses()
    } catch (error) {
      setStatusActionError(error instanceof Error ? error.message : '刪除資產狀態失敗。')
    } finally {
      setSavingStatus(false)
    }
  }

  const openCreateCategoryDialog = () => {
    setCategoryActionError('')
    setCategoryDialog({
      open: true,
      mode: 'create',
      originalNameCode: '',
      originalNameCode2: '',
      name_code: '',
      name_code2: '',
      asset_category_name: '',
      description: '',
    })
  }

  const openEditCategoryDialog = (row: AssetCategoryOption) => {
    setCategoryActionError('')
    setCategoryDialog({
      open: true,
      mode: 'edit',
      originalNameCode: row.name_code,
      originalNameCode2: row.name_code2,
      name_code: row.name_code,
      name_code2: row.name_code2,
      asset_category_name: row.asset_category_name || '',
      description: row.description || '',
    })
  }

  const closeCategoryDialog = () => {
    if (savingCategory) {
      return
    }
    setCategoryDialog(emptyAssetCategoryDialog())
  }

  const submitCategoryDialog = async () => {
    const nameCode = categoryDialog.name_code.trim()
    const nameCode2 = categoryDialog.name_code2.trim()
    const categoryName = categoryDialog.asset_category_name.trim()
    const description = categoryDialog.description.trim()

    if (!nameCode || !nameCode2 || !categoryName) {
      setCategoryActionError('大類代碼、小類代碼、分類名稱皆為必填。')
      return
    }

    setSavingCategory(true)
    setCategoryActionError('')
    try {
      if (categoryDialog.mode === 'create') {
        await createAssetCategoryOption({
          name_code: nameCode,
          name_code2: nameCode2,
          asset_category_name: categoryName,
          description,
        })
      } else {
        await updateAssetCategoryOption(categoryDialog.originalNameCode, categoryDialog.originalNameCode2, {
          name_code: nameCode,
          name_code2: nameCode2,
          asset_category_name: categoryName,
          description,
        })
      }
      setCategoryDialog(emptyAssetCategoryDialog())
      await loadAssetCategories()
    } catch (error) {
      setCategoryActionError(error instanceof Error ? error.message : '儲存資產分類失敗。')
    } finally {
      setSavingCategory(false)
    }
  }

  const confirmDeleteCategory = (row: AssetCategoryOption) => {
    setCategoryActionError('')
    setDeletingCategory({ name_code: row.name_code, name_code2: row.name_code2 })
  }

  const deleteCategory = async () => {
    if (!deletingCategory) {
      return
    }
    setSavingCategory(true)
    setCategoryActionError('')
    try {
      await deleteAssetCategoryOption(deletingCategory.name_code, deletingCategory.name_code2)
      setDeletingCategory(null)
      await loadAssetCategories()
    } catch (error) {
      setCategoryActionError(error instanceof Error ? error.message : '刪除資產分類失敗。')
    } finally {
      setSavingCategory(false)
    }
  }

  return (
    <div className="grid gap-4">
      <Tabs defaultValue="asset-status">
        <TabsList>
          <TabsTrigger value="asset-status">資產狀態碼</TabsTrigger>
          <TabsTrigger value="asset-category">資產分類</TabsTrigger>
        </TabsList>

        <TabsContent value="asset-status">
          <SectionCard title="資產狀態碼主檔" description="維護資產狀態下拉選單（新增、編輯、刪除）。">
            <div className="mb-3 flex justify-end">
              <Button type="button" onClick={openCreateStatusDialog}>
                新增狀態碼
              </Button>
            </div>
            {statusActionError ? <p className="mt-0 mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{statusActionError}</p> : null}
            {statusError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{statusError}</p> : null}
            {!statusError && loadingStatus ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">資料載入中...</p> : null}
            {!statusError && !loadingStatus && assetStatuses.length === 0 ? (
              <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">目前沒有資產狀態資料。</p>
            ) : null}
            {!statusError && !loadingStatus && assetStatuses.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>狀態碼</TableHead>
                      <TableHead>說明</TableHead>
                      <TableHead className="w-[180px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetStatuses.map((row) => (
                      <TableRow key={row.code}>
                        <TableCell className="font-semibold">{row.code}</TableCell>
                        <TableCell>{row.description || '--'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" size="sm" onClick={() => openEditStatusDialog(row)}>
                              編輯
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => confirmDeleteStatus(row.code)}>
                              刪除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </SectionCard>
        </TabsContent>

        <TabsContent value="asset-category">
          <SectionCard title="資產分類主檔" description="維護資產分類代碼對照（新增、編輯、刪除）。">
            <div className="mb-3 flex justify-end">
              <Button type="button" onClick={openCreateCategoryDialog}>
                新增分類
              </Button>
            </div>
            {categoryActionError ? <p className="mt-0 mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{categoryActionError}</p> : null}
            {categoryError ? <p className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{categoryError}</p> : null}
            {!categoryError && loadingCategory ? <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">資料載入中...</p> : null}
            {!categoryError && !loadingCategory && assetCategories.length === 0 ? (
              <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">目前沒有資產分類資料。</p>
            ) : null}
            {!categoryError && !loadingCategory && assetCategories.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-[hsl(var(--border))]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>大類代碼</TableHead>
                      <TableHead>分類名稱</TableHead>
                      <TableHead>小類代碼</TableHead>
                      <TableHead>小類說明</TableHead>
                      <TableHead className="w-[180px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetCategories.map((row) => (
                      <TableRow key={`${row.name_code}__${row.name_code2}`}>
                        <TableCell className="font-semibold">{row.name_code}</TableCell>
                        <TableCell>{row.asset_category_name || '--'}</TableCell>
                        <TableCell>{row.name_code2}</TableCell>
                        <TableCell>{row.description || '--'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button type="button" variant="secondary" size="sm" onClick={() => openEditCategoryDialog(row)}>
                              編輯
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => confirmDeleteCategory(row)}>
                              刪除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog
        open={statusDialog.open}
        onClose={closeStatusDialog}
        title={statusDialog.mode === 'create' ? '新增資產狀態碼' : '編輯資產狀態碼'}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={closeStatusDialog} disabled={savingStatus}>
              取消
            </Button>
            <Button type="button" onClick={() => void submitStatusDialog()} disabled={savingStatus}>
              {savingStatus ? '儲存中...' : '儲存'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="asset-status-code">狀態碼</Label>
            <Input
              id="asset-status-code"
              value={statusDialog.code}
              onChange={(event) => setStatusDialog((prev) => ({ ...prev, code: event.target.value }))}
              disabled={savingStatus}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-status-description">說明</Label>
            <Input
              id="asset-status-description"
              value={statusDialog.description}
              onChange={(event) => setStatusDialog((prev) => ({ ...prev, description: event.target.value }))}
              disabled={savingStatus}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deletingStatusCode !== null}
        onClose={() => (savingStatus ? null : setDeletingStatusCode(null))}
        title="刪除資產狀態碼"
        description={`確定要刪除狀態碼 ${deletingStatusCode ?? ''} 嗎？此操作無法復原。`}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeletingStatusCode(null)} disabled={savingStatus}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteStatus()} disabled={savingStatus}>
              {savingStatus ? '刪除中...' : '確認刪除'}
            </Button>
          </>
        }
      />

      <Dialog
        open={categoryDialog.open}
        onClose={closeCategoryDialog}
        title={categoryDialog.mode === 'create' ? '新增資產分類' : '編輯資產分類'}
        panelClassName="max-w-xl"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={closeCategoryDialog} disabled={savingCategory}>
              取消
            </Button>
            <Button type="button" onClick={() => void submitCategoryDialog()} disabled={savingCategory}>
              {savingCategory ? '儲存中...' : '儲存'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="asset-category-name-code">大類代碼</Label>
            <Input
              id="asset-category-name-code"
              value={categoryDialog.name_code}
              onChange={(event) => setCategoryDialog((prev) => ({ ...prev, name_code: event.target.value }))}
              disabled={savingCategory}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="asset-category-name-code2">小類代碼</Label>
            <Input
              id="asset-category-name-code2"
              value={categoryDialog.name_code2}
              onChange={(event) => setCategoryDialog((prev) => ({ ...prev, name_code2: event.target.value }))}
              disabled={savingCategory}
            />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="asset-category-name">分類名稱</Label>
            <Input
              id="asset-category-name"
              value={categoryDialog.asset_category_name}
              onChange={(event) => setCategoryDialog((prev) => ({ ...prev, asset_category_name: event.target.value }))}
              disabled={savingCategory}
            />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="asset-category-description">小類說明</Label>
            <Input
              id="asset-category-description"
              value={categoryDialog.description}
              onChange={(event) => setCategoryDialog((prev) => ({ ...prev, description: event.target.value }))}
              disabled={savingCategory}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deletingCategory !== null}
        onClose={() => (savingCategory ? null : setDeletingCategory(null))}
        title="刪除資產分類"
        description={
          deletingCategory
            ? `確定要刪除分類 ${deletingCategory.name_code} / ${deletingCategory.name_code2} 嗎？此操作無法復原。`
            : undefined
        }
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeletingCategory(null)} disabled={savingCategory}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteCategory()} disabled={savingCategory}>
              {savingCategory ? '刪除中...' : '確認刪除'}
            </Button>
          </>
        }
      />
    </div>
  )
}
