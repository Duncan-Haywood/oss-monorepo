#!/usr/bin/env python3
"""Quality audits: sample subjects, validate audit files, print the scoreboard.

The programme, rubric and procedure are in portfolio/quality/README.md. This
script does the routine parts so an auditing session spends its time on
judgment: a reproducible stratified draw, a schema check, and the aggregate
numbers (share meeting the bar, with Wilson intervals, by stratum and round).

    python3 platform/ci/quality_audit.py sample [--seed 2026-11-07] [--k 2]   # prints the seed and round number to use
    python3 platform/ci/quality_audit.py validate
    python3 platform/ci/quality_audit.py summary [--md]
    python3 platform/ci/quality_audit.py metrics [--md]   # detailed: gates, defect taxonomy, mutations, fixes, coverage
    python3 platform/ci/quality_audit.py census | queue | mode | coverage   # see quality_metrics.py

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
# A flagship audited this recently is not drawn again: on 2026-11-10, 22 of 183 audit files re-audited a flagship
# within two days with no fix between, and 138 of their 154 scores came back identical (quality_metrics agreement).
FLAGSHIP_REAUDIT_DAYS = 7
# Audits dated on or after this carry the detailed fields (checks, mutations, defect category and origin):
# the owner, 2026-11-10: "more detail in it ... detailed metrics on quality and correctness".
DETAIL_FROM = "2026-11-11"
CHECK_RESULTS = ("pass", "fail", "partial")
DRAWN_BY = ("sample", "census", "fix")  # how the subject was chosen; only "sample" feeds the unbiased share
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


def remote_audits(local: list[dict], ref: str = "origin/main") -> list[dict]:
    """Audits on `ref` this checkout lacks (a round merged after the clone was made).

    Fail-soft: no git, no ref or no network-free answer returns []. Reads the
    local ref only; it does not fetch, so `git fetch origin main` first for a
    current answer."""
    import subprocess
    rel = AUDITS.relative_to(ROOT).as_posix()
    try:
        names = subprocess.run(["git", "ls-tree", "--name-only", ref, rel + "/"], capture_output=True, text=True, timeout=20, cwd=ROOT).stdout.split()
        have = {a["_file"] for a in local}
        out = []
        for n in names:
            if n.endswith(".json") and Path(n).name not in have:
                txt = subprocess.run(["git", "show", f"{ref}:{n}"], capture_output=True, text=True, timeout=20, cwd=ROOT).stdout
                data = json.loads(txt)
                data["_file"] = Path(n).name
                out.append(data)
        return out
    except Exception:
        return []


def free_seed(date: str, audits: list[dict]) -> str:
    """`date`, or `date-b`, `date-c`, ... : the first seed no audit has used.

    The default seed was the date, so a second round on the same day reused it
    (rounds 39, 40 and 41 all ran on seed 2026-11-10) and each post had to
    explain why; picking the suffix by hand was the -b/-c rule in the README."""
    used = {str(a.get("seed", "")) for a in audits}
    for suffix in [""] + [f"-{c}" for c in "bcdefghijklmnopqrstuvwxyz"]:
        if date + suffix not in used:
            return date + suffix
    return date + "-" + hashlib.sha256(repr(sorted(used)).encode()).hexdigest()[:6]


ROUND_RE = re.compile(r"quality-audit-round-(\d+)\.md$")


def post_limits() -> str:
    """The round post's front-matter caps, printed with its name: two quality runs
    on 2026-11-12 had a first draft refused on all three (run records)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from check_post_frontmatter import limits_line
    except ImportError:  # a sparse checkout without it
        return "front matter: see platform/ci/check_post_frontmatter.py --limits"
    return limits_line()


# "quality: round 60 (seed 2026-11-13-f), ..." -- the title every round PR uses.
PR_ROUND_RE = re.compile(r"^quality:\s*round\s+(\d+)(?:\s*\(seed\s+([\w-]+)\))?", re.I)


