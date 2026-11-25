#!/usr/bin/env python3
"""Detailed quality metrics over the audit corpus, and the routine parts of the quality track.

quality_audit.py answers "what share meets the bar?". This module answers the
questions that come next, so a session can spend its time on judgment:

  - which gate a subject fails on (claims? verification? correctness?);
  - what kind of defect auditors find, and at which process stage it would
    have been prevented (a keyword taxonomy, checked against hand labels in
    portfolio/quality/taxonomy-labels.json, with the agreement reported);
  - whether defects get fixed or reappear in the next audit of the subject;
  - how often a seeded mutation survives the subject's own tests;
  - how much of the repository has ever been audited, and how long a full
    pass would take at the current pace;
  - which mode the next quality session should run (sample, census, fix,
    reflect), and the open-defect queue a fix session works from.

    python3 platform/ci/quality_audit.py metrics [--md]
    python3 platform/ci/quality_audit.py coverage
    python3 platform/ci/quality_audit.py census [--n 6] [--seed <date>]
    python3 platform/ci/quality_audit.py queue [--severity high] [--limit 30] [--no-git] [--no-prs] [--seed S | --oldest-first]   # flags subjects changed since audit or named by an open PR; shuffles subjects per session
    python3 platform/ci/quality_audit.py mode [--date <date>]

Standard library only. Tests: platform/ci/test_quality_metrics.py.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import random
import re
import statistics
import time
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LABELS = ROOT / "portfolio" / "quality" / "taxonomy-labels.json"
REFLECTIONS = ROOT / "portfolio" / "quality" / "reflections"

DIMENSIONS = ("correctness", "completeness", "verification", "craft", "claims", "fitness", "domain")
GATES = ("correctness", "claims", "verification")
BAR = 3

# --- defect taxonomy ----------------------------------------------------------
#
# Each category names a kind of defect and the process stage that should have
# stopped it. Rules run in order; the first match wins. An audit can set
# `category` and `origin` on a defect itself (the schema for audits from
# 2026-11-11 asks for them); those win over the rules. Keep the rules in step
# with taxonomy-labels.json: `metrics` reports how often they agree.

ORIGINS = {
    "spec": "deciding what to build: the domain rule, source data and scope",
    "design": "research design: baseline, confounds, prior work",
    "implementation": "writing the code",
    "tests": "writing tests that would catch a wrong number",
    "build": "building and running the thing that ships",
    "claims": "writing the README, page and headline",
    "maintenance": "keeping docs current after later changes",
    "audit": "the audit itself (not a defect in the subject)",
}

CATEGORIES: list[tuple[str, str, str]] = [
    # (category, origin, regex over the defect text, case-insensitive)
    ("source-only", "audit",
     r"(llms\.txt|sitemap(\.xml)?|canonical|robots(\.txt)?)[^.;]*(github\.io|retired|old (github|address|host)|superseded|relative|example\.invalid|workers\.dev)"
     r"|(github\.io|retired (github )?pages? host|old github\.io)[^.;]*(llms|sitemap|canonical)"),
    ("tests-check-a-copy", "tests",
     r"copy (of|inside) [^.;]*test|test[^.;]*(copy|re-?implement)|re-?implements it|fake\w*[^.;]*re-?implement"
     r"|does not exercise the (code|function) that"),
    ("not-built-or-run", "build",
     r"never (been )?(compiled|run|rendered|built)\b|not installed|no console script|cannot be (built|installed)"),
    ("untested-core", "tests",
     r"mutat|surviv|untested|unpinned|no test|tests? (do|does|would) not|test gap|pins? no|never (exercise|execute)"
     r"|not (guarded|pinned|covered)|no independent oracle|vacuous|(left|leaves?|leaving) (all|every) [^.;]*(green|pass)"
     r"|(only|single) (one )?(unit )?test|protected by a single|guarded by one|tests? (are )?(loose|example-based)"),
    ("stale-docs", "maintenance",
     r"stale|out of date|no longer|(says|states) \d+ tests|there are \d+|now has \d+|retired|superseded|run[- ]log|still says"
     r"|old address|was deleted|deleted on|(docstring|readme) says '?about|says ~"),
    ("research-design", "design",
     r"novelt|prior (art|work)|textbook|literature|related[- ]work|no references|cites? (no|only)|not cited|confound"
     r"|baseline|by construction|like-for-like|synthetic|toy|independent anchor|infeasible|not physically"
     r"|rigorous|worst case|best case|lower bounds? of|geometry of|single seed|confidence intervals?|biased|weak evidence"
     r"|single fixed split|no spread|search cap|not an optimum|checked only at|true only for"),
    ("source-data", "spec",
     r"rate card|invented|live page|price list|round numbers|unsourced|no source|could be fetched|look[s]? [^.;]*below typical"
     r"|stale against|approximation|uncited|round figures|no datasheet|high end of|not shown to be a real"),
    ("overclaim", "claims",
     r"claim|headline|contradict|promis|overstat|unbacked|not backed|no file backs|false\b|rounds? [^.;]* up"
     r"|counted as a win|probably wrong|says [^.;]* but|exceed|does not say|do not say"),
    ("domain-rule", "spec",
     r"\bpub(lication)? \d|\birs\b|\brfc\b|statut|chrome's|sitemaps?\.org|sitemap protocol|\birc\b|\bnds\b|\bncci\b"
     r"|section 179|per (the )?(spec|standard|docs)|standard (is|method)|is the standard|conflicts with|departs from"),
    ("input-handling", "implementation",
     r"pars|comma|quot(ed|ing)|blank|non-numeric|silently|crash|throws|traceback|\bnan\b|undefined|input validation"
     r"|no validation|locale|month-first|zerodivision|typeerror|rangeerror|regex|render[s]? broken|as raw strings"
     r"|flags any|hang|loop forever"),
    ("code-craft", "implementation",
     r"dead code|unused|duplicat|copied|monolith|vendored|sys\.path|one-liner|repeats|\d+-line|differ from [^.;]*defaults"
     r"|kb of|templated"),
    ("scope-gap", "spec",
     r"^no |^only |not modell|cannot be modelled|omits|\bno [a-z-]+ (input|cost|line|route)|single blended|only \d+ "
     r"|can only be reached|is percent only|supports only|ignores|not implemented|is not in|left open|single-stage"),
    ("logic-error", "implementation",
     r"instead of|is awarded|counts every|uses? [^.;]* for all|applied to|charged on|wrong|still pays|auto-confirmed"
     r"|records every|measured before|rounding|never cross-checked"),
    ("repo-hygiene", "build",
     r"unrelated pr|\|\| true|fresh checkout|no requirements\.txt|cannot be installed|undeclared|pythonpath|hides? [^.;]*failures"),
]
_COMPILED = [(c, o, re.compile(rx, re.I)) for c, o, rx in CATEGORIES]
ORIGIN_OF = {c: o for c, o, _ in CATEGORIES} | {"other": "audit"}
REPEAT_RX = re.compile(r"unchanged|unfixed|not fixed|carried over|re-?confirmed|still |third audit|again|earlier (audit|round)s?|in a row", re.I)


def classify(defect: dict) -> tuple[str, str, str]:
    """(category, origin, how) for one defect; `how` is 'audit' when the auditor set it, else 'rule'."""
    if defect.get("category"):
        cat = defect["category"]
        return cat, defect.get("origin") or ORIGIN_OF.get(cat, "audit"), "audit"
    text = " ".join(str(defect.get(k, "")) for k in ("what", "where"))
    for cat, origin, rx in _COMPILED:
        if rx.search(text):
            return cat, origin, "rule"
    return "other", "audit", "rule"


def defect_fixed(a: dict, d: dict) -> bool:
    """Whether defect `d` of audit `a` has a recorded fix. A defect's own `fixed_by` (a PR URL) answers per defect;
    once any defect of the audit carries one, the others are open until they do. An audit with no `fixed_by` on any
    defect keeps the older reading: a non-empty `fix_prs` closes every defect. That older reading hid partial fixes:
    PR #15848 fixed one of three medium defects in home-inspection-report-builder and the other two left the queue."""
    if d.get("fixed_by"):
        return True
    if any(x.get("fixed_by") for x in a.get("defects") or []):
        return False
    return bool(a.get("fix_prs"))


