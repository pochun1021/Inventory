import { RouterProvider, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppShell } from './components/layout/AppShell'
import { BorrowListPage } from './components/pages/BorrowListPage'
import { BorrowPage } from './components/pages/BorrowPage'
import { DashboardPage } from './components/pages/DashboardPage'
import { DonationListPage } from './components/pages/DonationListPage'
import { DonationPage } from './components/pages/DonationPage'
import { InventoryFormPage } from './components/pages/InventoryFormPage'
import { InventoryListPage } from './components/pages/InventoryListPage'
import { IssueListPage } from './components/pages/IssueListPage'
import { IssuePage } from './components/pages/IssuePage'
import { LogsPage } from './components/pages/LogsPage'
import { UploadPage } from './components/pages/UploadPage'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card'

function parsePositiveId(value: string): number | null {
  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function NotFoundPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>找不到頁面</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">請使用側邊導覽前往 Dashboard、財產、領用、借用、捐贈、上傳或日誌頁面。</p>
      </CardContent>
    </Card>
  )
}

function InvalidRouteParameter() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>參數格式錯誤</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]">網址中的資料編號無效，請回到清單頁重新操作。</p>
      </CardContent>
    </Card>
  )
}

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFoundPage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inventory',
  component: InventoryListPage,
})

const inventoryCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inventory/new',
  component: InventoryFormPage,
})

function InventoryEditRouteComponent() {
  const { itemId } = inventoryEditRoute.useParams()
  const parsedItemId = parsePositiveId(itemId)
  if (!parsedItemId) {
    return <InvalidRouteParameter />
  }
  return <InventoryFormPage itemId={parsedItemId} />
}

const inventoryEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inventory/edit/$itemId',
  component: InventoryEditRouteComponent,
})

const issueListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/issues',
  component: IssueListPage,
})

const issueCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/issues/new',
  component: IssuePage,
})

function IssueEditRouteComponent() {
  const { requestId } = issueEditRoute.useParams()
  const parsedRequestId = parsePositiveId(requestId)
  if (!parsedRequestId) {
    return <InvalidRouteParameter />
  }
  return <IssuePage requestId={parsedRequestId} />
}

const issueEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/issues/$requestId',
  component: IssueEditRouteComponent,
})

const borrowListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/borrows',
  component: BorrowListPage,
})

const borrowCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/borrows/new',
  component: BorrowPage,
})

function BorrowEditRouteComponent() {
  const { requestId } = borrowEditRoute.useParams()
  const parsedRequestId = parsePositiveId(requestId)
  if (!parsedRequestId) {
    return <InvalidRouteParameter />
  }
  return <BorrowPage requestId={parsedRequestId} />
}

const borrowEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/borrows/$requestId',
  component: BorrowEditRouteComponent,
})

const donationListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/donations',
  component: DonationListPage,
})

const donationCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/donations/new',
  component: DonationPage,
})

function DonationEditRouteComponent() {
  const { requestId } = donationEditRoute.useParams()
  const parsedRequestId = parsePositiveId(requestId)
  if (!parsedRequestId) {
    return <InvalidRouteParameter />
  }
  return <DonationPage requestId={parsedRequestId} />
}

const donationEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/donations/$requestId',
  component: DonationEditRouteComponent,
})

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/upload',
  component: UploadPage,
})

const logsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/logs',
  component: LogsPage,
})

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  inventoryRoute,
  inventoryCreateRoute,
  inventoryEditRoute,
  issueListRoute,
  issueCreateRoute,
  issueEditRoute,
  borrowListRoute,
  borrowCreateRoute,
  borrowEditRoute,
  donationListRoute,
  donationCreateRoute,
  donationEditRoute,
  uploadRoute,
  logsRoute,
])

const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return <RouterProvider router={router} />
}

export default App
