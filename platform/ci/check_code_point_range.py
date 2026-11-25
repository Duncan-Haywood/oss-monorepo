#!/usr/bin/env python3
"""Every String.fromCodePoint() call must be guarded against out-of-range input.

`String.fromCodePoint(n)` throws a RangeError for n past U+10FFFF or not an
integer. On 2026-11-24 a red-team run found 28 decoders under ventures/ and
platform/pages/ that fed it the digits of a `&#...;` character reference or a
`\\U` escape straight from a stranger's page, feed, sidecar, IFC or YAML file,
so one `&#99999999;` crashed page-seo-audit, social-preview-check,
podcast-feed-check, the photo culler's sidecar reader and others instead of
being reported. They now call a local `codePointOr(n)` (U+FFFD past the
range, as HTML parsers do) or check the range themselves.

A call counts as guarded when its own line or one of the six lines before it
holds a range bound (0x10ffff, 0x110000, 1114111 or 1114112), a `try`, or
reads the value with `codePointAt` (always in range). Calls a reviewer
judged safe some other way (a loop over a fixed table, an ASCII-only value)
are listed with a reason in `code_point_range_baseline.txt`; a stale entry
fails, so the list only shrinks.

    python3 platform/ci/check_code_point_range.py           # exit 1 on an unguarded call
    python3 platform/ci/check_code_point_range.py --list    # every unguarded call, baseline included

Argument-free, so `unwired_checks.py` runs it on every ventures pull request.
"""
import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BASELINE = HERE / "code_point_range_baseline.txt"
SCAN = ("ventures", "platform")
SKIP_PARTS = {"node_modules", "vendor", "dist", ".git"}
CALL = re.compile(r"String\.fromCodePoint\(")
GUARD = re.compile(r"0x10ffff|0x110000|1114111|1114112|\btry\b|codePointAt", re.I)
LOOKBACK = 6
MINIFIED = 1000  # a line this long is a bundled library, not our code


def is_source(path: Path) -> bool:
    name = path.name
    if ".test." in name or name.startswith("test_") or name.endswith(".min.js"):
        return False
    return not (SKIP_PARTS & set(path.parts))


def unguarded_in(text: str) -> list[int]:
    """1-based line numbers of String.fromCodePoint calls with no guard in reach."""
    lines = text.split("\n")
    out = []
    for i, line in enumerate(lines):
        if len(line) > MINIFIED or not CALL.search(line):
            continue
        window = "\n".join(lines[max(0, i - LOOKBACK):i + 1])
        if not GUARD.search(window):
            out.append(i + 1)
    return out


def findings(root: Path = ROOT) -> dict[str, list[int]]:
    found = {}
    for top in SCAN:
        base = root / top
        if not base.is_dir():
            continue
        for path in sorted(list(base.rglob("*.mjs")) + list(base.rglob("*.js"))):
            rel = path.relative_to(root)
            if not is_source(rel):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            if "fromCodePoint" not in text:
                continue
            hits = unguarded_in(text)
            if hits:
                found[rel.as_posix()] = hits
    return found


def read_baseline(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    out = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        entry = line.split("#", 1)[0].strip()
        if entry:
            out.add(entry)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--baseline", type=Path, default=BASELINE)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args(argv)
    found = findings(args.root)
    if args.list:
        for rel, hits in found.items():
            print(f"{rel}: lines {', '.join(map(str, hits))}")
        return 0
    allowed = read_baseline(args.baseline)
    bad = {rel: hits for rel, hits in found.items() if rel not in allowed}
    stale = sorted(allowed - set(found))
    for rel, hits in bad.items():
        print(f"{rel}:{hits[0]}: String.fromCodePoint() with no range guard "
              f"(a code point past U+10FFFF throws a RangeError). Use "
              f"`n <= 0x10ffff ? String.fromCodePoint(n) : fallback`, or list the "
              f"file with a reason in {args.baseline.name} if the value cannot leave the range.")
    for rel in stale:
        print(f"{rel}: listed in {args.baseline.name} but has no unguarded call now; delete the entry.")
    if bad or stale:
        return 1
    print(f"code point range: {len(found)} baselined file(s), no new unguarded String.fromCodePoint calls")
    return 0


if __name__ == "__main__":
    sys.exit(main())