def open_round_prs(timeout: int = 20) -> list[tuple[int, str | None]]:
    """(round, seed) of every open `quality: round N (seed S)` PR.

    A round's number and seed reach main only when its PR merges, so two
    rounds in flight got the same ones: round 55 twice (doc_friction on this
    file, 2026-11-13) and, on the day this was written, `sample` offered
    round 60 / seed 2026-11-13-f while open PR #15385 held both. One `gh api`
    search (works unauthenticated in cloud sessions); fail-soft to []."""
    import subprocess
    try:
        proc = subprocess.run(
            ["gh", "api", "-X", "GET", "search/issues", "-f",
             "q=repo:duncan-haywood/oss-monorepo is:pr is:open in:title quality round",
             "-f", "per_page=100", "--jq", ".items[].title"],
            capture_output=True, text=True, timeout=timeout)
    except Exception:
        return []
    if proc.returncode != 0:
        return []
    return parse_round_titles(proc.stdout.splitlines())


def parse_round_titles(titles) -> list[tuple[int, str | None]]:
    out = []
    for t in titles:
        if m := PR_ROUND_RE.match(t.strip()):
            out.append((int(m.group(1)), m.group(2)))
    return out


def fetch_main(timeout: int = 60) -> bool:
    """`git fetch --depth=1 origin main`, fail-soft. `sample` read a stale
    origin/main and drew a seed round 58 had already used (doc_friction,
    2026-11-13); the README's "fetch first" step was the fix, so do it here."""
    import subprocess
    try:
        return subprocess.run(["git", "fetch", "-q", "--depth=1", "origin", "main"], capture_output=True,
                              timeout=timeout, cwd=ROOT).returncode == 0
    except Exception:
        return False


def next_round(posts: Path = ROOT / "docs" / "posts", ref: str = "origin/main", in_flight: tuple[int, ...] = ()) -> int:
    """One more than the highest `*-quality-audit-round-N.md` post here or on `ref`.

    Round numbers lived only in post filenames, so runs read them off by hand
    (doc_friction, 2026-11-10). Fail-soft on git like remote_audits."""
    import subprocess
    names = [f.name for f in posts.glob("*quality-audit-round-*.md")] if posts.is_dir() else []
    try:
        rel = posts.relative_to(ROOT).as_posix()
        names += subprocess.run(["git", "ls-tree", "--name-only", ref, rel + "/"], capture_output=True, text=True, timeout=20, cwd=ROOT).stdout.split()
    except Exception:
        pass
    nums = [int(m.group(1)) for n in names if (m := ROUND_RE.search(n))] + list(in_flight)
    return max(nums, default=0) + 1


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
    if a.get("drawn_by", "sample") not in DRAWN_BY:
        errs.append(f"{name}: drawn_by must be one of {DRAWN_BY}")
    errs += validate_detail(a, name)
    return errs


