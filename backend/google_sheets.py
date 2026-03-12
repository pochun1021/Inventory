from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence

from db import list_borrow_items, list_borrow_requests, list_issue_items, list_issue_requests

GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / "google_sheets_state.json"


@dataclass(frozen=True)
class GoogleSheetsConfig:
    client_secrets_file: Path
    token_file: Path
    spreadsheet_id: str | None
    spreadsheet_title: str
    issue_sheet_name: str
    borrow_sheet_name: str


def _get_env(name: str) -> str:
    return os.getenv(name, "").strip()


def _load_state() -> dict[str, str]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_state(data: dict[str, str]) -> None:
    STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_google_sheets_config() -> GoogleSheetsConfig | None:
    client_secrets_path = Path(
        _get_env("GOOGLE_SHEETS_CLIENT_SECRETS_FILE")
        or _get_env("GOOGLE_SHEETS_CREDENTIALS_FILE")
        or (BASE_DIR / "client_secret.json")
    )
    if not client_secrets_path.exists():
        return None

    token_file = Path(_get_env("GOOGLE_SHEETS_TOKEN_FILE") or (BASE_DIR / "google_token.json"))
    spreadsheet_id = _get_env("GOOGLE_SHEETS_SPREADSHEET_ID") or _load_state().get("spreadsheet_id")
    spreadsheet_title = _get_env("GOOGLE_SHEETS_SPREADSHEET_TITLE") or "Inventory Requests"
    issue_sheet_name = _get_env("GOOGLE_SHEETS_ISSUE_SHEET_NAME") or "IssueRequests"
    borrow_sheet_name = _get_env("GOOGLE_SHEETS_BORROW_SHEET_NAME") or "BorrowRequests"

    return GoogleSheetsConfig(
        client_secrets_file=client_secrets_path,
        token_file=token_file,
        spreadsheet_id=spreadsheet_id,
        spreadsheet_title=spreadsheet_title,
        issue_sheet_name=issue_sheet_name,
        borrow_sheet_name=borrow_sheet_name,
    )


def is_google_sheets_configured() -> bool:
    return get_google_sheets_config() is not None


def _load_credentials(config: GoogleSheetsConfig):
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as exc:  # pragma: no cover - requires optional dependency
        raise RuntimeError(
            "Missing Google Sheets dependencies. Install google-api-python-client, google-auth, google-auth-oauthlib."
        ) from exc

    creds = None
    if config.token_file.exists():
        creds = Credentials.from_authorized_user_file(str(config.token_file), GOOGLE_SHEETS_SCOPES)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    elif not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(config.client_secrets_file), GOOGLE_SHEETS_SCOPES)
        creds = flow.run_local_server(port=0)

    if creds:
        config.token_file.write_text(creds.to_json(), encoding="utf-8")
    return creds


def ensure_google_oauth() -> None:
    config = get_google_sheets_config()
    if not config:
        return
    _load_credentials(config)


@lru_cache(maxsize=1)
def _get_sheets_service():
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:  # pragma: no cover - requires optional dependency
        raise RuntimeError("Missing Google Sheets dependencies. Install google-api-python-client.") from exc

    config = get_google_sheets_config()
    if not config:
        raise RuntimeError("Google Sheets is not configured.")

    credentials = _load_credentials(config)
    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def _ensure_spreadsheet_id(config: GoogleSheetsConfig) -> str:
    if config.spreadsheet_id:
        return config.spreadsheet_id

    service = _get_sheets_service()
    spreadsheet = (
        service.spreadsheets()
        .create(body={"properties": {"title": config.spreadsheet_title}})
        .execute()
    )
    spreadsheet_id = spreadsheet["spreadsheetId"]
    state = _load_state()
    state["spreadsheet_id"] = spreadsheet_id
    _save_state(state)
    return spreadsheet_id


