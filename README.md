# Lab Inventory — static site

Renders the lab's inventory sheets into a searchable static site. Anything
heavy (RDKit drawing structures) happens at build time, so what gets published
is plain HTML, CSS, JS, JSON and SVG — no server, no cold starts, nothing to
keep running.

```
build.py                      fetch each section's sheet → build → write dist/
inventory/sources.py          Google Sheets / .xlsx readers, header matching
inventory/chemicals.py        Building blocks: structures, functional groups
inventory/cells.py            Cell lines: the ATCC list, minus pricing
site/                         landing page and the shared stylesheet
site/chemicals/, site/cells/  one page per section
.github/workflows/build.yml   rebuild on push, nightly, or on demand
dist/                         build output (gitignored)
```

## Sections

| Section | Google Sheet | Page |
| --- | --- | --- |
| Building blocks | *Chemical Inventory* — id in `inventory/chemicals.py` | `/chemicals/` |
| Cell lines | *Cell lines* — id in `inventory/cells.py` | `/cells/` |

Columns are found by their header, so column order in a sheet does not matter,
and a title row above the header is fine. Every tab is read; a tab with no
recognisable header is skipped with a note in the build log.

**Building blocks** recognises `CAS`, `Quantity`, `Vendor`, `Position`, `Name`,
`SMILES`, `Cat#`, `Fridge?` (blank/`No` = room temp, or a temperature such as
`4` or `-20`) and `Box` (`BOX A` … `BOX D`, labelled by `BOX_LABELS`). CAS
numbers a spreadsheet has zero-padded like dates (`0624-08-08`) are restored
(`624-08-8`) at build time; formatting the CAS column as plain text in the
sheet avoids the problem at the source. The old one-tab-per-box workbook
(tab names in `SHEET_LABELS`) still builds.

**Cell lines** recognises `Program`, `Cell Line`, `ATCC Cat. No.`,
`Organism / Background`, `Tissue / Disease`, `Key Feature or Marker`,
`Recommended Base Medium`, `Role in Project` and `Qty`. A second `Locations`
column in the form `Box A: A3, H8 | Box B: A4` is parsed into freezer
coordinates and powers the [freezer map](site/cells/freezer-map/index.html).
Rows without a cell line name (subtotals, spacers) are skipped. The ATCC link
is built from the catalogue number. Price columns are ignored on purpose.

## Build locally

```bash
pip install -r requirements.txt
python build.py --chemicals-xlsx Chemicals.xlsx --cells-xlsx "Cell lines.xlsx"
python -m http.server -d dist 8000   # then open http://localhost:8000
```

The `--<section>-xlsx` flags are the offline path (File → Download → .xlsx from
Google Sheets). Without a flag, that section is read from Google Sheets, which
needs `GOOGLE_SERVICE_ACCOUNT_JSON` in the environment.

## Connect Google Sheets

1. In Google Cloud console, create a project and enable the **Google Sheets API**.
2. Create a **service account**, then create a JSON key for it and download it.
3. Share **each** inventory spreadsheet with the service account's email
   address (`…@….iam.gserviceaccount.com`); Viewer access is enough.

## Deploy

Create a Cloudflare Pages project named `lab-inventory` (or change the name in
`build.yml`), push to GitHub, then add these repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole service-account JSON key file, pasted in |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → custom token with *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, Workers & Pages sidebar |

The workflow publishes `dist/` on every push to `main`, once a night, and
whenever you press **Run workflow** in the Actions tab.

To deploy somewhere else instead, drop the last workflow step — `dist/` is an
ordinary static folder that any host will serve.

## Adding a section

1. Add `inventory/<slug>.py` with `SLUG`, `TITLE`, `UNIT`, `BLURB`, `SHEET_ID`
   and `build(tabs, out_dir)`, which writes `out_dir/data.json` and returns
   `{"count": n}`. `inventory/cells.py` is the smallest example.
2. Add `site/<slug>/index.html` and `app.js`; copying `site/cells/` is the
   quickest start. The page fetches its own `data.json`.
3. Append the module to `SECTIONS` in `build.py`, and add a link to the
   `<nav class="topnav">` of the other pages.
4. Share the new sheet with the service account.

## Structure caveats (building blocks)

Rows whose SMILES were blank or wrong in the source spreadsheet are corrected
in `CORRECTIONS` in `inventory/chemicals.py`, keyed by CAS, and each one shows
a visible warning in the site's detail view:

| Position | Compound | Issue |
| --- | --- | --- |
| B-05 | undecan-1-ol | SMILES blank, filled from CAS |
| B-10 | 2-aminoethanol hydrochloride | SMILES blank, filled from CAS |
| C-22 | 2-ethylhexyl prop-2-enoate | held triethanolamine's SMILES, copied from C-20 |

A correction only applies while the sheet still has the problem. Once a row is
right at the source, delete its entry from `CORRECTIONS`.

## Functional group tags

`GROUPS` in `inventory/chemicals.py` holds SMARTS patterns matched against
every structure at build time; the site turns them into filter chips that
combine with AND, so `isocyanide` + `tertiary amine` narrows to compounds
carrying both. Add a row to that list to track another group — useful when
planning a new Ugi-4CR round.

Tags are pattern matches, not curation. Check the structure before relying on one.
