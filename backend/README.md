 Backend（FastAPI）

本目錄為資產管理系統的後端服務，負責：

- 提供 Dashboard 與庫存 CRUD API
- 提供 Excel（`.xlsx`）批次匯入 API
- 提供 POS 結帳與庫存異動 API（不含金流）
- 管理 XLSX 資料檔與資料表初始化
- 記錄操作日誌（create/read/update/delete/import/purge）
- 提供前端靜態資源（當 `frontend/dist` 存在時）

## 技術棧

- Python 3.14+
- FastAPI
- Uvicorn
- XLSX（openpyxl）
- filelock（檔案鎖）
- openpyxl（讀取 xlsx）
- Google Sheets API（同步領用/借用清單，可選）

## 目錄說明

```text
backend/
├─ main.py         # API 路由、Pydantic schema、靜態檔回傳
├─ db.py           # 資料表建立、查詢與 CRUD、操作日誌
├─ xlsx_import.py  # Excel 匯入與欄位驗證
├─ pyproject.toml  # Python 套件與相依設定
└─ inventory.xlsx  # XLSX 資料檔（執行後產生）
```

## 安裝與啟動

### 使用 uv（建議）

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 使用 venv + pip

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

啟動後可透過以下位址確認：

- API 文件（Swagger）：`http://localhost:8000/docs`
- OpenAPI JSON：`http://localhost:8000/openapi.json`

## API 一覽

### Dashboard

- `GET /api/data`
  - 回傳系統狀態、資產總數、待修改資料數。

### 庫存資料

- `GET /api/items`：列出所有未刪除資料
- `GET /api/items?include_donated=true`：列出包含已捐贈資料
- `GET /api/items/{item_id}`：取得單筆資料
- `POST /api/items`：新增資料
- `PUT /api/items/{item_id}`：更新資料
- `DELETE /api/items/{item_id}`：軟刪除資料

### 捐贈資料

- `GET /api/donations`：列出捐贈單
- `GET /api/donations/{request_id}`：取得單筆捐贈單
- `POST /api/donations`：建立捐贈單（`recipient` 必填）
- `PUT /api/donations/{request_id}`：更新捐贈單（`recipient` 必填）
- `DELETE /api/donations/{request_id}`：刪除捐贈單，解除關聯品項的捐贈標記

### POS（不含金流）

- `POST /api/pos/checkout`：建立 POS 訂單並寫入庫存異動
- `GET /api/pos/orders`：列出 POS 訂單
- `GET /api/pos/orders/{order_id}`：取得單筆 POS 訂單
- `GET /api/pos/stock`：查看各品項庫存餘額
- `PUT /api/pos/stock/{item_id}`：設定單一品項庫存數量
- `GET /api/pos/stock-movements`：查看庫存異動台帳

`order_type` 支援：
- `sale`：一般銷售（扣庫）
- `issue`：領用（扣庫，並自動建立 issue request）
- `borrow`：借用（扣庫，並自動建立 borrow request）
- `issue_restock`：領用回補（加庫）
- `borrow_return`：借用歸還（加庫；可帶 `borrow_request_id` 直接回填借用單狀態）

### 批次匯入

- `POST /api/items/import`
  - `multipart/form-data`
  - 欄位：
    - `file`：`.xlsx` 檔案
    - `kind`：類別（例：`assets` / `supplies` / `other`）

## Excel 欄位需求

匯入檔案表頭必須包含：

- `備註`
- `規格(大小/容量)`
- `財產編號`
- `品名`
- `型號`
- `單位`
- `購置日期`
- `放置地點`
- `保管人（單位）`

> `類別` 不從 Excel 欄位讀取，而是使用上傳時傳入的 `kind`。

## 資料儲存與資料保留策略

- 啟動時會自動初始化 XLSX 工作表（若不存在則建立）。
- 刪除採 **軟刪除**（`deleted_at` 標記）。
- 啟動時會清除超過 6 個月的軟刪除資料（永久刪除）。

## 開發備註

- 後端程式會優先嘗試回傳 `frontend/dist/index.html`；若不存在則退回 `frontend/index.html`。
- 若僅開發 API，可直接使用 `/docs` 驗證端點。

## Google Sheets 同步（即時）

每次「領用/借用」資料新增、更新、刪除後，會即時同步整張清單到 Google Sheets。此功能預設關閉，採 OAuth 用戶授權：

- `client_secrets.json` 放在 `backend/` 目錄（或用環境變數指定路徑）
- 第一次啟動會打開瀏覽器完成授權，token 會寫到 `backend/google_token.json`

環境變數（選填）：

- `GOOGLE_SHEETS_CLIENT_SECRETS_FILE`（預設 `backend/client_secrets.json`，也支援舊的 `GOOGLE_SHEETS_CREDENTIALS_FILE`）
- `GOOGLE_SHEETS_TOKEN_FILE`（預設 `backend/google_token.json`）
- `GOOGLE_SHEETS_SPREADSHEET_ID`（若未提供，會自動建立 Spreadsheet，並存到 `backend/google_sheets_state.json`）
- `GOOGLE_SHEETS_SPREADSHEET_TITLE`（自動建立時的標題，預設 `Inventory Requests`）
- `GOOGLE_SHEETS_ISSUE_SHEET_NAME`（預設 `IssueRequests`）
- `GOOGLE_SHEETS_BORROW_SHEET_NAME`（預設 `BorrowRequests`）

同步欄位會以 request + item 展開，每個 item 一列。若清單為空會保留標題列。

## 常見問題

- **上傳 xlsx 失敗**
  - 請確認檔案格式為 `.xlsx`，且標題列包含所有必要欄位。
- **資料刪除後仍可追蹤到筆數差異**
  - 軟刪除資料不會出現在清單 API；到期（6 個月）才會被永久刪除。