def defect_rows(audits: list[dict]) -> list[dict]:
    rows = []
    for a in audits:
        for i, d in enumerate(a.get("defects") or []):
            cat, origin, how = classify(d)
            rows.append({"key": f"{a['_file']}#{i}", "file": a["_file"], "subject": a.get("subject"),
                         "stratum": a.get("stratum"), "date": a.get("date"), "severity": d.get("severity"),
                         "what": d.get("what", ""), "category": cat, "origin": origin, "how": how,
                         "fixed": defect_fixed(a, d)})
    return rows


def label_agreement(rows: list[dict], path: Path = LABELS) -> dict:
    if not path.exists():
        return {"n": 0}
    labels = json.loads(path.read_text()).get("labels", {})
    by_key = {r["key"]: r for r in rows}
    pairs = [(lab, by_key[k]["category"]) for k, lab in labels.items() if k in by_key]
    agree = sum(a == b for a, b in pairs)
    confusions = Counter(f"{a} -> {b}" for a, b in pairs if a != b)
    return {"n": len(pairs), "agree": agree, "share": round(agree / len(pairs), 3) if pairs else None,
            "confusions": dict(confusions.most_common(8)), "labelled_share": dict(Counter(a for a, _ in pairs))}


# --- per-audit signals --------------------------------------------------------

MUT_RX = re.compile(r"mutat|seeded", re.I)
SURVIVED_RX = re.compile(r"surviv|(left|leaves?|leaving|kept) (all|every)[^.;]*(green|pass)|(pass|passed|passes) all|not caught|uncaught|still pass", re.I)
CAUGHT_RX = re.compile(r"caught|failed|failures?\b|went red|detected|tests? fail", re.I)
COMMAND_RX = re.compile(r"`[^`]{3,}`|python3? |node |pytest|npm |cargo |go test|curl |ran |re-?ran|reproduced", re.I)


def mutation_outcome(a: dict) -> str:
    """'survived' when any seeded mutation outlived the tests, 'caught' when mutations were seeded and all failed a
    test, 'unknown' otherwise. Structured `mutations` (schema from 2026-11-11) win over the text."""
    muts = a.get("mutations")
    if isinstance(muts, list) and muts:
        return "survived" if any(not m.get("caught") for m in muts) else "caught"
    ev = (a.get("evidence") or {}).get("verification", "")
    texts = [ev] + [d.get("what", "") for d in a.get("defects") or []]
    seeded = [t for t in texts if MUT_RX.search(t)]
    if not seeded:
        return "unknown"
    if any(SURVIVED_RX.search(t) for t in seeded):
        return "survived"
    return "caught" if any(CAUGHT_RX.search(t) for t in seeded) else "unknown"


def evidence_detail(a: dict) -> dict:
    ev = a.get("evidence") or {}
    lens = [len(str(ev.get(d, ""))) for d in DIMENSIONS]
    with_cmd = sum(bool(COMMAND_RX.search(str(ev.get(d, "")))) for d in DIMENSIONS)
    return {"chars": sum(lens), "dims_with_command": with_cmd,
            "checks": len(a.get("checks") or []), "mutations": len(a.get("mutations") or [])}


def _tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9_.]{4,}", s.lower())}


def jaccard(a: str, b: str) -> float:
    x, y = _tokens(a), _tokens(b)
    return len(x & y) / len(x | y) if x and y else 0.0


def persistence(audits: list[dict], threshold: float = 0.3) -> dict:
    """For subjects audited more than once: of the earlier audit's defects, how many reappear in the next one."""
    by_subject: dict[str, list[dict]] = defaultdict(list)
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        if a.get("status") == "audited":
            by_subject[a["subject"]].append(a)
    pairs = earlier_n = repeated = said_unchanged = 0
    examples = []
    for subj, seq in by_subject.items():
        for prev, nxt in zip(seq, seq[1:]):
            pairs += 1
            for d in prev.get("defects") or []:
                earlier_n += 1
                hit = max((jaccard(d.get("what", ""), e.get("what", "")) for e in nxt.get("defects") or []), default=0)
                if hit >= threshold:
                    repeated += 1
                    if len(examples) < 5:
                        examples.append(f"{subj}: {d.get('what', '')[:110]}")
            said_unchanged += sum(bool(REPEAT_RX.search(e.get("what", ""))) for e in nxt.get("defects") or [])
    return {"subjects_reaudited": sum(len(s) > 1 for s in by_subject.values()), "pairs": pairs,
            "earlier_defects": earlier_n, "reappeared": repeated,
            "share": round(repeated / earlier_n, 3) if earlier_n else None,
            "later_defects_saying_unchanged": said_unchanged, "examples": examples}


def agreement(audits: list[dict], meets_bar, max_gap_days: int = 2) -> dict:
    """Score agreement between consecutive audits of one subject, no fix recorded between them and at most
    `max_gap_days` apart: a floor on how reproducible a score is. Later auditors can read the earlier file, so
    agreement here is an upper bound on independent agreement; same-day pairs (gap 0) are the closest to blind."""
    by_subject: dict[str, list[dict]] = defaultdict(list)
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        if a.get("status") == "audited":
            by_subject[a["subject"]].append(a)
    out = {}
    for label, gaps in (("same_day", (0,)), ("within_2_days", tuple(range(max_gap_days + 1)))):
        pairs = []
        for seq in by_subject.values():
            for x, y in zip(seq, seq[1:]):
                gap = (dt.date.fromisoformat(y["date"]) - dt.date.fromisoformat(x["date"])).days
                if gap in gaps and not x.get("fix_prs"):
                    pairs.append((x, y))
        cells = [(x["scores"][d], y["scores"][d]) for x, y in pairs for d in DIMENSIONS]
        out[label] = {"pairs": len(pairs), "cells": len(cells),
                      "exact": sum(p == q for p, q in cells), "within_one": sum(abs(p - q) <= 1 for p, q in cells),
                      "bar_verdict_agrees": sum(meets_bar(x["scores"]) == meets_bar(y["scores"]) for x, y in pairs)}
    return out


