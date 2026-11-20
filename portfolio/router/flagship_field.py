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
    flagship_field.py ai-bookkeeper --park ITEM [--park ITEM2]  # move open items to ventures/<v>/NEXT.md
    flagship_field.py ai-bookkeeper --replace OLD NEW --park ITEM  # both in one call, cap checked after
    flagship_field.py ai-bookkeeper --replace OLD NEW --make-room  # park from the end until it fits
    flagship_field.py ai-bookkeeper --replace OLD NEW --history RESULT  # move a result you name to HISTORY.md
    flagship_field.py --check                       # exit 1 on a hyphen-folded break or a stray ';.'

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

Once the landed notes were gone the cap still bit: by the evening of
2026-11-15 all 11 rows sat at 1,611 to 1,999 with no landed clause left, and
13 sessions in two days (friction_rank.py) said recording one result meant
deleting someone else's open item ("the cap forces silent loss of open
items"). `--park ITEM` makes that cut a move: it takes ITEM out of `next:` and
appends it, dated, to the venture's own `ventures/<v>/NEXT.md` under
PARK_HEADING, so `next:` keeps the items most worth starting and nothing open
is lost. `next:` should say the rest lives there (the tool adds that pointer
once if it fits).

Parking still cost a round trip: `--park` refused to run with `--replace`, and
`--replace` refused while over the cap, so a run had to park, then replace,
and guess how much room its new wording needed. By 2026-11-16 ten of the 11
rows sat at 1,922 to 1,997 characters, and 16 sessions in two days
(friction_rank.py --live, 2026-11-14..15) reported two or three tries per
landing. So `--replace`/`--set` now take `--park` in the same call (the cap is
checked after the park), and a refusal lists the row's items from the end,
with the room each frees and the `--park` flag to add, until there is enough.

That still meant a refusal, then a second call (and a third when the parks
chosen left no room for the NEXT.md pointer): on 2026-11-16 the 11 rows sat
at 1,611 to 1,999 characters, eight of them within 80 of the cap, and the
three newest flagship_field.py reports (friction_rank.py, 2026-11-16) were
all that round trip. `--make-room` parks the items the refusal would have
listed, from the end of the row, never the run's own NEW text, the opening
history pointer or the NEXT.md pointer, until the value and the pointer fit,
and prints what it moved. Pass `--park` instead when the tail holds
something more urgent than an item further up.

`buildable:` has its own 600-character cap, and its refusal said only that
it was over: three runs on 2026-11-16 overran it by 14 to 47 characters and
had to guess how much to cut. Both refusals now give the overrun, the
landed clauses to cut and, with one --replace, the longest NEW that fits;
reading or writing either field prints how many characters are left.

Even so the rows never left the cap: --make-room parked only until the row
fitted, so the next run found it at 1,990+ again and paid the same refusal
or park. On 2026-11-17 11 of 12 rows sat at 1,814 to 1,999 characters and
`friction_rank.py --live --ungated --days 3` ranked "next: at the cap" first,
18 sessions in three days, after a "by-design" verdict. So a park now goes
down to FLAGSHIP_NEXT_TARGET (1,700), leaving room for the next few runs'
edits, and a `--replace`/`--set` on `next:` that would pass the cap parks by
itself (as --make-room did) instead of refusing; `--no-make-room` keeps the
refusal. `--trim` parks a row that is over the target down to it now.

That overshot the other way. In the day after it (2026-11-17..18), ten run
records said an edit that only passed the cap parked four to eight items
(one parked about 900 characters for a 120-character replacement), that it
happened without --make-room although allocate.py's hint said it was
opt-in, and that it moved landed results into NEXT.md as if they were open
items. An implicit park (a `--replace`/`--set` with no --make-room) now
parks only until the row fits under the cap, so it moves one or two items,
not eight; FLAGSHIP_NEXT_TARGET's headroom is what an explicit --make-room
or --trim asks for. A clause reporting landed work is never parked (cut it,
`--landed` lists them). Every park says up front how many items and
characters it moves, and `--dry-run` shows that without writing.

Rows still filled with results rather than open items: on 2026-11-19
ids-model-check sat at 1,926 and photo-editing at 1,978, `--landed` found
nothing to cut (no clause says "landed"), and three runs that day failed
with "parking every item it may move still leaves 2068". An edit that passes
the cap (or --make-room, --trim) now first moves dated results that sit
before the row's last open marker to `ventures/<v>/HISTORY.md`, under
HISTORY_HEADING, down to FLAGSHIP_NEXT_TARGET; only then are open items
parked. `history_pieces` says which text counts.

Landed results without the word still went: five records on 2026-11-18 saw
"proved impossible: 7, 9 on 2x6" and "8 on 2x6, 12 on 2x9 UNSAT" (fragments
of one landed sentence) parked as open items. Every row names where its open
items start ("Next:", "Open:", "Wanted, ...:"), so nothing before that marker
is offered for parking (`open_start`).

Undated results after the marker still went to NEXT.md as open items (five
records, 2026-11-18..19: "lasting moves to more days: cut has the power (8 of
9 cells)"). An item the park picks that reads as a result (`is_result`) now
goes to HISTORY.md instead; one with any open cue still goes to NEXT.md.

