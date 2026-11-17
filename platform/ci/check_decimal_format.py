#!/usr/bin/env python3
"""Flag CSV readers that take the decimal format from the delimiter alone.

The usual page code read `normalizeRows(parseCsv(text, d), { decimalComma:
d === ";" })`: a semicolon file is decimal comma, anything else decimal point.
The red-team run of 2026-11-14 found that this reads a tab-delimited European
export (Excel's "Unicode text" from a German or French locale) with "12,50" as
1250 and "1.234,56" as 1.23, and a semicolon file with dot decimals,
"1,234.56", as 1.23. It was in 29 report analyzers and categorizers. Each now
calls `detectDecimalComma(rows, d)`, which votes from the amounts and falls
back to the delimiter only when no value tells.

Two parts:

1. A line that sets `decimalComma:` (or `decimalComma =`) from a delimiter
   comparison with ";" and nothing else is a hit.
2. Every module that exports `function detectDecimalComma(table, delim)` is
   imported under node and run on fixed fixtures (tab + "12,50", semicolon +
   "1,234.56", whole numbers on each delimiter). A copy that answers any of
   them wrong is a hit. Copies with another signature (text, not rows) are
   left to their own suites.

Test files are skipped. Exit 1 lists each hit.
Usage: python3 platform/ci/check_decimal_format.py [root ...]
"""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DELIM_ONLY = re.compile(r"""decimalComma\s*[:=]\s*\(?\s*\w+\s*===?\s*["'];["']\s*\)?\s*[,;})\n]""")
ROWS_FN = re.compile(r"export function detectDecimalComma\(table\b")
SUFFIXES = {".mjs", ".js", ".html"}
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}

# (rows, delimiter, expected)
FIXTURES = [
    ([["Order date", "Subtotal"], ["01.06.2026 12:00", "12,50"], ["02.06.2026", "1.234,56"]], "\t", True),
    ([["Date", "Amount"], ["2026-06-01", "1,234.56"], ["2026-06-02", "20.00"]], ";", False),
    ([["Date", "Amount"], ["2026-06-01", "20"]], ";", True),
    ([["Date", "Amount"], ["2026-06-01", "20"]], ",", False),
    ([["Date", "Amount"], ["2026-06-01", "$-12.50"], ["2026-06-02", "USD 3.00"]], ",", False),
]


def scan_text(text):
    """Line numbers (1-based) that pick decimal comma from the delimiter only."""
    return [i for i, line in enumerate(text.splitlines(), 1) if DELIM_ONLY.search(line + "\n")]


def files(roots):
    for root in roots:
        for p in sorted(pathlib.Path(root).rglob("*")):
            if p.suffix not in SUFFIXES or not p.is_file() or SKIP_PARTS & set(p.parts):
                continue
            if ".test." in p.name or p.name.endswith(".min.js"):
                continue
            yield p


def rel(p):
    return p.relative_to(ROOT) if p.is_relative_to(ROOT) else p


def behaviour(modules):
    """Run FIXTURES against each module's detectDecimalComma; return hits."""
    if not modules or not shutil.which("node"):
        return []
    script = (
        "const [mods, fx] = JSON.parse(process.argv[1]); const bad = [];\n"
        "for (const m of mods) { const mod = await import(m);\n"
        "  fx.forEach(([rows, d, want], i) => { const got = mod.detectDecimalComma(rows, d);\n"
        "    if (got !== want) bad.push(`${m}: fixture ${i} (${JSON.stringify(d)}) gave ${got}, want ${want}`); }); }\n"
        "console.log(JSON.stringify(bad));\n"
    )
    arg = json.dumps([[p.resolve().as_uri() for p in modules], FIXTURES])
    r = subprocess.run(["node", "--input-type=module", "-e", script, arg], capture_output=True, text=True)
    if r.returncode != 0:
        return [f"node failed: {r.stderr.strip()[:500]}"]
    return [line.replace("file://" + str(ROOT) + "/", "") for line in json.loads(r.stdout)]


def scan(roots):
    hits, modules = [], []
    for p in files(roots):
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for n in scan_text(text):
            hits.append(f"{rel(p)}:{n}: decimal comma taken from the delimiter alone; "
                        "use detectDecimalComma(rows, delimiter) (see restaurant-delivery-commission-analyzer/calc.mjs)")
        if p.suffix == ".mjs" and ROWS_FN.search(text):
            modules.append(p)
    return hits + behaviour(modules), len(modules)


def main(argv):
    roots = argv or [ROOT / "ventures", ROOT / "platform"]
    hits, n = scan(roots)
    for h in hits:
        print(h)
    if hits:
        return 1
    print(f"check_decimal_format: no reader takes the decimal format from the delimiter alone; {n} detectDecimalComma copies pass the fixtures")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
