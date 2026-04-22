# Backend（FastAPI）

本目錄提供 Inventory 系統後端 API，資料以 XLSX 儲存，涵蓋資產、領用、借用、捐贈與批次匯入。

## 技術棧

- Python 3.14+
- FastAPI + Uvicorn
- openpyxl + filelock
- Google Sheets API（選配）

## 主要檔案

```text
backend/
├─ main.py            # API routes、schema、前端靜態檔回傳
├─ db.py              # XLSX schema、CRUD、驗證與交易邏輯
├─ xlsx_import.py     # 批次匯入驗證與轉換
├─ google_sheets.py   # Google Sheets 同步（選配）
├─ tests/
└─ pyproject.toml
```

## 安裝與啟動

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

文件網址：

- `http://localhost:8000/docs`
- `http://localhost:8000/openapi.json`

## API 一覽

### Dashboard

- `GET /api/data`

### Lookup（資產狀態）

- `GET /api/lookups/asset-status`
- `POST /api/lookups/asset-status`
- `PUT /api/lookups/asset-status/{code}`
- `DELETE /api/lookups/asset-status/{code}`

### 資產

- `GET /api/items`
- `GET /api/items/{item_id}`
- `POST /api/items`
- `PUT /api/items/{item_id}`
- `DELETE /api/items/{item_id}`
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
- `DELETE /api/borrows/{request_id}`

### 捐贈

- `GET /api/donations`
- `GET /api/donations/{request_id}`
- `POST /api/donations`
- `PUT /api/donations/{request_id}`
- `DELETE /api/donations/{request_id}`

### 匯入

- `POST /api/items/import`
  - `multipart/form-data`
  - `file`：`.xlsx`
  - `asset_type`：`11` / `A1` / `A2`

## 規則與資料行為

- 領用/借用/捐贈為單件模式：`quantity` 必須是 `1`
- 借用預約 `borrow_date`、`due_date` 必填，且 `due_date` 不可早於 `borrow_date`
- 借用預約天數上限為 30 天（`due_date - borrow_date <= 30`）
- 捐贈單建立與更新時 `recipient` 必填
- API 會驗證 item 可用性，避免重複占用
- 刪除採軟刪除，超過 6 個月自動清除
- `GET /api/items` 可用 `deleted_scope=active|deleted` 篩選是否查詢已軟刪除資料（預設 `active`）

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

`類別` 由 `asset_type` 決定，不讀取 Excel 欄位。

## Google Sheets 同步（選配）

領用/借用資料在新增、更新、刪除後可背景同步到 Google Sheets。預設關閉。

可設定環境變數：

- `GOOGLE_SHEETS_CLIENT_SECRETS_FILE`（亦支援 `GOOGLE_SHEETS_CREDENTIALS_FILE`）
- `GOOGLE_SHEETS_TOKEN_FILE`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SPREADSHEET_TITLE`
- `GOOGLE_SHEETS_ISSUE_SHEET_NAME`
- `GOOGLE_SHEETS_BORROW_SHEET_NAME`
