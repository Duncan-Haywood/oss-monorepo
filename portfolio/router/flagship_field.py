#!/usr/bin/env python3
"""Read or rewrite one field of one flagship in portfolio/flagships.yaml.

Runs that land a slice rewrite their flagship's `next:`, a folded (`>-`)
scalar wrapped at about 78 columns. A plain string replace on the file fails
whenever the text to change spans a line break, so runs unfolded, edited and
rewrapped by hand (doc_friction, 2026-11-14, five run records), and hand
wrapping at a hyphen silently corrupts the text: YAML folds the break to a
space, so `ventures/wall-framing-\n takeoff` reads as
`ventures/wall-framing- takeoff` (six such breaks were in the file).

    flagship_field.py ai-bookkeeper                 # print `next:` unfolded, with its length
    flagship_field.py ai-bookkeeper --field buildable
    flagship_field.py ai-bookkeeper --replace OLD NEW [--replace OLD2 NEW2]
    flagship_field.py ai-bookkeeper --set new.txt   # or --set - for stdin
    flagship_field.py --check                       # exit 1 on a hyphen-folded break

Edits touch only that field's lines, rewrap without breaking at hyphens or
inside long words, re-read the file to prove the value round-trips exactly,
and refuse a `next:` over validate.py's cap (FLAGSHIP_NEXT_MAX).
"""
from __future__ import annotations

import argparse
import re
import sys
import textwrap
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from validate import FLAGSHIP_NEXT_MAX, FLAGSHIPS_PATH  # noqa: E402

INDENT = " " * 6
WIDTH = 84
# A word ending in a hyphen at the end of a folded line, continued on the next.
HYPHEN_FOLD = re.compile(r"[A-Za-z0-9]-\n {6}\S")


def _entries(doc) -> list[dict]:
    return (doc.get("flagships") if isinstance(doc, dict) else doc) or []


def read_value(text: str, venture: str, field: str) -> str | None:
    for entry in _entries(yaml.safe_load(text)):
        if entry.get("venture") == venture:
            v = entry.get(field)
            return None if v is None else str(v)
    raise KeyError(f"no flagship named {venture!r}")


def _span(lines: list[str], venture: str, field: str) -> tuple[int, int]:
    """[start, end) of the field's lines (header included) in that venture's block."""
    start = None
    for i, line in enumerate(lines):
        if line.rstrip() == f"  - venture: {venture}":
            start = i + 1
            break
    if start is None:
        raise KeyError(f"no flagship named {venture!r}")
    end_block = len(lines)
    for j in range(start, len(lines)):
        if lines[j].startswith("  - ") or (lines[j].strip() and not lines[j].startswith("    ")):
            end_block = j
            break
    for i in range(start, end_block):
        if lines[i].startswith(f"    {field}:"):
            k = i + 1
            while k < end_block and (lines[k].startswith(INDENT) or not lines[k].strip()):
                k += 1
            while k > i + 1 and not lines[k - 1].strip():
                k -= 1
            return i, k
    return end_block, end_block


def wrap(field: str, value: str) -> list[str]:
    body = textwrap.wrap(" ".join(value.split()), width=WIDTH, initial_indent=INDENT,
                         subsequent_indent=INDENT, break_long_words=False,
                         break_on_hyphens=False)
    return [f"    {field}: >-\n"] + [line + "\n" for line in body]


def set_value(text: str, venture: str, field: str, value: str) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("refusing to write an empty value")
    if field == "next" and len(value) > FLAGSHIP_NEXT_MAX:
        raise ValueError(f"`next:` would be {len(value)} of {FLAGSHIP_NEXT_MAX} characters: "
                         "replace what you landed, don't append")
    lines = text.splitlines(keepends=True)
    a, b = _span(lines, venture, field)
    out = "".join(lines[:a] + wrap(field, value) + lines[b:])
    got = read_value(out, venture, field)
    if got != value:
        raise ValueError(f"round trip failed for {venture}.{field}: wrote {value[:80]!r}, read {str(got)[:80]!r}")
    return out


def hyphen_folds(text: str) -> list[int]:
    """1-based line numbers of folded lines that end in a word-hyphen."""
    return [text.count("\n", 0, m.start()) + 1 for m in HYPHEN_FOLD.finditer(text)]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("venture", nargs="?")
    ap.add_argument("--field", default="next")
    ap.add_argument("--replace", nargs=2, action="append", metavar=("OLD", "NEW"),
                    help="substring replace on the unfolded value (repeatable)")
    ap.add_argument("--set", metavar="FILE", help="new value from a file, or - for stdin")
    ap.add_argument("--check", action="store_true", help="exit 1 if any folded line breaks at a hyphen")
    ap.add_argument("--file", type=Path, default=FLAGSHIPS_PATH)
    args = ap.parse_args(argv)
    text = args.file.read_text()

    if args.check:
        bad = hyphen_folds(text)
        for n in bad:
            print(f"{args.file}:{n}: folded line ends in a hyphen; YAML reads it as '- ' "
                  f"(fix: flagship_field.py <venture> --replace '<word>- <rest>' '<word>-<rest>')")
        return 1 if bad else 0
    if not args.venture:
        ap.error("name a venture (or pass --check)")
    try:
        current = read_value(text, args.venture, args.field)
        if args.set is None and not args.replace:
            if current is None:
                print(f"{args.venture} has no `{args.field}:`", file=sys.stderr)
                return 1
            print(current)
            cap = f" of {FLAGSHIP_NEXT_MAX}" if args.field == "next" else ""
            print(f"-- {len(current)}{cap} characters", file=sys.stderr)
            return 0
        if args.set is not None:
            new = sys.stdin.read() if args.set == "-" else Path(args.set).read_text()
        else:
            new = current or ""
        for old, rep in args.replace or []:
            if old not in new:
                print(f"not found in {args.venture}.{args.field}: {old!r}", file=sys.stderr)
                return 1
            new = new.replace(old, rep, 1)
        out = set_value(text, args.venture, args.field, new)
    except (KeyError, ValueError) as e:
        print(e, file=sys.stderr)
        return 1
    args.file.write_text(out)
    n = len(" ".join(new.split()))
    cap = f" of {FLAGSHIP_NEXT_MAX}" if args.field == "next" else ""
    print(f"wrote {args.venture}.{args.field}: {n}{cap} characters")
    return 0


if __name__ == "__main__":
    sys.exit(main())
