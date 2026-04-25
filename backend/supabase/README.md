# Supabase Migrations

`backend/supabase/migrations/*.sql` 是資料庫 schema 的唯一來源。

## 常用指令

```bash
cd backend

# 建立新 migration
supabase migration new <migration_name>

# 查看 local 狀態
supabase status

# 套用到已 link 的雲端專案
supabase db push --linked --include-all --password "$SUPABASE_DB_PASSWORD"
```

## 注意事項

- 不要直接在 Cloud SQL Editor 手動修改正式 schema。
- `backend/supabase_sql/schema.sql` 只作快照與檢閱用途。
