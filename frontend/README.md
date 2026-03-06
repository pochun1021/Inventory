# Frontend（React + Vite）

本目錄為資產管理系統前端，提供：

- Dashboard（系統狀態與統計）
- 財產清單頁（查詢、篩選、分頁、刪除）
- 新增/編輯財產頁
- Excel 匯入頁

## 技術棧

- React 19
- TypeScript
- Vite
- SweetAlert2

## 安裝與啟動

```bash
cd frontend
npm install
npm run dev
```

預設開發網址：`http://localhost:5173`

## 與後端串接

### 開發環境（預設）

前端使用 `/api/*` 路徑呼叫後端。開發時由 Vite proxy 轉發到：

- `http://localhost:8000`

請先啟動 backend：

```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 部署環境（可選）

如果前後端不是同網域，可在 build 時設定：

```bash
VITE_API_BASE_URL=https://your-api.example.com npm run build
```

> `VITE_API_BASE_URL` 若有設定，前端會將 API 路徑組成 `BASE_URL + /api/...`。

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
- `/inventory/edit/:id`：編輯財產
- `/upload`：Excel 匯入

## 畫面與資料行為

- 清單資料由 `GET /api/items` 載入。
- 新增資料使用 `POST /api/items`。
- 編輯資料使用 `PUT /api/items/{id}`。
- 刪除資料使用 `DELETE /api/items/{id}`（軟刪除）。
- 匯入頁使用 `POST /api/items/import` 上傳 `.xlsx`。

## 建置輸出

```bash
npm run build
```

輸出目錄：`frontend/dist`

後端若偵測到此資料夾，會優先提供其靜態內容。

## 疑難排解

- **前端顯示連線錯誤**
  - 確認 backend 是否啟動於 `http://localhost:8000`。
- **部署後 API 404 / CORS 問題**
  - 檢查 `VITE_API_BASE_URL` 是否正確，並確認後端允許對應來源。
