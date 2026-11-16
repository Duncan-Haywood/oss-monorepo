"""Find (and with --fix, repair) money formatters that print "-$0.00".

The formatter family

    `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`

takes the sign from the raw value and the digits from the rounded one, so
float noise such as 0.3 - 0.1 - 0.2 (-2.8e-17) or any loss under half a cent
prints "-$0.00". Found by the red-team run of 2026-11-16 in 30 formatters
across 27 ventures. The repair keeps the minus only when the printed digits
are not zero:

    `${x < 0 && Math.abs(x).toFixed(2) !== "0.00" ? "-" : ""}$${Math.abs(x).toFixed(2)}`

Usage: python3 platform/ci/money_sign.py [--fix]   (exit 1 when any is found)
test_money_sign.py runs the check over every tracked venture file.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
# `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)`, with ' or ", an ASCII or U+2212
# minus, and "" or "+" for the non-negative case.
PATTERN = re.compile(
    r"\$\{(?P<v>\w+) < 0 \? (?P<q>['\"])(?P<minus>[-−])(?P=q) : (?P<q2>['\"])(?P<plus>\+?)(?P=q2)\}"
    r"(?P<tail>\$?\$\{Math\.abs\((?P=v)\)\.toFixed\(2\))")
SUFFIXES = (".mjs", ".js", ".cjs", ".html")


def _fixed(m):
    v, q, q2 = m["v"], m["q"], m["q2"]
    return (f"${{{v} < 0 && Math.abs({v}).toFixed(2) !== {q}0.00{q} ? {q}{m['minus']}{q} : "
            f"{q2}{m['plus']}{q2}}}{m['tail']}")


def scan_text(text):
    """Line numbers (1-based) of unguarded formatters in text."""
    return [text.count("\n", 0, m.start()) + 1 for m in PATTERN.finditer(text)]


def fix_text(text):
    return PATTERN.sub(_fixed, text)


def tracked(under="ventures"):
    out = subprocess.run(["git", "ls-files", under], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    for rel in out.splitlines():
        if rel.endswith(SUFFIXES) and "node_modules/" not in rel:
            yield rel


def main(argv):
    fix = "--fix" in argv
    found = []
    for rel in tracked():
        p = ROOT / rel
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        lines = scan_text(text)
        if not lines:
            continue
        found += [f"{rel}:{n}" for n in lines]
        if fix:
            p.write_text(fix_text(text), encoding="utf-8")
    for f in found:
        print(f"{f}: sign taken before rounding, prints -$0.00 for float noise"
              + (" (fixed)" if fix else ""))
    if found and not fix:
        print(f"{len(found)} found; repair with: python3 platform/ci/money_sign.py --fix")
    return 1 if found and not fix else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
