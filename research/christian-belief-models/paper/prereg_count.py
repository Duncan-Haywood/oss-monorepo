"""Recount the pre-registration record from LOG.md, and check the paper's table.

Every experiment entry in LOG.md writes numbered predictions before the run and
appends one verdict per prediction after it, as "(n) **Verdict**: ...".
Milestone 1 used named hypotheses H1 to H4 ("**H1: mostly supported.**"), and
the 2026-11-06 entry wrote its verdicts unbolded. This script reads all three
forms, maps each verdict phrase to held / partly held / refuted with the table
below, and fails on a phrase it has not been told about, so a new wording gets
a reader's decision instead of a silent default.

    python3 paper/prereg_count.py            # print the recount as a table
    python3 paper/prereg_count.py --check    # compare with Section 11 of draft.md

Stdlib only. The paper's rule (Section 11): a prediction with several parts
counts as held only if every part held.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOG = HERE.parent / "LOG.md"
DRAFT = HERE / "draft.md"

# Every verdict phrase used in LOG.md, lower-cased, and how it counts.
# The judgement calls are commented; the rest follow the words.
VERDICTS = {
    "held": "held",
    "supported": "held",
    "held, barely": "held",  # 3.38 vs 3.43 inside "match, not beat by 0.5": held as written
    "partly held": "partly",
    "half held": "partly",
    "mostly held": "partly",
    "mostly supported": "partly",
    "weakly held": "partly",  # direction right (6 of 13 vs 4 of 11 items), no interval
    "held on the point estimate, not cleanly": "partly",
    "held in its first two parts, missed narrowly in the third": "partly",
    "refuted in part": "partly",  # one of three parts failed
    "refuted in its first half": "partly",  # second half held
    "refuted narrowly for hgb_shift": "partly",  # held around mice_logreg, failed around hgb_shift
    "refuted": "refuted",
    "refuted narrowly": "refuted",
    "narrowly refuted": "refuted",
    "refuted in the other direction": "refuted",
    "refuted in the worse direction": "refuted",
    "refuted for one item": "refuted",  # the claim was "every target"; one target failed
    # 2026-11-07 (Hispanic) (2): "on most items" is 6 of 11 literally, but no paired
    # interval excludes zero except one in the other direction; the entry itself says
    # "not a result". Counted against the prediction, the conservative reading.
    "not supported": "refuted",
}

ENTRY = re.compile(r"^## (\d{4}-\d{2}-\d{2}) · (.+)$", re.M)
NUMBERED = re.compile(r"\((\d+)\)\s*\*\*([^*]+?)\*\*")
UNBOLDED = re.compile(r"\((\d+)\)\s*\*{0,2}([a-z][a-z ]*?)\*{0,2}:")
HYPOTHESIS = re.compile(r"\*\*H(\d): ([^.*]+)\.\*\*")
PLANNED_H = re.compile(r"^- \*\*H(\d)\.\*\*", re.M)


def entries(text: str):
    """(date, title, body) for each log entry, newest first as written."""
    heads = list(ENTRY.finditer(text))
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        yield m.group(1), m.group(2), text[m.end():end]


def bullets(body: str) -> list[str]:
    return [b.strip() for b in re.split(r"\n- ", "\n" + body) if b.strip()]


def milestone(title: str) -> str:
    m = re.match(r"(?:Milestone|Session) (\d)", title)
    return m.group(1) if m else "?"


def recount(text: str) -> list[dict]:
    """One row per entry that carries predictions with verdicts."""
    rows = []
    all_entries = list(entries(text))
    for date, title, body in all_entries:
        bs = bullets(body)
        preds = [b for b in bs if b.startswith("Predictions")]
        verdicts: dict[int, str] = {}
        if title.startswith("Session 1, plan"):
            continue  # the hypotheses themselves; their verdicts are in the results entry
        if any(HYPOTHESIS.match(b) for b in bs):
            # Milestone 1: hypotheses H1..Hk planned in the session-1 entry.
            plan = next(bd for d, t, bd in all_entries if t.startswith("Session 1, plan"))
            n = len(PLANNED_H.findall(plan))
            for b in bs:
                for k, v in HYPOTHESIS.findall(b):
                    verdicts[int(k)] = v
        elif preds:
            n = max(int(k) for k in re.findall(r"\((\d+)\)", preds[0]))
            tail = [b for b in bs if b.lstrip("*").lower().startswith("outcome")] + preds[1:]
            for b in tail:
                for k, v in NUMBERED.findall(b) + UNBOLDED.findall(b):
                    verdicts.setdefault(int(k), v)
        else:
            continue
        if not verdicts:
            raise SystemExit(f"{date} {title[:60]}: predictions but no verdicts found")
        if sorted(verdicts) != list(range(1, n + 1)):
            raise SystemExit(f"{date} {title[:60]}: {n} predictions, verdicts for {sorted(verdicts)}")
        counts = Counter()
        for k in sorted(verdicts):
            phrase = verdicts[k].strip().lower()
            if phrase not in VERDICTS:
                raise SystemExit(f"{date} ({k}): unclassified verdict {verdicts[k]!r}; add it to VERDICTS")
            counts[VERDICTS[phrase]] += 1
        rows.append({
            "date": date, "milestone": milestone(title), "title": title, "n": n,
            "held": counts["held"], "partly": counts["partly"], "refuted": counts["refuted"],
            "verdicts": [verdicts[k] for k in sorted(verdicts)],
        })
    return rows


def key(r: dict) -> tuple:
    return (r["date"], r["n"], r["held"], r["partly"], r["refuted"])


def draft_rows(draft: str) -> tuple[list[tuple], list[tuple]]:
    """Body rows (date, n, held, partly, refuted) and bold total rows of Section 11's table."""
    sec = draft.split("## 11. Pre-registration record", 1)[1].split("\n## ", 1)[0]
    body, totals = [], []
    for line in sec.splitlines():
        cells = [c.strip().strip("*") for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or not cells[2].isdigit():
            continue
        nums = tuple(int(c) for c in cells[2:6])
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", cells[1]):
            body.append((cells[1], *nums))
        else:
            totals.append((cells[0], *nums))
    return body, totals


def check(rows: list[dict], draft: str) -> list[str]:
    body, totals = draft_rows(draft)
    errs = []
    want, have = Counter(key(r) for r in rows), Counter(body)
    for k in want - have:
        errs.append(f"LOG.md row missing or different in the draft: {k}")
    for k in have - want:
        errs.append(f"draft row not supported by LOG.md: {k}")

    def tot(rs):
        return tuple(sum(r[f] for r in rs) for f in ("n", "held", "partly", "refuted"))

    late = [r for r in rows if r["milestone"] in "56"]
    early = [r for r in rows if r["milestone"] in "123"]
    expect = {"milestones 5 and 6": tot(late), "milestones 1 to 3": tot(early), "total": tot(rows)}
    for label, *nums in totals:
        lab = label.lower()
        if lab not in expect:
            errs.append(f"unknown total row {label!r}")
        elif tuple(nums) != expect[lab]:
            errs.append(f"{label}: draft {tuple(nums)}, LOG.md {expect[lab]}")
    for lab in expect:
        if lab not in {t[0].lower() for t in totals}:
            errs.append(f"draft has no {lab!r} row")
    return errs


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="compare with draft.md Section 11")
    a = ap.parse_args(argv)
    rows = recount(LOG.read_text(encoding="utf-8"))
    if a.check:
        errs = check(rows, DRAFT.read_text(encoding="utf-8"))
        for e in errs:
            print("MISMATCH", e)
        print("ok" if not errs else f"{len(errs)} mismatch(es)")
        return 1 if errs else 0
    print("| milestone | log entry | predictions | held | partly held | refuted | verdicts as written |")
    print("|---|---|---:|---:|---:|---:|---|")
    for r in sorted(rows, key=lambda r: (r["milestone"], r["date"])):
        print(f"| {r['milestone']} | {r['date']} | {r['n']} | {r['held']} | {r['partly']} | "
              f"{r['refuted']} | {'; '.join(r['verdicts'])} |")
    t = [sum(r[f] for r in rows) for f in ("n", "held", "partly", "refuted")]
    print(f"| **total** | | **{t[0]}** | **{t[1]}** | **{t[2]}** | **{t[3]}** | |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
