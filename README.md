# Building Block Library — static structure browser

Renders the chemical inventory into a searchable static site. RDKit draws every
structure **at build time**, so the published site is plain HTML, CSS, JS and SVG
files — no server, no cold starts, nothing to keep running.

```
build.py                      fetch data → render structures → write dist/
site/                         the front end (index.html, style.css, app.js)
.github/workflows/build.yml   rebuild on push, nightly, or on demand
dist/                         build output (gitignored)
```

## Build locally

```bash
pip install -r requirements.txt
python build.py --xlsx Chemicals_260818-final.xlsx
python -m http.server -d dist 8000   # then open http://localhost:8000
```

`--xlsx` is the offline path. Without it, the script reads Google Sheets and
needs `SHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON` in the environment.

## Connect Google Sheets

1. In Google Cloud console, create a project and enable the **Google Sheets API**.
2. Create a **service account**, then create a JSON key for it and download it.
3. Share the spreadsheet with the service account's email address
   (`…@….iam.gserviceaccount.com`), Viewer access is enough.

Columns are found by their header, so order does not matter. Recognised
headers: `CAS`, `Quantity`, `Vendor`, `Position`, `Name`, `SMILES`, `Cat#`,
`Fridge?` (blank/`No` = room temp, or a temperature such as `4` or `-20`), and
`Box` (`BOX A` … `BOX D`, mapped to labels by `BOX_LABELS` in `build.py`). Every
tab with such a header is read; tabs without one are skipped, unless the tab is
named like the old one-tab-per-box workbook (`SHEET_LABELS`), in which case it
is read in that fixed column order with the box taken from the tab name.

CAS numbers that a spreadsheet has zero-padded like dates (`0624-08-08`) are
restored to their proper form (`624-08-8`) at build time.

## Deploy

Push to GitHub, then add these repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
| --- | --- |
| `SHEET_ID` | the long id in the spreadsheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole service-account JSON key file, pasted in |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens, template "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar |

Create a Cloudflare Pages project named `lab-building-blocks` first (or change
the name in `build.yml`). The workflow then publishes `dist/` on every push, once
a night, and whenever you press **Run workflow** in the Actions tab.

To deploy somewhere else instead, drop the last workflow step — `dist/` is an
ordinary static folder that any host will serve.

## Structure caveats

Three rows had SMILES problems in the source spreadsheet. They are corrected in
`CORRECTIONS` in `build.py`, keyed by CAS, and each one shows a visible warning
in the site's detail view:

| Position | Compound | Issue |
| --- | --- | --- |
| B-05 | undecan-1-ol | SMILES blank, filled from CAS |
| B-10 | 2-aminoethanol hydrochloride | SMILES blank, filled from CAS |
| C-22 | 2-ethylhexyl prop-2-enoate | held triethanolamine's SMILES, copied from C-20 |

Fixing these in the spreadsheet itself is better than carrying them here. Once
a row is right at the source, delete its entry from `CORRECTIONS`.

## Functional group tags

`GROUPS` in `build.py` holds SMARTS patterns matched against every structure at
build time; the site turns them into filter chips that combine with AND, so
`isocyanide` + `tertiary amine` narrows to compounds carrying both. Add a row to
that list to track another group — useful when planning a new Ugi-4CR round.

Tags are pattern matches, not curation. Check the structure before relying on one.
