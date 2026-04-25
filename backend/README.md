# Backend（FastAPI）

本目錄提供 Inventory 後端 API。現況主流程仍可用 XLSX，並已加入 Supabase 遷移/備份管理端點，涵蓋資產、交易流程（領用/借用/捐贈）、日誌查詢、批次上傳與 AI 規格辨識。

## 技術棧

- Python 3.14+
- FastAPI + Uvicorn
- openpyxl + filelock
- Pillow + pillow-heif（影像轉換）
- Google Sheets API（選配）

## 主要檔案

```text
backend/
├─ main.py            # API routes、schema、前端靜態檔回傳
├─ db.py              # XLSX schema、CRUD、驗證與交易邏輯
├─ xlsx_import.py     # 批次上傳驗證與轉換
├─ ai_recognition.py  # AI 規格辨識
├─ google_sheets.py   # Google Sheets 同步（選配）
├─ supabase_client.py # Supabase client 與環境設定
├─ migration_service.py # XLSX -> Supabase 遷移與報告
├─ backup_service.py  # Supabase -> Google Sheets 全表備份
├─ supabase/migrations/ # Supabase migration（Schema 唯一來源）
├─ supabase_sql/schema.sql # Supabase schema 快照（文件與比對用）
├─ tests/
└─ pyproject.toml
```

## 安裝與啟動

```bash
cd backend
uv sync
cp env.local.example .env.local  # first time only
uv run --env-file .env.local uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Swagger：`http://localhost:8000/docs`
- OpenAPI：`http://localhost:8000/openapi.json`

### Supabase local（已啟用時）

請在 `backend/` 目錄操作 Supabase CLI，避免 project context 錯置：

```bash
cd backend
supabase status
```

建立 `backend/.env.local`（本機使用，不要提交版控）：

```dotenv
USE_SUPABASE=true
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_SCHEMA=public
ADMIN_API_TOKEN=local-admin-token
```

`SUPABASE_SERVICE_ROLE_KEY` 可由 local CLI 取得：

```bash
cd backend
supabase status -o env | rg '^SERVICE_ROLE_KEY='
```

若要連同 API URL 一起生成 `.env.local`，可直接執行：

```bash
cd backend
cat > .env.local <<EOF
USE_SUPABASE=true
SUPABASE_URL=$(supabase status -o env | rg '^API_URL=' | cut -d'=' -f2- | tr -d '"')
SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o env | rg '^SERVICE_ROLE_KEY=' | cut -d'=' -f2- | tr -d '"')
SUPABASE_SCHEMA=public
ADMIN_API_TOKEN=local-admin-token
EOF
```

完成後以 `uv run --env-file .env.local ...` 啟動後端。

建立新 migration（本機）：

```bash
cd backend
supabase migration new <migration_name>
```

產生後把 SQL 寫入 `backend/supabase/migrations/<timestamp>_<migration_name>.sql`。

### 環境切換（Local / Cloud）

建議同時保留兩份環境檔：

- `backend/.env.local`：連 Supabase local
- `backend/.env.cloud`：連 Supabase Cloud

兩份模板可用：

```bash
cd backend
cp env.local.example .env.local
cp env.cloud.example .env.cloud
```

啟動 local：

```bash
cd backend
uv run --env-file .env.local uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

啟動 cloud：

```bash
cd backend
uv run --env-file .env.cloud uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`SUPABASE_SERVICE_ROLE_KEY` 僅可放後端環境，不可放前端。

### Schema 部署（GitHub Actions）

