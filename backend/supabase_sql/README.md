# Supabase Cloud Workflow (Schema + Data Sync)

本文件說明目前正式流程：

- Schema：使用 `backend/supabase/migrations/*.sql` + GitHub Actions 自動部署。
- Data：使用後端管理 API + GitHub Actions 排程同步。
- `backend/supabase_sql/schema.sql` 僅作快照與人工檢閱，不是部署唯一來源。

## 1) Cloud 專案初始化（一次性）

1. 在 Supabase 建立 Cloud project（區域與 DB 密碼）。
2. 於 GitHub repo 設定 Secrets：
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
   - `BACKEND_BASE_URL`
   - `ADMIN_API_TOKEN`
3. 確認後端部署環境可正確處理：
   - `POST /api/admin/migration/run`
   - `GET /api/admin/migration/report/{job_id}`

## 2) Schema 變更流程（Migration-first）

本機建立 migration：

```bash
cd backend
supabase migration new <migration_name>
```

將 SQL 寫入 `backend/supabase/migrations/<timestamp>_<migration_name>.sql`，並提交到 `main`。

`main` 合併後會觸發 `.github/workflows/db-schema-deploy.yml`：

1. `supabase link`
2. `supabase db lint`
3. `supabase db push --include-all`

## 3) 資料同步流程（CI 排程）

`.github/workflows/db-data-sync.yml` 會：

1. 呼叫 `POST /api/admin/migration/run` with `{"dry_run": true}`
2. 成功後呼叫 `POST /api/admin/migration/run` with `{"dry_run": false}`
3. 查詢 `GET /api/admin/migration/report/{job_id}`，並寫入 workflow summary

可手動執行 `workflow_dispatch`：

- `run_full_sync=false`：只做 dry-run
- `run_full_sync=true`：dry-run 成功後做正式同步

## 4) 緊急回復與驗證

- 若 schema deploy 失敗，先修 migration 再重新觸發 workflow，不要在 Cloud SQL Editor 直接改正式結構。
- 若 data sync 失敗，先看 workflow summary 與 `report.errors`，修正後重新執行。
- 每次同步後建議抽查：
  - `status=success`
  - 各 table 的 `migrated_rows` / `skipped_rows` 是否合理
