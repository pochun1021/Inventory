 Backend（FastAPI）

本目錄為資產管理系統的後端服務，負責：

- 提供 Dashboard 與庫存 CRUD API
- 提供 Excel（`.xlsx`）批次匯入 API
- 管理 SQLite 資料庫與資料表初始化
- 記錄操作日誌（create/read/update/delete/import/purge）
- 提供前端靜態資源（當 `frontend/dist` 存在時）

## 技術棧

- Python 3.14+
- FastAPI
- Uvicorn
- SQLite
- openpyxl（讀取 xlsx）

## 目錄說明

```text
backend/
├─ main.py         # API 路由、Pydantic schema、靜態檔回傳
├─ db.py           # 資料表建立、查詢與 CRUD、操作日誌
├─ xlsx_import.py  # Excel 匯入與欄位驗證
├─ pyproject.toml  # Python 套件與相依設定
└─ inventory.db    # SQLite 資料庫檔（執行後產生）
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
- `GET /api/items/{item_id}`：取得單筆資料
- `POST /api/items`：新增資料
- `PUT /api/items/{item_id}`：更新資料
- `DELETE /api/items/{item_id}`：軟刪除資料

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

## 資料庫與資料保留策略

- 啟動時會自動初始化資料表（若不存在則建立）。
- 刪除採 **軟刪除**（`deleted_at` 標記）。
- 啟動時會清除超過 6 個月的軟刪除資料（永久刪除）。

## 開發備註

- 後端程式會優先嘗試回傳 `frontend/dist/index.html`；若不存在則退回 `frontend/index.html`。
- 若僅開發 API，可直接使用 `/docs` 驗證端點。

## 常見問題

- **上傳 xlsx 失敗**
  - 請確認檔案格式為 `.xlsx`，且標題列包含所有必要欄位。
- **資料刪除後仍可追蹤到筆數差異**
  - 軟刪除資料不會出現在清單 API；到期（6 個月）才會被永久刪除。
