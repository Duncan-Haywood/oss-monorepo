#!/usr/bin/env python3
"""The open "Still weakest" items across recent polish reports, minus the ones a later run took.

Every polish run ends its `docs/reports/polish-*.md` note with "Still weakest,
and what I would do next", and the polish prompt says the next run starts from
that list. With eight or nine polish runs a day the lists overlap and go stale:
at least five run records from 2026-11-13 to 11-16 found the item they were
about to take already landed ("the next-steps lists aren't pruned when an item
lands, so each polish run re-checks them"), and one said picking meant reading
25 reports from two days.

The reports already say what they took, in their lead ("Picked item 2 of
"Still weakest" in `polish-...md`", "Picked from `polish-...md`, "Still
weakest" item 3"), and a carried-over item names its source ("(`polish-...md`,
item 1)"). This script reads both and prints what is left, newest first:

    python3 platform/ci/polish_queue.py            # open items from the last 2 days of reports
    python3 platform/ci/polish_queue.py --days 4   # a wider window
    python3 platform/ci/polish_queue.py --taken    # also list what was picked, and by whom

An item is "taken" when a later report's lead picks it by report and number,
or picks the item it was carried over from. An open item whose key words
mostly match a taken one is printed with a "maybe taken" note instead of being
dropped: the match is a guess. It reads files only; it cannot see open pull
requests, so still search them (`polish in:title`) before starting.
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "docs" / "reports"

NAME = r"(polish-\d{4}-\d{2}-\d{2}-[\w.-]+?\.md)"
# "item 2 of "Still weakest" in `X`", "from item 1 of `X`"
_ITEM_THEN_NAME = re.compile(r"\bitems? (\d+)(?: and (\d+))? of [^`]{0,40}?`" + NAME + "`", re.I)
# "Picked from `X`, "Still weakest" item 3", "`X` (item 1)"
_NAME_THEN_ITEM = re.compile("`" + NAME + r"`[^`]{0,40}?\bitems? (\d+)(?: and (\d+))?", re.I)
_DATE = re.compile(r"polish-(\d{4}-\d{2}-\d{2})-")
_WEAKEST = re.compile(r"^##\s.*still weakest", re.I)
_NUMBERED = re.compile(r"^(\d+)\.\s+(.*)")
_BOLD = re.compile(r"\*\*(.+?)\*\*")
_STOP = set("""the and that this with from into over under have has had its it's their there
these those than then when what which while would could should about after before also
only still more most other each every page pages site item items carried polish report
reports``""".split())


def report_date(name):
    m = _DATE.search(name)
    return dt.date.fromisoformat(m.group(1)) if m else None


def split_front(text):
    """The report's body without its YAML front matter."""
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            return text[end + 4:]
    return text


def lead(text):
    """The text between the title and the first `## ` heading: where a run says what it picked."""
    body = split_front(text)
    out = []
    for line in body.splitlines():
        if line.startswith("## "):
            break
        out.append(line)
    return " ".join(out)


def picks(text):
    """{(report name, item number)} that this report's lead says it took."""
    found = set()
    t = lead(text)
    for m in _ITEM_THEN_NAME.finditer(t):
        for n in (m.group(1), m.group(2)):
            if n:
                found.add((m.group(3), int(n)))
    for m in _NAME_THEN_ITEM.finditer(t):
        for n in (m.group(2), m.group(3)):
            if n:
                found.add((m.group(1), int(n)))
    return found


def weakest(text):
    """[(n, item text)] from the "Still weakest" section, numbered items with their wrapped lines."""
    items, on, cur = [], False, None
    for line in split_front(text).splitlines():
        if line.startswith("## "):
            if on:
                break
            on = bool(_WEAKEST.match(line))
            continue
        if not on:
            continue
        m = _NUMBERED.match(line)
        if m:
            cur = [int(m.group(1)), m.group(2).strip()]
            items.append(cur)
        elif cur is not None and line.strip():
            cur[1] += " " + line.strip()
        elif cur is not None and not line.strip():
            cur = None
    return [(n, t) for n, t in items]


