#!/usr/bin/env python3
"""Read or rewrite one flagship's `next:` (or `buildable:`, `inputs_only:`,
`why:`) in portfolio/flagships.yaml without hand-editing the folded scalar.

Why: `next:` is a YAML folded scalar (`>-`) wrapped at ~110 columns and held
under validate.py's 2,000-character cap. A run that lands an item has to find
the item across line breaks, unfold, edit, rewrap and count; seven run records
on 2026-11-13/14 report that edit as friction (a plain string replace fails on
the wrapping, and rows sitting at 1,950-1,996 characters took several rounds of
trimming). This tool edits the *parsed* text, rewraps it, checks the cap and
re-reads the whole file to prove nothing else moved.

    python3 portfolio/router/flagship_next.py show ai-bookkeeper
    python3 portfolio/router/flagship_next.py replace ai-bookkeeper "OLD" "NEW"
    python3 portfolio/router/flagship_next.py set ai-bookkeeper --file new.txt   # or - for stdin

`replace` matches OLD against the text `show` prints (wrapping ignored); OLD
must occur exactly once. An empty NEW deletes it. `--field` picks another
folded field; `--dry-run` prints the result without writing.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import yaml

FLAGSHIPS = Path(__file__).resolve().parents[2] / "portfolio" / "flagships.yaml"
NEXT_MAX = 2000  # validate.py's FLAGSHIP_NEXT_MAX (test_allocate pins them together)
WIDTH = 110
INDENT = " " * 6
FIELDS = ("next", "buildable", "inputs_only", "why")
_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


class EditError(Exception):
    pass


def load(text: str) -> dict:
    return {r["venture"]: r for r in yaml.load(text, Loader=_LOADER)["flagships"]}


def wrap(text: str, width: int = WIDTH) -> list[str]:
    """Lines that fold back to exactly `text` under `>-`: break only at a
    single space between two non-spaces (a fold turns a line break into one
    space, and interior runs of spaces survive only inside a line)."""
    if not text or "\n" in text or text != text.strip():
        raise EditError("text must be one non-empty paragraph without leading/trailing space")
    words, cur = [], ""
    for i, ch in enumerate(text):
        breakable = ch == " " and text[i - 1] != " " and text[i + 1] != " "
        if breakable:
            words.append(cur)
            cur = ""
        else:
            cur += ch
    words.append(cur)
    lines, line = [], ""
    room = width - len(INDENT)
    for w in words:
        if line and len(line) + 1 + len(w) > room:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}" if line else w
    lines.append(line)
    return [INDENT + ln for ln in lines]


def locate(lines: list[str], venture: str, field: str) -> tuple[int, int, int | None]:
    """(entry start, field header index or None's slot, field end) for a venture."""
    start = next((i for i, ln in enumerate(lines)
                  if re.fullmatch(rf"  - venture: {re.escape(venture)}\s*", ln)), None)
    if start is None:
        raise EditError(f"no flagship '{venture}' in {FLAGSHIPS.name}")
    end = start + 1
    while end < len(lines) and not lines[end].startswith("  - ") and (
            lines[end].startswith("    ") or not lines[end].strip()):
        end += 1
    head = next((i for i in range(start, end) if lines[i].startswith(f"    {field}:")), None)
    if head is None:
        return start, end, None
    stop = head + 1
    while stop < end and (lines[stop].startswith("     ") or not lines[stop].strip()):
        stop += 1
    while stop - 1 > head and not lines[stop - 1].strip():  # keep trailing blank lines
        stop -= 1
    return head, stop, head


def rewrite(text: str, venture: str, field: str, new: str) -> str:
    """The file text with `venture`'s `field` set to `new`, verified."""
    before = load(text)
    if venture not in before:
        raise EditError(f"no flagship '{venture}' (have: {', '.join(before)})")
    if field == "next" and len(new) > NEXT_MAX:
        raise EditError(f"next: would be {len(new)} characters, over the {NEXT_MAX} cap "
                        f"by {len(new) - NEXT_MAX}: replace what landed rather than appending")
    lines = text.split("\n")
    a, b, head = locate(lines, venture, field)
    block = [f"    {field}: >-"] + wrap(new)
    if head is None:  # add the field at the end of the entry
        while b - 1 > a and not lines[b - 1].strip():
            b -= 1
        a = b
    lines[a:b] = block
    out = "\n".join(lines)
    after = load(out)
    want = dict(before)
    want[venture] = {**before[venture], field: new}
    if after != want:
        raise EditError("internal: the rewrite changed something besides the field; nothing written")
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--file-path", default=str(FLAGSHIPS), help=argparse.SUPPRESS)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("show", "replace", "set"):
        s = sub.add_parser(name)
        s.add_argument("venture")
        s.add_argument("--field", default="next", choices=FIELDS)
        if name == "replace":
            s.add_argument("old")
            s.add_argument("new")
        if name == "set":
            s.add_argument("--file", required=True, help="text file, or - for stdin")
        if name != "show":
            s.add_argument("--dry-run", action="store_true")
    a = p.parse_args(argv)
    path = Path(a.file_path)
    text = path.read_text()
    rows = load(text)
    if a.venture not in rows:
        print(f"no flagship '{a.venture}' (have: {', '.join(rows)})", file=sys.stderr)
        return 2
    cur = rows[a.venture].get(a.field) or ""
    if a.cmd == "show":
        print(cur)
        if a.field == "next":
            print(f"\n({len(cur)} of {NEXT_MAX} characters)", file=sys.stderr)
        return 0
    if a.cmd == "replace":
        n = cur.count(a.old)
        if n != 1:
            print(f"'{a.old[:80]}' occurs {n} times in {a.venture}'s {a.field}: "
                  "match the text `show` prints, once", file=sys.stderr)
            return 1
        i = cur.index(a.old)
        left, right = cur[:i], cur[i + len(a.old):]
        if a.new:
            new = left + a.new + right
        else:  # a deletion: close the gap it leaves, without touching the rest
            left, right = left.rstrip(" "), right.lstrip(" ")
            new = left + ("" if not left or not right or right[0] in ";,.)" else " ") + right
        new = new.strip()
    else:
        new = (sys.stdin.read() if a.file == "-" else Path(a.file).read_text())
        new = " ".join(new.split("\n")).strip()
    try:
        out = rewrite(text, a.venture, a.field, new)
    except EditError as e:
        print(e, file=sys.stderr)
        return 1
    if a.dry_run:
        print(new)
    else:
        path.write_text(out)
    tail = f" ({len(new)} of {NEXT_MAX} characters, was {len(cur)})" if a.field == "next" else ""
    print(f"{'would set' if a.dry_run else 'set'} {a.venture} {a.field}:{tail}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
