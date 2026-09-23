"""
Kits: in-house kits, each documented as a set of tabs in the Kit sheet
(materials list, recipe calculation, preparation protocol). The page shows
one kit at a time.

Tabs are grouped into kits in sheet order: each materials tab starts a new
kit, named from its title row ("In-House Luciferase Assay Kit — Reagents &
Materials List" -> "In-House Luciferase Assay Kit"), and the recipe and
protocol tabs after it belong to that kit. A tab title with a kit prefix,
e.g. "Luc assay Kit · Materials List", overrides both the grouping and the
name. A tab's role is recognised from its contents, not its name:

  materials   a header with a name column and a catalog-number or CAS column
  recipe      a "组分" / "Component" header row that has a final-concentration column
  protocol    a "步骤" / "Step" header next to "操作说明" / "Instructions"

Anything else (equipment lists, cost sheets) is skipped. Prices are never
carried over: the materials columns are an allow-list, and cost tabs do not
match any role.

Writes data.json to the section folder.
"""

import json
import re
import sys

from .sources import clean

SLUG = "kits"
TITLE = "Kits"
UNIT = "kits"
BLURB = (
    "In-house kits: every material with its catalog number, storage and "
    "stock, plus the recipe and preparation protocol."
)
SHEET_ID = "15tvazrVEUHqtj_iK264RjfN3ysxIp4HbA9wvkySgOpk"

# Tab title "<kit> <sep> <part>". Hyphens and dashes need spaces around them
# so a kit name such as "Glo-Lysis" is not split.
TAB_SEP = re.compile(r"\s*[·|｜]\s*|\s+[-–—]\s+")

# Materials: record field -> words that identify its header cell (after key()).
# First match wins, so the more specific words come first. Price, subtotal
# and purchase-line columns are left out on purpose.
MATERIAL_FIELDS = [
    ("catalog", ["货号", "cat#", "catno", "catalog"]),
    ("vendor", ["供应商", "vendor", "supplier", "manufacturer"]),
    ("no", ["序号", "no", "#"]),
    ("spec", ["英文名", "规格", "spec"]),
    ("name", ["材料名称", "名称", "material", "name", "reagent"]),
    ("cas", ["cas"]),
    ("purity", ["纯度", "purity", "grade"]),
    ("use", ["用于", "用途", "application", "use", "purpose"]),
    ("storage", ["储存", "存储", "保存", "storage"]),
    ("notes", ["备注", "notes", "note", "comments"]),
    ("pack_unit", ["包装单位", "packageunit", "packunit"]),
    ("pack", ["包装量", "包装", "pack", "size"]),
    ("stock", ["库存", "存量", "剩余", "stock", "remaining", "onhand"]),
    ("qty", ["采购数量", "数量", "qty", "quantity"]),
    ("uom", ["uom"]),
]
# Header words that must never be picked up as a column, even partially.
SKIP_HEADERS = ["单价", "小计", "价格", "金额", "price", "cost", "subtotal", "total", "采购行号", "poline"]

CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"


def key(cell):
    """'英文名 / 规格' -> '英文名规格', 'Cat. No.' -> 'catno'. Keeps CJK."""
    return re.sub(r"[\s/()（）\[\]【】.,:：、_\-]+", "", clean(cell).lower())


def fmt(value):
    """Tidy numbers from formulas: 550.0000000000001 -> '550', 8.3333 -> '8.33'."""
    text = clean(value)
    if isinstance(value, (int, float)) or re.fullmatch(r"-?\d+\.\d{4,}", text):
        x = float(value)
        if abs(x - round(x)) < 1e-9:
            return str(int(round(x)))
        if abs(x) >= 100:
            text = f"{x:.1f}"
        elif abs(x) >= 1:
            text = f"{x:.2f}"
        else:
            return f"{x:.3g}"
        return text.rstrip("0").rstrip(".")
    return text


def cells(row):
    return [clean(c) for c in row]


def is_error(text):
    """Spreadsheet error values: #VALUE!, #N/A, #REF! …"""
    return bool(re.fullmatch(r"#[A-Z0-9/]+[!?]?", text))


def kit_and_part(title):
    parts = TAB_SEP.split(title.strip(), maxsplit=1)
    return (parts[0], parts[1]) if len(parts) == 2 and parts[0] else (None, title)


# ---- materials ----

