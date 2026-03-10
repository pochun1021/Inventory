import { TopNav } from './components/TopNav'
import { DashboardPage } from './components/pages/DashboardPage'
import { InventoryFormPage } from './components/pages/InventoryFormPage'
import { InventoryListPage } from './components/pages/InventoryListPage'
import { UploadPage } from './components/pages/UploadPage'

function parseEditItemId(pathname: string): number | null {
  const matchedParts = pathname.match(/^\/inventory\/edit\/(\d+)$/)
  if (!matchedParts) {
    return null
  }

  const parsedId = Number(matchedParts[1])
  return Number.isInteger(parsedId) ? parsedId : null
}

function App() {
  const pathname = window.location.pathname
  const isUploadPage = pathname === '/upload'
  const isDashboardPage = pathname === '/'
  const isInventoryPage = pathname === '/inventory'
  const isCreateInventoryPage = pathname === '/inventory/new'
  const editItemId = parseEditItemId(pathname)

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[980px] gap-5 px-4 pb-12 pt-8">
      <TopNav pathname={pathname} />

      {isDashboardPage ? <DashboardPage /> : null}
      {isInventoryPage ? <InventoryListPage /> : null}
      {isUploadPage ? <UploadPage /> : null}
      {isCreateInventoryPage ? <InventoryFormPage /> : null}
      {editItemId ? <InventoryFormPage itemId={editItemId} /> : null}

      {!isDashboardPage && !isUploadPage && !isInventoryPage && !isCreateInventoryPage && !editItemId ? (
        <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
          <h1 className="mt-0">找不到頁面</h1>
          <p className="mt-2 text-slate-500">請使用上方導覽前往 Dashboard、財產清單、新增庫存或上傳頁面。</p>
        </section>
      ) : null}
    </main>
  )
}

export default App
