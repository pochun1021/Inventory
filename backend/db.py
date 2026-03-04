import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "inventory.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(get_connection()) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS inventory_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT DEFAULT '',
                property_number TEXT DEFAULT '',
                name TEXT NOT NULL DEFAULT '',
                model TEXT NOT NULL DEFAULT '',
                specification TEXT DEFAULT '',
                unit TEXT DEFAULT '',
                purchase_date TEXT DEFAULT '',
                location TEXT DEFAULT '',
                memo TEXT NOT NULL DEFAULT '',
                keeper TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS order_sn (
                name TEXT PRIMARY KEY,
                current_value INTEGER NOT NULL DEFAULT 0
            );

            INSERT OR IGNORE INTO order_sn
            VALUES ('assets', 0),
                   ('supplies', 0),
                   ('other', 0);
            """
        )
        conn.commit()


def get_items_count() -> int:
    with closing(get_connection()) as conn:
        return conn.execute("SELECT COUNT(*) FROM inventory_items").fetchone()[0]


def list_items() -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT
                id,
                kind,
                specification,
                property_number,
                name,
                model,
                purchase_date,
                location,
                keeper,
                memo
            FROM inventory_items
            ORDER BY id DESC
            """
        ).fetchall()


def get_item_by_id(item_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT
                id,
                kind,
                specification,
                property_number,
                name,
                model,
                unit,
                purchase_date,
                location,
                keeper,
                memo
            FROM inventory_items
            WHERE id = ?
            """,
            (item_id,),
        ).fetchone()


def create_item(item_data: dict[str, Any]) -> int:
    property_number = str(item_data.get("property_number", "")).strip()
    if not property_number:
        order_sn_name = item_data.get("kind") if item_data.get("kind") in {"assets", "supplies", "other"} else "other"
        order_sn_row = get_order_sn(order_sn_name)
        if order_sn_row is not None:
            property_number = order_sn_row["tmp_no"]

    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            INSERT INTO inventory_items (
                kind,
                specification,
                property_number,
                name,
                model,
                unit,
                purchase_date,
                location,
                keeper,
                memo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_data["kind"],
                item_data["specification"],
                item_data["property_number"],
                item_data["name"],
                item_data["model"],
                item_data["unit"],
                item_data["purchase_date"],
                item_data["location"],
                item_data["keeper"],
                item_data["memo"],
            ),
        )
        conn.commit()
        return cursor.lastrowid


def update_item(item_id: int, item_data: dict[str, Any]) -> bool:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            UPDATE inventory_items
            SET
                kind = ?,
                specification = ?,
                property_number = ?,
                name = ?,
                model = ?,
                unit = ?,
                purchase_date = ?,
                location = ?,
                keeper = ?,
                memo = ?
            WHERE id = ?
            """,
            (
                item_data["kind"],
                item_data["specification"],
                item_data["property_number"],
                item_data["name"],
                item_data["model"],
                item_data["unit"],
                item_data["purchase_date"],
                item_data["location"],
                item_data["keeper"],
                item_data["memo"],
                item_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def get_order_sn(name: str) -> list[sqlite3.Row] | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            UPDATE order_sn
            SET current_value = current_value + 1
            WHERE name = ?
            RETURNING 'tmp-' || strftime('%Y%m%d', 'now', 'localtime') || '-' || printf('%04d', current_value) AS tmp_no
            """,
            (name,),
        ).fetchone()
