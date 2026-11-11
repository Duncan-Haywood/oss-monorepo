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
    python3 platform/ci/quality_audit.py queue [--severity high] [--limit 30] [--no-git]   # flags subjects changed since audit
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


def defect_rows(audits: list[dict]) -> list[dict]:
    rows = []
    for a in audits:
        for i, d in enumerate(a.get("defects") or []):
            cat, origin, how = classify(d)
            rows.append({"key": f"{a['_file']}#{i}", "file": a["_file"], "subject": a.get("subject"),
                         "stratum": a.get("stratum"), "date": a.get("date"), "severity": d.get("severity"),
                         "what": d.get("what", ""), "category": cat, "origin": origin, "how": how,
                         "fixed": bool(a.get("fix_prs"))})
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


# --- the open-defect queue ---------------------------------------------------------

SEV_RANK = {"high": 0, "medium": 1, "low": 2}


def queue(audits: list[dict], severity: str = "medium") -> list[dict]:
    """Defects from each subject's latest audit that no fix PR is recorded against, worst first. Source-only defects
    (fixed by the build at deploy) are left out."""
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x["_file"])):
        latest[a["subject"]] = a
    out = []
    for a in latest.values():
        if a.get("fix_prs"):
            continue
        for i, d in enumerate(a.get("defects") or []):
            cat, origin, _ = classify(d)
            if cat == "source-only" or SEV_RANK.get(d.get("severity"), 3) > SEV_RANK[severity]:
                continue
            out.append({"severity": d["severity"], "subject": a["subject"], "audit": a["_file"], "index": i,
                        "category": cat, "what": d.get("what", ""), "where": d.get("where", "")})
    out.sort(key=lambda r: (SEV_RANK[r["severity"]], r["audit"], r["index"]))
    return out


def _git(args: list[str], root: Path = ROOT) -> str:
    import subprocess
    try:
        r = subprocess.run(["git", *args], capture_output=True, text=True, timeout=30, cwd=root)
        return r.stdout if r.returncode == 0 else ""
    except Exception:
        return ""


def changes_since(subject: str, date: str, git=_git) -> dict:
    """Commits under `subject` since its audit `date`, so a fix session can tell a defect that may already be fixed
    (with no fix_prs recorded) from one nobody touched. On 2026-11-11 a fix run found PR #14327 had fixed a queued
    high defect without recording it. Fail-soft: no git gives status "unknown". Shallow clones: the boundary commit
    looks as if it touches every path, so it is dropped, and a history that starts after the audit date is reported
    as "unknown" with the fetch that would answer it.
    Audit-round commits are kept: they only appear when they touched the subject itself, and round 30 (#14329)
    shipped a photo-editing page fix that way."""
    ref = "origin/main" if git(["rev-parse", "--verify", "-q", "origin/main"]).strip() else "HEAD"
    shallow_path = git(["rev-parse", "--git-path", "shallow"]).strip()
    boundary: set[str] = set()
    if shallow_path:
        p = Path(shallow_path)
        if not p.is_absolute():
            p = ROOT / p
        try:
            boundary = set(p.read_text().split())
        except OSError:
            boundary = set()
    if boundary:
        dates = [git(["log", "-1", "--format=%cs", b]).strip() for b in boundary]
        dates = [d for d in dates if d]
        if dates and max(dates) > date:
            return {"status": "unknown", "commits": [],
                    "why": f"history starts {max(dates)}; git fetch --shallow-since={date} origin main"}
    out = git(["log", ref, f"--since={date} 00:00", "--format=%H%x09%h%x09%s", "--", subject])
    if not out and not git(["rev-parse", "--verify", "-q", ref]).strip():
        return {"status": "unknown", "commits": [], "why": "no git history"}
    commits = []
    for line in out.splitlines():
        full, short, title = (line.split("\t", 2) + ["", ""])[:3]
        if full in boundary:
            continue
        commits.append({"sha": short, "title": title})
    return {"status": "changed" if commits else "untouched", "commits": commits}


# --- which mode is due ----------------------------------------------------------------

