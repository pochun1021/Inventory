import { TopNav } from './components/TopNav'
import { DashboardPage } from './components/pages/DashboardPage'
import { BorrowPage } from './components/pages/BorrowPage'
import { BorrowListPage } from './components/pages/BorrowListPage'
import { InventoryFormPage } from './components/pages/InventoryFormPage'
import { InventoryListPage } from './components/pages/InventoryListPage'
import { IssueListPage } from './components/pages/IssueListPage'
import { IssuePage } from './components/pages/IssuePage'
import { UploadPage } from './components/pages/UploadPage'

function parseEditItemId(pathname: string): number | null {
  const matchedParts = pathname.match(/^\/inventory\/edit\/(\d+)$/)
  if (!matchedParts) {
    return null
  }

  const parsedId = Number(matchedParts[1])
  return Number.isInteger(parsedId) ? parsedId : null
}

function parseIssueRequestId(pathname: string): number | null {
  const matchedParts = pathname.match(/^\/issues\/(\d+)$/)
  if (!matchedParts) {
    return null
  }

  const parsedId = Number(matchedParts[1])
  return Number.isInteger(parsedId) ? parsedId : null
}

function parseBorrowRequestId(pathname: string): number | null {
  const matchedParts = pathname.match(/^\/borrows\/(\d+)$/)
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
  const isIssueListPage = pathname === '/issues'
  const isIssueCreatePage = pathname === '/issues/new'
  const isBorrowListPage = pathname === '/borrows'
  const isBorrowCreatePage = pathname === '/borrows/new'
  const isInventoryPage = pathname === '/inventory'
  const isCreateInventoryPage = pathname === '/inventory/new'
  const editItemId = parseEditItemId(pathname)
  const editIssueRequestId = parseIssueRequestId(pathname)
  const editBorrowRequestId = parseBorrowRequestId(pathname)

  return (
    <main className="mx-auto grid max-h-screen w-full max-w-[980px] gap-5 px-4 pb-12 pt-8">
      <TopNav pathname={pathname} />

      {isDashboardPage ? <DashboardPage /> : null}
      {isIssueListPage ? <IssueListPage /> : null}
      {isIssueCreatePage ? <IssuePage /> : null}
      {editIssueRequestId ? <IssuePage requestId={editIssueRequestId} /> : null}
      {isBorrowListPage ? <BorrowListPage /> : null}
      {isBorrowCreatePage ? <BorrowPage /> : null}
      {editBorrowRequestId ? <BorrowPage requestId={editBorrowRequestId} /> : null}
      {isInventoryPage ? <InventoryListPage /> : null}
      {isUploadPage ? <UploadPage /> : null}
      {isCreateInventoryPage ? <InventoryFormPage /> : null}
      {editItemId ? <InventoryFormPage itemId={editItemId} /> : null}

      {!isDashboardPage &&
      !isIssueListPage &&
      !isIssueCreatePage &&
      !isBorrowListPage &&
      !isBorrowCreatePage &&
      !editIssueRequestId &&
      !editBorrowRequestId &&
      !isUploadPage &&
      !isInventoryPage &&
      !isCreateInventoryPage &&
      !editItemId ? (
        <section className="rounded-2xl bg-white px-7 py-6 shadow-[0_12px_30px_rgba(31,41,55,0.12)]">
          <h1 className="mt-0">找不到頁面</h1>
          <p className="mt-2 text-slate-500">請使用上方導覽前往 Dashboard、領用/借用清單、財產清單、新增資料或上傳頁面。</p>
        </section>
      ) : null}
    </main>
  )
}

export default App
