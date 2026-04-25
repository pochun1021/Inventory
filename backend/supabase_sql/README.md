# Supabase Migration Workflow (Local -> Cloud)

本文件用於「先接上 local，再遷移到 Supabase Cloud」。

## 1) Supabase Cloud 先做的設定

1. 在 Supabase 建立 Cloud project（選區域、設定 DB 密碼）。
2. 進入 Cloud project 的 SQL Editor，執行 `backend/supabase_sql/schema.sql`。
3. 從 Project Settings 取得：
   - Project URL（給 `SUPABASE_URL`）
   - `service_role` key（給 `SUPABASE_SERVICE_ROLE_KEY`）

注意：
- `SUPABASE_SERVICE_ROLE_KEY` 只能放後端環境，不可放前端。
- `ADMIN_API_TOKEN` 請使用強隨機字串。

## 2) 後端環境變數（遷移到 Cloud）

以 `backend/.env.cloud` 為例：

```dotenv
USE_SUPABASE=true
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<cloud-service-role-key>"
SUPABASE_SCHEMA="public"
ADMIN_API_TOKEN="<strong-admin-token>"
```

啟動後端：

```bash
cd backend
cp env.cloud.example .env.cloud  # first time only
uv run --env-file .env.cloud uvicorn main:app --host 0.0.0.0 --port 8000
```

## 3) 先做 dry-run

```bash
cd backend
set -a
source .env.cloud
set +a

curl -X POST http://localhost:8000/api/admin/migration/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"dry_run": true}'
```

## 4) 正式遷移到 Cloud

```bash
cd backend
set -a
source .env.cloud
set +a

curl -X POST http://localhost:8000/api/admin/migration/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"dry_run": false}'
```

## 5) 查報告與驗證

```bash
cd backend
set -a
source .env.cloud
set +a

curl -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  http://localhost:8000/api/admin/migration/report/<job_id>
```

`<job_id>` 可由 `run` API 回傳值取得。預期：
- `status=success`
- 各 table 有合理 `migrated_rows` / `skipped_rows`

## 6) （可選）觸發 Cloud 備份到 Google Sheets

```bash
cd backend
set -a
source .env.cloud
set +a

curl -X POST -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  http://localhost:8000/api/admin/backup/sheets/sync
```
