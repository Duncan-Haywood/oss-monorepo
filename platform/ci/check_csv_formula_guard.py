#!/usr/bin/env python3
"""Fail when a venture's CSV exporter has no spreadsheet formula-injection guard.

A cell that starts with `=`, `+`, `-` or `@` runs as a formula when the CSV is
opened in Excel or Google Sheets (CSV injection, CWE-1236). Our calculators
export what a visitor typed, and many prefill from a shared link, so a crafted
link plus "Download CSV" puts `=HYPERLINK(...)` in front of someone else. The
fix is one line: prefix such a cell with an apostrophe, unless it is a plain number
(`if (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?$/.test(s)) s = "'" + s;`).

A file counts as an exporter when it defines `toCsv` or exports a function whose
name ends in `Csv` (`ratingsCsv`, `reportCsv`, `findingsCsv`...), leaving out
readers and fixtures (`parse*`, `split*`, `read*`, `load*`, `import*`,
`sample*`, `example*`). It counts as guarded when
it contains a leading-formula-character test (`/^[=`, `/^[=+`, `^[=@]`) or
names the risk ("formula injection", "CSV injection"). On 2026-11-12, 203 of
235 exporters had no guard. They are listed in
`csv_formula_guard_baseline.txt`, a ratchet: a new unguarded exporter fails,
and so does a listed file that is now guarded or gone, so the list only shrinks.
On 2026-11-13 the exporter test was widened from `toCsv` alone (a red-team run
found tournament-pairing-manager's `ratingsCsv` and `standingsCsv` writing
player names unguarded, both invisible to the old test) and the baseline was
rewritten once to take in the exporters it newly sees.

A guard can also be present and still leak. On 2026-11-14 a red-team run found
wash-sale-checker exempting any cell that *starts* with a number
(`!/^-?\\d/.test(s)`), so a ticker typed as `-1+CMD|...` was written raw and a
spreadsheet ran it. So any number exemption next to the formula test must be
anchored at both ends (`!/^-?\\d+(\\.\\d+)?$/`); an unanchored one fails
on any venture file, with no baseline.

The guard's shape is checked too, also with no baseline (2026-11-16, red team).
insurance-commission-reconciler left `-` out of the class and defused it only
before a non-digit (`/^-[^\\d.]/`), so "-1+HYPERLINK(...)" was written raw; so a
line that defuses a cell must test all six of `= + - @ \\t \\r`. And about 100 guards
had no number exemption at all, so a negative amount or a change made mid-shift
(notice hours -1) left as the text "'-12.50", which a spreadsheet cannot sum
or sort and an accounting import rejects; so the line must also let a plain
number through (`!/^-?\\d+(\\.\\d+)?$/`, an anchored `/^-?\\d...$/.test` in a
`.replace` callback, or a `typeof ... "number"` test). A line that only warns
about a cell (a CSV checker's finding) writes nothing and is left alone.

    python3 platform/ci/check_csv_formula_guard.py [--root DIR] [--write-baseline]
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = Path(__file__).with_name("csv_formula_guard_baseline.txt")
EXPORTER = re.compile(
    r"(function\s+toCsv\b|\btoCsv\s*=\s*(\(|function|async)"
    r"|export\s+(async\s+)?function\s+(?!parse|split|read|load|import|sample|example)[a-z]\w*Csv\s*\()")
GUARD = re.compile(r"/\^\[=|\^\[=@\]|\^\[=\+|formula[- ]injection|csv[- ]injection", re.I)
# The formula test followed by a negated exemption regex: `/^[=+\-@\t\r]/.test(s) && !/^-?\d+$/.test(s)`.
EXEMPTION = re.compile(r"/\^\[=[^\]]*\]/\.test\([^)]*\)\s*&&\s*!\s*/(\^(?:\\/|[^/])*)/[a-z]*\.test\(")
SKIP_PARTS = {"node_modules", ".next", "dist", "build", ".git", "vendor"}
# The literal both EXEMPTION and GUARD_TEST start with. Testing it per file and
# per line before the regexes gives the same entries in a fraction of the time
# (docs/history/ci-perf-2026-11-20-paired-check-prefilters.md).
FORMULA_TEST = "/^[="


def is_exporter(text):
    return EXPORTER.search(text) is not None


def is_guarded(text):
    return GUARD.search(text) is not None


def weak_exemptions(text):
    """Number exemptions beside a formula guard that are not anchored with `$`, so "-1+cmd" slips past."""
    return [m.group(1) for m in EXEMPTION.finditer(text) if not m.group(1).endswith("$")]


# A formula test in a guard: `/^[=+\-@\t\r]/.test(` or `.replace(/^[=+\-@\t\r]/,`.
GUARD_TEST = re.compile(r"/\^\[(=[^\]]*)\]/[a-z]*(?:\.test\(|,)")
# The line writes the apostrophe ("'" + s, `'${s}`, "'$&", `"'${...}`), so it defuses rather than warns.
DEFUSES = re.compile(r"\"'\"|`'\$\{|\"'\$&\"|`\"'\$\{")
NUMBER_PASSES = re.compile(r"!\s*/\^[^/]*\\d[^/]*\$/|/\^-\?\\d[^/]*\$/[a-z]*\.test|typeof\b[^;]*\bnumber\b")
NEEDED = (("=", "="), ("+", "+"), ("-", "-"), ("@", "@"), ("\\t", "\\t"), ("\\r", "\\r"))


def guard_shape(line):
    """Reasons a guard on this line defuses too little (a missing character) or too much (a plain number)."""
    if not DEFUSES.search(line):
        return []
    out = []
    for m in GUARD_TEST.finditer(line):
        missing = [shown for shown, lit in NEEDED if lit not in m.group(1)]
        if missing:
            out.append(f"the formula test is missing {' '.join(missing)}")
        if not NUMBER_PASSES.search(line):
            out.append("a plain number such as -12.50 is defused into text")
    return out


def scan_shape(root):
    """Return sorted 'path:line: reason' entries for guards of the wrong shape under root/ventures."""
    out = []
    for pat in ("*.mjs", "*.js", "*.html", "*.ts", "*.tsx"):
        for p in (root / "ventures").rglob(pat):
            rel = p.relative_to(root)
            if SKIP_PARTS & set(rel.parts) or ".test." in p.name:
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            # guard_shape reports only through GUARD_TEST, which needs "/^[=".
            if FORMULA_TEST not in text:
                continue
            for n, line in enumerate(text.splitlines(), 1):
                if FORMULA_TEST not in line:
                    continue
                for reason in guard_shape(line):
                    out.append(f"{rel.as_posix()}:{n}: {reason}")
    return sorted(out)


def scan_weak(root):
    """Return sorted 'path:line' entries for unanchored number exemptions under root/ventures."""
    out = []
    for pat in ("*.mjs", "*.js", "*.html"):
        for p in (root / "ventures").rglob(pat):
            rel = p.relative_to(root)
            if SKIP_PARTS & set(rel.parts) or ".test." in p.name:
                continue
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            # EXEMPTION starts with the literal "/^[=".
            if FORMULA_TEST not in text:
                continue
            for n, line in enumerate(text.splitlines(), 1):
                if FORMULA_TEST in line and weak_exemptions(line):
                    out.append(f"{rel.as_posix()}:{n}")
    return sorted(out)


def scan(root):
    """Return sorted repo-relative paths of unguarded exporters under root/ventures."""
    base = root / "ventures"
    out = []
    for p in base.rglob("*.mjs"):
        rel = p.relative_to(root)
        if SKIP_PARTS & set(rel.parts) or p.name.endswith(".test.mjs"):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if is_exporter(text) and not is_guarded(text):
            out.append(rel.as_posix())
    return sorted(out)


def read_baseline(path):
    if not path.exists():
        return set()
    return {ln.strip() for ln in path.read_text().splitlines() if ln.strip() and not ln.startswith("#")}


def compare(found, baseline):
    found = set(found)
    return sorted(found - baseline), sorted(baseline - found)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args(argv)
    found = scan(a.root)
    if a.write_baseline:
        a.baseline.write_text(
            "# Venture CSV exporters with no formula-injection guard (check_csv_formula_guard.py).\n"
            "# Ratchet: remove a line when you add the guard; never add one.\n" + "".join(f + "\n" for f in found))
        print(f"wrote {len(found)} entries to {a.baseline}")
        return 0
    new, stale = compare(found, read_baseline(a.baseline))
    for f in new:
        print(f"{f}: CSV exporter has no spreadsheet formula-injection guard. Prefix cells starting "
              "=, +, -, @, tab or CR with an apostrophe (see ventures/ucr-fee-calculator/calc.mjs csvCell).")
    for f in stale:
        print(f"{f}: listed in {a.baseline.name} but now guarded or gone; delete its line.")
    weak = scan_weak(a.root)
    for f in weak:
        print(f"{f}: the number exemption beside the formula guard is not anchored with $, so a cell such as "
              "-1+CMD|... passes as a number; use !/^-?\\d+(\\.\\d+)?$/.")
    shape = scan_shape(a.root)
    for f in shape:
        print(f"{f}; test all of = + - @ \\t \\r and let a plain number through: "
              "if (/^[=+\\-@\\t\\r]/.test(s) && !/^-?\\d+(\\.\\d+)?$/.test(s)) s = \"'\" + s;")
    if new or stale or weak or shape:
        return 1
    print(f"csv formula guard: ok ({len(found)} unguarded exporters still on the baseline)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
