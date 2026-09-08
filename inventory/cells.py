"""
Cell lines: the ATCC order list, one card per line with what it is for.

Writes data.json to the section folder. Pricing columns in the sheet are
deliberately not carried over; this is an inventory, not a quote.
"""

import json
import re
import sys

from .sources import clean, find_table, pick_columns

SLUG = "cells"
TITLE = "Cell lines"
UNIT = "cell lines"
BLURB = (
    "ATCC lines on hand or on order, grouped by program, with the base medium "
    "and the role each one plays."
)
SHEET_ID = "1Ezga1klNnOzxdRa-8rgWEQhAqDztvxok_qHcyuqu0MY"

FIELDS = ["program", "name", "catalog", "organism", "tissue", "marker", "medium", "role", "qty"]

# header_key() of a header cell -> record field.
HEADER_FIELDS = {
    "program": "program",
    "cellline": "name",
    "line": "name",
    "name": "name",
    "atcccatno": "catalog",
    "catno": "catalog",
    "cat#": "catalog",
    "catalog": "catalog",
    "organismbackground": "organism",
    "organism": "organism",
    "species": "organism",
    "tissuedisease": "tissue",
    "tissue": "tissue",
    "disease": "tissue",
    "keyfeatureormarker": "marker",
    "keyfeature": "marker",
    "marker": "marker",
    "recommendedbasemedium": "medium",
    "basemedium": "medium",
    "medium": "medium",
    "roleinproject": "role",
    "role": "role",
    "notes": "role",
    "qty": "qty",
    "quantity": "qty",
    "vials": "qty",
}

ATCC_URL = "https://www.atcc.org/products/{}"


def species(organism):
    """'Mouse, BALB/c' -> 'Mouse'; 'Human (T-ALL, peripheral blood)' -> 'Human'."""
    m = re.match(r"[A-Za-z]+", organism)
    return m[0].capitalize() if m else ""


def program_key(rec):
    """Programs are numbered ('1 - In vivo CAR-T'). Sort by that only; the
    sort is stable, so within a program the sheet's own order is kept."""
    m = re.match(r"(\d+)", rec["program"])
    return (int(m[1]) if m else 99, rec["program"])


def load(tabs):
    out = []
    for title, rows in tabs.items():
        idx, data = find_table(rows, HEADER_FIELDS, {"name", "catalog"})
        if idx is None:
            print(f"  ! no cell-line header, skipping tab: {title}", file=sys.stderr)
            continue
        for raw in pick_columns(data, idx, FIELDS):
            rec = {f: clean(raw[f]) for f in FIELDS}
            if not rec["name"]:
                continue  # subtotal and spacer rows
            rec["species"] = species(rec["organism"])
            rec["url"] = ATCC_URL.format(rec["catalog"].lower()) if rec["catalog"] else ""
            out.append(rec)
    return out


def build(tabs, out_dir):
    records = load(tabs)
    records.sort(key=program_key)
    out_dir.mkdir(parents=True, exist_ok=True)

    programs = []
    for rec in records:
        if rec["program"] and rec["program"] not in programs:
            programs.append(rec["program"])

    payload = {
        "records": records,
        "programs": programs,
        "species": sorted({r["species"] for r in records if r["species"]}),
    }
    (out_dir / "data.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"  {len(records)} cell lines across {len(programs)} programs")
    return {"count": len(records)}