The heuristics still miss undated results, which no rule will catch, and on
2026-11-19 the refusal ("parking every item it may move still leaves 2068")
was the most reported flagship_field.py friction: 12 run records that day
(PRs #17479, #17486, #17502, #17504, #17517, #17522, #17526, #17534, #17539,
#17609 among them) cut a landed clause by hand and copied it to a README or
NEXT.md, and one asked for "a --park-landed option". `--history TEXT` is that
option: the run names the finished result (any span of the unfolded value,
not only a `; ` item), and it moves to HISTORY.md in the same call as the
--replace, before the cap is checked. The refusal now names the longest
landed clauses as ready `--history` flags. Judgment about what is finished
stays with the run; the tool does the move.

Two misfires were left on 2026-11-20 (friction_rank.py's top live cluster,
five sessions). The guard on the run's own NEW text matched whole strings,
so a NEW spanning a `; ` break matched neither half and its first half moved
to HISTORY.md as a result (PRs #17798, #17912); `holds_new` now matches any
fragment. And an edit a few characters over the cap parked whatever tail
item freed enough, however big (#17900): an implicit park that would move
more than IMPLICIT_PARK_FREE characters or five times the overrun refuses and
names the NEW budget; `--make-room` still parks on request.
"""
from __future__ import annotations

import argparse
import datetime
import re
import shlex
import sys
import textwrap
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from validate import FLAGSHIP_BUILDABLE_MAX, FLAGSHIP_NEXT_MAX, FLAGSHIPS_PATH  # noqa: E402

# Where a park leaves `next:`: room under the cap for the next runs' edits,
# so a row is not refused or parked again on every landing (see the docstring).
FLAGSHIP_NEXT_TARGET = 1700
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
REPO_ROOT = HERE.parents[1]
PARK_HEADING = "## Parked from flagships.yaml `next:`"
# An implicit park (an edit over the cap, no --make-room) may move this many
# characters, or five times the overrun, before it refuses instead (see the
# refusal in _main): a few characters over should cost a shorter NEW, not a
# whole open item.
IMPLICIT_PARK_FREE = 300
PARK_POINTER = "More open items: NEXT.md."
# The row's own instruction sentence ("A run that lands a slice replaces its
# item here", "When a slice lands, replace its item here ...", "keep this under
# 2,000 characters"). Rows put it inside their last `; ` item, so parking that
# item whole carried the instruction into NEXT.md and left "item;." behind
# (einvoice-preflight run, 2026-11-16; shift-roster-builder and
# league-schedule-generator rows read ";." on main that day). It is never parked.
ROW_NOTE = re.compile(r"\s*\b(?:(?:A run that lands|When a slice lands)\b[^.;]*"
                      r"|keep this under [\d,]+ characters)[.;]?", re.I)


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
            rows.append("        keep: (no safe split: a pointer, or landed and open items interleaved; trim by hand: write the shortened field with --set - from stdin)")
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


def split_items(value: str) -> list[str]:
    """The `; `-separated items of `value`, splitting only outside brackets.

    A plain split broke items at a "; " inside "(...)": the first --trim of
    the real rows (2026-11-17) offered "the Nexus 5X carries ForwardMatrix)"
    and "--baritones, ... (TTBB" as items, which would have parked half an
    item and left an unclosed bracket in `next:`."""
    out, depth, start = [], 0, 0
    v = " ".join(value.split())
    for i, ch in enumerate(v):
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth = max(depth - 1, 0)
        elif ch == ";" and depth == 0 and v.startswith("; ", i):
            out.append(v[start:i])
            start = i + 2
    out.append(v[start:])
    return out


def holds_new(piece: str, keep: tuple[str, ...]) -> bool:
    """True when `piece` (an item, sentence or result a park or move would
    take) overlaps any of `keep`, the NEW texts of the run's own --replace.

    Why: the check was whole-string only (`k in piece or piece in k`), so a
    NEW spanning an item or sentence break ("count default ships (README
    ...); next the How eager ladder ...") matched neither half. Its first
    half then read as a finished result and moved to HISTORY.md, taking the
    run's just-written next step out of `next:` (run records 2026-11-19T21:18,
    PR #17798, and 2026-11-20T12:20, PR #17912). Now any `; ` or `. `
    fragment of NEW of 12 or more characters found in `piece` counts too."""
    body = " ".join(piece.split())
    if not body:
        return False
    for k in keep:
        k = " ".join(k.split())
        if not k:
            continue
        if k in body or body in k:
            return True
        for item in split_items(k):
            for frag in re.split(r"(?<=[.])\s+", item):
                frag = frag.strip(" ;").rstrip(".")
                if len(frag) >= 12 and frag in body:
                    return True
    return False


def _balanced(text: str) -> bool:
    depth = 0
    for ch in text:
        depth += ch in "([{"
        depth -= ch in ")]}"
        if depth < 0:
            return False
    return depth == 0


# A full stop inside an item joins two thoughts the `; ` split could not part
# ("...carry-forward. joint drift ... Open: (0) drift model ..."): parking it
# would take the next sentence's label ("Open:") with it, so it is not offered.
SENTENCE = re.compile(r"[a-z0-9)\]]\. (?=[A-Za-z(])")


# Where a row's open items begin ("Next:", "Open:", "next:", "Next, most
# valuable first:", "Open items, most valuable first:", "Wanted, all needing
# real inputs:"). Text before the first
# one is history (results, landed work) however it is worded. On 2026-11-18
# implicit parks moved "proved impossible: 7, 9 on 2x6" and "8 on 2x6, 12 on
# 2x9 UNSAT" into league-schedule-generator's NEXT.md as open items: they were
# `; `-fragments of one landed sentence, and only the first fragment said
# "landed" (six run records that day; PRs #17133, #17193, #17254, #17272,
# #17275). Every row on main carries such a marker; one with none is parked as
# before.
OPEN_MARK = re.compile(r"\b(?:[Nn]ext|[Oo]pen|Wanted)\b(?:,[^:;.]{0,40}| items\b[^:;.]{0,30})?:")


def open_start(value: str) -> int:
    """Offset in the space-normalised `value` where open items begin: the
    first OPEN_MARK outside the NEXT.md pointer, or 0 when there is none."""
    v = " ".join(value.split()).replace(PARK_POINTER, " " * len(PARK_POINTER))
    m = OPEN_MARK.search(v)
    return m.start() if m else 0


def park_candidates(value: str, over: int, keep: tuple[str, ...] = ()) -> list[tuple[str, int]]:
    """(item, room it frees) for the `; `-separated items of `value`, last first,
    until together they free `over` characters. The history pointer that opens
    a row, the NEXT.md pointer and any item holding text in `keep` (the NEW of
    the run's own --replace) are never offered. Rows list their most
    useful items first ("Next, most valuable first: ..."), so the tail is the
    usual place to cut, but which one to park stays the run's call.

    The item just before the run's own text is kept too: a run edits in
    context, and that clause is often the heading its text continues. On
    2026-11-17 (PR #16944) --make-room parked "control series: ... synthetic
    control ...: CA rank 1 of 39" and left the run's "MA, AZ, OR ranks 6-13;
    covariates ... failed" under the previous item's "its AR(1) term", so
    the run needed a second --replace to restore the heading."""
    start = open_start(value)
    items, pos, history = [], 0, set()
    for item in split_items(value):
        pos += len(item) + 2
        if item:
            # an item ending before the first open marker is history: never offered
            if pos - 2 <= start:
                history.add(len(items))
            items.append(item)

    def _body(item: str) -> str:
        return ROW_NOTE.sub("", item.replace(PARK_POINTER, "")).strip().rstrip(". ")

    def _mine(item: str) -> bool:
        return holds_new(item, keep) or holds_new(_body(item), keep)

    held = {j - 1 for j, item in enumerate(items) if j and _mine(item)}
    out: list[tuple[str, int]] = []
    freed = 0
    for i, item in enumerate(reversed(items)):
        j = len(items) - 1 - i
        body = _body(item)
        if (j == 0 or j in history or j in held or _mine(item) or not body or POINTER.match(body)
                or LANDED.search(body)
                or len(body) < 12 or not _balanced(body) or SENTENCE.search(body)):
            continue
        gain = len(body) + 2
        out.append((body, gain))
        freed += gain
        if freed >= over:
            break
    # The item that reached `over` may free enough alone or with fewer of the
    # tail items before it; those stay in the row. Why: runs reported parks
    # past what the cap needed (2026-11-18T04:57: 67 over, two items and 147
    # characters parked; 12:17: two items and 310 characters, 202 left spare).
    # Only earlier-taken (later-in-row, less valuable) items are dropped, so
    # nothing more valuable is parked than before, only less in total.
    if freed >= over:
        for k in range(len(out) - 2, -1, -1):
            if freed - out[k][1] >= over:
                freed -= out[k][1]
                del out[k]
    return out


def park_hint(value: str, venture: str, over: int, keep: tuple[str, ...] = ()) -> str:
    room = 0 if PARK_POINTER in value else len(PARK_POINTER) + 1
    cands = park_candidates(value, over + room, keep)
    if not cands:
        return (f"To make room without losing an open item, move the least urgent one to "
                f"ventures/{venture}/NEXT.md: add --park 'ITEM' to this same command")
    rows = [f"  {g:4d}  --park {shlex.quote(c)}" for c, g in cands]
    return ("To make room without losing an open item, add --park for one or more of these "
            f"to this same command (they move to ventures/{venture}/NEXT.md; room freed, "
            "items from the end of the row; pick the least urgent), or add --make-room to "
            "park exactly these:\n"
            + "\n".join(rows))


def new_budget(keep: tuple[str, ...], over: int) -> str:
    """With --replace, the longest its NEW can be, so the second try fits
    (doc_friction 2026-11-16: three runs overran `buildable:` by 14 to 47
    characters and could only guess how much to cut). With several --replace
    NEWs it names their total and a cut for each, in proportion to its length
    (friction 2026-11-19: a two-item `buildable:` rewrite took three tries
    because the refusal named no budget when two NEWs were given)."""
    keep = tuple(k for k in keep if k)
    if not keep:
        return ""
    if len(keep) == 1:
        most = len(keep[0]) - over
        if most <= 0:
            return (f". Your NEW text ({len(keep[0])} chars) cannot fit by shortening alone: "
                    "cut another item too")
        return f". Your NEW text is {len(keep[0])} characters; at most {most} fits"
    total = sum(len(k) for k in keep)
    if total - over <= 0:
        return (f". Your {len(keep)} NEW texts ({total} chars together) cannot fit by "
                "shortening alone: cut another item too")
    cuts, left = [], over
    for i, k in enumerate(keep):
        c = left if i == len(keep) - 1 else min(left, -(-over * len(k) // total))
        cuts.append(c)
        left -= c
    each = "; ".join(f"{k[:30]!r}{'...' if len(k) > 30 else ''} {len(k)} -> {len(k) - c}"
                     for k, c in zip(keep, cuts))
    return (f". Your {len(keep)} NEW texts are {total} characters together; at most "
            f"{total - over} fit, e.g. {each}")


def cap_note(field: str, n: int) -> str:
    """' of CAP characters, R left' for a capped field, ' characters' otherwise."""
    cap = {"next": FLAGSHIP_NEXT_MAX, "buildable": FLAGSHIP_BUILDABLE_MAX}.get(field)
    return f" of {cap} characters, {cap - n} left" if cap else " characters"


def set_value(text: str, venture: str, field: str, value: str,
              keep: tuple[str, ...] = ()) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("refusing to write an empty value")
    if field == "next" and len(value) > FLAGSHIP_NEXT_MAX:
        over = len(value) - FLAGSHIP_NEXT_MAX
        hint = landed_hint(value, over)
        raise ValueError(f"`next:` would be {len(value)} of {FLAGSHIP_NEXT_MAX} characters "
                         f"({over} over): replace what you landed, don't append"
                         + new_budget(keep, over)
                         + (f"\n{hint}" if hint else "") + history_hint(value, over, keep)
                         + "\n" + park_hint(value, venture, over, keep))
    if field == "buildable" and len(value) > FLAGSHIP_BUILDABLE_MAX:
        # Say the overrun, the room the row had, the landed cuts and (with one
        # --replace) the longest NEW that fits, so the next attempt fits first
        # time (three runs on 2026-11-16 rewrote a replacement 14 to 47 over).
        over = len(value) - FLAGSHIP_BUILDABLE_MAX
        before = read_value(text, venture, field)
        room = (f"; the row was {len(before)}, so it had {FLAGSHIP_BUILDABLE_MAX - len(before)} to spare"
                if before is not None and len(before) <= FLAGSHIP_BUILDABLE_MAX else "")
        hint = landed_hint(value, over)
        raise ValueError(f"`buildable:` would be {len(value)} of {FLAGSHIP_BUILDABLE_MAX} characters "
                         f"({over} over{room}): name only items a session can start now; landed work "
                         "goes in the README or eval/" + new_budget(keep, over)
                         + (f"\n{hint}" if hint else ""))
    lines = text.splitlines(keepends=True)
    a, b = _span(lines, venture, field)
    out = "".join(lines[:a] + wrap(field, value) + lines[b:])
    got = read_value(out, venture, field)
    if got != value:
        raise ValueError(f"round trip failed for {venture}.{field}: wrote {value[:80]!r}, read {str(got)[:80]!r}")
    return out


def remove_items(value: str, items: list[str]) -> str:
    """`value` with each item cut out and the separators around it tidied."""
    out = " ".join(value.split())
    for item in items:
        # Only the open item moves: the row's note and the full stop that
        # closes the sentence stay in `next:`.
        want = ROW_NOTE.sub("", " ".join(item.split())).strip(" ;").rstrip(".")
        if not want or want not in out:
            raise ValueError(f"--park: not found in `next:`: {item!r} (copy it from "
                             "`flagship_field.py <venture>`, the unfolded value)")
        out = out.replace(want, "", 1)
    out = re.sub(r"\s*;\s*(?:;\s*)+", "; ", out)       # "a; ; b" -> "a; b"
    # (?=\s|$): a file extension or an ellipsis after a separator is text, not a
    # stray ("reply sets; .eml and .mbox files" read "sets.eml and.mbox" after
    # a park in sales-agent; "Curitiba,...)" lost its comma in einvoice-preflight).
    out = re.sub(r"\s+([;,.:])(?=\s|$)", r"\1", out)  # "a ; b" / "a ." -> "a; b" / "a."
    out = re.sub(r"[;,]+\.(?=\s|$)", ".", out)          # "a;. Note" -> "a. Note"
    out = re.sub(r"[;,]\s*(?=" + re.escape(PARK_POINTER) + ")", ". ", out)  # "a; More open" -> "a. More open"
    out = re.sub(r"([:.])\s*;\s*", r"\1 ", out)        # "next: ; b" -> "next: b"
    out = re.sub(r";\s*$", ".", out.strip())
    out = re.sub(r"^[;,.]\s*", "", out)
    return " ".join(out.split())


def park_text(existing: str | None, venture: str, items: list[str], day: str) -> str:
    """NEXT.md with the items appended under PARK_HEADING (created if missing)."""
    body = existing if existing is not None else (
        f"# {venture}: open items beyond flagships.yaml\n\n"
        "`portfolio/flagships.yaml` caps a flagship's `next:` at "
        f"{FLAGSHIP_NEXT_MAX} characters, so it holds the items most worth starting. "
        "Open items moved out to make room are kept here by "
        "`portfolio/router/flagship_field.py --park`. Take one back into `next:` "
        "when it becomes the most useful thing to do, and delete it here when it lands.\n")
    if PARK_HEADING not in body:
        body = body.rstrip("\n") + f"\n\n{PARK_HEADING}\n\n"
    else:
        body = body.rstrip("\n") + "\n"
    add = "".join(f"- ({day}) {ROW_NOTE.sub('', ' '.join(i.split())).strip(' ;')}\n" for i in items)
    return body + add


DATE = re.compile(r"\b20\d\d-\d\d-\d\d\b")
# Words that mark a piece as still open work, whatever its date.
OPENISH = re.compile(r"\b(?:open|wanted|needs?|not (?:yet|done)|to do|todo)\b", re.I)
# Abbreviations whose ". " does not end a sentence.
_ABBREV = re.compile(r"(?:\b(?:e\.g|i\.e|vs|etc|cf|approx|no|v\d+)|\.\.)$", re.I)


def history_pieces(value: str, keep: tuple[str, ...] = ()) -> list[tuple[int, int]]:
    """(start, end) spans in the space-normalised `value` that record finished
    work and can move to ventures/<v>/HISTORY.md, in row order.

    Why: by 2026-11-19 the rows at the cap were full of results, not open
    items. ids-model-check sat at 1,926 and photo-editing at 1,978 of 2,000
    with `--landed` finding 0 clauses (none says "landed"), and --make-room
    parks only open items, so three runs in a day (2026-11-19T01:17, 02:15,
    02:28) failed with "parking every item it may move still leaves 2068"
    and cut other runs' results by hand. Those results are dated sentences
    ("Kodak DCR 2026-11-18 = LibRaw (eval/kodak-dcr-*)."), so:

    - pieces are the row's sentences (". " outside brackets), cut at open
      markers; a `; ` fragment alone ("4 x 2 tiles (177 MP)") loses its
      subject, so a whole sentence moves;
    - only a piece that carries a date (2026-11-18) and comes before the
      row's last open marker is offered; ids-model-check's "Next, most
      valuable first:" is followed by a dozen dated results before its real
      "next:". Undated text before the first marker is not taken on trust:
      chant-forge's "Open checks that need a person: ..." sits there;
    - never the row's first sentence (its pointer), a piece that runs
      straight into an open marker ("X passed; open: Y" keeps X as Y's
      subject), a piece saying open, wanted or needs, the run's own NEW
      text, the NEXT.md pointer, the row's note, or anything in a row with
      no open marker (history and open items cannot be told apart there).
    """
    v = " ".join(value.split())
    marks: list[tuple[int, int]] = []
    masked = v.replace(PARK_POINTER, " " * len(PARK_POINTER))
    seps: list[tuple[int, int]] = []
    depth = 0
    depth_at = []
    for i, ch in enumerate(v):
        depth_at.append(depth)
        if ch in "([" and v[i + 1:i + 2] != "?":  # "(?:" is regex text, not a bracket
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        elif depth == 0 and ch == "." and v[i + 1:i + 2] == " ":
            if ch == "." and _ABBREV.search(v[:i]):
                continue
            seps.append((i, i + 2))
    for m in OPEN_MARK.finditer(masked):
        if depth_at[m.start()] == 0:
            end = m.end() + (1 if v[m.end():m.end() + 1] == " " else 0)
            marks.append((m.start(), end))
    if not marks:
        return []
    last_mark = marks[-1][0]
    first_sentence = seps[0][1] if seps else len(v)
    bounds = sorted(seps + marks)
    out = []
    pos = 0
    for a, b in bounds + [(len(v), len(v))]:
        start, end = pos, a
        pos = max(pos, b)
        if end <= start:
            continue
        piece = v[start:end].strip()
        if not piece or start < first_sentence or start >= last_mark:
            continue
        if any(ms <= start < me for ms, me in marks):
            continue
        if not DATE.search(piece) or OPENISH.search(piece):
            continue
        if any(ms == a for ms, _ in marks) and v[start:a].rstrip()[-1:] != ".":
            continue
        if (PARK_POINTER in piece or ROW_NOTE.search(piece) or not _balanced(piece)
                or holds_new(piece, keep)):
            continue
        out.append((start, start + len(piece)))
    return out


def remove_span(value: str, start: int, end: int) -> str:
    """`value` without v[start:end] and one separator next to it: the one
    before it when there is one ("a; b. Next:" -> "a. Next:"), else the one
    after ("Next: x; y" -> "Next: y")."""
    v = value
    before = v[:start]
    m = re.search(r"[;.] $", before)
    if m:
        return " ".join((before[:m.start()] + v[end:]).split())
    after = re.match(r" ?[;.]? ?", v[end:])
    return " ".join((before + v[end + after.end():]).split())


def remove_text(value: str, piece: str) -> str:
    """`value` without `piece` (matched on whitespace-normalised text) and one
    separator beside it, for --history. Raises ValueError when it is absent."""
    v = " ".join(value.split())
    want = " ".join(piece.split()).strip(" ;").rstrip(".")
    i = v.find(want) if want else -1
    if i < 0:
        raise ValueError(f"--history: not found in `next:`: {piece!r} (copy it from "
                         "`flagship_field.py <venture>`, the unfolded value)")
    j = i + len(want)
    if v[max(0, i - 2):i] == ". " and v[j:j + 2] == "; ":
        # "a. PIECE; b" -> "a. b": keep the sentence break, drop the item's
        return " ".join((v[:i] + v[j + 2:]).split())
    return remove_span(v, i, j)


def archive_history(value: str, goal: int, keep: tuple[str, ...] = ()) -> tuple[str, list[str]]:
    """Move history pieces, oldest (first in the row) first, until `value`
    and the NEXT.md pointer fit under `goal`. Returns (value, pieces moved)."""
    value = " ".join(value.split())
    moved: list[str] = []
    while True:
        room = 0 if PARK_POINTER in value else len(PARK_POINTER) + 1
        if len(value) + room <= goal:
            break
        spans = history_pieces(value, keep)
        if not spans:
            break
        a, b = spans[0]
        moved.append(value[a:b].rstrip("."))
        value = remove_span(value, a, b)
    return value, moved


HISTORY_HEADING = "## Moved from flagships.yaml `next:`"

# An item a park would move that reads as a finished result, not open work:
# it states an outcome (a verb below, a count "8 of 9", a share "54%") and
# carries no sign of work still to do. Why: rows mix undated results into
# their open list after "Next, most valuable first:", and the parker (which
# goes by position) filed them in NEXT.md as open items. Five run records on
# 2026-11-18..19 said so, e.g. "lasting moves to more days: cut has the power
# (8 of 9 cells)" and "two covariates: ... (bar failed)" in
# changepoint-detector's NEXT.md. Such items now go to HISTORY.md with the
# dated results; anything with an open cue still goes to NEXT.md, since
# losing an open item from the open list costs more than a stray result.
RESULTISH = re.compile(
    r"\b(?:ships|shipped|landed|fail|failed|fails|passed|passes|holds|replicated?|replicates)\b"
    r"|\b\d+(?:\.\d+)? of \d+\b|\d%", re.I)
STILL_OPEN = re.compile(
    r"\b(?:open|next|wanted|wants?|needs?|needed|try|test it|re-?run|retest|re-test"
    r"|to do|todo|not (?:yet|done)|should|could|would|whether|unknown|unclear|tbd|when"
    r"|left|remaining|miss(?:es|ing)?|a real|tail|refresh)\b|\?", re.I)


# A landed entry's usual shape: a label, the day it landed, then its evidence in
# brackets, and nothing after ("two courses 2026-11-20 (golf-courses.test.mjs)",
# "facet-result cache 2026-11-18 (eval/applies-cache-2026-11-18.md: ...)"). No
# verb, so RESULTISH missed it and an implicit park filed it in NEXT.md as open
# work (league-schedule-generator, PR #17951's record). Text after the bracket
# ("... (eval/pair-exact.txt): a ... search on it") or an imperative sentence
# keeps an item open, as does any STILL_OPEN cue.
DATED_EVIDENCE = re.compile(r"\b20\d\d-\d\d-\d\d \(((?:[^()]|\([^()]*\))*)\)\.?$")
EVIDENCE = re.compile(r"\beval/|\b[\w*.-]+\.(?:mjs|js|ts|py|txt|md|json|csv|html|c|rs|go|ipynb)\b")


# A numbered item ("(4) advanced breps on ...") is an entry in the row's ordered
# open list ("Next, most valuable first: (1) ..."); rows keep each area's
# progress so far inside it ("A run that lands a slice replaces its item").
# A count or share in that progress ("703 of 767 = IfcOpenShell to 0.1%") is
# not a sign the area is done, so only an explicit SHIPPED_WORD or the
# DATED_EVIDENCE shape makes one a result. Why: on 2026-11-20 an implicit park
# filed ifc-quantity-takeoff's open item (4) in HISTORY.md as a result (PR
# #17963's record); 7 of the 13 numbered items on main then read as results.
NUMBERED = re.compile(r"^\(\d+[a-z]?\)\s")
SHIPPED_WORD = re.compile(r"\b(?:ships|shipped|landed)\b", re.I)


def is_result(item: str) -> bool:
    """True when a parked item reads as a finished result: RESULTISH (only
    SHIPPED_WORD for a NUMBERED open-list item) or a DATED_EVIDENCE entry, and no
    STILL_OPEN cue."""
    body = ROW_NOTE.sub("", " ".join(item.split())).strip(" ;")
    if STILL_OPEN.search(body):
        return False
    if (SHIPPED_WORD if NUMBERED.match(body) else RESULTISH).search(body):
        return True
    m = DATED_EVIDENCE.search(body)
    return bool(m and EVIDENCE.search(m.group(1)))


def history_text(existing: str | None, venture: str, pieces: list[str], day: str) -> str:
    """HISTORY.md with the pieces appended under HISTORY_HEADING."""
    body = existing if existing is not None else (
        f"# {venture}: what has landed\n\n"
        "Results moved out of `portfolio/flagships.yaml`'s `next:` by "
        "`portfolio/router/flagship_field.py` to keep that row under its "
        f"{FLAGSHIP_NEXT_MAX}-character cap. The README and eval/ files each "
        "entry names hold the detail.\n")
    if HISTORY_HEADING not in body:
        body = body.rstrip("\n") + f"\n\n{HISTORY_HEADING}\n\n"
    else:
        body = body.rstrip("\n") + "\n"
    return body + "".join(f"- (moved {day}) {p}\n" for p in pieces)


def make_room(value: str, keep: tuple[str, ...] = (),
              trigger: int = FLAGSHIP_NEXT_MAX,
              target: int = FLAGSHIP_NEXT_TARGET) -> tuple[str, list[str]]:
    """(`value` with items parked from the end, the items parked). Unchanged
    when it is at most `trigger` characters; otherwise items go until it and
    the NEXT.md pointer fit under `target` (FLAGSHIP_NEXT_TARGET for an
    explicit --make-room or --trim, the cap for an edit's implicit park), or,
    when the parkable items cannot free that much, under the cap. Raises
    ValueError when even the cap cannot be reached."""
    value = " ".join(value.split())
    if len(value) <= trigger:
        return value, []
    parked: list[str] = []
    for _ in range(50):
        room = 0 if PARK_POINTER in value else len(PARK_POINTER) + 1
        over = len(value) + room - target
        if over <= 0:
            return value, parked
        cands = [c for c, _ in park_candidates(value, over, keep)]
        if not cands:
            break
        value = remove_items(value, cands)
        parked += cands
    if len(value) <= FLAGSHIP_NEXT_MAX:
        return value, parked
    raise ValueError(f"--make-room: parking every item it may move still leaves `next:` at "
                     f"{len(value)} of {FLAGSHIP_NEXT_MAX} characters; shorten the new text, or move "
                     "finished results to HISTORY.md with --history (landed clauses are never "
                     "parked; dated results before the last open marker were already moved)"
                     + history_hint(value, len(value) - FLAGSHIP_NEXT_MAX, keep))


def history_candidates(value: str, keep: tuple[str, ...] = ()) -> list[str]:
    """Items of `value` that read as finished work, longest first: whole
    landed clauses (`landed_clauses` with nothing to keep) and `; ` items
    `is_result` accepts. Never the run's own NEW text, the row's first
    sentence (its pointer) or the NEXT.md pointer. A suggestion for
    --history; the run decides."""
    v = " ".join(value.split())
    first = v.split(". ", 1)[0]

    def bare(c: str) -> str:
        marks = list(OPEN_MARK.finditer(c))
        if marks:  # "Next: A passed" -> "A passed": the marker stays in the row
            c = c[marks[-1].end():]
        if c.startswith(first + ". "):
            c = c[len(first) + 2:]
        return c.strip(" ;").rstrip(".")

    seen, out = set(), []
    pool = [bare(c) for c, k in landed_clauses(v) if k == ""] + [
        c for c in map(bare, split_items(v)) if is_result(c)]
    for c in pool:
        if (not c or c in seen or c in first or PARK_POINTER in c
                or not _balanced(c) or holds_new(c, keep)):
            continue
        seen.add(c)
        out.append(c)
    return sorted(out, key=len, reverse=True)


def history_hint(value: str, over: int, keep: tuple[str, ...] = ()) -> str:
    """Ready --history flags that together free `over` characters, or ""."""
    flags, freed = [], 0
    for c in history_candidates(value, keep):
        flags.append("--history " + shlex.quote(c))
        freed += len(c) + 2
        if freed >= over:
            break
    if not flags:
        return ""
    return ("\nfinished results this row holds (check each is done, then add to the same call; "
            f"{freed} chars):\n  " + "\n  ".join(flags))


def with_pointer(value: str) -> str:
    if PARK_POINTER in value:
        return value
    grown = f"{value} {PARK_POINTER}"
    return grown if len(grown) <= FLAGSHIP_NEXT_MAX else value


def where_else(text: str, venture: str, field: str, old: str) -> list[str]:
    """Other `venture.field` values holding `old`, this venture's own fields first.

    `--replace` defaults to `next:`, so a run editing a `buildable:` item got a
    bare 'not found' (doc_friction, 2026-11-15T08:08); naming the field it is in
    saves the guess. Whitespace is compared folded, as the value is.
    """
    want = " ".join(old.split())
    if not want:
        return []
    hits: list[str] = []
    entries = _entries(yaml.safe_load(text))
    entries.sort(key=lambda e: e.get("venture") != venture)
    for entry in entries:
        name = entry.get("venture")
        for key, v in entry.items():
            if key == "venture" or (name == venture and key == field) or not isinstance(v, str):
                continue
            if want in " ".join(v.split()):
                hits.append(f"{name}.{key}")
    return hits


def not_found_hint(text: str, venture: str, field: str, old: str, value: str) -> str:
    msg = f"not found in {venture}.{field}: {old!r}"
    if " ".join(old.split()) in " ".join(value.split()):
        return msg + ("\n  it is there with different spacing or line breaks: copy OLD from "
                      f"`flagship_field.py {venture} --field {field}` (the unfolded value)")
    hits = where_else(text, venture, field, old)
    if hits:
        own = [h for h in hits if h.startswith(f"{venture}.")]
        same = [h for h in hits if h.endswith(f".{field}")]
        first = (own or same or hits)[0]
        v, f = first.split(".", 1)
        msg += f"\n  found in {', '.join(hits[:5])}" + (" ..." if len(hits) > 5 else "")
        msg += f"\n  rerun as: flagship_field.py {v} --field {f} --replace ..."
    return msg


def hyphen_folds(text: str) -> list[int]:
    """1-based line numbers of folded lines that end in a word-hyphen."""
    return [text.count("\n", 0, m.start()) + 1 for m in HYPHEN_FOLD.finditer(text)]


def stray_separators(text: str) -> list[str]:
    """`venture.field` values holding a separator left by a cut ("item;." or
    "item; ;"), which no reader means and an old --park left on two rows."""
    bad = []
    for entry in _entries(yaml.safe_load(text)):
        for key, v in entry.items():
            if isinstance(v, str) and re.search(r"[;,]\s*\.(?:\s|$)|;\s*;", " ".join(v.split())):
                bad.append(f"{entry.get('venture')}.{key}")
    return bad


def main(argv: list[str] | None = None) -> int:
    """Run the CLI. A write attempt (--set/--replace/--park/--make-room) that
    fails ends with one NOT WRITTEN line, so a refusal is not mistaken for a
    write (doc_friction 2026-11-16 and 2026-11-17: a refusal's park
    suggestions read as output, and two runs only saw nothing had changed by
    re-reading the row)."""
    argv = sys.argv[1:] if argv is None else argv
    rc = _main(argv)
    writes = {"--set", "--replace", "--park", "--make-room", "--trim"}
    if rc != 0 and "--dry-run" not in argv and any(a.split("=", 1)[0] in writes for a in argv):
        print(f"NOT WRITTEN: exit {rc}, no file was changed", file=sys.stderr)
    return rc


def _main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("venture", nargs="?")
    ap.add_argument("--field", default="next")
    ap.add_argument("--replace", nargs=2, action="append", metavar=("OLD", "NEW"),
                    help="substring replace on the unfolded value (repeatable)")
    ap.add_argument("--set", metavar="FILE", help="new value from a file, or - for stdin")
    ap.add_argument("--check", action="store_true", help="exit 1 if any folded line breaks at a hyphen")
    ap.add_argument("--landed", action="store_true",
                    help="list the clauses that report landed work, longest first (cut candidates)")
    ap.add_argument("--park", action="append", metavar="ITEM",
                    help="move an open item out of `next:` into ventures/<v>/NEXT.md (repeatable; "
                         "combines with --replace/--set, the cap is checked after parking)")
    ap.add_argument("--history", action="append", metavar="TEXT",
                    help="move a finished result (any span of the unfolded `next:`) to "
                         "ventures/<v>/HISTORY.md (repeatable; combines with --replace/--set, "
                         "the cap is checked after the move)")
    ap.add_argument("--make-room", action="store_true",
                    help="when `next:` would pass the cap, park items from the end of the row "
                         "(never your own NEW text) until it and the NEXT.md pointer fit")
    ap.add_argument("--no-make-room", action="store_true",
                    help="refuse a `next:` edit over the cap instead of parking by itself")
    ap.add_argument("--trim", action="store_true",
                    help=f"park items from the end of `next:` until it is at most "
                         f"{FLAGSHIP_NEXT_TARGET} characters (no other edit needed)")
    ap.add_argument("--dry-run", action="store_true",
                    help="say what a `next:` edit would park and how long the row would be; write nothing")
    ap.add_argument("--file", type=Path, default=FLAGSHIPS_PATH)
    ap.add_argument("--ventures-dir", type=Path, default=REPO_ROOT / "ventures", help=argparse.SUPPRESS)
    args = ap.parse_args(argv)
    text = args.file.read_text()

    if args.check:
        bad = hyphen_folds(text)
        for n in bad:
            print(f"{args.file}:{n}: folded line ends in a hyphen; YAML reads it as '- ' "
                  f"(fix: flagship_field.py <venture> --replace '<word>- <rest>' '<word>-<rest>')")
        stray = stray_separators(text)
        for where in stray:
            print(f"{args.file}: {where} holds a stray ';.' or '; ;' left by a cut "
                  f"(fix: flagship_field.py {where.split('.')[0]} --field {where.split('.', 1)[1]} "
                  "--replace ';.' '.')")
        return 1 if bad or stray else 0
    if not args.venture:
        ap.error("name a venture (or pass --check)")
    try:
        current = read_value(text, args.venture, args.field)
        mine = tuple(" ".join(rep.split()) for _, rep in args.replace or [])
        # A `next:` edit that would pass the cap parks by itself unless told
        # not to (FLAGSHIP_NEXT_TARGET, docstring); a fitting edit is unchanged.
        explicit = args.make_room or args.trim
        if (args.field == "next" and current is not None and not args.no_make_room
                and (args.set is not None or args.replace)):
            args.make_room = True
        if args.trim:
            args.make_room = True
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
        if args.park or args.make_room or args.history:
            if args.field != "next":
                ap.error("--park, --history and --make-room work on `next:` only")
            if current is None:
                print(f"{args.venture} has no `next:`", file=sys.stderr)
                return 1
            new = current
            if args.set is not None:
                new = sys.stdin.read() if args.set == "-" else Path(args.set).read_text()
            for old, rep in args.replace or []:
                if old not in new:
                    print(not_found_hint(text, args.venture, args.field, old, new), file=sys.stderr)
                    return 1
                new = new.replace(old, rep, 1)
            parks = list(args.park or [])
            if parks:
                new = remove_items(new, parks)
            history: list[str] = []
            for piece in args.history or []:
                new = remove_text(new, piece)
                history.append(" ".join(piece.split()).strip(" ;").rstrip("."))
            if args.make_room:
                before = len(" ".join(new.split()))
                trigger = FLAGSHIP_NEXT_TARGET if args.trim else FLAGSHIP_NEXT_MAX
                if before > trigger:
                    # Finished, dated results go to HISTORY.md before any open
                    # item is parked (history_pieces' docstring), and down to
                    # the target even on an implicit edit: the move loses
                    # nothing, and stopping at the cap left the next run there.
                    new, history = archive_history(new, FLAGSHIP_NEXT_TARGET, mine)
                    for piece in history:
                        print(f"{'would move' if args.dry_run else 'moving'} to HISTORY.md "
                              f"({len(piece) + 2} chars): {piece}", file=sys.stderr)
                new, auto = make_room(new, mine,
                                      FLAGSHIP_NEXT_TARGET if args.trim else FLAGSHIP_NEXT_MAX,
                                      FLAGSHIP_NEXT_TARGET if explicit else FLAGSHIP_NEXT_MAX)
                moved = sum(len(i) + 2 for i in auto)
                over = before - FLAGSHIP_NEXT_MAX
                if auto and not explicit and moved > max(IMPLICIT_PARK_FREE, 5 * over):
                    # Why: an edit a few characters over the cap parked the
                    # row's biggest open item whole (2026-11-20, PR #17900
                    # "auto-parked an unrelated open item"; on #17912's row a
                    # 28-over edit would park 777 characters, the deployer
                    # item). Shortening NEW is the cheaper fix; say by how much.
                    raise ValueError(
                        f"`next:` would be {before} of {FLAGSHIP_NEXT_MAX} ({over} over), and "
                        f"fitting it by itself would park {moved} characters of other open "
                        f"items: {auto[0][:90]}{'...' if len(auto[0]) > 90 else ''}\n"
                        f"Shorten your NEW text by {over}{new_budget(mine, over) if mine else ''}"
                        ", move a finished result with --history, or add --make-room to park "
                        "it anyway" + history_hint(new, over, mine))
                if auto:
                    how = ("--make-room" if explicit else
                           "the edit passes the cap, so it parks by itself (--no-make-room refuses instead)")
                    print(f"{'would park' if args.dry_run else 'parking'} {len(auto)} item(s), "
                          f"{sum(len(i) + 2 for i in auto)} chars: `next:` was {before} of "
                          f"{FLAGSHIP_NEXT_MAX} after the edit; {how}", file=sys.stderr)
                for item in auto:
                    if is_result(item):
                        # a finished result: HISTORY.md, not NEXT.md's open list (RESULTISH)
                        history.append(item)
                        print(f"{'would move' if args.dry_run else 'moving'} to HISTORY.md, "
                              f"a result rather than an open item ({len(item) + 2} chars): {item}",
                              file=sys.stderr)
                    else:
                        parks.append(item)
                        print(f"--make-room parked ({len(item) + 2} chars): {item}", file=sys.stderr)
            if args.dry_run:
                shown = with_pointer(new) if parks else " ".join(new.split())
                print(f"dry run: {args.venture}.next would be {len(shown)}"
                      f"{cap_note('next', len(shown))}; {len(parks)} item(s) to NEXT.md, "
                      f"{len(history)} to HISTORY.md; nothing written")
                return 0
            hist_dest = args.ventures_dir / args.venture / "HISTORY.md"
            if history and not hist_dest.parent.is_dir():
                raise ValueError(f"no venture folder {hist_dest.parent}")
            hist_out = (history_text(hist_dest.read_text() if hist_dest.exists() else None,
                                     args.venture, history, datetime.date.today().isoformat())
                        if history else None)
            if not parks:
                # it fitted (perhaps once history moved): no NEXT.md entry
                new = " ".join(new.split())
                out = set_value(text, args.venture, "next", new, mine)
                args.file.write_text(out)
                if hist_out is not None:
                    hist_dest.write_text(hist_out)
                    print(f"moved {len(history)} result(s) to "
                          f"{hist_dest.relative_to(hist_dest.parents[2])}")
                print(f"wrote {args.venture}.next: {len(new)}{cap_note('next', len(new))}")
                return 0
            args.park = parks
            new = with_pointer(new)
            out = set_value(text, args.venture, "next", new, mine)
            dest = args.ventures_dir / args.venture / "NEXT.md"
            if not dest.parent.is_dir():
                raise ValueError(f"no venture folder {dest.parent}")
            parked = park_text(dest.read_text() if dest.exists() else None, args.venture,
                               args.park, datetime.date.today().isoformat())
            args.file.write_text(out)
            dest.write_text(parked)
            if hist_out is not None:
                hist_dest.write_text(hist_out)
                print(f"moved {len(history)} result(s) to "
                      f"{hist_dest.relative_to(hist_dest.parents[2])}")
            print(f"parked {len(args.park)} item(s) in {dest.relative_to(dest.parents[2])}; "
                  f"wrote {args.venture}.next: {len(new)}{cap_note('next', len(new))}")
            if PARK_POINTER not in new:
                print(f"note: no room for the pointer {PARK_POINTER!r}; park one more item "
                      "or shorten one so readers know NEXT.md exists", file=sys.stderr)
            return 0
        if args.set is None and not args.replace:
            if current is None:
                print(f"{args.venture} has no `{args.field}:`", file=sys.stderr)
                return 1
            print(current)
            print(f"-- {len(current)}{cap_note(args.field, len(current))}", file=sys.stderr)
            return 0
        if args.set is not None:
            new = sys.stdin.read() if args.set == "-" else Path(args.set).read_text()
        else:
            new = current or ""
        for old, rep in args.replace or []:
            if old not in new:
                print(not_found_hint(text, args.venture, args.field, old, new), file=sys.stderr)
                return 1
            new = new.replace(old, rep, 1)
        out = set_value(text, args.venture, args.field, new, mine)
        if args.dry_run:
            n = len(" ".join(new.split()))
            print(f"dry run: {args.venture}.{args.field} would be {n}{cap_note(args.field, n)}; "
                  "nothing written")
            return 0
    except (KeyError, ValueError) as e:
        print(e, file=sys.stderr)
        return 1
    args.file.write_text(out)
    n = len(" ".join(new.split()))
    print(f"wrote {args.venture}.{args.field}: {n}{cap_note(args.field, n)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