# --- coverage of the whole repository -------------------------------------------

def coverage(audits: list[dict], pop: dict[str, list[str]], today: dt.date, skip_days: int = 90) -> dict:
    last: dict[str, str] = {}
    for a in audits:
        s, d = a.get("subject"), a.get("date", "")
        if s and d > last.get(s, ""):
            last[s] = d
    cutoff = (today - dt.timedelta(days=skip_days)).isoformat()
    out = {}
    seen: set[str] = set()
    for stratum in ("venture", "research", "platform"):
        subjects = pop.get(stratum, [])
        ever = [s for s in subjects if s in last]
        recent = [s for s in ever if last[s] >= cutoff]
        seen |= set(subjects)
        out[stratum] = {"population": len(subjects), "audited_ever": len(ever), "audited_recently": len(recent),
                        "share_ever": round(len(ever) / len(subjects), 3) if subjects else None}
    dates = sorted({a["date"] for a in audits if a.get("date")})
    total = len(seen)
    done = sum(1 for s in seen if s in last)
    days = (dt.date.fromisoformat(dates[-1]) - dt.date.fromisoformat(dates[0])).days + 1 if dates else 0
    pace = done / days if days else 0.0
    out["all"] = {"population": total, "audited_ever": done, "share_ever": round(done / total, 3) if total else None,
                  "days_of_audits": days, "subjects_per_day": round(pace, 1),
                  "days_to_first_full_pass": round((total - done) / pace) if pace else None}
    return out


def census(audits: list[dict], pop: dict[str, list[str]], n: int, seed: str) -> list[dict]:
    """The full-repository sweep: never-audited subjects first, then the least recently audited, across every
    stratum in proportion to its size; ties broken by a hash of the seed so parallel sessions spread out."""
    last: dict[str, str] = {}
    for a in audits:
        if a.get("subject") and a.get("date", "") > last.get(a["subject"], ""):
            last[a["subject"]] = a["date"]
    flag = set(pop.get("flagship", []))
    pool = [(st, s) for st in ("venture", "research", "platform") for s in pop.get(st, []) if s not in flag]
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))
    rng.shuffle(pool)
    pool.sort(key=lambda p: last.get(p[1], ""))  # stable: never-audited ("") first, shuffled within a date
    return [{"stratum": st, "subject": s, "last_audited": last.get(s)} for st, s in pool[:n]]


def census_free(audits: list[dict], pop: dict[str, list[str]], n: int, seed: str,
                prs: list[tuple[int, str]]) -> tuple[list[dict], list[tuple[str, list[tuple[int, str]]]]]:
    """census(), passing over subjects an open PR title already names, so a second session on the
    same day does not audit what the first is auditing: census had no claim check, unlike sample and
    queue (run-record doc_friction on quality_audit.py, 2026-11-15T07:08). Returns (picks, skipped)."""
    ranked = census(audits, pop, sum(len(v) for v in pop.values()), seed)
    picks, skipped = [], []
    for p in ranked:
        if len(picks) >= n:
            break
        naming = prs_naming(p["subject"], prs)
        if naming:
            skipped.append((p["subject"], naming))
        else:
            picks.append(p)
    return picks, skipped


# --- the open-defect queue ---------------------------------------------------------

SEV_RANK = {"high": 0, "medium": 1, "low": 2}


def queue(audits: list[dict], severity: str = "medium", seed: str | None = None) -> list[dict]:
    """Defects from each subject's latest audit that no fix PR is recorded against (`defect_fixed`), worst first.
    Source-only defects (fixed by the build at deploy) are left out.

    With `seed`, subjects within a severity come in a seeded shuffle (a subject's defects stay together, in
    index order) instead of oldest audit first: two fix sessions that started the same minute both took the
    top medium row, research/sequential-slashing, before either had a PR to see (run-record doc_friction on
    quality_audit.py, 2026-11-16T16:41). sample and census already add a random seed tail for this race."""
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        latest[a["subject"]] = a
    out = []
    for a in latest.values():
        for i, d in enumerate(a.get("defects") or []):
            if defect_fixed(a, d):
                continue
            cat, origin, _ = classify(d)
            if cat == "source-only" or SEV_RANK.get(d.get("severity"), 3) > SEV_RANK[severity]:
                continue
            out.append({"severity": d["severity"], "subject": a["subject"], "audit": a["_file"], "index": i,
                        "category": cat, "what": d.get("what", ""), "where": d.get("where", "")})
    if seed is None:
        out.sort(key=lambda r: (SEV_RANK[r["severity"]], r["audit"], r["index"]))
        return out
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))
    subjects = sorted({r["subject"] for r in out})
    rng.shuffle(subjects)
    place = {s: i for i, s in enumerate(subjects)}
    out.sort(key=lambda r: (SEV_RANK[r["severity"]], place[r["subject"]], r["index"]))
    return out


def unmarked_fixes(audits: list[dict], severity: str = "medium") -> list[dict]:
    """Latest audits whose `fix_prs` closes two or more defects at `severity` or worse with no `fixed_by` on any:
    the whole-audit reading hides them all, though a fix PR may have closed only some (PR #15848 closed one of
    three). Counted so the queue can say how much it cannot see; set `fixed_by` per defect to bring the rest back."""
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        latest[a["subject"]] = a
    out = []
    for a in latest.values():
        ds = a.get("defects") or []
        if not a.get("fix_prs") or any(d.get("fixed_by") for d in ds):
            continue
        if sum(SEV_RANK.get(d.get("severity"), 3) <= SEV_RANK[severity] for d in ds) >= 2:
            out.append(a)
    return out


OPEN_RX = re.compile(r"known gaps?|not yet fixed|still open|unfixed|open defects", re.I)


def documented_open(a: dict, root: Path = ROOT) -> bool:
    """Whether the subject's README names this audit file next to "known gaps" or "not yet fixed": the round's PR
    wrote the defects down as open, and listing that PR in `fix_prs` then counted them all as fixed. On
    2026-11-17, 56 of 186 such latest audits read this way, 49 high defects among them; gig-driver-net-pay-
    calculator's missing depreciation and verifier-bribery's threshold were two (reflection 2)."""
    readme = root / a.get("subject", "") / "README.md"
    try:
        text = readme.read_text(errors="ignore")
    except OSError:
        return False
    return a.get("_file", "") in text and bool(OPEN_RX.search(text))


