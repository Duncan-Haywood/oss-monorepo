#!/usr/bin/env python3
"""Rebuild src/shared/controls/official-text.json from the official public-domain sources.

The control library in src/shared/controls/ is tested against this file
(official-text.test.ts), so a typo in a requirement, objective, Level 1 item or point
value fails the unit tests. This script is how the file was made, so the next person
can repeat it when NIST, the FAR or 32 CFR 170 change.

Sources (all US government works, public domain, 17 U.S.C. 105):
  - NIST SP 800-171 Rev. 2 requirements spreadsheet (csrc.nist.gov)
  - NIST SP 800-171A (June 2018) PDF (nvlpubs.nist.gov), read with `pdftotext` (poppler)
  - FAR 52.204-21(b)(1) and 32 CFR 170.24(c)(2) from the eCFR renderer API (ecfr.gov)

Usage (needs network and `pdftotext`; standard library only):
  python3 scripts/extract_official_text.py            # writes the JSON
  python3 scripts/extract_official_text.py --check    # exits 1 if the JSON would change

Clean-ups applied, and only these: NIST's footnote markers ("[23]") and stray trailing
periods after them are removed; missing final periods are added; whitespace is collapsed;
pdftotext page headers and footers are dropped; "( i.e.," in the eCFR rendering becomes
"(i.e.,". Requirements whose 800-171A objective is a single "Determine if ..." sentence get
the objective id [a], as the 320-objective count does.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src/shared/controls/official-text.json"

URLS = {
    "reqs": "https://csrc.nist.gov/files/pubs/sp/800/171/r2/upd1/final/docs/sp800-171r2-security-reqs.xlsx",
    "sp171a": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171A.pdf",
    "far": "https://www.ecfr.gov/api/renderer/v1/content/enhanced/current/title-48?part=52&section=52.204-21",
    "cfr170_24": "https://www.ecfr.gov/api/renderer/v1/content/enhanced/current/title-32?part=170&section=170.24",
}

ROMAN = "i ii iii iv v vi vii viii ix x xi xii xiii xiv xv".split()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "cmmc-library-check/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def html_text(raw: bytes) -> str:
    t = re.sub(r"<[^>]+>", " ", raw.decode("utf-8"))
    return squash(html.unescape(t))


def clean_requirement(s: str) -> str:
    s = squash(s)
    s = re.sub(r"\s*\[\d+\]", "", s)  # footnote markers
    s = re.sub(r"\.+$", "", s).rstrip()
    return s + "."


def requirements() -> list[dict]:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(io.BytesIO(fetch(URLS["reqs"])))
    strings = [
        "".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t"))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)
    ]
    out = []
    for name in sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet")):
        for row in ET.fromstring(z.read(name)).iter(f"{{{ns['m']}}}row"):
            vals = []
            for c in row.findall("m:c", ns):
                v = c.find("m:v", ns)
                if v is None:
                    vals.append("")
                else:
                    vals.append(strings[int(v.text)] if c.get("t") == "s" else v.text)
            if len(vals) >= 5 and re.fullmatch(r"3\.\d+\.\d+", vals[2].strip()):
                out.append(
                    {
                        "nistId": vals[2].strip(),
                        "kind": vals[1].strip().lower(),
                        "text": clean_requirement(vals[4]),
                    }
                )
    return out


NOISE = re.compile(
    r"^(This publication is available free of charge from: https://doi\.org/10\.6028/NIST\.SP\.800-171A"
    r"|NIST SP 800-171A|ASSESSING SECURITY REQUIREMENTS FOR CONTROLLED UNCLASSIFIED INFORMATION"
    r"|_{10,}|PAGE \d+|CHAPTER THREE)$"
)


def objectives(req_ids: list[str]) -> dict[str, list[str]]:
    with tempfile.TemporaryDirectory() as d:
        pdf = Path(d) / "171a.pdf"
        pdf.write_bytes(fetch(URLS["sp171a"]))
        raw = subprocess.run(["pdftotext", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = [ln for ln in raw.replace("\f", "\n").split("\n") if not NOISE.match(ln.strip())]
    text = "\n".join(lines)
    text = text[text.index("3.1 ACCESS CONTROL\n3.1.1") :]
    out: dict[str, list[str]] = {}
    for rid in req_ids:
        # The requirement's own section: from its heading line to the next "POTENTIAL ASSESSMENT".
        heads = [m.end() for m in re.finditer(rf"^{re.escape(rid)}\s*\n\s*\nSECURITY REQUIREMENT", text, re.M)]
        if len(heads) != 1:
            raise SystemExit(f"{rid}: found {len(heads)} section headings in SP 800-171A")
        section = text[heads[0] : text.index("POTENTIAL ASSESSMENT METHODS", heads[0])]
        marks = list(re.finditer(rf"^{re.escape(rid)}\[([a-z]+)\]\s*$", section, re.M))
        if marks:
            items = []
            for i, m in enumerate(marks):
                end = marks[i + 1].start() if i + 1 < len(marks) else len(section)
                items.append(squash(section[m.end() : end]))
            out[rid] = items
        else:
            m = re.search(r"Determine if (.*)", section, re.S)
            if not m:
                raise SystemExit(f"{rid}: no determination statement in SP 800-171A")
            out[rid] = [squash(m.group(1))]
    return out


def level1() -> list[str]:
    t = html_text(fetch(URLS["far"]))
    t = t[t.index("(i) Limit") : t.index("(2) Other requirements")]
    parts = re.split(r"\((" + "|".join(ROMAN) + r")\) ", t)[1:]
    items = dict(zip(parts[0::2], (squash(p.replace("( i.e.,", "(i.e.,")) for p in parts[1::2])))
    if list(items) != ROMAN:
        raise SystemExit(f"FAR 52.204-21(b)(1): expected items {ROMAN}, got {list(items)}")
    return [items[r] for r in ROMAN]


def weights() -> dict[str, list[str]]:
    t = html_text(fetch(URLS["cfr170_24"]))

    def ids(after: str, before: str) -> list[str]:
        seg = t[t.index(after) : t.index(before, t.index(after))]
        return re.findall(r"[A-Z]{2}[.-]L2-\s?(3\.\d+\.\d+)", seg)

    return {
        "five": ids("five (5) points are subtracted", "( 2 ) For basic and derived"),
        "three": ids("three (3) points are subtracted", "( 3 ) All remaining"),
        "partial": ids("( 4 ) Two derived security requirements", "can be partially effective"),
        "noValue": ids("( 5 ) OSAs must have a System Security Plan", "in place at the time"),
    }


def build() -> dict:
    reqs = requirements()
    if len(reqs) != 110:
        raise SystemExit(f"expected 110 requirements, got {len(reqs)}")
    objs = objectives([r["nistId"] for r in reqs])
    for r in reqs:
        r["objectives"] = objs[r["nistId"]]
    return {
        "_about": "Generated by scripts/extract_official_text.py from the official sources it names. Do not edit by hand.",
        "sources": URLS,
        "level2": reqs,
        "level1": level1(),
        "weights": weights(),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="exit 1 if the JSON on disk differs")
    args = ap.parse_args()
    built = build()
    if args.check:
        # Compare content, not bytes: biome reformats the file after it is written.
        same = OUT.exists() and json.loads(OUT.read_text()) == built
        print("official-text.json is current" if same else "official-text.json differs from the sources")
        return 0 if same else 1
    OUT.write_text(json.dumps(built, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT}; run `pnpm exec biome format --write` on it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
