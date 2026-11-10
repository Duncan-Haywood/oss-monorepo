#!/usr/bin/env python3
"""Quality audits: sample subjects, validate audit files, print the scoreboard.

The programme, rubric and procedure are in portfolio/quality/README.md. This
script does the routine parts so an auditing session spends its time on
judgment: a reproducible stratified draw, a schema check, and the aggregate
numbers (share meeting the bar, with Wilson intervals, by stratum and round).

    python3 platform/ci/quality_audit.py sample [--seed 2026-11-07] [--k 2]
    python3 platform/ci/quality_audit.py validate
    python3 platform/ci/quality_audit.py summary [--md]
    python3 platform/ci/quality_audit.py history [--md]

Standard library only, so it runs in a bare container. It lives in platform/ci
(tests: platform/ci/test_quality_audit.py) beside post_merge_review.py; the
programme's README and audit files are in portfolio/quality/.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import random
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDITS = ROOT / "portfolio" / "quality" / "audits"
FLAGSHIPS = ROOT / "portfolio" / "flagships.yaml"

DIMENSIONS = ("correctness", "completeness", "verification", "craft", "claims", "fitness", "domain")
GATES = ("correctness", "claims", "verification")
BAR = 3
STRATA = ("flagship", "venture", "research", "platform", "topical")
# Chosen, not drawn: reported apart and kept out of the sampled share. A
# `topical` audit covers a subject someone asked about (e.g. the CI/CD and
# Cloudflare setup, 2026-11-10), so letting it into the random strata, or
# into the 90-day skip, would bias the estimate the sample exists for.
CHOSEN = ("flagship", "topical")
SEVERITIES = ("high", "medium", "low")
STATUSES = ("audited", "unauditable")
SKIP_DAYS = 90
FILE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-[a-z0-9][a-z0-9._-]*\.json$")


# --- populations -------------------------------------------------------------

def flagships(path: Path = FLAGSHIPS) -> list[str]:
    """Flagship venture names in file order (a tiny reader: `- venture: name`)."""
    if not path.exists():
        return []
    return re.findall(r"^\s*-\s*venture:\s*([A-Za-z0-9._-]+)\s*$", path.read_text(), re.M)


def subdirs(parent: Path) -> list[str]:
    if not parent.is_dir():
        return []
    return sorted(p.name for p in parent.iterdir() if p.is_dir() and not p.name.startswith(("_", ".")))


def population(root: Path = ROOT) -> dict[str, list[str]]:
    return {
        "flagship": [f"ventures/{n}" for n in flagships(root / "portfolio" / "flagships.yaml")],
        "venture": [f"ventures/{n}" for n in subdirs(root / "ventures")],
        "research": [f"research/{n}" for n in subdirs(root / "research")],
        "platform": [f"platform/{n}" for n in subdirs(root / "platform")],
    }


# --- audit files -------------------------------------------------------------

def load_audits(directory: Path = AUDITS) -> list[dict]:
    out = []
    if not directory.is_dir():
        return out
    for f in sorted(directory.glob("*.json")):
        data = json.loads(f.read_text())
        data["_file"] = f.name
        out.append(data)
    return out


def last_audited(audits: list[dict]) -> dict[str, str]:
    last: dict[str, str] = {}
    for a in audits:
        s, d = a.get("subject"), a.get("date", "")
        if a.get("stratum") == "topical":
            continue
        if s and d > last.get(s, ""):
            last[s] = d
    return last


def validate_audit(a: dict) -> list[str]:
    """Problems with one audit file; empty when it is well formed."""
    errs = []
    name = a.get("_file", "?")
    m = FILE_RE.match(name)
    if not m:
        errs.append(f"{name}: name must be <YYYY-MM-DD>-<subject>.json")
    elif a.get("date") != m.group(1):
        errs.append(f"{name}: date {a.get('date')!r} does not match the file name")
    for key in ("date", "subject", "stratum", "status", "verdict"):
        if not a.get(key):
            errs.append(f"{name}: missing {key}")
    if a.get("stratum") not in STRATA:
        errs.append(f"{name}: stratum must be one of {STRATA}")
    if a.get("status") not in STATUSES:
        errs.append(f"{name}: status must be one of {STATUSES}")
    subj = a.get("subject", "")
    if subj and not (ROOT / subj).exists():
        errs.append(f"{name}: subject {subj} is not a path in the repository")
    if a.get("status") == "audited":
        if not a.get("professional"):
            errs.append(f"{name}: name the senior professional whose bar this is ('professional')")
        scores, evidence = a.get("scores") or {}, a.get("evidence") or {}
        for d in DIMENSIONS:
            v = scores.get(d)
            if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 4:
                errs.append(f"{name}: scores.{d} must be an integer 0-4")
            ev = evidence.get(d, "")
            if not isinstance(ev, str) or len(ev.strip()) < 40:
                errs.append(f"{name}: evidence.{d} must say what was run or checked (40+ characters)")
        extra = set(scores) - set(DIMENSIONS)
        if extra:
            errs.append(f"{name}: unknown score dimensions {sorted(extra)}")
    for i, d in enumerate(a.get("defects") or []):
        if d.get("severity") not in SEVERITIES:
            errs.append(f"{name}: defects[{i}].severity must be one of {SEVERITIES}")
        if not d.get("what"):
            errs.append(f"{name}: defects[{i}] needs 'what'")
    if not isinstance(a.get("fix_prs", []), list):
        errs.append(f"{name}: fix_prs must be a list")
    return errs


# --- scoring -----------------------------------------------------------------

def meets_bar(scores: dict) -> bool:
    if any(scores.get(g, 0) < BAR for g in GATES):
        return False
    return statistics.median(scores.get(d, 0) for d in DIMENSIONS) >= BAR


def finished(scores: dict) -> bool:
    return scores.get("completeness", 0) >= BAR


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    den = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, mid - half), min(1.0, mid + half))


def summarize(audits: list[dict]) -> dict:
    """The scoreboard. Uses each subject's latest audit, so a re-audit after a fix replaces the old row."""
    latest: dict[str, dict] = {}
    for a in sorted(audits, key=lambda x: (x.get("date", ""), x.get("_file", ""))):
        latest[a["subject"]] = a
    rows = [a for a in latest.values() if a.get("status") == "audited"]
    out = {"audits": len(audits), "subjects": len(latest), "unauditable": sum(1 for a in latest.values() if a.get("status") == "unauditable"), "strata": {}, "dimensions": {}, "defects": {s: 0 for s in SEVERITIES}, "rounds": {}}
    for s in STRATA:
        rs = [a for a in rows if a["stratum"] == s]
        k = sum(meets_bar(a["scores"]) for a in rs)
        f = sum(finished(a["scores"]) for a in rs)
        lo, hi = wilson(k, len(rs))
        out["strata"][s] = {"n": len(rs), "meets_bar": k, "finished": f, "ci": [round(lo, 3), round(hi, 3)]}
    for d in DIMENSIONS:
        vals = [a["scores"][d] for a in rows]
        out["dimensions"][d] = {"mean": round(statistics.mean(vals), 2) if vals else None, "at_bar": sum(v >= BAR for v in vals), "n": len(vals)}
    for a in latest.values():
        for d in a.get("defects") or []:
            out["defects"][d["severity"]] += 1
    for a in audits:
        r = out["rounds"].setdefault(a["date"], {"n": 0, "meets_bar": 0})
        if a.get("status") == "audited":
            r["n"] += 1
            r["meets_bar"] += meets_bar(a["scores"])
    sampled = [a for a in rows if a["stratum"] not in CHOSEN]
    k = sum(meets_bar(a["scores"]) for a in sampled)
    lo, hi = wilson(k, len(sampled))
    out["sampled"] = {"n": len(sampled), "meets_bar": k, "finished": sum(finished(a["scores"]) for a in sampled), "ci": [round(lo, 3), round(hi, 3)]}
    out["rows"] = [{"subject": a["subject"], "stratum": a["stratum"], "date": a["date"], "scores": a["scores"], "meets_bar": meets_bar(a["scores"]), "finished": finished(a["scores"])} for a in sorted(rows, key=lambda x: (x["stratum"], x["subject"]))]
    return out


