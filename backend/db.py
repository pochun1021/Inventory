import sqlite3
import json
from contextlib import closing
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "inventory.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
                keeper TEXT DEFAULT '',
                deleted_at TEXT
            );

            CREATE TABLE IF NOT EXISTS order_sn (
                name TEXT PRIMARY KEY,
                current_value INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                entity TEXT NOT NULL,
                entity_id INTEGER,
                status TEXT NOT NULL DEFAULT 'success',
                detail TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS issue_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requester TEXT NOT NULL DEFAULT '',
                department TEXT NOT NULL DEFAULT '',
                purpose TEXT NOT NULL DEFAULT '',
                request_date TEXT NOT NULL DEFAULT '',
                memo TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS issue_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (request_id) REFERENCES issue_requests(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS borrow_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                borrower TEXT NOT NULL DEFAULT '',
                department TEXT NOT NULL DEFAULT '',
                purpose TEXT NOT NULL DEFAULT '',
                borrow_date TEXT NOT NULL DEFAULT '',
                due_date TEXT NOT NULL DEFAULT '',
                return_date TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'borrowed',
                memo TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS borrow_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (request_id) REFERENCES borrow_requests(id) ON DELETE CASCADE
            );

            INSERT OR IGNORE INTO order_sn
            VALUES ('asset', 0),
                   ('item', 0),
                   ('other', 0);
            """
        )
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(inventory_items)").fetchall()
        }
        if "deleted_at" not in columns:
            conn.execute("ALTER TABLE inventory_items ADD COLUMN deleted_at TEXT")
        conn.commit()


def get_items_count() -> int:
    with closing(get_connection()) as conn:
        return conn.execute("SELECT COUNT(*) FROM inventory_items WHERE deleted_at IS NULL").fetchone()[0]


def get_pending_fix_count() -> int:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT COUNT(*)
            FROM inventory_items
            WHERE deleted_at IS NULL
              AND (
                    TRIM(property_number) = ''
                    OR property_number GLOB '*[一-龥]*'
              )
            """
        ).fetchone()[0]


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
                unit,
                purchase_date,
                location,
                keeper,
                memo
            FROM inventory_items
            WHERE deleted_at IS NULL
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
            WHERE id = ? AND
                  deleted_at IS NULL
            """,
            (item_id,),
        ).fetchone()


def create_item(item_data: dict[str, Any]) -> int:
    property_number = str(item_data.get("property_number", "")).strip()
    if not property_number:
        order_sn_name = item_data.get("kind") if item_data.get("kind") in {"asset", "item", "other"} else "other"
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
            WHERE id = ? AND
                  deleted_at IS NULL
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

def delete_item(item_id: int) -> bool:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            UPDATE inventory_items
            SET deleted_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
            WHERE id = ?
              AND deleted_at IS NULL
            """,
            (item_id,),
        )
        conn.commit()
        return cursor.rowcount > 0


def purge_soft_deleted_items() -> int:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            DELETE FROM inventory_items
            WHERE deleted_at IS NOT NULL
              AND datetime(deleted_at) <= datetime('now', 'localtime', '-6 months')
            """
        )
        conn.commit()
        return cursor.rowcount


def log_inventory_action(
    action: str,
    *,
    entity: str = "inventory_item",
    entity_id: int | None = None,
    status: str = "success",
    detail: dict[str, Any] | None = None,
) -> None:
    serialized_detail = json.dumps(detail or {}, ensure_ascii=False)

    with closing(get_connection()) as conn:
        conn.execute(
            """
            INSERT INTO operation_logs (action, entity, entity_id, status, detail)
            VALUES (?, ?, ?, ?, ?)
            """,
            (action, entity, entity_id, status, serialized_detail),
        )
        conn.commit()


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


def create_issue_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            INSERT INTO issue_requests (
                requester,
                department,
                purpose,
                request_date,
                memo
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                request_data["requester"],
                request_data["department"],
                request_data["purpose"],
                request_data["request_date"],
                request_data["memo"],
            ),
        )
        request_id = cursor.lastrowid
        conn.executemany(
            """
            INSERT INTO issue_items (request_id, item_id, quantity, note)
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    request_id,
                    item["item_id"],
                    item["quantity"],
                    item.get("note", ""),
                )
                for item in items
            ],
        )
        conn.commit()
        return request_id


def list_issue_requests() -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT id, requester, department, purpose, request_date, memo, created_at
            FROM issue_requests
            ORDER BY id DESC
            """
        ).fetchall()


def get_issue_request(request_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT id, requester, department, purpose, request_date, memo, created_at
            FROM issue_requests
            WHERE id = ?
            """,
            (request_id,),
        ).fetchone()