def reaudit_due(audits: list[dict], seed: str | None = None, root: Path = ROOT) -> list[dict]:
    """Subjects whose latest audit records a fix (a `fix_prs` entry or a defect's `fixed_by`) that no later audit
    has checked: the "a later round re-audits" step of the fix loop. Nothing scheduled it before 2026-11-17, and
    sample and census skip a subject audited in the last 90 days, so 250 audits with fix PRs had no re-audit
    (reflection 2, portfolio/quality/reflections/2026-11-17-the-fix-loop-is-open.md). Subjects whose recorded
    fixes include a high-severity defect come first, then the oldest audit; with `seed`, subjects are shuffled
    within those two groups so parallel sessions spread out (as `queue` does). Subjects whose README still lists the
    audit's defects as open (`documented_open`) and that hold a high go first of all."""
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        latest[a["subject"]] = a
    out = []
    for a in latest.values():
        ds = a.get("defects") or []
        if a.get("status") != "audited" or not (a.get("fix_prs") or any(d.get("fixed_by") for d in ds)):
            continue
        fixed = [d for d in ds if defect_fixed(a, d)]
        out.append({"subject": a["subject"], "audit": a["_file"], "date": a.get("date", ""),
                    "fix_prs": list(a.get("fix_prs") or []), "defects": len(ds), "fixed": len(fixed),
                    "explicit": sum(bool(d.get("fixed_by")) for d in ds),
                    "high_fixed": sum(d.get("severity") == "high" for d in fixed),
                    "documented_open": documented_open(a, root)})
    rank = {}
    if seed is not None:
        rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))
        subjects = sorted(r["subject"] for r in out)
        rng.shuffle(subjects)
        rank = {s: i for i, s in enumerate(subjects)}
    # Within each group, audits whose fixes are only assumed (a fix PR listed, no `fixed_by`) come before marked ones:
    # on the nine re-audits of 2026-11-21, 25 of 29 marked defects were closed but only 11 of 27 assumed ones
    # (reflection 3, portfolio/quality/reflections/2026-11-24-the-blanket-rule-is-mostly-wrong.md).
    out.sort(key=lambda r: (not (r["documented_open"] and r["high_fixed"]), r["high_fixed"] == 0, r["explicit"] > 0,
                            rank.get(r["subject"], 0), r["date"], r["subject"]))
    return out


REAUDIT_STATUSES = ("closed", "partial", "open")
REAUDIT_BASES = ("marked", "assumed", "open")


def reaudit_outcomes(audits: list[dict]) -> dict:
    """What re-audits found when they re-checked an earlier audit's defects, by how the earlier record counted each
    one (`basis`: "marked" with its own `fixed_by`, "assumed" fixed by the blanket `fix_prs` reading, or "open"),
    against its state when the re-auditor arrived (`status`, before any fix the re-audit's own PR made). This is the
    error rate of `defect_fixed`: reflection 2 could only spot-check it; from 2026-11-24 every re-audit records it."""
    table = {b: {s: 0 for s in REAUDIT_STATUSES} for b in REAUDIT_BASES}
    high = {b: {s: 0 for s in REAUDIT_STATUSES} for b in REAUDIT_BASES}
    files = 0
    for a in audits:
        rows = [r for r in (a.get("prior_defects") or [])
                if r.get("basis") in REAUDIT_BASES and r.get("status") in REAUDIT_STATUSES]
        if not rows:
            continue
        files += 1
        for r in rows:
            table[r["basis"]][r["status"]] += 1
            if r.get("severity") == "high":
                high[r["basis"]][r["status"]] += 1
    return {"files": files, "by_basis": table, "high_by_basis": high}


def mutation_kill(audits: list[dict]) -> dict:
    """Per-mutation outcome over structured `mutations` rows. The per-audit share ("at least one survived")
    saturates once auditors seed several mutants each: 193 of 196 structured audits had a survivor on 2026-11-17,
    at about six mutants an audit, so it can no longer move. The kill rate per mutant can."""
    rows = [m for a in audits if a.get("status") == "audited" for m in (a.get("mutations") or [])]
    killed = sum(bool(m.get("caught")) for m in rows)
    n_audits = sum(bool(a.get("mutations")) for a in audits if a.get("status") == "audited")
    return {"mutants": len(rows), "killed": killed, "audits": n_audits,
            "kill_rate": round(killed / len(rows), 3) if rows else None,
            "per_audit": round(len(rows) / n_audits, 1) if n_audits else None}


def fix_confirmation(audits: list[dict]) -> dict:
    """How defects come to count as fixed in the latest audits: marked one by one (`fixed_by`), or assumed because
    the audit lists a fix PR and no defect is marked (`defect_fixed`'s older reading), and how many of the
    subjects with a recorded fix a later audit has re-checked."""
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        latest[a["subject"]] = a
    explicit = assumed = open_ = 0
    for a in latest.values():
        ds = a.get("defects") or []
        any_marked = any(d.get("fixed_by") for d in ds)
        for d in ds:
            if d.get("fixed_by"):
                explicit += 1
            elif not any_marked and a.get("fix_prs"):
                assumed += 1
            else:
                open_ += 1
    by_subject: dict[str, list[dict]] = defaultdict(list)
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        if a.get("status") == "audited":
            by_subject[a["subject"]].append(a)
    rechecked = sum(any(x.get("fix_prs") for x in seq[:-1]) for seq in by_subject.values() if len(seq) > 1)
    due = reaudit_due(audits)
    return {"explicit": explicit, "assumed": assumed, "open": open_,
            "rechecked_after_fix": rechecked, "awaiting_recheck": len(due),
            "documented_open": sum(r["documented_open"] for r in due)}


def bar_by_instrument(audits: list[dict], meets_bar) -> dict:
    """The sampled share meeting the bar, split by whether the audit carries structured `mutations` (required from
    2026-11-11). The two halves were measured differently, so a drop across the boundary is not by itself a fall
    in the work's quality."""
    out = {}
    for label, structured in (("prose", False), ("structured", True)):
        xs = [a for a in audits if a.get("status") == "audited" and a.get("stratum") in ("venture", "research", "platform")
              and a.get("drawn_by", "sample") == "sample" and bool(a.get("mutations")) == structured]
        out[label] = {"n": len(xs), "meets_bar": sum(meets_bar(a["scores"]) for a in xs)}
    return out

def _git(args: list[str], root: Path = ROOT) -> str:
    import subprocess
    try:
        r = subprocess.run(["git", *args], capture_output=True, text=True, timeout=30, cwd=root)
        return r.stdout if r.returncode == 0 else ""
    except Exception:
        return ""


def _shallow_boundary(git=_git) -> set[str]:
    shallow_path = git(["rev-parse", "--git-path", "shallow"]).strip()
    if not shallow_path:
        return set()
    p = Path(shallow_path)
    if not p.is_absolute():
        p = ROOT / p
    try:
        return set(p.read_text().split())
    except OSError:
        return set()


def _ref(git=_git) -> str:
    return "origin/main" if git(["rev-parse", "--verify", "-q", "origin/main"]).strip() else "HEAD"