def render_md(s: dict) -> str:
    pct = lambda lo, hi: f"{lo * 100:.0f}% to {hi * 100:.0f}%"
    lines = [f"Subjects audited: {s['subjects']} ({s['audits']} audit files, {s['unauditable']} unauditable).", ""]
    sm = s["sampled"]
    if sm["n"]:
        lines += [f"Randomly sampled subjects meeting the senior-professional bar: **{sm['meets_bar']} of {sm['n']}** (Wilson 95% {pct(*sm['ci'])}); finished: {sm['finished']} of {sm['n']}.", ""]
    lines += ["| stratum | audited | meets bar | finished | 95% interval (meets bar) |", "|---|---|---|---|---|"]
    for name, v in s["strata"].items():
        if v["n"]:
            lines.append(f"| {name} | {v['n']} | {v['meets_bar']} | {v['finished']} | {pct(*v['ci'])} |")
    lines += ["", "| dimension | mean (0-4) | at or above 3 |", "|---|---|---|"]
    for d, v in s["dimensions"].items():
        if v["n"]:
            lines.append(f"| {d} | {v['mean']:.2f} | {v['at_bar']} of {v['n']} |")
    lines += ["", "| subject | stratum | " + " | ".join(DIMENSIONS) + " | bar |", "|---|---|" + "---|" * len(DIMENSIONS) + "---|"]
    for r in s["rows"]:
        lines.append(f"| `{r['subject']}` | {r['stratum']} | " + " | ".join(str(r["scores"][d]) for d in DIMENSIONS) + f" | {'yes' if r['meets_bar'] else 'no'} |")
    d = s["defects"]
    lines += ["", f"Defects found: {d['high']} high, {d['medium']} medium, {d['low']} low."]
    return "\n".join(lines) + "\n"