def _ensure_sheets_exist(spreadsheet_id: str, sheet_names: Sequence[str]) -> None:
    service = _get_sheets_service()
    spreadsheet = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    existing = {sheet.get("properties", {}).get("title") for sheet in spreadsheet.get("sheets", [])}
    missing = [name for name in sheet_names if name not in existing]
    if not missing:
        return

    requests = [{"addSheet": {"properties": {"title": name}}} for name in missing]
    service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": requests}).execute()


def _batch_clear_and_update(
    spreadsheet_id: str,
    entries: Sequence[tuple[str, Sequence[str], Iterable[Sequence[str]]]],
) -> None:
    service = _get_sheets_service()

    clear_ranges = [entry[0] for entry in entries]
    service.spreadsheets().values().batchClear(
        spreadsheetId=spreadsheet_id,
        body={"ranges": clear_ranges},
    ).execute()

    data = []
    for sheet_name, headers, rows in entries:
        values = [list(headers)]
        values.extend([list(row) for row in rows])
        data.append(
            {
                "range": f"{sheet_name}!A1",
                "values": values,
            }
        )

    service.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "valueInputOption": "RAW",
            "data": data,
        },
    ).execute()


def _format_issue_rows():
    rows = []
    for request in list_issue_requests():
        items = list_issue_items(request["id"])
        if not items:
            rows.append(
                [
                    str(request["id"]),
                    request["requester"],
                    request["department"],
                    request["purpose"],
                    request["request_date"],
                    request["memo"],
                    "",
                    "",
                    "",
                    "",
                    "",
                    request["created_at"],
                ]
            )
            continue

        for item in items:
            rows.append(
                [
                    str(request["id"]),
                    request["requester"],
                    request["department"],
                    request["purpose"],
                    request["request_date"],
                    request["memo"],
                    str(item["item_id"]),
                    item["item_name"],
                    item["item_model"],
                    str(item["quantity"]),
                    item["note"],
                    request["created_at"],
                ]
            )
    return rows


def _format_borrow_rows():
    rows = []
    for request in list_borrow_requests():
        items = list_borrow_items(request["id"])
        if not items:
            rows.append(
                [
                    str(request["id"]),
                    request["borrower"],
                    request["department"],
                    request["purpose"],
                    request["borrow_date"],
                    request["due_date"],
                    request["return_date"],
                    request["status"],
                    request["memo"],
                    "",
                    "",
                    "",
                    "",
                    "",
                    request["created_at"],
                ]
            )
            continue

        for item in items:
            rows.append(
                [
                    str(request["id"]),
                    request["borrower"],
                    request["department"],
                    request["purpose"],
                    request["borrow_date"],
                    request["due_date"],
                    request["return_date"],
                    request["status"],
                    request["memo"],
                    str(item["item_id"]),
                    item["item_name"],
                    item["item_model"],
                    str(item["quantity"]),
                    item["note"],
                    request["created_at"],
                ]
            )
    return rows


def sync_requests_to_google_sheets() -> None:
    config = get_google_sheets_config()
    if not config:
        return

    spreadsheet_id = _ensure_spreadsheet_id(config)
    _ensure_sheets_exist(spreadsheet_id, [config.issue_sheet_name, config.borrow_sheet_name])

    issue_headers = [
        "領用單號",
        "領用人",
        "部門",
        "用途",
        "領用日期",
        "備註",
        "物品ID",
        "品名",
        "型號",
        "數量",
        "項目備註",
        "建立時間",
    ]
    borrow_headers = [
        "借用單號",
        "借用人",
        "部門",
        "用途",
        "借用日期",
        "預計歸還日",
        "實際歸還日",
        "狀態",
        "備註",
        "物品ID",
        "品名",
        "型號",
        "數量",
        "項目備註",
        "建立時間",
    ]

    entries = [
        (config.issue_sheet_name, issue_headers, _format_issue_rows()),
        (config.borrow_sheet_name, borrow_headers, _format_borrow_rows()),
    ]
    _batch_clear_and_update(spreadsheet_id, entries)