def _boundary_dates(git=_git, ref: str | None = None, boundary: set[str] | None = None) -> list[str]:
    """Commit dates of the shallow boundaries `ref` can reach. .git/shallow also lists the boundaries of
    other shallow fetches: prompt.md step 0 fetches the security-alerts branch, whose boundary is a commit
    from the same morning, so before 2026-11-25 every queue row read "history starts <today>" and
    "unknown" even right after a successful deepen to the oldest audit (run-record doc_friction on
    quality_audit.py, 2026-11-25, twice; friction_rank.py had the same fix)."""
    ref = ref or _ref(git)
    boundary = _shallow_boundary(git) if boundary is None else boundary
    dates = [git(["log", "-1", "--format=%cs", b]).strip() for b in sorted(boundary)
             if git(["merge-base", b, ref]).strip() == b]
    return [d for d in dates if d]


def history_start(git=_git) -> str | None:
    """Commit date (YYYY-MM-DD) where a shallow clone's history of main begins, or None when it is complete."""
    dates = _boundary_dates(git)
    return max(dates) if dates else None


# A shallow-since fetch back to an audit a week old took 20 s in a cloud session (2026-11-14); older
# audits mean bigger packs, so past this age the queue says what to fetch instead of fetching it.
FETCH_MAX_DAYS = 30
FETCH_TIMEOUT_S = 90


def deepen_for(oldest: str, today: dt.date, git=_git, git_run=None) -> str:
    """Fetch origin/main back to `oldest` when a shallow clone starts after it, so `changes_since`
    can answer instead of printing "unknown" for every row (run-record doc_friction on this file,
    2026-11-14T01:16 and 03:25: every queued high defect came out unknown on a cloud clone, and a
    fix run searched open PRs by hand to learn one was already fixed). Returns a note for stderr,
    or "" when nothing was needed."""
    import subprocess
    start = history_start(git)
    if not start or start <= oldest:
        return ""
    if (today - dt.date.fromisoformat(oldest)).days > FETCH_MAX_DAYS:
        return (f"(shallow clone starts {start}; oldest audit {oldest} is over {FETCH_MAX_DAYS} days old, "
                f"so not fetching: run `git fetch --shallow-since={oldest} origin main` in the background)")
    cmd = ["git", "fetch", "-q", f"--shallow-since={oldest}", "origin", "main"]

    def default_run(c):
        # shallow_repair drops the bogus .git/shallow entry an earlier --shallow-since fetch can
        # leave; without it this fetch failed every time in a clone that had run one (2026-11-14).
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import shallow_repair
        return shallow_repair.fetch(c[2:], cwd=ROOT, timeout=FETCH_TIMEOUT_S).returncode
    run = git_run or default_run
    try:
        ok = run(cmd) == 0
    except (OSError, subprocess.SubprocessError):
        ok = False
    if ok:
        return f"(shallow clone started {start}: fetched main since {oldest} to check changes since each audit)"
    return f"(fetch of main since {oldest} failed or exceeded {FETCH_TIMEOUT_S}s; rows below may say unknown)"


def changes_since(subject: str, date: str, git=_git, audit_path: str | None = None) -> dict:
    """Commits under `subject` since its audit `date`, so a fix session can tell a defect that may already be fixed
    (with no fix_prs recorded) from one nobody touched. On 2026-11-11 a fix run found PR #14327 had fixed a queued
    high defect without recording it. Fail-soft: no git gives status "unknown". Shallow clones: the boundary commit
    looks as if it touches every path, so it is dropped, and a history that starts after the audit date is reported
    as "unknown" with the fetch that would answer it.
    Audit-round commits are kept: they only appear when they touched the subject itself, and round 30 (#14329)
    shipped a photo-editing page fix that way.
    The audit's own commit is not a change since the audit: given `audit_path`, the log starts after the commit that
    added that file. Before this, every queued row of a census day pointed at the census commit itself, which edits
    the subject's README (process run 2026-11-18T18:52 and #17455: 14 of 15 shown rows were that commit)."""
    ref = _ref(git)
    boundary = _shallow_boundary(git)
    if boundary:
        dates = _boundary_dates(git, ref, boundary)
        if dates and max(dates) > date:
            return {"status": "unknown", "commits": [],
                    "why": f"history starts {max(dates)}; git fetch --shallow-since={date} origin main"}
    own = ""
    if audit_path:
        added = git(["log", "--diff-filter=A", "--format=%H", ref, "--", audit_path]).split()
        own = added[-1] if added else ""
    span = [f"{own}..{ref}"] if own else [ref, f"--since={date} 00:00"]
    out = git(["log", *span, "--format=%H%x09%h%x09%s", "--", subject])
    if not out and not git(["rev-parse", "--verify", "-q", ref]).strip():
        return {"status": "unknown", "commits": [], "why": "no git history"}
    commits = []
    for line in out.splitlines():
        full, short, title = (line.split("\t", 2) + ["", ""])[:3]
        if full in boundary:
            continue
        commits.append({"sha": short, "title": title})
    return {"status": "changed" if commits else "untouched", "commits": commits}


# --- open PRs that already name a queued subject -------------------------------------

def _rest_open_prs() -> list[dict] | None:
    """The REST pulls list via portfolio/router/claim_check.py, or None if unreadable."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "portfolio" / "router"))
    try:
        from claim_check import open_prs
    except ImportError:
        return None
    return open_prs()


def open_pr_titles(timeout: int = 20, pages: int = 3, run=None, pulls=None) -> list[tuple[int, str]] | None:
    """(number, title) of open PRs in this repository, newest first, or None when the search failed.

    The queue only knew fix PRs recorded in an audit's fix_prs, which happens at merge. Two fix
    sessions took the same high defect (osrobot-pairprice) minutes apart on 2026-11-14, and two more
    runs that day saw platform/agents listed as unfixed while PR #14674 sat open (run-record
    doc_friction on this file and on duplicate-work.md). One `gh api` search per 100 PRs; it works
    unauthenticated in cloud sessions.

    The REST pulls list is read first (unless a test passes `run`): the search index can lag a new
    PR by minutes (claim_check.py), and allocate.py missed 10- and 15-minute-old claims through it
    on 2026-11-15. Fork PRs are dropped there, as claim_check.decide does."""
    import subprocess

    if run is None:
        batch = (pulls or _rest_open_prs)()
        if batch is not None:
            own = "duncan-haywood/oss-monorepo"
            rows = [(int(p["number"]), str(p.get("title", ""))) for p in batch
                    if (((p.get("head") or {}).get("repo") or {}).get("full_name") or "").lower() == own]
            return sorted(rows, reverse=True)

    def default_run(page: int) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["gh", "api", "-X", "GET", "search/issues", "-f",
             "q=repo:duncan-haywood/oss-monorepo is:pr is:open", "-f", "sort=created", "-f", "order=desc",
             "-f", "per_page=100", "-f", f"page={page}", "--jq", '.items[] | "\\(.number)\\t\\(.title)"'],
            capture_output=True, text=True, timeout=timeout)
    run = run or default_run
    out: list[tuple[int, str]] = []
    for page in range(1, pages + 1):
        try:
            proc = run(page)
        except Exception:
            return out or None
        if proc.returncode != 0:
            return out or None
        lines = [l for l in proc.stdout.splitlines() if "\t" in l]
        for line in lines:
            num, title = line.split("\t", 1)
            if num.strip().isdigit():
                out.append((int(num), title))
        if len(lines) < 100:
            break
    return out


def subject_names(subject: str) -> list[str]:
    """Names a PR title would use for `subject`: the path itself, and its last part when that is
    specific enough to mean it (a slug with a hyphen, or 8+ characters; "agents" alone is not)."""
    names = [subject.rstrip("/")]
    last = names[0].rsplit("/", 1)[-1]
    if last != names[0] and ("-" in last or len(last) >= 8):
        names.append(last)
    return names


def prs_naming(subject: str, prs: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Open PRs whose title names `subject` (whole-word match on any of subject_names)."""
    pats = [re.compile(r"(?<![\w/-])" + re.escape(n) + r"(?![\w-])", re.I) for n in subject_names(subject)]
    return [(n, t) for n, t in prs if any(p.search(t) for p in pats)]


