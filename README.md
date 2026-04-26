# Inventory 資產管理系統

前後端分離的資產管理專案，支援財產管理與三種交易流程（領用、借用、捐贈），並提供 xlsx 批次上傳、日誌查詢與 AI 規格辨識。

## 技術棧

- 前端：React 19 + TypeScript + Vite + TanStack Router + Tailwind CSS v4
- 後端：FastAPI + Uvicorn
- 資料儲存：XLSX（`backend/inventory.xlsx`，使用 `openpyxl` + `filelock`），並支援 Supabase 遷移/備份管理流程
- 選配整合：Google Sheets 同步、Gemini 規格辨識

## 目前功能

- Dashboard：系統狀態、資產數、交易統計
- 財產管理：清單查詢、新增、編輯、軟刪除、還原、拆卸子件
- 領用/借用/捐贈：清單與單據 CRUD（借用含借出/歸還流程）
- 代碼設定：資產狀態、堪用狀態、資產分類 lookup 維護
- 批次上傳：`POST /api/items/import`
- 日誌查詢：異動流水帳與操作日誌
- AI 設定：Gemini token 管理與規格辨識 API

## 專案結構

```text
Inventory/
├─ backend/
│  ├─ main.py                 # FastAPI routes + schema + 前端靜態檔服務
│  ├─ db.py                   # XLSX schema、CRUD、交易一致性與驗證
│  ├─ xlsx_import.py          # Excel 匯入與欄位驗證
│  ├─ ai_recognition.py       # AI 規格辨識
│  ├─ google_sheets.py        # Google Sheets 同步（選配）
│  └─ tests/
└─ frontend/
   ├─ src/App.tsx             # 路由註冊
   ├─ src/components/pages/   # 各頁面（含 Logs/MasterData/AiSettings）
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
cp env.local.example .env.local  # first time only
uv run --env-file .env.local uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger：`http://localhost:8000/docs`
- OpenAPI：`http://localhost:8000/openapi.json`

地端/雲端切換建議使用 `backend/.env.local` 與 `backend/.env.cloud`，啟動時用 `--env-file` 明確指定。完整步驟請見 `backend/README.md` 的「環境切換（Local / Cloud）」與 `backend/supabase_sql/README.md`。Schema 更新請以 `backend/supabase/migrations/*.sql` 為唯一來源，並透過 GitHub Actions 部署。

### 2) 啟動前端

```bash
cd frontend
npm install
npm run dev
```

如需指定 API 網址：

```bash
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

## 前端路由

- `/`：Dashboard
- `/inventory`、`/inventory/new`、`/inventory/edit/:itemId`：財產清單/新增/編輯
- `/issues`、`/issues/new`、`/issues/:requestId`：領用
- `/borrows`、`/borrows/new`、`/borrows/:requestId`：借用
- `/donations`、`/donations/new`、`/donations/:requestId`：捐贈
- `/upload`：批次上傳
- `/logs`：日誌查詢
- `/features/master-data`：代碼設定
- `/features/ai-settings`：AI 設定

## API 概覽

根 README 僅放總覽；完整端點與欄位請見 `backend/README.md`。

- Dashboard：`GET /api/data`
- Lookup：
  - `/api/lookups/asset-status`（CRUD）
  - `/api/lookups/condition-status`（CRUD）
  - `/api/lookups/asset-category`（CRUD）
  - `/api/lookups/borrow-reservations`
- 財產：
  - `/api/items`、`/api/items/{item_id}`（CRUD）
  - `POST /api/items/{item_id}/detach`
  - `POST /api/items/{item_id}/restore`
- 領用：`/api/issues`（CRUD）
- 借用：
  - `/api/borrows`（CRUD）
  - `/api/borrows/{request_id}/pickup-candidates`
  - `/api/borrows/{request_id}/pickup-lines`
  - `/api/borrows/{request_id}/pickup-lines/{line_id}/candidates`
  - `/api/borrows/{request_id}/pickup-resolve-scan`
  - `/api/borrows/{request_id}/pickup`
  - `/api/borrows/{request_id}/return`
- 捐贈：`/api/donations`（CRUD）
- 日誌：`GET /api/logs/movements`、`GET /api/logs/operations`
- 匯入：`POST /api/items/import`
- AI 設定與辨識：
  - `/api/settings/ai/gemini-token`（GET/PUT/DELETE）
  - `GET /api/ai/spec-recognition/quota`
  - `POST /api/ai/spec-recognition`
  - `POST /api/ai/spec-recognition/batch`
- 管理端點（需 `X-Admin-Token`）：
  - `POST /api/admin/migration/run`
  - `GET /api/admin/migration/report/{job_id}`
  - `POST /api/admin/backup/sheets/sync`
  - `GET /api/admin/jobs/sync`

## 交易規則（重點）

- 領用/借用/捐贈為單件模式：每個 item 的 `quantity` 必須是 `1`
- 借用預約 `borrow_date`、`due_date` 必填，且 `due_date` 不可早於 `borrow_date`
- 借用預約天數上限為 30 天（`due_date - borrow_date <= 30`）
- 建立或更新捐贈單時 `recipient` 必填
- API 會檢查品項可用性，避免重複占用

## 測試指令

```bash
# backend
cd backend
uv run pytest

# frontend
cd frontend
npm run test
```

## 建置

```bash
cd frontend
npm run build
```

前端輸出到 `frontend/dist`，後端會優先回傳該目錄靜態檔案。

## CI 同步注意事項

- `db-data-sync` workflow 的 `BACKEND_BASE_URL` 要填「後端 API 服務根網址」
  例如 `https://your-service.onrender.com`。
- 不可填 Supabase 專案網址（`https://<project-ref>.supabase.co`），
  否則 `/api/admin/migration/run` 會回 404。