# --- history -----------------------------------------------------------------

PATH_RE = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+")


def defect_file(d: dict) -> str:
    """The first file path a defect's `where` names, without a line number: the key for "same defect again"."""
    m = PATH_RE.search(d.get("where") or "")
    return m.group(0) if m else ""


def history(audits: list[dict]) -> dict:
    """Does auditing change anything? Follow-through on high defects, and how re-audited subjects moved.

    `summary` keeps only each subject's latest audit; this reads every file in order.
    A high defect counts as *re-found* when a later audit of the same subject reports a
    high defect in the same file: a strong hint it was never fixed (it is a hint, not
    proof; check the defect itself before saying so).
    """
    rows = sorted((a for a in audits if a.get("status") == "audited"), key=lambda x: (x.get("date", ""), x.get("_file", "")))
    high = [a for a in rows if any(d["severity"] == "high" for d in a.get("defects") or [])]
    out = {
        "audits": len(rows),
        "with_fix_prs": sum(1 for a in rows if a.get("fix_prs")),
        "with_high": len(high),
        "with_high_and_fix_prs": sum(1 for a in high if a.get("fix_prs")),
        "reaudited": [],
        "refound_high": [],
    }
    by: dict[str, list[dict]] = {}
    for a in rows:
        by.setdefault(a["subject"], []).append(a)
    for subject, seq in sorted(by.items()):
        if len(seq) < 2:
            continue
        totals = [sum(a["scores"].values()) for a in seq]
        out["reaudited"].append({"subject": subject, "audits": len(seq), "totals": totals,
                                 "bar": [meets_bar(a["scores"]) for a in seq], "change": totals[-1] - totals[0]})
        seen: dict[str, str] = {}
        for a in seq:
            for d in a.get("defects") or []:
                f = defect_file(d)
                if d["severity"] != "high" or not f:
                    continue
                if f in seen and seen[f] != a["_file"]:
                    out["refound_high"].append({"subject": subject, "file": f, "first": seen[f], "again": a["_file"]})
                seen.setdefault(f, a["_file"])
    moved = [r["change"] for r in out["reaudited"]]
    out["reaudit_change"] = {"up": sum(c > 0 for c in moved), "flat": sum(c == 0 for c in moved), "down": sum(c < 0 for c in moved)}
    return out


