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
    flagship_field.py ai-bookkeeper --landed        # landed-work clauses and what of each to keep
    flagship_field.py --check                       # exit 1 on a hyphen-folded break

Edits touch only that field's lines, rewrap without breaking at hyphens or
inside long words, re-read the file to prove the value round-trips exactly,
and refuse a `next:` over validate.py's cap (FLAGSHIP_NEXT_MAX). A refusal
lists the clauses that report landed work, with the open part of each to keep:
on 2026-11-15 every flagship's `next:` sat at 1,611 to 1,992 of 2,000
characters, and eleven sessions (friction_rank.py, 2026-11-10..15) said the
cap made them shorten other runs' open items by hand. Landed work belongs in
the README those clauses name; across the 11 flagships, 959 characters of
landed notes could go without touching an open item (421 in
einvoice-preflight), which `--landed` lists.
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
from validate import FLAGSHIP_BUILDABLE_MAX, FLAGSHIP_NEXT_MAX, FLAGSHIPS_PATH  # noqa: E402

INDENT = " " * 6
WIDTH = 84
# A word ending in a hyphen at the end of a folded line, continued on the next.
HYPHEN_FOLD = re.compile(r"[A-Za-z0-9]-\n {6}\S")
# Clauses of a `next:` value: split after "; " and after a sentence-ending ". "
# (not "e.g. " or "v1. "), so each item and its "landed" note can be weighed.
CLAUSE_SPLIT = re.compile(r"(?<=;) |(?<=[a-z)\]]\.) (?=[A-Z])")
LANDED = re.compile(r"\blanded\b", re.I)
# Where the open item after a landed note starts ("... landed: open: x",
# "... landed (README), next a gate").
TAIL = re.compile(r"\b(?:open|next)\b:?\s")
# "Landed work and measurements: README ..." is the pointer, not a landed item.
POINTER = re.compile(r"(?:Landed work|History)\b", re.I)
LANDED_SHOWN = 5


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


def landed_clauses(value: str) -> list[tuple[str, str]]:
    """(clause, the part to keep) for each clause that says something landed,
    by characters saved, most first.

    A clause often carries the open item that follows the landed work
    ("Mexico CFDI 4.0 landed: open: SAT's CP error matrix ..."), so only the
    text before its last "open:" (or before the ": " after "landed") is cut;
    a clause with no such tail is cut whole (keep is ""). The "Landed work
    ...: README" pointer, and a clause that
    interleaves several landed and open items ("A landed: open: x, y, B
    landed: open: z"), have no safe split, so their keep is None: trim it by hand,
    and it counts for nothing in the characters freed."""
    out = []
    for c in CLAUSE_SPLIT.split(" ".join(value.split())):
        m = LANDED.search(c)
        if not m:
            continue
        if (len(LANDED.findall(c)) > 1 or 0 <= c.find("open:") < m.start()
                or POINTER.match(c)):
            out.append((c, None))
            continue
        t = TAIL.search(c, m.end())
        if t:
            keep = c[t.start():]
        else:
            j = c.find(": ", m.end())
            keep = c[j + 2:] if j >= 0 else ""
        out.append((c, keep))
    return sorted(out, key=_gain, reverse=True)


def _gain(ck) -> int:
    c, k = ck
    if k is None:
        return 0
    return len(c) - len(k) + (0 if k else 1)  # a whole clause takes its separator


def _saved(found) -> int:
    return sum(_gain(ck) for ck in found)


def landed_lines(found, shown: int | None = None) -> list[str]:
    rows = []
    for c, k in found[:shown]:
        if k is None:
            rows.append(f"     ?  {c}")
            rows.append("        keep: (no safe split: a pointer, or landed and open items interleaved; trim by hand)")
            continue
        rows.append(f"  {_gain((c, k)):4d}  {c}")
        rows.append(f"        keep: {k}" if k else "        keep: (nothing; cut the clause)")
    return rows


def landed_hint(value: str, over: int = 0) -> str:
    """The landed clauses as cut candidates, or "" when there are none."""
    found = landed_clauses(value)
    if not found:
        return ""
    head = (f"{len(found)} clause(s) report landed work (the README they name holds it); "
            f"trimming them to their open part frees {_saved(found)} characters"
            + (f", {over} needed" if over else "") + ". Cut these before anyone's open items")
    rows = landed_lines(found, LANDED_SHOWN)
    if len(found) > LANDED_SHOWN:
        rows.append(f"  ... {len(found) - LANDED_SHOWN} more: flagship_field.py <venture> --landed")
    return "\n".join([head + ":"] + rows)


def set_value(text: str, venture: str, field: str, value: str) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("refusing to write an empty value")
    if field == "next" and len(value) > FLAGSHIP_NEXT_MAX:
        hint = landed_hint(value, len(value) - FLAGSHIP_NEXT_MAX)
        raise ValueError(f"`next:` would be {len(value)} of {FLAGSHIP_NEXT_MAX} characters: "
                         "replace what you landed, don't append" + (f"\n{hint}" if hint else ""))
    if field == "buildable" and len(value) > FLAGSHIP_BUILDABLE_MAX:
        raise ValueError(f"`buildable:` would be {len(value)} of {FLAGSHIP_BUILDABLE_MAX} characters: "
                         "name only items a session can start now; landed work goes in the README or eval/")
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
    ap.add_argument("--landed", action="store_true",
                    help="list the clauses that report landed work, longest first (cut candidates)")
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
        if args.landed:
            if current is None:
                print(f"{args.venture} has no `{args.field}:`", file=sys.stderr)
                return 1
            found = landed_clauses(current)
            for line in landed_lines(found):
                print(line)
            print(f"-- {len(found)} landed clause(s); trimming them frees {_saved(found)} of "
                  f"{len(current)} characters", file=sys.stderr)
            return 0
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