# --- which mode is due ----------------------------------------------------------------

MODES = {
    "sample": "the stratified random round (quality_audit.py sample): the unbiased share meeting the bar",
    "census": "the full-repository sweep (census): never-audited subjects first",
    "fix": "fix the open-defect queue (queue), with a regression test per fix; a later round re-audits (not this one)",
    "reaudit": "re-audit a subject whose recorded fix no later audit has checked (reaudit), in a new audit file",
    "reflect": "read the corpus (metrics) and the process, write a reflection with process fixes",
}
# reaudit took 0.10 from census on 2026-11-17 (reflection 2): no subject had been re-audited after a fix since
# 2026-11-10, so no recorded fix had been confirmed. It drops out of the draw when nothing awaits a re-check.
# Reaudit 0.10 -> 0.20 (sample 0.35 -> 0.30, census 0.20 -> 0.15) on 2026-11-24, reflection 3: the mode is drawn per
# day, so one reaudit day in ten re-checked 9 subjects while the backlog grew from 248 to 511, and the blanket
# "fixed" reading it resolves was right for only 11 of 27 defects re-checked.
MODE_WEIGHTS = {"sample": 0.30, "census": 0.15, "fix": 0.25, "reaudit": 0.20, "reflect": 0.10}
REFLECT_EVERY_DAYS = 7


def last_reflection(directory: Path = REFLECTIONS) -> str | None:
    if not directory.is_dir():
        return None
    dates = [m.group(1) for f in directory.glob("*.md") if (m := re.match(r"(\d{4}-\d{2}-\d{2})-", f.name))]
    return max(dates) if dates else None


def mode_for(date: str, seed: str | None = None, last_reflect: str | None = None, open_high: int = 0,
             reaudit_waiting: int | None = None) -> dict:
    """Software for the routine: which mode today's quality session runs. A reflection is forced when none has been
    written for a week; otherwise a seeded draw by MODE_WEIGHTS, with `fix` doubled while high defects are open."""
    day = dt.date.fromisoformat(date)
    if last_reflect is None or (day - dt.date.fromisoformat(last_reflect)).days >= REFLECT_EVERY_DAYS:
        return {"mode": "reflect", "why": f"no reflection in portfolio/quality/reflections/ since {last_reflect or 'ever'}"}
    weights = dict(MODE_WEIGHTS)
    if open_high:
        weights["fix"] *= 2
    if reaudit_waiting == 0:
        del weights["reaudit"]
    rng = random.Random(int(hashlib.sha256((seed or date).encode()).hexdigest()[:16], 16))
    pick = rng.random() * sum(weights.values())
    for mode, w in weights.items():
        pick -= w
        if pick < 0:
            break
    return {"mode": mode, "why": f"seeded draw over {weights} ({open_high} high defects open)"}


# --- the detailed metrics ------------------------------------------------------------

def metrics(audits: list[dict], pop: dict[str, list[str]], today: dt.date, meets_bar, wilson) -> dict:
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        latest[a["subject"]] = a
    rows = [a for a in latest.values() if a.get("status") == "audited"]
    failing = [a for a in rows if not meets_bar(a["scores"])]

    hist = {d: [sum(a["scores"][d] == v for a in rows) for v in range(5)] for d in DIMENSIONS}
    gate_fail = {g: sum(a["scores"][g] < BAR for a in failing) for g in GATES}
    only_gate = Counter()
    for a in failing:
        below = [g for g in GATES if a["scores"][g] < BAR]
        only_gate[below[0] if len(below) == 1 else ("none (median only)" if not below else "two or more")] += 1
    # One point short: subjects that would meet the bar if a single dimension rose by one.
    one_short = Counter()
    for a in failing:
        for d in DIMENSIONS:
            if a["scores"][d] < 4 and meets_bar({**a["scores"], d: a["scores"][d] + 1}):
                one_short[d] += 1

    drows = defect_rows(list(latest.values()))
    all_drows = defect_rows(audits)
    cats = Counter(r["category"] for r in drows)
    by_sev = defaultdict(Counter)
    for r in drows:
        by_sev[r["category"]][r["severity"]] += 1
    origins = Counter(r["origin"] for r in drows)
    by_stratum = defaultdict(Counter)
    for r in drows:
        by_stratum[r["stratum"]][r["category"]] += 1

    muts = Counter(mutation_outcome(a) for a in rows)
    known = muts["survived"] + muts["caught"]
    lo, hi = wilson(muts["survived"], known)
    ev = [evidence_detail(a) for a in rows]
    with_defects = [a for a in audits if a.get("defects")]
    high_open = sum(1 for r in queue(audits, "high"))

    weeks = defaultdict(lambda: {"n": 0, "meets_bar": 0})
    for a in audits:
        if a.get("status") == "audited":
            y, w, _ = dt.date.fromisoformat(a["date"]).isocalendar()
            weeks[f"{y}-W{w:02d}"]["n"] += 1
            weeks[f"{y}-W{w:02d}"]["meets_bar"] += meets_bar(a["scores"])

    return {
        "subjects": len(rows),
        "failing": len(failing),
        "score_histograms": hist,
        "gate_failures_among_failing": gate_fail,
        "single_binding_gate": dict(only_gate),
        "one_point_short": dict(one_short.most_common()),
        "defects": {"n": len(drows), "by_category": dict(cats.most_common()),
                    "by_category_severity": {c: dict(v) for c, v in by_sev.items()},
                    "by_origin": dict(origins.most_common()),
                    "by_stratum": {s: dict(v.most_common(5)) for s, v in by_stratum.items()},
                    "per_subject_median": statistics.median([len(a.get("defects") or []) for a in rows]) if rows else None,
                    "audit_set_category": sum(r["how"] == "audit" for r in all_drows),
                    "source_only_share": round(cats["source-only"] / len(drows), 3) if drows else None},
        "classifier": label_agreement(all_drows),
        "mutations": {"survived": muts["survived"], "caught": muts["caught"], "unknown": muts["unknown"],
                      "survival_rate": round(muts["survived"] / known, 3) if known else None,
                      "ci": [round(lo, 3), round(hi, 3)]},
        "mutation_kill": mutation_kill(audits),
        "reaudit_outcomes": reaudit_outcomes(audits),
        "fixes": {"audits_with_defects": len(with_defects),
                  "audits_with_fix_prs": sum(bool(a.get("fix_prs")) for a in with_defects),
                  "open_high_in_latest": high_open, **fix_confirmation(audits)},
        "bar_by_instrument": bar_by_instrument(audits, meets_bar),
        "persistence": persistence(audits),
        "agreement": agreement(audits, meets_bar),
        "evidence": {"median_chars": statistics.median(e["chars"] for e in ev) if ev else None,
                     "median_dims_quoting_a_command": statistics.median(e["dims_with_command"] for e in ev) if ev else None,
                     "audits_with_structured_checks": sum(e["checks"] > 0 for e in ev),
                     "audits_with_structured_mutations": sum(e["mutations"] > 0 for e in ev)},
        "weeks": dict(sorted(weeks.items())),
        "coverage": coverage(audits, pop, today),
    }