- `main` 分支變更 `backend/supabase/migrations/**` 後，會觸發 `.github/workflows/db-schema-deploy.yml`。
- Workflow 會依序執行：`supabase db lint` -> `supabase db push --include-all`。
- 需要設定 GitHub Secrets：
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_DB_PASSWORD`

### 資料同步（GitHub Actions）

- `.github/workflows/db-data-sync.yml` 每日排程執行，並可手動觸發。
- 每次先跑 `dry_run=true`，成功後才會進行 `dry_run=false` 正式同步。
- 需要設定 GitHub Secrets：
  - `BACKEND_BASE_URL`
  - `ADMIN_API_TOKEN`

### 遷移到 Supabase Cloud（一次性/初始化）

若要做第一次上雲初始化（Cloud 端必要設定、環境變數、dry-run/正式遷移），請依 `backend/supabase_sql/README.md` 操作。

## API 一覽

### Dashboard

- `GET /api/data`

### Lookup

- 資產狀態：`/api/lookups/asset-status`（GET/POST/PUT/DELETE）
- 堪用狀態：`/api/lookups/condition-status`（GET/POST/PUT/DELETE）
- 資產分類：`/api/lookups/asset-category`（GET/POST/PUT/DELETE）
- 借用預約選項：`GET /api/lookups/borrow-reservations`

### 資產

- `GET /api/items`
- `GET /api/items/{item_id}`
- `POST /api/items`
- `PUT /api/items/{item_id}`
- `DELETE /api/items/{item_id}`
- `POST /api/items/{item_id}/detach`
- `POST /api/items/{item_id}/restore`

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
- `POST /api/borrows/{request_id}/pickup`
- `POST /api/borrows/{request_id}/return`
- `DELETE /api/borrows/{request_id}`

借用撿貨輔助：

- `GET /api/borrows/{request_id}/pickup-candidates`
- `GET /api/borrows/{request_id}/pickup-lines`
- `GET /api/borrows/{request_id}/pickup-lines/{line_id}/candidates`
- `POST /api/borrows/{request_id}/pickup-resolve-scan`

### 捐贈

- `GET /api/donations`
- `GET /api/donations/{request_id}`
- `POST /api/donations`
- `PUT /api/donations/{request_id}`
- `DELETE /api/donations/{request_id}`

### 日誌

- `GET /api/logs/movements`
- `GET /api/logs/operations`

### 批次上傳

- `POST /api/items/import`
  - `multipart/form-data`
  - `file`：`.xlsx`
  - `asset_type`：`11` / `A1` / `A2`

### AI 設定

- `GET /api/settings/ai/gemini-token`
- `PUT /api/settings/ai/gemini-token`
- `DELETE /api/settings/ai/gemini-token`

### AI 規格辨識

- `GET /api/ai/spec-recognition/quota`
- `POST /api/ai/spec-recognition`
- `POST /api/ai/spec-recognition/batch`

### 管理端點（需 `X-Admin-Token`）

- `POST /api/admin/migration/run`
- `GET /api/admin/migration/report/{job_id}`
- `POST /api/admin/backup/sheets/sync`
- `GET /api/admin/jobs/sync`

`POST /api/ai/spec-recognition` 補充：

- 上傳格式：`multipart/form-data`，欄位 `file`
- 支援：`image/jpeg`、`image/png`、`image/webp`、`image/heic`、`image/heif`、`image/heic-sequence`、`image/heif-sequence`
- 大小上限：5MB
- 常見錯誤碼：`feature_disabled`、`invalid_image`、`ocr_failed`、`upstream_error`、`ai_parse_failed`

## 規則與資料行為

- 領用/借用/捐贈為單件模式：`quantity` 必須是 `1`
- 借用預約 `borrow_date`、`due_date` 必填，且 `due_date` 不可早於 `borrow_date`
- 借用預約天數上限為 30 天（`due_date - borrow_date <= 30`）
- 捐贈單建立與更新時 `recipient` 必填
- API 會驗證 item 可用性，避免重複占用
- 刪除採軟刪除，超過 6 個月自動清除
- `GET /api/items` 可用 `deleted_scope=active|deleted` 篩選是否查詢已軟刪除資料（預設 `active`）
- `GET /api/items` 的 `keyword` 會同時比對 `key` 與相容序號欄位（`n_property_sn`、`property_sn`、`n_item_sn`、`item_sn`）

## Key 與序號欄位整合

- `property`（財產）欄位：`n_property_sn`、`property_sn`
- `item`（物品）欄位：`n_item_sn`、`item_sn`
- 以上四個欄位屬相容欄位，系統統一識別欄位為 `key`
- 讀取優先順序：`key` → `n_property_sn` → `property_sn` → `n_item_sn` → `item_sn`

## 測試

```bash
cd backend
uv run pytest
```

## Excel 欄位需求

匯入檔案必須包含：

- `備註`
- `規格(大小/容量)`
- `財產編號`
- `品名`
- `型號`
- `單位`
- `購置日期`
- `放置地點`
- `保管人（單位）`

`類別` 由 `asset_type` 決定，不讀取 Excel 欄位。`財產編號` 會寫入 `key` 並同步寫入 `n_property_sn`（相容欄位）。

## Google Sheets / AI 設定（選配）

可設定環境變數：

- `GOOGLE_SHEETS_CLIENT_SECRETS_FILE`（亦支援 `GOOGLE_SHEETS_CREDENTIALS_FILE`）
- `GOOGLE_SHEETS_TOKEN_FILE`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SPREADSHEET_TITLE`
- `GOOGLE_SHEETS_ISSUE_SHEET_NAME`
- `GOOGLE_SHEETS_BORROW_SHEET_NAME`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SCHEMA`（預設 `public`）
- `USE_SUPABASE`（`true/false`）
- `ADMIN_API_TOKEN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`（可選，預設 `gemini-2.0-flash`）