def contains_ok(word):
    """Match inside a longer header ('储存' in '储存条件'), except short Latin
    words, which would hit too much ('no' in 'notes')."""
    return len(word) > 2 or not word.isascii()


def material_columns(row):
    idx, labels = {}, {}
    for col, cell in enumerate(row):
        k = key(cell)
        if not k or any(s in k for s in SKIP_HEADERS):
            continue
        for field, words in MATERIAL_FIELDS:
            if field not in idx and any(k == w or (contains_ok(w) and w in k) for w in words):
                idx[field], labels[field] = col, clean(cell)
                break
    if "name" in idx and ("catalog" in idx or "cas" in idx):
        return idx, labels
    return None, None


def stock_text(rec):
    pack = " ".join(p for p in (rec.pop("pack"), rec.pop("pack_unit")) if p)
    qty, uom = rec.pop("qty"), rec.pop("uom")
    if qty and uom and uom.upper() != "EA":
        qty = f"{qty} {uom}"
    if pack and qty and qty != "1":
        return f"{pack} × {qty}"
    return pack or qty


def parse_materials(rows):
    for i, row in enumerate(rows[:10]):
        idx, labels = material_columns(row)
        if idx:
            break
    else:
        return None

    fields = [f for f, _ in MATERIAL_FIELDS]
    groups = [{"title": "", "items": []}]
    for raw in rows[i + 1:]:
        row = cells(raw)
        get = lambda f: fmt(raw[idx[f]]) if f in idx and idx[f] < len(raw) else ""
        rec = {f: get(f) for f in fields}
        if not rec["name"]:
            continue  # spacer and total rows
        for f, v in rec.items():
            if is_error(v):
                # e.g. a CAS number the sheet read as a date and then choked on
                print(f"  ! {v} in {labels.get(f, f)} for {rec['name']}; fix the cell in the sheet "
                      "(format as plain text)", file=sys.stderr)
                rec[f] = ""
        filled = [c for c in row if c]
        if len(filled) == 2 and re.fullmatch(r"[A-Za-z]", row[0]):
            # Section row: "A | Cell Lysis Buffer …" with nothing else filled in.
            groups.append({"title": f"{row[0]} · {rec['name']}", "items": []})
            continue
        rec["stock_total"] = stock_text(rec)
        groups[-1]["items"].append(rec)

    # Columns in the sheet's own order; pack size and count merge into one.
    shown = sorted(
        (f for f in idx if f not in ("pack", "pack_unit", "qty", "uom")), key=idx.get
    )
    columns = [{"key": f, "label": labels[f]} for f in shown]
    if any(f in idx for f in ("pack", "qty")):
        pack_label = labels.get("pack", "")
        qty_label = labels.get("qty", "")
        columns.append({"key": "stock_total", "label": " × ".join(l for l in (pack_label, qty_label) if l)})
    groups = [g for g in groups if g["items"]]
    return {"columns": columns, "groups": groups} if groups else None


def materials_title(rows):
    """'In-House Luciferase Assay Kit — Reagents & Materials List' -> 'In-House Luciferase Assay Kit'."""
    for row in rows[:3]:
        text = clean(row[0]) if row else ""
        if "—" in text:
            return text.split("—")[0].strip()
    return ""


# ---- recipe ----

def is_component_header(row):
    return key(row[0]) in ("组分", "component", "reagent") and any(
        "终浓度" in key(c) or "final" in key(c) for c in row
    )


def is_section_title(row):
    return bool(row) and row[0][:1] in CIRCLED and not any(row[1:7])


def kv_pairs(row, extra_labels):
    """Label/value pairs from a parameter row laid out as
    label | value | unit | label | value | unit | … notes …"""
    def unit(col):
        u = row[col] if col < len(row) else ""
        return f" {u}" if u and len(u) <= 6 and not re.match(r"-?\d", u) else ""

    pairs = []
    at = lambda col: row[col] if col < len(row) else ""
    if at(0) and at(1):
        pairs.append([at(0), fmt(at(1)) + unit(2)])
    if at(3) and at(4) and not re.match(r"-?\d", at(3)):
        pairs.append([at(3), fmt(at(4)) + unit(5)])
    if at(0) and not any((at(1), at(2), at(3))) and at(4):
        pairs.append([at(0), fmt(at(4)) + unit(5)])
    for col, label in extra_labels.items():
        if at(col):
            pairs.append([label, fmt(at(col))])
    return pairs


