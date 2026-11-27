#!/usr/bin/env python3
"""Writes src/shared/nj-mw562-fields.ts: the field names of NJDOL's fillable MW-562, by position.

The MW-562 (Payroll Certification for Public Works Projects) names its fields inconsistently from row
to row ("1 SuS Hrs.0.0.0", "2 Su-S Hrs.1", "10  MS Hrs.0.6.2.0.1"), so this reads where each field
sits on the page and assigns it to a row and a column. Run it again when NJDOL publishes a new form:

    pip install pypdf
    python3 scripts/nj-mw562-fields.py <path to the blank MW-562.pdf>

The form is NJDOL's, linked from https://www.nj.gov/labor/wageandhour/prevailing-rates/wagehubfaq.shtml
("Electronically fill out the latest version of the ... (MW-562) and upload it to the Wage Hub").
It is not kept in this repository: the contractor downloads it from NJDOL and PayApps fills it.
"""

import json
import sys
from pathlib import Path

from pypdf import PdfReader

OUT = Path(__file__).resolve().parent.parent / "src" / "shared" / "nj-mw562-fields.ts"

# Left edges (points) of the employee-row columns on page 1, read from the 2/25 form.
HOUR_X = {"su": 470, "mo": 492, "tu": 514, "we": 537, "th": 558, "fr": 580, "sa": 602, "total": 625, "rate": 649}
MONEY_X = {
    "grossProject": 682,
    "grossWeek": 710,
    "fica": 739,
    "federalTax": 767,
    "stateTax": 795,
    "other1": 822,
    "other2": 849,
    "totalDeductions": 877,
    "net": 912,
    "fringe": 942,
}
TEXT_X = {"employee": 37, "jobTitle": 165, "workCategory": 259, "sex": 348, "race": 394, "ethnicity": 416}
PLAN_X = {
    "program": 300,
    "health": 429,
    "vacation": 462,
    "training": 497,
    "pension": 532,
    "otherType": 566,
    "otherAmount": 670,
    "administrator": 713,
    "account": 844,
    "trustee": 919,
}


def full_name(w):
    parts = []
    n = w
    while n is not None:
        if "/T" in n:
            parts.insert(0, str(n["/T"]))
        n = n["/Parent"].get_object() if "/Parent" in n else None
    return ".".join(parts)


def inherited(w, key):
    n = w
    while n is not None:
        if key in n:
            return n[key]
        n = n["/Parent"].get_object() if "/Parent" in n else None
    return None


def widgets(reader, page_no):
    out = []
    for a in reader.pages[page_no].get("/Annots", []):
        w = a.get_object()
        if w.get("/Subtype") != "/Widget":
            continue
        a0, b0, a1, b1 = (float(v) for v in w["/Rect"])
        x0, y0, y1 = min(a0, a1), min(b0, b1), max(b0, b1)  # some rects are stored upside down
        ml = inherited(w, "/MaxLen")
        out.append({"name": full_name(w), "x": x0, "y0": y0, "y1": y1, "max": int(ml) if ml is not None else None})
    return out


def pick(ws, x, ylo, yhi, tol=3):
    hits = [w for w in ws if abs(w["x"] - x) <= tol and ylo <= (w["y0"] + w["y1"]) / 2 <= yhi]
    if len(hits) != 1:
        raise SystemExit(f"expected one field at x={x} y={ylo}..{yhi}, found {[h['name'] for h in hits]}")
    return hits[0]


def by_name(ws, name):
    hits = [w for w in ws if w["name"] == name]
    if len(hits) != 1:
        raise SystemExit(f"expected one field named {name!r}, found {len(hits)}")
    return hits[0]


