# Inventory 資產管理系統

這是一個前後端分離的資產管理專案，提供儀表板、財產清單、單筆新增/編輯、Excel 批次匯入等功能。

- **前端**：React + TypeScript + Vite
- **後端**：FastAPI
- **資料儲存**：XLSX（檔案：`backend/inventory.xlsx`）

## 功能總覽

- Dashboard 顯示系統狀態、資產總數、待修改資料數量
- 財產清單查詢（關鍵字、類別、待修正篩選、分頁）
- 單筆新增與編輯財產資料
- Excel（`.xlsx`）批次匯入
- 軟刪除機制（刪除資料先標記，保留 6 個月後自動清除）
- 操作日誌紀錄（create/read/update/delete/import/purge）

## 專案結構

```text
Inventory/
├─ backend/                # FastAPI + XLSX
│  ├─ main.py              # API 與前端靜態檔路由
│  ├─ db.py                # 資料庫 schema 與 CRUD
│  └─ xlsx_import.py       # Excel 匯入邏輯
└─ frontend/               # React + Vite
   └─ src/
      ├─ components/pages/
      └─ UploadPanel.tsx
```

## 環境需求

- Python 3.14+
- Node.js 20+
- npm 10+

> 後端使用 `pyproject.toml` 管理依賴，建議使用 `uv` 或你慣用的 Python 虛擬環境工具。

## 快速開始

### 1) 啟動後端

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

若未安裝 `uv`，可改用 `venv + pip`：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2) 啟動前端

```bash
cd frontend
npm install
npm run dev
```

前端開發伺服器預設會把 `/api/*` 代理到 `http://localhost:8000`。

## API 概覽

- `GET /api/data`：儀表板資訊
- `GET /api/items`：取得清單
- `GET /api/items/{item_id}`：取得單筆
- `POST /api/items`：新增
- `PUT /api/items/{item_id}`：更新
- `DELETE /api/items/{item_id}`：軟刪除
- `POST /api/items/import`：上傳 Excel 匯入（`multipart/form-data`）

## Excel 匯入欄位

匯入檔案需包含以下欄位名稱：

- `備註`
- `規格(大小/容量)`
- `財產編號`
- `品名`
- `型號`
- `單位`
- `購置日期`
- `放置地點`
- `保管人（單位）`

> `類別` 由上傳表單選擇，不從 Excel 欄位讀取。

## 建置與部署

### 前端建置

```bash
cd frontend
npm run build
```

建置後檔案會輸出至 `frontend/dist`。後端啟動時會優先提供 `frontend/dist/index.html` 與靜態資源。

### 後端啟動（正式環境示例）

```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

## 常見問題

- **看不到前端頁面？**
  - 請先確認 `frontend/dist` 是否存在，或直接使用前端開發伺服器（`npm run dev`）。
- **匯入失敗？**
  - 確認副檔名為 `.xlsx`，且欄位名稱完全符合需求。
- **資料被刪除了還在嗎？**
  - 系統採軟刪除，資料會先標記刪除，6 個月後才會被永久清除。

---

如需擴充欄位、調整匯入格式或新增報表頁面，建議先同步更新：
1. `backend/main.py` 的 Pydantic schema
2. `backend/db.py` 的資料表欄位
3. 前端表單與清單欄位