def list_issue_items(request_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT
                issue_items.id,
                issue_items.request_id,
                issue_items.item_id,
                issue_items.quantity,
                issue_items.note,
                inventory_items.name AS item_name,
                inventory_items.model AS item_model
            FROM issue_items
            LEFT JOIN inventory_items ON inventory_items.id = issue_items.item_id
            WHERE issue_items.request_id = ?
            ORDER BY issue_items.id ASC
            """,
            (request_id,),
        ).fetchall()


def update_issue_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            UPDATE issue_requests
            SET requester = ?, department = ?, purpose = ?, request_date = ?, memo = ?
            WHERE id = ?
            """,
            (
                request_data["requester"],
                request_data["department"],
                request_data["purpose"],
                request_data["request_date"],
                request_data["memo"],
                request_id,
            ),
        )
        if cursor.rowcount == 0:
            conn.rollback()
            return False

        conn.execute("DELETE FROM issue_items WHERE request_id = ?", (request_id,))
        conn.executemany(
            """
            INSERT INTO issue_items (request_id, item_id, quantity, note)
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    request_id,
                    item["item_id"],
                    item["quantity"],
                    item.get("note", ""),
                )
                for item in items
            ],
        )
        conn.commit()
        return True


def delete_issue_request(request_id: int) -> bool:
    with closing(get_connection()) as conn:
        cursor = conn.execute("DELETE FROM issue_requests WHERE id = ?", (request_id,))
        conn.commit()
        return cursor.rowcount > 0


def create_borrow_request(request_data: dict[str, Any], items: list[dict[str, Any]]) -> int:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            INSERT INTO borrow_requests (
                borrower,
                department,
                purpose,
                borrow_date,
                due_date,
                return_date,
                status,
                memo
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request_data["borrower"],
                request_data["department"],
                request_data["purpose"],
                request_data["borrow_date"],
                request_data["due_date"],
                request_data["return_date"],
                request_data["status"],
                request_data["memo"],
            ),
        )
        request_id = cursor.lastrowid
        conn.executemany(
            """
            INSERT INTO borrow_items (request_id, item_id, quantity, note)
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    request_id,
                    item["item_id"],
                    item["quantity"],
                    item.get("note", ""),
                )
                for item in items
            ],
        )
        conn.commit()
        return request_id


def list_borrow_requests() -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT id, borrower, department, purpose, borrow_date, due_date, return_date, status, memo, created_at
            FROM borrow_requests
            ORDER BY id DESC
            """
        ).fetchall()


def get_borrow_request(request_id: int) -> sqlite3.Row | None:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT id, borrower, department, purpose, borrow_date, due_date, return_date, status, memo, created_at
            FROM borrow_requests
            WHERE id = ?
            """,
            (request_id,),
        ).fetchone()


def list_borrow_items(request_id: int) -> list[sqlite3.Row]:
    with closing(get_connection()) as conn:
        return conn.execute(
            """
            SELECT
                borrow_items.id,
                borrow_items.request_id,
                borrow_items.item_id,
                borrow_items.quantity,
                borrow_items.note,
                inventory_items.name AS item_name,
                inventory_items.model AS item_model
            FROM borrow_items
            LEFT JOIN inventory_items ON inventory_items.id = borrow_items.item_id
            WHERE borrow_items.request_id = ?
            ORDER BY borrow_items.id ASC
            """,
            (request_id,),
        ).fetchall()


def update_borrow_request(request_id: int, request_data: dict[str, Any], items: list[dict[str, Any]]) -> bool:
    with closing(get_connection()) as conn:
        cursor = conn.execute(
            """
            UPDATE borrow_requests
            SET borrower = ?, department = ?, purpose = ?, borrow_date = ?, due_date = ?, return_date = ?, status = ?, memo = ?
            WHERE id = ?
            """,
            (
                request_data["borrower"],
                request_data["department"],
                request_data["purpose"],
                request_data["borrow_date"],
                request_data["due_date"],
                request_data["return_date"],
                request_data["status"],
                request_data["memo"],
                request_id,
            ),
        )
        if cursor.rowcount == 0:
            conn.rollback()
            return False

        conn.execute("DELETE FROM borrow_items WHERE request_id = ?", (request_id,))
        conn.executemany(
            """
            INSERT INTO borrow_items (request_id, item_id, quantity, note)
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    request_id,
                    item["item_id"],
                    item["quantity"],
                    item.get("note", ""),
                )
                for item in items
            ],
        )
        conn.commit()
        return True


def delete_borrow_request(request_id: int) -> bool:
    with closing(get_connection()) as conn:
        cursor = conn.execute("DELETE FROM borrow_requests WHERE id = ?", (request_id,))
        conn.commit()
        return cursor.rowcount > 0