MODES = {
    "sample": "the stratified random round (quality_audit.py sample): the unbiased share meeting the bar",
    "census": "the full-repository sweep (census): never-audited subjects first",
    "fix": "fix the open-defect queue (queue), with a regression test per fix, then re-audit",
    "reflect": "read the corpus (metrics) and the process, write a reflection with process fixes",
}
MODE_WEIGHTS = {"sample": 0.35, "census": 0.30, "fix": 0.25, "reflect": 0.10}
REFLECT_EVERY_DAYS = 7


def last_reflection(directory: Path = REFLECTIONS) -> str | None:
    if not directory.is_dir():
        return None
    dates = [m.group(1) for f in directory.glob("*.md") if (m := re.match(r"(\d{4}-\d{2}-\d{2})-", f.name))]
    return max(dates) if dates else None


def mode_for(date: str, seed: str | None = None, last_reflect: str | None = None, open_high: int = 0) -> dict:
    """Software for the routine: which mode today's quality session runs. A reflection is forced when none has been
    written for a week; otherwise a seeded draw by MODE_WEIGHTS, with `fix` doubled while high defects are open."""
    day = dt.date.fromisoformat(date)
    if last_reflect is None or (day - dt.date.fromisoformat(last_reflect)).days >= REFLECT_EVERY_DAYS:
        return {"mode": "reflect", "why": f"no reflection in portfolio/quality/reflections/ since {last_reflect or 'ever'}"}
    weights = dict(MODE_WEIGHTS)
    if open_high:
        weights["fix"] *= 2
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
        "fixes": {"audits_with_defects": len(with_defects),
                  "audits_with_fix_prs": sum(bool(a.get("fix_prs")) for a in with_defects),
                  "open_high_in_latest": high_open},
        "persistence": persistence(audits),
        "agreement": agreement(audits, meets_bar),
        "evidence": {"median_chars": statistics.median(e["chars"] for e in ev) if ev else None,
                     "median_dims_quoting_a_command": statistics.median(e["dims_with_command"] for e in ev) if ev else None,
                     "audits_with_structured_checks": sum(e["checks"] > 0 for e in ev),
                     "audits_with_structured_mutations": sum(e["mutations"] > 0 for e in ev)},
        "weeks": dict(sorted(weeks.items())),
        "coverage": coverage(audits, pop, today),
    }


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
    fx, ps = m["fixes"], m["persistence"]
    L += ["", f"**Fixes.** {fx['audits_with_fix_prs']} of {fx['audits_with_defects']} audits with defects list a fix PR; "
          f"{fx['open_high_in_latest']} high-severity defects are open in the latest audits.",
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
        for p in census(audits, pop, args.n, args.seed):
            print(f"  {p['stratum']:<9} {p['subject']}  last audited: {p['last_audited'] or 'never'}")
    elif args.cmd == "queue":
        rows = queue(audits, args.severity)
        seen: dict[tuple[str, str], dict] = {}
        changed = 0
        for r in rows[: args.limit]:
            print(f"[{r['severity']}] {r['subject']} ({r['audit']}#{r['index']}, {r['category']}): {r['what'][:200]}")
            if getattr(args, "no_git", False):
                continue
            key = (r["subject"], r["audit"][:10])
            if key not in seen:
                seen[key] = changes_since(*key)
            c = seen[key]
            if c["status"] == "changed":
                changed += 1
                last = c["commits"][0]
                print(f"    changed since audit: {len(c['commits'])} commit(s), latest {last['sha']} {last['title'][:90]}")
            elif c["status"] == "unknown":
                print(f"    changed since audit: unknown ({c['why']})")
        print(f"{len(rows)} open defects at {args.severity} or worse (no fix PR recorded; source-only left out)")
        if changed:
            print(f"{changed} shown sit under a subject changed since its audit: check whether a commit already fixed"
                  " it, and if so record that PR in the audit's fix_prs instead of fixing it again")
    elif args.cmd == "mode":
        open_high = len(queue(audits, "high"))
        print(json.dumps(mode_for(args.date, args.seed, last_reflection(), open_high), indent=1))
    return 0