def _reaudit_lines(ro: dict) -> list[str]:
    if not ro.get("files"):
        return []
    parts = []
    for b, label in (("marked", "marked fixed one by one"), ("assumed", "assumed fixed"), ("open", "counted open")):
        t = ro["by_basis"][b]
        n = sum(t.values())
        if n:
            parts.append(f"{label}: {t['closed']} of {n} closed, {t['partial']} partly, {t['open']} still open")
    return [f"When {ro['files']} re-audits re-checked the earlier defects (state on arrival, `prior_defects`): "
            + "; ".join(parts) + "."]


def render_md(m: dict) -> str:
    pct = lambda k, n: f"{100 * k / n:.0f}%" if n else "n/a"
    L = [f"Latest audit per subject: {m['subjects']} subjects, {m['failing']} below the bar.", "",
         "**Why subjects miss the bar.** Of those below it, how many fail each gate (a subject can fail several):", "",
         "| gate | fails | share of failing |", "|---|---|---|"]
    for g, k in m["gate_failures_among_failing"].items():
        L.append(f"| {g} | {k} | {pct(k, m['failing'])} |")
    L += ["", "Single binding gate: " + ", ".join(f"{k} {v}" for k, v in m["single_binding_gate"].items()) + ".",
          "One point short (a +1 on this dimension alone would clear the bar): "
          + (", ".join(f"{k} {v}" for k, v in m["one_point_short"].items()) or "none") + ".", "",
          "| dimension | 0 | 1 | 2 | 3 | 4 |", "|---|---|---|---|---|---|"]
    for d, h in m["score_histograms"].items():
        L.append(f"| {d} | " + " | ".join(str(x) for x in h) + " |")
    df = m["defects"]
    L += ["", f"**Defects** in the latest audits: {df['n']} (median {df['per_subject_median']} per subject).", "",
          "| category | stage that should have stopped it | high | medium | low | total |", "|---|---|---|---|---|---|"]
    for c, n in df["by_category"].items():
        s = df["by_category_severity"].get(c, {})
        L.append(f"| {c} | {ORIGIN_OF.get(c, 'audit')} | {s.get('high', 0)} | {s.get('medium', 0)} | {s.get('low', 0)} | {n} |")
    cl = m["classifier"]
    if cl.get("n"):
        L += ["", f"Categories are from keyword rules; on {cl['n']} hand-labelled defects they agree {cl['agree']} times "
              f"({100 * cl['share']:.0f}%). Treat category counts as approximate."]
    mu = m["mutations"]
    L += ["", f"**Seeded mutations.** In {mu['survived'] + mu['caught']} audits that report the outcome, at least one seeded "
          f"bug in core logic survived the subject's own tests in {mu['survived']} ({100 * (mu['survival_rate'] or 0):.0f}%, Wilson 95% "
          f"{100 * mu['ci'][0]:.0f}% to {100 * mu['ci'][1]:.0f}%); {mu['unknown']} audits do not say."]
    mk = m.get("mutation_kill") or {}
    if mk.get("mutants"):
        L.append(f"Per mutant (structured rows, all audits): {mk['killed']} of {mk['mutants']} seeded bugs failed a test "
                 f"({100 * mk['kill_rate']:.0f}% killed) over {mk['audits']} audits, {mk['per_audit']} an audit. The per-audit "
                 "share above saturates at several mutants an audit; the kill rate is the one that can move.")
    fx, ps = m["fixes"], m["persistence"]
    L += ["", f"**Fixes.** {fx['audits_with_fix_prs']} of {fx['audits_with_defects']} audits with defects list a fix PR; "
          f"{fx['open_high_in_latest']} high-severity defects are open in the latest audits.",
          f"Of the latest audits' defects, {fx['explicit']} are marked fixed one by one (`fixed_by`), {fx['assumed']} are "
          f"assumed fixed because their audit lists a fix PR and marks none, and {fx['open']} are open. "
          f"{fx['rechecked_after_fix']} subjects have been re-audited after a recorded fix; {fx['awaiting_recheck']} await one "
          f"(`quality_audit.py reaudit`), {fx['documented_open']} of them with a README that still lists the audit's defects as open.",
          *_reaudit_lines(m.get("reaudit_outcomes") or {}),
          f"Of {ps['earlier_defects']} defects in an audit that was later repeated, {ps['reappeared']} "
          f"({100 * (ps['share'] or 0):.0f}%) reappear in the next audit of the same subject "
          f"({ps['subjects_reaudited']} subjects re-audited)."]
    for label, ag in m["agreement"].items():
        if ag["pairs"]:
            L.append(f"Re-audit agreement ({label.replace('_', ' ')}, {ag['pairs']} pairs with no fix between): "
                     f"{ag['exact']} of {ag['cells']} dimension scores identical, {ag['within_one']} within one; "
                     f"the bar verdict agrees in {ag['bar_verdict_agrees']} of {ag['pairs']}.")
    ev = m["evidence"]
    L += ["", f"**Audit detail.** Median evidence length {ev['median_chars']} characters over seven dimensions; median "
          f"{ev['median_dims_quoting_a_command']} of 7 dimensions quote a command or reproduction. "
          f"{ev['audits_with_structured_checks']} audits carry structured `checks`, {ev['audits_with_structured_mutations']} structured `mutations`."]
    cv = m["coverage"]
    a = cv["all"]
    L += ["", f"**Coverage of the repository.** {a['audited_ever']} of {a['population']} subjects audited at least once "
          f"({100 * (a['share_ever'] or 0):.1f}%), at {a['subjects_per_day']} a day over {a['days_of_audits']} days: "
          f"a first full pass would take about {a['days_to_first_full_pass']} more days at that pace.", "",
          "| stratum | population | audited ever | in the last 90 days |", "|---|---|---|---|"]
    for st in ("venture", "research", "platform"):
        c = cv[st]
        L.append(f"| {st} | {c['population']} | {c['audited_ever']} | {c['audited_recently']} |")
    bi = m.get("bar_by_instrument") or {}
    if bi:
        L += ["", "**Sampled share by instrument.** Audits before 2026-11-11 are prose; after it they carry structured "
              "checks and mutations. A change across the boundary is partly the instrument.", "",
              "| instrument | sampled audits | meets bar |", "|---|---|---|"]
        for k, v in bi.items():
            L.append(f"| {k} | {v['n']} | {v['meets_bar']} ({pct(v['meets_bar'], v['n'])}) |")
    L += ["", "| week | audited | meets bar |", "|---|---|---|"]
    for w, v in m["weeks"].items():
        L.append(f"| {w} | {v['n']} | {v['meets_bar']} |")
    return "\n".join(L) + "\n"


