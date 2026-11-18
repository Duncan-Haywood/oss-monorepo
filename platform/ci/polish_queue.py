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
dropped: the match is a guess.

It also reads the open pull requests (unauthenticated REST; this repository
is public) and marks an item "claimed by #N" when an open PR's body picks it
by report and number, or "maybe claimed" when a PR title shares its key words.
Reports were the only signal, and a report lands with the PR after a 10 to 20
minute build: on 2026-11-18 three runs took the same item within five minutes
(PRs #17145, #17146 and #17147, all opened 02:23 to 02:28 UTC) and two of them
redid work the first had landed. So open the draft PR as soon as you pick,
with "Picked item N of `polish-...md`" in its body; this script then shows
the claim to the next run. --offline skips the PR read.
"""
import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "docs" / "reports"
REPO = "duncan-haywood/oss-monorepo"

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
    return refs(lead(text))


def refs(t):
    """{(report name, item number)} named in `t` in either phrasing picks() reads."""
    found = set()
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


def open_prs(repo=REPO, pages=5, opener=urllib.request.urlopen):
    """[(number, title, body, head ref)] of open PRs whose title starts with "polish";
    None when the API could not be read (said aloud, so "no claims" is never a silent guess)."""
    found = []
    try:
        for page in range(1, pages + 1):
            url = f"https://api.github.com/repos/{repo}/pulls?state=open&per_page=100&page={page}"
            with opener(url, timeout=15) as r:
                batch = json.load(r)
            found += [(p["number"], p.get("title") or "", p.get("body") or "",
                       (p.get("head") or {}).get("ref", "")) for p in batch
                      if re.match(r"\s*polish\b", p.get("title") or "", re.I)]
            if len(batch) < 100:
                break
    except Exception:
        return None
    return found


def title_words(title):
    """A PR title's key words, without the "polish:" prefix and the "+ post" tail."""
    t = re.sub(r"^\s*polish\s*[:/]\s*", "", title, flags=re.I)
    t = re.sub(r"\s*\+\s*(post|check)\b.*$", "", t, flags=re.I).replace("`", " ")
    return {w for w in re.findall(r"[a-z][a-z0-9-]{3,}", t.lower()) if w not in _STOP}


def _singular(words):
    """Titles and items differ in plurals ("intro" vs "intros", PR #17145's title against
    the item it took), which kept a real claim under similar()'s three-word bar."""
    return {w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w for w in words}


def claims(open_, prs, own_branch=""):
    """{index into open_: note} for items an open PR (not this branch's) has claimed."""
    out = {}
    others = [p for p in prs if not own_branch or p[3] != own_branch]
    named = {}
    for n, _, body, _ in others:
        for ref in refs(body):
            named.setdefault(ref, n)
    for i, (name, item, part, _) in enumerate(open_):
        if (name, item) in named:
            out[i] = f"claimed by open PR #{named[(name, item)]}: leave it"
            continue
        kw = _singular(key_words(part))
        hit = next((n for n, title, _, _ in others if similar(kw, _singular(title_words(title)))), None)
        if hit:
            out[i] = f"maybe claimed: open PR #{hit}'s title looks like it"
    return out


def current_branch():
    out = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT,
                         capture_output=True, text=True)
    return out.stdout.strip() if out.returncode == 0 else ""


def clip(s, width=220):
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= width else s[:width - 1].rsplit(" ", 1)[0] + " …"


def main(argv=None, texts=None, today=None, prs=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--days", type=int, default=2, help="reports dated this many days back (default 2: today and yesterday)")
    ap.add_argument("--taken", action="store_true", help="also list the items later runs picked")
    ap.add_argument("--offline", action="store_true", help="do not read open PRs for claims")
    args = ap.parse_args(argv)
    texts = load() if texts is None else texts
    today = today or dt.date.today()
    since = today - dt.timedelta(days=args.days - 1) if args.days > 0 else None
    open_, taken = queue(texts, since)
    window = sum(1 for n in texts if since is None or (report_date(n) or dt.date.min) >= since)
    print(f"{window} polish reports since {since or 'the start'}: "
          f"{len(open_)} open item(s), {len(taken)} taken by a later report")
    if prs is None and not args.offline:
        prs = open_prs()
    if prs is None:
        print("open PRs: not read (" + ("--offline" if args.offline else "GitHub API unreachable")
              + "); search them (`polish in:title`) before you start")
        claimed = {}
    else:
        claimed = claims(open_, prs, current_branch())
        print(f"open polish PRs read: {len(prs)}; {sum(1 for v in claimed.values() if v.startswith('claimed'))} "
              f"item(s) claimed, {sum(1 for v in claimed.values() if v.startswith('maybe'))} maybe")
    for i, (name, n, text, note) in enumerate(open_):
        notes = "; ".join(x for x in (claimed.get(i), note) if x)
        print(f"- {name} #{n}: {clip(text)}" + (f"  [{notes}]" if notes else ""))
    if args.taken:
        print("\nTaken:")
        for name, n, text, by in taken:
            print(f"- {name} #{n} -> {by}: {clip(text, 120)}")
    if not open_:
        print("Nothing open in the window: survey the site (polish prompt, 'Pick one piece of work').")
    else:
        print('Claim before you build: open the draft PR now, its body saying "Picked item N of '
              '`polish-...md`", so the next run sees it here (three runs took one item on 2026-11-18).')
    return 0


if __name__ == "__main__":
    sys.exit(main())