def parts(text):
    """A carried-over item lists several things after "Carried over:", split on `;`.
    Each part comes back with the (report, item) it names as its source, if any."""
    m = re.match(r"\s*\**carried over\**\s*(?:\([^)]*\))?\s*:\s*(.*)", text, re.I | re.S)
    chunks = [c.strip(" .") for c in m.group(1).split(";")] if m else [text]
    out = []
    for c in chunks:
        if not c:
            continue
        src = None
        s = re.search("`" + NAME + r"`[^`]{0,20}?\bitem (\d+)", c, re.I)
        if s:
            src = (s.group(1), int(s.group(2)))
        out.append((c, src, bool(m)))
    return out


def key_words(text):
    """The item's gist as a set of words: its bold title when it has one, else its first clause."""
    b = _BOLD.search(text)
    head = b.group(1) if b else re.split(r"[:.(]\s", text, maxsplit=1)[0]
    head = re.sub(r"\([^)]*\)", " ", head).replace("`", " ")  # drop "(`polish-...md`, item 2)" refs
    return {w for w in re.findall(r"[a-z][a-z0-9-]{3,}", head.lower()) if w not in _STOP}


def similar(a, b):
    """Three key words in common (and half the shorter set), or both words of a two-word gist.
    Two shared words out of three were too loose ("tool", "project" matched unrelated items)."""
    if not a or not b:
        return False
    common, small = len(a & b), min(len(a), len(b))
    return (common >= 3 and common / small >= 0.5) or (common == small == 2)


def load(reports=REPORTS):
    """{name: text} for every polish report, by name (a fresh clone gives every file one mtime)."""
    return {p.name: p.read_text(encoding="utf-8", errors="replace")
            for p in sorted(reports.glob("polish-*.md"))}


def queue(texts, since=None):
    """(open, taken): open = [(report, n, part text, note)] newest report first;
    taken = [(report, n, text, picked_by)].

    A picked item that is a list of carried-over things ("Carried over: a; b; c")
    usually had one of them taken, so its parts stay open with a note."""
    names = sorted(texts)
    picked = {}
    for name in names:
        for ref in picks(texts[name]):
            if ref[0] != name:
                picked.setdefault(ref, name)
    taken, taken_keys, rows = [], [], []
    for name in reversed(names):
        for n, text in weakest(texts[name]):
            ps = parts(text)
            by = picked.get((name, n))
            if by and len(ps) == 1:
                taken.append((name, n, text, by))
                taken_keys.append((key_words(text), name, n))
                continue
            for part, src, carried in ps:
                if src and src in picked:  # it names its source, and that was picked
                    taken.append((name, n, part, picked[src]))
                    taken_keys.append((key_words(part), name, n))
                    continue
                note = f"one part of this item was picked by {by}" if by else ""
                rows.append((name, n, part, note))
    open_, seen = [], []
    for name, n, part, note in rows:
        d = report_date(name)
        if since is not None and (d is None or d < since):
            continue
        kw = key_words(part)
        if any(similar(kw, k) for k in seen):
            continue  # already printed from a newer report
        seen.append(kw)
        if not note:
            for k, tn, ti in taken_keys:
                if similar(kw, k):
                    note = f"maybe taken: looks like {tn} item {ti}"
                    break
        open_.append((name, n, part, note))
    in_window = lambda r: since is None or (report_date(r) or dt.date.min) >= since
    return open_, [t for t in taken if in_window(t[0])]


def clip(s, width=220):
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= width else s[:width - 1].rsplit(" ", 1)[0] + " …"


def main(argv=None, texts=None, today=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--days", type=int, default=2, help="reports dated this many days back (default 2: today and yesterday)")
    ap.add_argument("--taken", action="store_true", help="also list the items later runs picked")
    args = ap.parse_args(argv)
    texts = load() if texts is None else texts
    today = today or dt.date.today()
    since = today - dt.timedelta(days=args.days - 1) if args.days > 0 else None
    open_, taken = queue(texts, since)
    window = sum(1 for n in texts if since is None or (report_date(n) or dt.date.min) >= since)
    print(f"{window} polish reports since {since or 'the start'}: "
          f"{len(open_)} open item(s), {len(taken)} taken by a later report")
    for name, n, text, note in open_:
        print(f"- {name} #{n}: {clip(text)}" + (f"  [{note}]" if note else ""))
    if args.taken:
        print("\nTaken:")
        for name, n, text, by in taken:
            print(f"- {name} #{n} -> {by}: {clip(text, 120)}")
    if not open_:
        print("Nothing open in the window: survey the site (polish prompt, 'Pick one piece of work').")
    return 0


if __name__ == "__main__":
    sys.exit(main())