def validate_detail(a: dict, name: str) -> list[str]:
    """The detailed fields. Checked for shape whenever present; required from DETAIL_FROM on."""
    errs = []
    required = a.get("status") == "audited" and a.get("date", "") >= DETAIL_FROM
    checks, muts = a.get("checks"), a.get("mutations")
    if checks is not None or required:
        if not isinstance(checks, list):
            errs.append(f"{name}: checks must be a list of {{dimension, what, method, expected, observed, result}}")
            checks = []
        for i, c in enumerate(checks):
            if c.get("dimension") not in DIMENSIONS:
                errs.append(f"{name}: checks[{i}].dimension must be one of {DIMENSIONS}")
            if c.get("result") not in CHECK_RESULTS:
                errs.append(f"{name}: checks[{i}].result must be one of {CHECK_RESULTS}")
            for k in ("what", "method"):
                if not c.get(k):
                    errs.append(f"{name}: checks[{i}] needs '{k}'")
        if required:
            recomputed = [c for c in checks if c.get("dimension") == "correctness"]
            if len(recomputed) < 3:
                errs.append(f"{name}: at least 3 correctness checks (outputs recomputed independently), found {len(recomputed)}")
            if len(checks) < 8:
                errs.append(f"{name}: at least 8 checks in all, found {len(checks)}")
    if muts is not None or required:
        if not isinstance(muts, list):
            errs.append(f"{name}: mutations must be a list of {{where, change, caught}}")
            muts = []
        for i, m in enumerate(muts):
            if not m.get("where") or not m.get("change") or not isinstance(m.get("caught"), bool):
                errs.append(f"{name}: mutations[{i}] needs 'where', 'change' and a boolean 'caught'")
        if required and len(muts) < 2:
            errs.append(f"{name}: seed at least 2 mutations in core logic, found {len(muts)}")
    if required:
        for i, d in enumerate(a.get("defects") or []):
            if not d.get("category") or not d.get("origin"):
                errs.append(f"{name}: defects[{i}] needs 'category' and 'origin' (portfolio/quality/README.md, the taxonomy)")
            if not d.get("where"):
                errs.append(f"{name}: defects[{i}] needs 'where' (path:line)")
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
    sampled = [a for a in rows if a["stratum"] not in CHOSEN and a.get("drawn_by", "sample") == "sample"]
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
    flag_cutoff = (today - dt.timedelta(days=FLAGSHIP_REAUDIT_DAYS)).isoformat()
    due = [s for s in pop["flagship"] if last.get(s, "") < flag_cutoff]
    if due:
        order = sorted(due, key=lambda s: (last.get(s, ""), pop["flagship"].index(s)))
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
    sp.add_argument("--seed", default=None, help="default: today's date, suffixed -b, -c ... past seeds audits already used")
    sp.add_argument("--k", type=int, default=2, help="subjects per venture and research stratum")
    sp.add_argument("--k-platform", type=int, default=1)
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--offline", action="store_true", help="skip the origin/main fetch and the open-PR read")
    sub.add_parser("validate", help="check every audit file")
    sm = sub.add_parser("summary", help="the scoreboard over every audit")
    sm.add_argument("--md", action="store_true")
    mt = sub.add_parser("metrics", help="detailed metrics: gates, defect taxonomy, mutations, fixes, coverage")
    mt.add_argument("--md", action="store_true")
    sub.add_parser("coverage", help="share of the whole repository ever audited")
    ce = sub.add_parser("census", help="the full-repository sweep: never-audited subjects first")
    ce.add_argument("--n", type=int, default=6)
    ce.add_argument("--seed", default=dt.date.today().isoformat())
    qu = sub.add_parser("queue", help="open defects with no fix PR, worst first")
    qu.add_argument("--severity", choices=SEVERITIES, default="medium")
    qu.add_argument("--limit", type=int, default=40)
    qu.add_argument("--no-git", action="store_true", help="skip the per-subject 'changed since audit' git check")
    mo = sub.add_parser("mode", help="which mode today's quality session runs")
    mo.add_argument("--date", default=dt.date.today().isoformat())
    mo.add_argument("--seed", default=None)
    args = ap.parse_args(argv)

    if args.cmd == "sample":
        fetched = False if args.offline else fetch_main()
        prs = [] if args.offline else open_round_prs()
        local = load_audits()
        every = local + remote_audits(local)
        held = [{"seed": sd} for _, sd in prs if sd]  # seeds open round PRs hold
        seed = args.seed or free_seed(dt.date.today().isoformat(), every + held)
        picks = draw(seed, args.k, args.k_platform, audits=every)
        rnd = next_round(in_flight=tuple(r for r, _ in prs))
        if args.json:
            print(json.dumps({"seed": seed, "round": rnd, "subjects": picks}, indent=1))
        else:
            print(f"seed {seed}   round {rnd} (next post: docs/posts/<date>-quality-audit-round-{rnd}.md)")
            if not args.offline:
                held_txt = ", ".join(f"{r}/{sd or '?'}" for r, sd in sorted(prs)) or "none"
                print(f"  open round PRs (round/seed, skipped): {held_txt}"
                      + ("" if fetched else "; origin/main NOT fetched, so merged rounds may be missing"))
            print(f"  post {post_limits()}")
            for p in picks:
                extra = f" (of {p['population']})" if p.get("population") else ""
                print(f"  {p['stratum']:<9} {p['subject']}{extra}  last audited: {p['last_audited'] or 'never'}")
            drawn = {p["stratum"] for p in picks}
            for st in STRATA:
                if st not in drawn:
                    days = FLAGSHIP_REAUDIT_DAYS if st == "flagship" else SKIP_DAYS
                    print(f"  {st:<9} none drawn: every subject was audited in the last {days} days (or none exist)")
        return 0
    audits = load_audits()
    if args.cmd in ("metrics", "coverage", "census", "queue", "mode"):
        sys.path.insert(0, str(Path(__file__).parent))
        import quality_metrics
        return quality_metrics.main_metrics(args, audits, population(), meets_bar, wilson)
    if args.cmd == "validate":
        errs = [e for a in audits for e in validate_audit(a)]
        for e in errs:
            print(e, file=sys.stderr)
        print(f"{len(audits)} audit files, {len(errs)} problems")
        return 1 if errs else 0
    s = summarize(audits)
    print(render_md(s) if args.md else json.dumps(s, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
