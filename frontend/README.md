# Frontend（React + Vite）

本目錄為 Inventory 系統前端，涵蓋 Dashboard、資產管理、交易流程、日誌查詢與系統設定頁面。

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
npm run test     # Vitest 測試
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
- `/donations`：捐贈清單
- `/donations/new`：新增捐贈
- `/donations/:requestId`：編輯捐贈單
- `/upload`：批次上傳
- `/logs`：日誌查詢
- `/features/master-data`：代碼設定
- `/features/ai-settings`：AI 設定

## 側邊導覽分類

- 總覽：Dashboard
- 領用：領用清單、新增領用
- 借用：借用清單、新增借用
- 捐贈：捐贈清單、新增捐贈
- 資產：財產清單、新增庫存、批次上傳
- 稽核：日誌查詢
- 系統設定：代碼設定、AI 設定

## 畫面與資料行為

- Dashboard 讀取 `/api/data`、`/api/items`、`/api/issues`、`/api/borrows`、`/api/donations`
- 財產頁使用 `/api/items` 系列 API（含 restore/detach 相關操作）
- 領用、借用、捐贈頁分別使用 `/api/issues`、`/api/borrows`、`/api/donations`
- 借用頁面含 pickup/return 流程，對應 borrow pickup API
- 匯入頁使用 `POST /api/items/import` 上傳 `.xlsx`
- 日誌頁使用 `/api/logs/movements`、`/api/logs/operations`
- 代碼設定頁使用 lookup API（asset status / condition status / asset category）
- AI 設定頁使用 `/api/settings/ai/gemini-token`，規格辨識對應 `/api/ai/spec-recognition` 系列

## 建置輸出

```bash
npm run build
```

輸出目錄：`frontend/dist`。後端若偵測到此資料夾，會優先提供其靜態內容。
