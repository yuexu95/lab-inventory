"""
Building blocks: the chemical inventory, one card per bottle with its
structure drawn from SMILES by RDKit at build time.

Writes to the section folder:
  data.json           one record per inventory row
  structures/*.svg    one file per unique structure, content-hashed
"""

import hashlib
import json
import re
import sys

from rdkit import Chem, RDLogger
from rdkit.Chem.Draw import rdMolDraw2D

from .sources import clean, find_table, pick_columns

RDLogger.DisableLog("rdApp.*")

SLUG = "chemicals"
TITLE = "Building blocks"
UNIT = "compounds"
BLURB = (
    "Reagent stock for ionizable-lipid synthesis, boxed by scale. "
    "Search by name, CAS or position; filter by box and functional group."
)
SHEET_ID = "1Vw0FgVxmjveS0k6KJYtrh0G5pVIMIqE_6unkUcSXNIg"

# Value in the Box column -> display label. Extend here if boxes are added.
BOX_LABELS = {
    "BOX A": "Box A (1-100g)",
    "BOX B": "Box B (100-500g)",
    "BOX C": "Box C (>500g)",
    "BOX D": "Box D (<1g)",
}

# Older workbooks kept one tab per box, named like this, with no Box column.
SHEET_LABELS = {
    "BOX A,  (1, 100g)": "Box A (1-100g)",
    "BOX B, (100, 500g)": "Box B (100-500g)",
    "BOX C, > 500 g": "Box C (>500g)",
    "Box D, < 1 g": "Box D (<1g)",
}

# Record fields, in the legacy column order.
COLUMNS = ["cas", "qty", "vendor", "position", "name", "smiles", "catalog", "storage"]
LEGACY_INDEX = {field: i for i, field in enumerate(COLUMNS)}

# header_key() of a header cell -> record field. Columns are matched by
# header, so the sheet can be reordered without touching this file.
HEADER_FIELDS = {
    "cas": "cas",
    "quantity": "qty",
    "qty": "qty",
    "vendor": "vendor",
    "position": "position",
    "pos": "position",
    "name": "name",
    "smiles": "smiles",
    "cat#": "catalog",
    "cat": "catalog",
    "catno": "catalog",
    "catalog": "catalog",
    "fridge": "storage",
    "storage": "storage",
    "box": "box",
}

STORAGE_LABELS = {None: "Room temp", "": "Room temp", 4: "4 °C", -20: "-20 °C"}

# SMILES that were blank or wrong in the source spreadsheet.
# Keyed by CAS so the fix survives row reordering. Every entry shows a
# visible caveat in the UI so it can be checked against the bottle.
CORRECTIONS = {
    "112-42-5": ("CCCCCCCCCCCO", "blank in source, filled from CAS"),
    "2002-24-6": ("C(CO)N.Cl", "blank in source, filled from CAS"),
    "103-11-7": (
        "CCCCC(CC)COC(=O)C=C",
        "source row held triethanolamine's SMILES, duplicated from C-20",
    ),
}

# Functional groups for library design. Order matters: first match wins for
# the card's accent, but a compound can carry several tags.
GROUPS = [
    ("isocyanide", "[C-]#[N+]"),
    ("aldehyde", "[CX3H1](=O)[#6,#1]"),
    ("formamide", "[NX3][CX3H1]=O"),
    ("ketone", "[#6][CX3](=O)[#6]"),
    ("carboxylic acid", "[CX3](=O)[OX2H1]"),
    ("anhydride", "[CX3](=O)[OX2][CX3](=O)"),
    ("acrylate", "C=C[CX3](=O)[OX2]"),
    ("epoxide", "[OX2r3]1[#6r3][#6r3]1"),
    ("alkyl halide", "[CX4][F,Cl,Br,I]"),
    ("primary amine", "[NX3;H2;!$(NC=O);!$(N[!#6])]"),
    ("secondary amine", "[NX3;H1;!$(NC=O);!$(N[!#6])]"),
    ("tertiary amine", "[NX3;H0;!$(NC=O);!$(N=*);!$([N+]);!$(N[!#6])]"),
    ("alcohol", "[OX2H][CX4]"),
    ("nitrile", "[NX1]#[CX2]"),
    ("thioether", "[#16X2H0]([#6])[#6]"),
]
COMPILED = [(name, Chem.MolFromSmarts(sma)) for name, sma in GROUPS]

# Atom colours, matched to the site palette rather than RDKit's defaults.
PALETTE = {
    6: (0.11, 0.15, 0.13),
    7: (0.18, 0.35, 0.66),
    8: (0.70, 0.25, 0.17),
    16: (0.64, 0.54, 0.05),
    9: (0.18, 0.57, 0.59),
    17: (0.18, 0.55, 0.24),
    35: (0.50, 0.30, 0.10),
    53: (0.42, 0.25, 0.63),
    15: (0.76, 0.40, 0.17),
    5: (0.54, 0.48, 0.36),
    3: (0.61, 0.35, 0.71),
    11: (0.61, 0.35, 0.71),
    19: (0.61, 0.35, 0.71),
    55: (0.61, 0.35, 0.71),
}


