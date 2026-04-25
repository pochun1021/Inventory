# Supabase Local-First Workflow

## 1) 建本地驗證環境

先在本地 Supabase 建 schema，再做遷移 dry-run。

```bash
# 先於 Supabase SQL Editor（local/staging）執行
backend/supabase_sql/schema.sql
```

## 2) 配置環境變數

```bash
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
export SUPABASE_SCHEMA="public"
export ADMIN_API_TOKEN="<admin-token>"
```

## 3) 先做 dry-run

```bash
curl -X POST http://localhost:8000/api/admin/migration/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"dry_run": true}'
```

## 4) 正式遷移

```bash
curl -X POST http://localhost:8000/api/admin/migration/run \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  -d '{"dry_run": false}'
```

## 5) 查報告與備份

```bash
curl -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  http://localhost:8000/api/admin/migration/report/<job_id>

curl -X POST -H "X-Admin-Token: $ADMIN_API_TOKEN" \
  http://localhost:8000/api/admin/backup/sheets/sync
```
