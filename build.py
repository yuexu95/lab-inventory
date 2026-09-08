#!/usr/bin/env python3
"""
Build the static lab-inventory site.

Each section of the inventory is a module in inventory/ that knows its Google
Sheet (SHEET_ID) and how to turn rows into a data.json plus any rendered
assets (build(tabs, out_dir)). This script fetches the rows, runs every
section, lays site/ over the top and writes the summary the landing page reads.

Data source per section, in order of preference:
  1. Local workbook  - pass --<slug>-xlsx path/to/file.xlsx
  2. Google Sheets   - set GOOGLE_SERVICE_ACCOUNT_JSON in the environment

Output goes to dist/ :
  dist/index.html, style.css   landing page and shared styles, from site/
  dist/summary.json            section counts and the build time
  dist/<slug>/                 one folder per section: its page and data.json
"""

import argparse
import datetime
import json
import os
import shutil
import sys
from pathlib import Path

from inventory import cells, chemicals
from inventory.sources import read_google, read_xlsx

ROOT = Path(__file__).parent
SITE = ROOT / "site"
DIST = ROOT / "dist"

# Order here is the order on the landing page. Adding a section means adding a
# module with SLUG, TITLE, UNIT, BLURB, SHEET_ID and build(), a matching
# site/<slug>/ page, and a link in the nav of the other pages.
SECTIONS = [chemicals, cells]


def main():
    ap = argparse.ArgumentParser()
    for section in SECTIONS:
        ap.add_argument(
            f"--{section.SLUG}-xlsx",
            metavar="PATH",
            help=f"build '{section.TITLE}' from a local workbook instead of Google Sheets",
        )
    args = ap.parse_args()
    creds = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    sys.stdout.reconfigure(line_buffering=True)  # keep warnings in order in CI logs

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SITE, DIST)

    summary = []
    for section in SECTIONS:
        local = getattr(args, f"{section.SLUG}_xlsx")
        print(f"[{section.SLUG}]")
        if local:
            print(f"  reading workbook {local}")
            tabs = read_xlsx(local)
        elif creds:
            print(f"  reading Google Sheet {section.SHEET_ID}")
            tabs = read_google(section.SHEET_ID, creds)
        else:
            sys.exit(
                f"No data source for '{section.SLUG}': pass --{section.SLUG}-xlsx PATH "
                "or set GOOGLE_SERVICE_ACCOUNT_JSON."
            )
        info = section.build(tabs, DIST / section.SLUG)
        summary.append(
            {
                "slug": section.SLUG,
                "title": section.TITLE,
                "unit": section.UNIT,
                "blurb": section.BLURB,
                **info,
            }
        )

    built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    (DIST / "summary.json").write_text(
        json.dumps({"built": built, "sections": summary}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"built -> {DIST}")


if __name__ == "__main__":
    main()