def load(tabs):
    """Raw records from every tab with an inventory header, or a legacy box tab."""
    out = []
    for title, rows in tabs.items():
        tab_label = SHEET_LABELS.get(title)
        idx, data = find_table(rows, HEADER_FIELDS, {"cas", "smiles"})
        if idx is None:
            if tab_label is None:
                print(f"  ! no inventory header, skipping tab: {title}", file=sys.stderr)
                continue
            idx, data = LEGACY_INDEX, rows[1:]
        for rec in pick_columns(data, idx, COLUMNS + ["box"]):
            if not clean(rec["cas"]) and not clean(rec["name"]):
                continue  # blank spacer row
            box = clean(rec["box"]).upper()
            rec["box"] = BOX_LABELS.get(box, tab_label or box)
            out.append(rec)
    return out


def normalise_cas(value):
    """Undo the date-style zero padding spreadsheets apply to some CAS numbers
    (624-08-8 arrives as 0624-08-08). Also keeps CORRECTIONS lookups matching."""
    m = re.fullmatch(r"0*(\d{2,7})-(\d{2})-0?(\d)", value)
    return f"{m[1]}-{m[2]}-{m[3]}" if m else value


def position_key(rec):
    """Sort A-2 before A-10, and boxes in label order."""
    m = re.match(r"([A-Za-z]+)-?(\d+)", rec["position"])
    if m:
        return (rec["box"], m[1].upper(), int(m[2]))
    return (rec["box"], rec["position"], 0)


def normalise(raw_rows):
    """Clean fields, apply corrections, note rows we cannot draw."""
    out, dropped = [], []
    for raw in raw_rows:
        rec = {k: clean(raw.get(k)) for k in COLUMNS}
        rec["box"] = raw.get("box", "")
        rec["position"] = rec["position"].upper()
        if rec["cas"].startswith("#"):
            # openpyxl yields #VALUE! for a CAS the sheet stored as an impossible date.
            print(
                f"  ! unreadable CAS at {rec['position'] or '?'} ({rec['cas']}); "
                "format the CAS column as plain text in the sheet",
                file=sys.stderr,
            )
            rec["cas"] = ""
        rec["cas"] = normalise_cas(rec["cas"])

        storage_raw = raw.get("storage")
        try:
            storage_key = int(storage_raw) if storage_raw not in (None, "") else None
        except (TypeError, ValueError):
            storage_key = None
        rec["storage"] = STORAGE_LABELS.get(storage_key, f"{storage_key} °C")

        if rec["smiles"] in ("", "#N/A", "N/A"):
            rec["smiles"] = ""

        fix = CORRECTIONS.get(rec["cas"])
        if fix and (not rec["smiles"] or rec["cas"] == "103-11-7"):
            rec["smiles"], rec["caveat"] = fix
        else:
            rec["caveat"] = ""

        if not rec["smiles"]:
            dropped.append((rec["position"], rec["name"], "no SMILES"))
            rec["structure"] = ""
            out.append(rec)
            continue

        mol = Chem.MolFromSmiles(rec["smiles"])
        if mol is None:
            dropped.append((rec["position"], rec["name"], "SMILES will not parse"))
            rec["structure"] = ""
            out.append(rec)
            continue

        rec["_mol"] = mol
        out.append(rec)
    return out, dropped


def render_svg(mol, width=260, height=170):
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    opts = drawer.drawOptions()
    opts.clearBackground = False
    opts.bondLineWidth = 1.6
    opts.updateAtomPalette(PALETTE)
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()
    svg = svg[svg.index("<svg"):].replace("<!-- END OF HEADER -->", "")
    # Drop the fixed pixel size so the SVG scales to whatever box holds it.
    svg = re.sub(r"width='\d+px' height='\d+px' ", "", svg, count=1)
    return re.sub(r"\n\s*\n", "\n", svg).strip()


def tag_groups(mol):
    return [name for name, patt in COMPILED if patt is not None and mol.HasSubstructMatch(patt)]


def build(tabs, out_dir):
    raw_rows = load(tabs)
    print(f"  {len(raw_rows)} rows read")
    records, dropped = normalise(raw_rows)
    records.sort(key=position_key)

    struct_dir = out_dir / "structures"
    struct_dir.mkdir(parents=True)

    # Render one SVG per unique structure; identical compounds share a file.
    by_canonical = {}
    for rec in records:
        mol = rec.pop("_mol", None)
        if mol is None:
            rec.setdefault("structure", "")
            rec["groups"] = []
            continue
        canonical = Chem.MolToSmiles(mol)
        if canonical not in by_canonical:
            svg = render_svg(mol)
            digest = hashlib.sha1(canonical.encode()).hexdigest()[:12]
            (struct_dir / f"{digest}.svg").write_text(svg, encoding="utf-8")
            by_canonical[canonical] = (f"structures/{digest}.svg", tag_groups(mol))
        rec["structure"], rec["groups"] = by_canonical[canonical]

    payload = {
        "records": records,
        "groups": sorted({g for r in records for g in r["groups"]}),
        "boxes": sorted({r["box"] for r in records if r["box"]}),
    }
    (out_dir / "data.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    print(f"  {len(records)} records, {len(by_canonical)} unique structures")
    if dropped:
        print(f"  {len(dropped)} row(s) without a usable structure:")
        for pos, name, why in dropped:
            print(f"    {pos or '?':<6} {name[:44]:<46} {why}")
    return {"count": len(records)}
