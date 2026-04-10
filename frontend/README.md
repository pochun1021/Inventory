# Frontend（React + Vite）

本目錄為 Inventory 系統前端，提供：

- Dashboard 與快速操作入口
- 財產清單與新增/編輯
- 領用、借用、捐贈流程（清單/新增/編輯）
- xlsx 批次上傳

## 技術棧

- React 19
- TypeScript
- Vite
- TanStack Router
- Tailwind CSS v4
- SweetAlert2

## 安裝與啟動

```bash
cd frontend
npm install
npm run dev
```

預設開發網址：`http://localhost:5173`

## 與後端串接

前端透過 `src/api.ts` 組 API URL：

- 有設定 `VITE_API_BASE_URL`：使用 `${VITE_API_BASE_URL}/api/...`
- 未設定：使用相對路徑 `/api/...`

請先啟動 backend：

```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

若前後端不同網域，建議明確設定：

```bash
VITE_API_BASE_URL=https://your-api.example.com npm run build
```

## 常用指令

```bash
npm run dev      # 開發模式
npm run build    # 生產建置
npm run preview  # 本機預覽建置結果
npm run lint     # ESLint 檢查
```

## 路由頁面

- `/`：Dashboard
- `/inventory`：財產清單
- `/inventory/new`：新增財產
- `/inventory/edit/:itemId`：編輯財產
- `/issues`：領用清單
- `/issues/new`：新增領用
- `/issues/:requestId`：編輯領用單
- `/borrows`：借用清單
- `/borrows/new`：新增借用
- `/borrows/:requestId`：編輯借用單
- `/upload`：Excel 匯入
- `/donations`：捐贈清單
- `/donations/new`：新增捐贈
- `/donations/:requestId`：編輯捐贈單

## 側邊導覽分類

- 總覽：Dashboard
- 領用：領用清單、新增領用
- 借用：借用清單、新增借用
- 捐贈：捐贈清單、新增捐贈
- 資產：財產清單、新增庫存、批次上傳

## 畫面與資料行為

- Dashboard 會同時讀取 `/api/data`、`/api/items`、`/api/issues`、`/api/borrows`、`/api/donations`。
- 財產頁使用 `/api/items` 系列 API（查詢/新增/更新/刪除）。
- 領用、借用、捐贈頁分別使用 `/api/issues`、`/api/borrows`、`/api/donations`。
- 匯入頁使用 `POST /api/items/import` 上傳 `.xlsx`。
- Lookup 管理使用 `/api/lookups/asset-status`。
- 交易表單目前為單件模式，`quantity` 需為 `1`（由後端驗證）。

## 建置輸出

```bash
npm run build
```

輸出目錄：`frontend/dist`

後端若偵測到此資料夾，會優先提供其靜態內容。