def main_metrics(args, audits, pop, meets_bar, wilson) -> int:
    today = dt.date.today()
    if args.cmd == "metrics":
        m = metrics(audits, pop, today, meets_bar, wilson)
        print(render_md(m) if args.md else json.dumps(m, indent=1))
    elif args.cmd == "coverage":
        print(json.dumps(coverage(audits, pop, today), indent=1))
    elif args.cmd == "census":
        import sys
        prs = None if getattr(args, "no_prs", False) else open_pr_titles()
        if prs is None and not getattr(args, "no_prs", False):
            print("(open-PR search failed: search open PRs by subject before auditing one)", file=sys.stderr)
        picks, skipped = census_free(audits, pop, args.n, args.seed, prs or [])
        print(f"seed {args.seed}  (--seed {args.seed} repeats this draw)")
        for p in picks:
            print(f"  {p['stratum']:<9} {p['subject']}  last audited: {p['last_audited'] or 'never'}")
        for subject, naming in skipped:
            print(f"  skipped   {subject}: open PR " + "; ".join(f"#{n} {t[:70]}" for n, t in naming[:2]))
    elif args.cmd == "queue":
        seed = getattr(args, "seed", None)
        rows = queue(audits, args.severity, seed)
        seen: dict[tuple[str, str], dict] = {}
        changed = 0
        if rows and not getattr(args, "no_git", False) and not getattr(args, "no_fetch", False):
            note = deepen_for(min(r["audit"][:10] for r in rows[: args.limit]), today)
            if note:
                import sys
                print(note, file=sys.stderr)
        prs = None if getattr(args, "no_prs", False) else open_pr_titles()
        if prs is None and not getattr(args, "no_prs", False):
            import sys
            print("(open-PR search failed: rows below may already have a PR in flight; search open PRs by subject)",
                  file=sys.stderr)
        claims: dict = {}
        if not getattr(args, "no_prs", False):
            import quality_claim
            got = quality_claim.live_claims()
            if got is None:
                import sys
                print("(claim-branch read failed: another session may hold a row below)", file=sys.stderr)
            claims = got or {}

        def held(r):
            return quality_claim.subject_slug(r["subject"]) in claims if claims else False
        if prs or claims:  # rows an open PR names or a session claimed go last, so the top row is free
            rows.sort(key=lambda r: (SEV_RANK[r["severity"]], bool(prs_naming(r["subject"], prs or [])) or held(r)))
        if seed:
            print(f"seed {seed}  (subjects shuffled within a severity so parallel fix sessions spread out;"
                  f" --seed {seed} repeats this order, --oldest-first gives the fixed one)")
        in_flight = 0
        now = time.time()
        for r in rows[: args.limit]:
            print(f"[{r['severity']}] {r['subject']} ({r['audit']}#{r['index']}, {r['category']}): {r['what'][:200]}")
            naming = prs_naming(r["subject"], prs or [])
            if naming:
                in_flight += 1
                print("    open PR naming it: " + "; ".join(f"#{n} {t[:80]}" for n, t in naming[:3]))
            elif held(r):
                in_flight += 1
                ts, msg = claims[quality_claim.subject_slug(r["subject"])]
                print(f"    claimed {max(0, int((now - ts) / 60))} min ago by another session: {msg[:90]}")
            if getattr(args, "no_git", False):
                continue
            key = (r["subject"], r["audit"])
            if key not in seen:
                seen[key] = changes_since(r["subject"], r["audit"][:10],
                                          audit_path=f"portfolio/quality/audits/{r['audit']}")
            c = seen[key]
            if c["status"] == "changed":
                changed += 1
                last = c["commits"][0]
                print(f"    changed since audit: {len(c['commits'])} commit(s), latest {last['sha']} {last['title'][:90]}")
            elif c["status"] == "unknown":
                print(f"    changed since audit: unknown ({c['why']})")
        print(f"{len(rows)} open defects at {args.severity} or worse (no fix PR recorded; source-only left out)")
        if in_flight:
            print(f"{in_flight} shown already have an open PR naming the subject or a live claim: extend or wait for"
                  " that PR, or pick another row (a fix PR that has not merged is not yet in fix_prs)")
        print("Before fixing a row: `python3 platform/ci/quality_audit.py claim <subject>` (exit 4: another session"
              " has it, take the next row)")
        if changed:
            print(f"{changed} shown sit under a subject changed since its audit: check whether a commit already fixed"
                  " it, and if so record that PR in the audit's fix_prs (and the defect's fixed_by) instead of fixing"
                  " it again")
        hidden = unmarked_fixes(audits, args.severity)
        if hidden:
            print(f"{len(hidden)} audits list fix_prs with no per-defect fixed_by, so all their defects are treated as"
                  " fixed and are not shown; when you fix some of an audit's defects, set fixed_by on each one you"
                  " fixed (portfolio/quality/README.md, 'Fix forward')")
    elif args.cmd == "mode":
        open_high = len(queue(audits, "high"))
        print(json.dumps(mode_for(args.date, args.seed, last_reflection(), open_high, len(reaudit_due(audits))), indent=1))
    elif args.cmd == "reaudit":
        prs = None if getattr(args, "no_prs", False) else open_pr_titles()
        rows = reaudit_due(audits, args.seed)
        if prs:  # subjects an open PR already names go last
            rows.sort(key=lambda r: bool(prs_naming(r["subject"], prs)))
        print(f"seed {args.seed}  (--seed {args.seed} repeats this order)")
        for r in rows[: args.limit]:
            print(f"  {r['subject']}  audit {r['audit']}  {r['fixed']} of {r['defects']} defects counted fixed"
                  f" ({r['explicit']} marked, {r['high_fixed']} high)  fix PRs: {', '.join(str(p) for p in r['fix_prs'][:3])}")
            if r["documented_open"]:
                print("      its README lists this audit under known gaps / not yet fixed: the fix PR may only have"
                      " written the defects down")
            for n, t in prs_naming(r["subject"], prs or [])[:2]:
                print(f"      open PR naming it: #{n} {t[:80]}")
        print(f"{len(rows)} subjects have a recorded fix no later audit has checked. Re-audit one in a new file with"
              ' "drawn_by": "reaudit": check every earlier defect (fixed or not) against the code as it is now and say'
              " which the fix closed (portfolio/quality/README.md, \"Five modes\").")
    return 0
