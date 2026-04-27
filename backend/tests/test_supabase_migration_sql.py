from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_SQL = ROOT / "supabase" / "migrations" / "20260426223000_add_lookup_tables_and_inventory_fks.sql"
SCHEMA_SQL = ROOT / "supabase_sql" / "schema.sql"


class SupabaseMigrationSqlTests(unittest.TestCase):
    def _read_sql(self, path: Path) -> str:
        return path.read_text(encoding="utf-8")

    def test_condition_status_seed_exists_in_migration(self) -> None:
        sql = self._read_sql(MIGRATION_SQL)
        self.assertIn("insert into condition_status_code", sql)
        self.assertIn("('0', '良好'", sql)
        self.assertIn("('1', '損壞'", sql)
        self.assertIn("('2', '報廢'", sql)

    def test_condition_status_normalization_happens_before_fk(self) -> None:
        sql = self._read_sql(MIGRATION_SQL)
        normalize_blank = sql.index("set condition_status = null")
        normalize_invalid = sql.index("set condition_status = '0'")
        add_fk = sql.index("add constraint fk_inventory_items_condition_status_code")
        self.assertLess(normalize_blank, add_fk)
        self.assertLess(normalize_invalid, add_fk)

    def test_asset_category_seed_exists_in_migration(self) -> None:
        sql = self._read_sql(MIGRATION_SQL)
        self.assertIn("insert into asset_category_name", sql)
        self.assertIn("('01', '筆記型電腦', '01'", sql)
        self.assertIn("('02', '桌上型電腦', '01'", sql)

    def test_asset_category_backfill_happens_before_fk(self) -> None:
        sql = self._read_sql(MIGRATION_SQL)
        normalize_name_code = sql.index("set name_code = lpad(name_code, 2, '0')")
        normalize_name_code2 = sql.index("set name_code2 = lpad(name_code2, 2, '0')")
        backfill_pairs = sql.index("backfilled from inventory_items during FK migration")
        add_fk = sql.index("add constraint fk_inventory_items_asset_category_pair")
        self.assertLess(normalize_name_code, add_fk)
        self.assertLess(normalize_name_code2, add_fk)
        self.assertLess(backfill_pairs, add_fk)

    def test_schema_snapshot_contains_same_safeguards(self) -> None:
        sql = self._read_sql(SCHEMA_SQL)
        self.assertIn("insert into condition_status_code", sql)
        self.assertIn("set condition_status = '0'", sql)
        self.assertIn("insert into asset_category_name", sql)
        self.assertIn("set name_code = lpad(name_code, 2, '0')", sql)
        self.assertIn("backfilled from inventory_items during FK migration", sql)
        add_fk = sql.index("add constraint fk_inventory_items_condition_status_code")
        normalize_invalid = sql.index("set condition_status = '0'")
        self.assertLess(normalize_invalid, add_fk)
        add_asset_fk = sql.index("add constraint fk_inventory_items_asset_category_pair")
        backfill_pairs = sql.index("backfilled from inventory_items during FK migration")
        self.assertLess(backfill_pairs, add_asset_fk)


if __name__ == "__main__":
    unittest.main()