def render_history_md(h: dict) -> str:
    c = h["reaudit_change"]
    lines = [
        f"Audits read: {h['audits']}. Audits listing any fix PR: {h['with_fix_prs']}.",
        f"Audits with a high-severity defect: {h['with_high']}, of which {h['with_high_and_fix_prs']} list a fix PR.",
        f"Subjects audited more than once: {len(h['reaudited'])} (score total up {c['up']}, flat {c['flat']}, down {c['down']}, first audit to latest).",
        "",
        "| subject | audits | score totals (of 28), in order | meets bar, in order |",
        "|---|---|---|---|",
    ]
    for r in h["reaudited"]:
        lines.append(f"| `{r['subject']}` | {r['audits']} | {', '.join(map(str, r['totals']))} | {', '.join('yes' if b else 'no' for b in r['bar'])} |")
    if h["refound_high"]:
        lines += ["", "High defects reported again, same file, by a later audit of the same subject:", "",
                  "| subject | file | first reported | reported again |", "|---|---|---|---|"]
        for r in h["refound_high"]:
            lines.append(f"| `{r['subject']}` | `{r['file']}` | {r['first']} | {r['again']} |")
    return "\n".join(lines) + "\n"


# --- sampling ----------------------------------------------------------------

def draw(seed: str, k: int = 2, k_platform: int = 1, audits: list[dict] | None = None, pop: dict[str, list[str]] | None = None, today: dt.date | None = None) -> list[dict]:
    """Today's subjects: the least recently audited flagship, then uniform draws per stratum."""
    audits = load_audits() if audits is None else audits
    pop = population() if pop is None else pop
    today = today or dt.date.today()
    last = last_audited(audits)
    cutoff = (today - dt.timedelta(days=SKIP_DAYS)).isoformat()
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))
    picked: list[dict] = []
    taken: set[str] = set()
    if pop["flagship"]:
        order = sorted(pop["flagship"], key=lambda s: (last.get(s, ""), pop["flagship"].index(s)))
        picked.append({"stratum": "flagship", "subject": order[0], "last_audited": last.get(order[0])})
        taken.add(order[0])
    flag = set(pop["flagship"])
    for stratum, n in (("venture", k), ("research", k), ("platform", k_platform)):
        pool = [s for s in pop[stratum] if s not in taken and last.get(s, "") < cutoff and not (stratum == "venture" and s in flag)]
        for s in rng.sample(pool, min(n, len(pool))):
            picked.append({"stratum": stratum, "subject": s, "last_audited": last.get(s), "population": len(pop[stratum])})
            taken.add(s)
    return picked


# --- cli ---------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("sample", help="draw this round's subjects")
    sp.add_argument("--seed", default=dt.date.today().isoformat())
    sp.add_argument("--k", type=int, default=2, help="subjects per venture and research stratum")
    sp.add_argument("--k-platform", type=int, default=1)
    sp.add_argument("--json", action="store_true")
    sub.add_parser("validate", help="check every audit file")
    sm = sub.add_parser("summary", help="the scoreboard over every audit")
    sm.add_argument("--md", action="store_true")
    hp = sub.add_parser("history", help="follow-through on defects and how re-audited subjects moved")
    hp.add_argument("--md", action="store_true")
    args = ap.parse_args(argv)

    if args.cmd == "sample":
        picks = draw(args.seed, args.k, args.k_platform)
        if args.json:
            print(json.dumps({"seed": args.seed, "subjects": picks}, indent=1))
        else:
            print(f"seed {args.seed}")
            for p in picks:
                extra = f" (of {p['population']})" if p.get("population") else ""
                print(f"  {p['stratum']:<9} {p['subject']}{extra}  last audited: {p['last_audited'] or 'never'}")
            drawn = {p["stratum"] for p in picks}
            for st in STRATA:
                if st not in drawn:
                    print(f"  {st:<9} none drawn: every subject was audited in the last {SKIP_DAYS} days (or none exist)")
        return 0
    audits = load_audits()
    if args.cmd == "validate":
        errs = [e for a in audits for e in validate_audit(a)]
        for e in errs:
            print(e, file=sys.stderr)
        print(f"{len(audits)} audit files, {len(errs)} problems")
        return 1 if errs else 0
    if args.cmd == "history":
        h = history(audits)
        print(render_history_md(h) if args.md else json.dumps(h, indent=1))
        return 0
    s = summarize(audits)
    print(render_md(s) if args.md else json.dumps(s, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