def main():
    src = sys.argv[1]
    r = PdfReader(src)
    p1, p2 = widgets(r, 0), widgets(r, 1)
    limits = {}

    def take(w):
        if w["max"] is not None:
            limits[w["name"]] = w["max"]
        return w["name"]

    rows = []
    emp = sorted((w for w in p1 if abs(w["x"] - 37) <= 2 and w["name"].endswith("Employee")), key=lambda w: -w["y1"])
    if len(emp) != 10:
        raise SystemExit(f"expected 10 employee rows, found {len(emp)}")
    for e in emp:
        lo, hi = e["y0"] - 3, e["y1"] + 3
        mid = (lo + hi) / 2
        row = {k: take(pick(p1, x, lo, hi)) for k, x in TEXT_X.items()}
        row["st"] = {k: take(pick(p1, x, mid, hi)) for k, x in HOUR_X.items()}
        row["ot"] = {k: take(pick(p1, x, lo, mid)) for k, x in HOUR_X.items()}
        row.update({k: take(pick(p1, x, lo, hi)) for k, x in MONEY_X.items()})
        rows.append(row)

    dates = {k: take(by_name(p1, n)) for k, n in [("su", "Su-date"), ("mo", "M-date"), ("tu", "Tu-date"), ("we", "W-date"), ("th", "Th-date"), ("fr", "F-date"), ("sa", "Sa-date")]}
    header = {
        "contractorName": "Contractor Name",
        "businessAddress": "Business Address",
        "projectName": "Project Name",
        "projectId": "Contract-Project ID",
        "projectLocation": "Project Location",
        "fein": "FEIN",
        "registration": "Contractor Reg #",
        "payrollNo": "Payroll No",
        "wagesPaid": "Date Wages Due  Paid",
        "weekEnding": "Week End Date",
        "otherLabel1": "OtherLabel1.0",
        "otherLabel2": "OtherLabel1.1",
    }
    header = {k: take(by_name(p1, n)) for k, n in header.items()}
    boxes = {
        "contractor": "Contractor or",
        "subcontractor": "Subcontractor",
        "noWork": "NoWorkWeek",
        "final": "Final Certification",
        "additionalSheets": "Check if additional sheets attached",
    }
    boxes = {k: by_name(p1, n)["name"] for k, n in boxes.items()}

    progs = sorted((w for w in p2 if abs(w["x"] - 300) <= 2), key=lambda w: -w["y1"])
    plans = []
    for p in progs:
        lo, hi = p["y0"] - 3, p["y1"] + 3
        plans.append({k: take(pick(p2, x, lo, hi)) for k, x in PLAN_X.items()})
    cert = {
        "contractorName": "2Contractor Name",
        "projectName": "2Project Name",
        "projectLocation": "ProjectLocation2",
        "start": "start date",
        "end": "end date",
        "name": "Name",
        "title": "Title",
        "signDate": "Sign Date",
    }
    cert = {k: take(by_name(p2, n)) for k, n in cert.items()}
    cert_boxes = {"fringePlans": "FringePlans", "fringeCash": "FringeCash", "eSign": "Check Box1"}
    cert_boxes = {k: by_name(p2, n)["name"] for k, n in cert_boxes.items()}

    title = r.metadata.get("/Title") if r.metadata else None
    data = {
        "rows": rows,
        "dates": dates,
        "header": header,
        "boxes": boxes,
        "plans": plans,
        "cert": cert,
        "certBoxes": cert_boxes,
        "maxLen": dict(sorted(limits.items())),
    }
    body = json.dumps(data, indent=2)
    OUT.write_text(
        "// Generated by scripts/nj-mw562-fields.py from NJDOL's fillable MW-562"
        f" ({title}); do not edit by hand.\n"
        "// Field names by row and column: the form's own names are not regular enough to compute.\n"
        f"export const MW562_TITLE = {json.dumps(str(title))};\n"
        f"export const MW562 = {body} as const;\n"
    )
    print(f"wrote {OUT}: {len(rows)} rows, {len(plans)} plan rows, {len(limits)} length limits")


if __name__ == "__main__":
    main()
