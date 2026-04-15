# Inventory 資產管理系統

前後端分離的資產管理專案，支援財產管理與三種交易流程（領用、借用、捐贈），並提供 xlsx 批次匯入與可選的 Google Sheets 同步。

## 技術棧

- 前端：React 19 + TypeScript + Vite + TanStack Router + Tailwind CSS v4
- 後端：FastAPI + Uvicorn
- 資料儲存：XLSX（`backend/inventory.xlsx`，使用 `openpyxl` + `filelock`）
- 其他：Google Sheets API（選配，用於同步領用/借用清單）

## 目前功能

- Dashboard：系統狀態、資產數、待修正資料、交易統計
- 財產管理：清單查詢、分頁、新增、編輯、軟刪除
- 領用單：清單/新增/編輯/刪除
- 借用單：清單/新增/編輯/刪除（含借用狀態）
- 捐贈單：清單/新增/編輯/刪除（建立/更新需 `recipient`）
- 代碼維護：資產狀態 lookup（CRUD）
- Excel 匯入：`POST /api/items/import`
- 資料保留：軟刪除資料逾 6 個月自動清除
- 日誌查詢：異動流水帳與操作日誌（可依時間/動作/實體/品項/單據篩選）

## 專案結構

```text
Inventory/
├─ backend/
│  ├─ main.py                 # FastAPI routes + schema + 前端靜態檔服務
│  ├─ db.py                   # XLSX schema、CRUD、交易一致性與驗證
│  ├─ xlsx_import.py          # Excel 匯入與欄位驗證
│  ├─ google_sheets.py        # Google Sheets 同步（選配）
│  └─ tests/
└─ frontend/
   ├─ src/App.tsx             # 路由註冊
   ├─ src/components/pages/   # 各頁面（Dashboard/Inventory/Issue/Borrow/Donation/Upload）
   └─ vite.config.ts
```

## 環境需求

- Python 3.14+
- Node.js 20+
- npm 10+

## 快速開始

### 1) 啟動後端

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

後端文件：

- Swagger：`http://localhost:8000/docs`
- OpenAPI：`http://localhost:8000/openapi.json`

### 2) 啟動前端

```bash
cd frontend
npm install
npm run dev
```

開發時若需要指定 API 網址，可設定：

```bash
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

## 前端路由

- `/`：Dashboard
- `/inventory`：財產清單
- `/inventory/new`：新增庫存
- `/inventory/edit/:itemId`：編輯庫存
- `/issues`、`/issues/new`、`/issues/:requestId`：領用
- `/borrows`、`/borrows/new`、`/borrows/:requestId`：借用
- `/donations`、`/donations/new`、`/donations/:requestId`：捐贈
- `/upload`：批次上傳
- `/logs`：異動流水帳與操作日誌查詢

## API 概覽

### Dashboard

- `GET /api/data`

### 資產狀態 Lookup

- `GET /api/lookups/asset-status`
- `POST /api/lookups/asset-status`
- `PUT /api/lookups/asset-status/{code}`
- `DELETE /api/lookups/asset-status/{code}`

### 財產

- `GET /api/items`
- `GET /api/items/{item_id}`
- `POST /api/items`
- `PUT /api/items/{item_id}`
- `DELETE /api/items/{item_id}`

### 領用

- `GET /api/issues`
- `GET /api/issues/{request_id}`
- `POST /api/issues`
- `PUT /api/issues/{request_id}`
- `DELETE /api/issues/{request_id}`

### 借用

- `GET /api/borrows`
- `GET /api/borrows/{request_id}`
- `POST /api/borrows`
- `PUT /api/borrows/{request_id}`
- `DELETE /api/borrows/{request_id}`

### 捐贈

- `GET /api/donations`
- `GET /api/donations/{request_id}`
- `POST /api/donations`
- `PUT /api/donations/{request_id}`
- `DELETE /api/donations/{request_id}`

### 批次匯入

- `POST /api/items/import`（`multipart/form-data`）
  - `file`：`.xlsx`
  - `asset_type`：`11` / `A1` / `A2`

### 日誌查詢

- `GET /api/logs/movements`
- `GET /api/logs/operations`
  - 可選參數：`scope=hot|all`（預設 `hot`，僅查近 90 天）

## 交易規則（重要）

- 領用/借用/捐贈目前為單件模式：每個 item 的 `quantity` 必須是 `1`
- 借用預約 `borrow_date`、`due_date` 必填，且 `due_date` 不可早於 `borrow_date`
- 借用預約天數上限為 30 天（`due_date - borrow_date <= 30`）
- 建立或更新捐贈單時 `recipient` 必填
- 交易會檢查品項可用性，不可重複占用或占用不可用資產

## Excel 匯入欄位

xlsx 必須包含以下欄位：

- `備註`
- `規格(大小/容量)`
- `財產編號`
- `品名`
- `型號`
- `單位`
- `購置日期`
- `放置地點`
- `保管人（單位）`

說明：`類別` 不從檔案欄位讀取，而是由上傳時 `asset_type` 決定。

## Google Sheets 同步（選配）

系統在領用/借用資料新增、更新、刪除後，可背景同步整份清單到 Google Sheets。

主要環境變數：

- `GOOGLE_SHEETS_CLIENT_SECRETS_FILE`
- `GOOGLE_SHEETS_TOKEN_FILE`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SPREADSHEET_TITLE`
- `GOOGLE_SHEETS_ISSUE_SHEET_NAME`
- `GOOGLE_SHEETS_BORROW_SHEET_NAME`

若未設定，功能預設關閉。

## 建置

```bash
cd frontend
npm run build
```

前端輸出到 `frontend/dist`，後端會優先回傳該目錄的靜態檔案。
