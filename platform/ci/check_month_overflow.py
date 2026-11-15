#!/usr/bin/env python3
"""Flag "add N months" date math that rolls a month-end day into the next month.

JavaScript's Date normalises an out-of-range day instead of clamping it, so
`d.setUTCMonth(d.getUTCMonth() + 1)` on 31 January gives 3 March (2 March in a
leap year), and `Date.UTC(y, m + 1, d)` with d = 31 does the same. A renewal,
deadline or due date computed that way skips a whole month for anyone whose
start date is the 29th, 30th or 31st. The usual fix, already used by
grant-deadline-tracker and cancel-flow, is to step to day 1, move the month,
then clamp the day to the new month's length.

Two shapes are flagged (found by the explore run of 2026-11-14, which fixed
three tools that used the first one):

1. `x.setMonth(...)` / `x.setUTCMonth(...)` with one argument that does month
   arithmetic (`getMonth() + n`, `getUTCMonth() - n`), when none of the three
   lines before it sets the day to 1 (`setDate(1)` / `setUTCDate(1)`) and the
   two lines after it do not re-clamp the day (`setDate(Math.min(...))`).
   A second argument (`setUTCMonth(m + 1, 1)`) names the day, so it passes.
2. `Date.UTC(y, m + n, day)` / `new Date(y, m + n, day)` whose month argument
   adds or subtracts something other than the usual `- 1` parse offset and
   whose day argument is neither a literal (0 = last day of the previous month,
   1 = first) nor clamped with `Math.min`.

Year arithmetic (`setFullYear(y + 1)` on 29 February gives 1 March) is not
flagged: for a one-year anniversary some rules want 28 February and some 1
March, so it is a judgment per tool, not a lint.

A line that has been checked and is intended may carry `month-overflow: ok`
(on the line itself or the one before).
Exit 1 lists each hit.
Usage: python3 platform/ci/check_month_overflow.py [root ...]
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SUFFIXES = {".mjs", ".js", ".cjs", ".ts", ".html"}
SKIP_PARTS = {"node_modules", ".next", "dist", "build", "vendor"}
ALLOW = "month-overflow: ok"

SET_MONTH = re.compile(r"\.set(?:UTC)?Month\(")
MONTH_MATH = re.compile(r"get(?:UTC)?Month\(\)\s*[-+]|[-+]\s*[\w.]*get(?:UTC)?Month\(\)")
DAY_ONE = re.compile(r"\.set(?:UTC)?Date\(\s*1\s*\)")
DAY_CLAMP = re.compile(r"\.set(?:UTC)?Date\(\s*Math\.min\(")
CTOR = re.compile(r"(?:Date\.UTC|new Date)\(")
LITERAL_DAY = re.compile(r"^\d+$")
# A demo-data day that cannot pass 28: `1 + ((i * 3) % 27)`, `1 + Math.floor(rnd() * 27)`.
SMALL_DAY = re.compile(r"^1 \+ .*[%*] ?(\d+)\)*$")


def _flat(expr):
    """The expression with every parenthesised or bracketed group removed."""
    prev = None
    while prev != expr:
        prev, expr = expr, re.sub(r"\([^()]*\)|\[[^\[\]]*\]", "", expr)
    return expr


def _is_parse_offset(month):
    """`m - 1`, `+m[2] - 1`, `Number(m[2]) - 1`, `+iso.slice(5, 7) - 1`: a 1-based month read in."""
    flat = _flat(month).strip().lstrip("+").strip()
    m = re.fullmatch(r"(.*?)\s*-\s*1", flat)
    return bool(m) and not re.search(r"[-+]", m.group(1))


def _args(text, start):
    """Split the call whose '(' is at text[start - 1]; return (args, end) or None."""
    depth, cur, out = 1, [], []
    i = start
    while i < len(text):
        ch = text[i]
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                out.append("".join(cur).strip())
                return out, i
        elif ch == "," and depth == 1:
            out.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        elif ch in "\"'`":
            return None  # a string inside the call: not date arithmetic we can read
        cur.append(ch)
        i += 1
    return None


def _set_month_hit(lines, i, line, m):
    parsed = _args(line, m.end())
    if not parsed:
        return False
    args, _ = parsed
    if len(args) != 1 or not MONTH_MATH.search(args[0]):
        return False
    before = "\n".join(lines[max(0, i - 3):i])
    if DAY_ONE.search(before) or DAY_ONE.search(line[:m.start()]):
        return False
    after = "\n".join([line[m.end():]] + lines[i + 1:i + 3])
    return not DAY_CLAMP.search(after)


def _ctor_hit(line, m):
    parsed = _args(line, m.end())
    if not parsed:
        return False
    args, _ = parsed
    if len(args) < 3:
        return False
    month, day = args[1], args[2]
    if not re.search(r"[-+]", _flat(month).strip().lstrip("+")) or _is_parse_offset(month):
        return False  # no month arithmetic, or the usual 1-based parse offset
    if LITERAL_DAY.match(day) or "Math.min(" in day:
        return False
    small = SMALL_DAY.match(day)
    if small and int(small.group(1)) <= 28:
        return False
    return True


def scan_text(text):
    """Line numbers (1-based) of month arithmetic that can overflow the day."""
    if "Month(" not in text and "Date.UTC(" not in text and "new Date(" not in text:
        return []
    lines = text.splitlines()
    hits = []
    for i, line in enumerate(lines):
        if ALLOW in line or (i and ALLOW in lines[i - 1]):
            continue
        hit = False
        if "Month(" in line:
            hit = any(_set_month_hit(lines, i, line, m) for m in SET_MONTH.finditer(line))
        if not hit and ("Date.UTC(" in line or "new Date(" in line):
            hit = any(_ctor_hit(line, m) for m in CTOR.finditer(line))
        if hit:
            hits.append(i + 1)
    return hits


def iter_files(roots):
    for root in roots:
        for path in sorted(pathlib.Path(root).rglob("*")):
            if path.suffix not in SUFFIXES or not path.is_file():
                continue
            if SKIP_PARTS.intersection(path.parts) or ".test." in path.name or path.name.startswith("test_"):
                continue
            yield path


def main(argv):
    roots = argv or [str(ROOT / "ventures")]
    found = []
    for path in iter_files(roots):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for n in scan_text(text):
            rel = path.relative_to(ROOT) if path.is_absolute() and ROOT in path.parents else path
            found.append(f"{rel}:{n}: {text.splitlines()[n - 1].strip()[:140]}")
    if found:
        print(f"check_month_overflow: {len(found)} month step(s) can roll the 29th-31st into the next month")
        print("Step to day 1, move the month, then clamp the day (see grant-deadline-tracker/calc.mjs addMonths),")
        print(f"or mark a checked line with '// {ALLOW}'.")
        for f in found:
            print("  " + f)
        return 1
    print("check_month_overflow: no month step rolls a month-end day into the next month")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