def parse_recipe(rows):
    rows = [cells(r) for r in rows]
    if not any(r and is_component_header(r) for r in rows):
        return None

    sections, section, header = [], None, None
    for row in rows:
        if not any(row):
            continue
        if is_section_title(row):
            # Labels sitting on the title row (e.g. "已购 GLB (mL)") head the
            # matching columns of the parameter rows below it.
            extra = {c: v for c, v in enumerate(row) if c >= 8 and v}
            section = {"title": row[0], "blocks": [], "_extra": extra}
            sections.append(section)
            header = None
            continue
        if section is None:
            continue  # sheet title and notes above the first section
        if is_component_header(row):
            # Drop columns the sheet itself marks as unused for this protocol.
            keep = [c for c, v in enumerate(row) if v and not re.search(r"不使用|n/a|not used", v, re.I)]
            header = keep
            section["blocks"].append({"kind": "table", "columns": [row[c] for c in keep], "rows": []})
            continue
        if header and row[0] and any(row[1:4]):
            section["blocks"][-1]["rows"].append([fmt(row[c]) if c < len(row) else "" for c in header])
            continue
        header = None
        pairs = kv_pairs(row, section["_extra"])
        if pairs:
            if not section["blocks"] or section["blocks"][-1]["kind"] != "params":
                section["blocks"].append({"kind": "params", "items": []})
            section["blocks"][-1]["items"].extend(pairs)

    for s in sections:
        s.pop("_extra")
        # A label repeated on the title row and a parameter row appears once.
        for block in s["blocks"]:
            if block["kind"] == "params":
                seen, items = set(), []
                for label, value in block["items"]:
                    if label not in seen:
                        seen.add(label)
                        items.append([label, value])
                block["items"] = items
    return [s for s in sections if s["blocks"]]


# ---- protocol ----

def parse_protocol(rows):
    rows = [cells(r) for r in rows]
    for i, row in enumerate(rows[:10]):
        k = [key(c) for c in row[:2]]
        if len(k) == 2 and k[0] in ("步骤", "step", "steps") and re.search(r"说明|instruction|procedure", k[1]):
            break
    else:
        return None

    intro = next((r[1] for r in rows[:i] if len(r) > 1 and r[1]), "")
    sections = []
    for row in rows[i + 1:]:
        if len(row) < 2 or not any(row):
            continue
        if row[0] and not row[1]:
            sections.append({"title": row[0], "steps": []})
        elif row[1]:
            if not sections:
                sections.append({"title": "", "steps": []})
            sections[-1]["steps"].append(row[1])
    return {"intro": intro, "sections": [s for s in sections if s["steps"]]}


# ---- assembly ----

def load(tabs):
    kits = []  # in sheet order
    named = {}  # kit name -> kit, for tabs with a "<kit> · " prefix
    current = None  # kit that unprefixed recipe / protocol tabs attach to
    for title, rows in tabs.items():
        prefix, _ = kit_and_part(title)
        parsed = {
            "materials": parse_materials(rows),
            "recipe": parse_recipe(rows),
            "protocol": parse_protocol(rows),
        }
        parsed = {k: v for k, v in parsed.items() if v}
        if not parsed:
            print(f"  ! not a materials, recipe or protocol tab, skipping: {title}", file=sys.stderr)
            continue
        if prefix:
            kit = named.get(prefix)
            if kit is None:
                kit = named[prefix] = {"name": prefix}
                kits.append(kit)
        elif "materials" in parsed or current is None:
            kit = {"name": materials_title(rows) or title}
            kits.append(kit)
        else:
            kit = current
        for part in parsed:
            if part in kit:
                print(f"  ! {kit['name']} already has a {part} tab; '{title}' replaces it", file=sys.stderr)
        kit.update(parsed)
        if not prefix:
            current = kit
    return kits


def build(tabs, out_dir):
    kits = load(tabs)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "data.json").write_text(
        json.dumps({"kits": kits}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    for kit in kits:
        n = sum(len(g["items"]) for g in kit.get("materials", {}).get("groups", []))
        parts = [p for p in ("materials", "recipe", "protocol") if p in kit]
        print(f"  {kit['name']}: {n} materials; {', '.join(parts)}")
    print(f"  {len(kits)} kits")
    return {"count": len(kits)}
