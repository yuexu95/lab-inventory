"""
Read a workbook from Google Sheets or a local .xlsx into plain rows, and the
small helpers every section uses to make sense of them.

Both readers return {tab_title: rows}; each row is a list of raw cell values
(strings from Google Sheets, whatever openpyxl gives for a local file).
"""

import datetime
import json
import re
import sys


def read_xlsx(path):
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}


def read_google(sheet_id, creds_json):
    import gspread
    from google.oauth2.service_account import Credentials

    try:
        info = json.loads(creds_json)
    except json.JSONDecodeError as e:
        # The first few characters of a key file are boilerplate, so they are
        # safe to show and usually explain a bad paste into the secret.
        head = creds_json.lstrip()[:16]
        sys.exit(
            f"GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON ({e.msg} at char {e.pos}). "
            f"It starts with {head!r} and is {len(creds_json)} characters long; the value "
            "must be the whole key file, from the opening '{' to the closing '}'."
        )
    creds = Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    book = gspread.authorize(creds).open_by_key(sheet_id)
    return {ws.title: ws.get_all_values() for ws in book.worksheets()}


def clean(value):
    if value is None:
        return ""
    if isinstance(value, datetime.date):
        # A value the workbook stored as a date; CAS numbers suffer this.
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def header_key(cell):
    """'ATCC Cat. No.' -> 'atcccatno', 'Fridge?' -> 'fridge', 'Cat#' -> 'cat#'."""
    return re.sub(r"[^a-z0-9#]+", "", clean(cell).lower())


def find_table(rows, fields, required, scan=10):
    """Locate the header row within the first `scan` rows.

    fields maps header_key() of a cell to a record field; required is the set
    of fields a row must supply to count as the header. Returns
    (column index, data rows), or (None, rows) when nothing matches.
    """
    for i, row in enumerate(rows[:scan]):
        idx = {}
        for col, cell in enumerate(row):
            field = fields.get(header_key(cell))
            if field and field not in idx:
                idx[field] = col
        if required <= idx.keys():
            return idx, rows[i + 1:]
    return None, rows


def pick_columns(rows, idx, fields):
    """Raw values of the mapped columns, one dict per row; missing -> None."""
    return [
        {f: raw[idx[f]] if f in idx and idx[f] < len(raw) else None for f in fields}
        for raw in rows
    ]
