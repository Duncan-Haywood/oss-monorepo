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
    python3 platform/ci/quality_audit.py claim <subject> [--note N | --release]   # before fixing a queue row

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
import secrets
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
DRAWN_BY = ("sample", "census", "fix", "reaudit")  # how the subject was chosen; only "sample" feeds the unbiased share
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


def refresh_main(timeout: int = 60) -> bool:
    """`git fetch origin main` with no depth option, fail-soft, so origin/main reaches its tip.

    A shallow clone keeps its boundary (the fetch stops at commits it already has), so this does not
    mark the tip shallow the way `fetch_main`'s --depth=1 would, which made `changes_since` say
    "unknown" for every row. Used by `queue`; `deepen_for` still reaches back to old audits."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import shallow_repair
        return shallow_repair.fetch(["-q", "origin", "main"], cwd=ROOT, timeout=timeout).returncode == 0
    except Exception:
        return False


def with_main_marks(local: list[dict], ref: str = "origin/main") -> tuple[list[dict], int]:
    """`local` audits with `ref`'s fix marks merged in, plus audits only `ref` has; and how many defects
    gained a `fixed_by` that way.

    `queue` read the checkout's own audit files, so a branch cut before another session's fix landed
    listed that fix's rows as open: research/swe-cachecost defects 0-1 minutes after PR #19000 marked
    them, and clothing-design-studio #0 two days after PR #18388 (run-record doc_friction on this file,
    2026-11-25, three sessions). Marks are unioned per defect, so a mark this branch made itself and
    main lacks is kept. A file whose defect list differs in length on `ref` is taken from `ref` whole.
    Fail-soft: no git or no ref returns `local` unchanged."""
    import subprocess
    rel = AUDITS.relative_to(ROOT).as_posix()
    try:
        diff = subprocess.run(["git", "diff", "--name-only", "HEAD", ref, "--", rel + "/"],
                              capture_output=True, text=True, timeout=20, cwd=ROOT)
        if diff.returncode != 0:
            return local, 0
        changed = {Path(n).name for n in diff.stdout.split() if n.endswith(".json")}
    except Exception:
        return local, 0
    out, gained = [], 0
    for a in local:
        if a.get("_file") not in changed:
            out.append(a)
            continue
        try:
            txt = subprocess.run(["git", "show", f"{ref}:{rel}/{a['_file']}"], capture_output=True,
                                 text=True, timeout=20, cwd=ROOT)
            theirs = json.loads(txt.stdout) if txt.returncode == 0 else None
        except Exception:
            theirs = None
        if not isinstance(theirs, dict):
            out.append(a)  # deleted on main, or unreadable: keep ours
            continue
        mine, main_d = a.get("defects") or [], theirs.get("defects") or []
        if len(mine) != len(main_d):
            theirs["_file"] = a["_file"]
            gained += sum(1 for d in main_d if d.get("fixed_by")) - sum(1 for d in mine if d.get("fixed_by"))
            out.append(theirs)
            continue
        merged = dict(a)
        merged["defects"] = []
        for d, m in zip(mine, main_d):
            if not d.get("fixed_by") and m.get("fixed_by"):
                d = dict(d, fixed_by=m["fixed_by"])
                gained += 1
            merged["defects"].append(d)
        merged["fix_prs"] = list(dict.fromkeys((a.get("fix_prs") or []) + (theirs.get("fix_prs") or [])))
        out.append(merged)
    return out + remote_audits(local, ref), max(gained, 0)


def free_seed(date: str, audits: list[dict]) -> str:
    """`date`, or `date-b`, `date-c`, ... : the first seed no audit has used.

    The default seed was the date, so a second round on the same day reused it
    (rounds 39, 40 and 41 all ran on seed 2026-11-10) and each post had to
    explain why; picking the suffix by hand was the -b/-c rule in the README."""
    used = {str(a.get("seed", "")) for a in audits}
    used |= {re.sub(r"-[0-9a-f]{4}$", "", s) for s in used}  # a claim_seed tail still uses its letter
    for suffix in [""] + [f"-{c}" for c in "bcdefghijklmnopqrstuvwxyz"]:
        if date + suffix not in used:
            return date + suffix
    return date + "-" + hashlib.sha256(repr(sorted(used)).encode()).hexdigest()[:6]


def claim_seed(base: str, token: str | None = None) -> str:
    """`base` plus a short random tail, so two sessions that run `sample`
    minutes apart draw different subjects. The letter alone did not do it:
    seeds 2026-11-13-e, -h and -o were each drawn by two sessions that started
    before either's claim PR was visible, and each pair audited the same four
    subjects (portfolio/quality/blind-pairs/). The seed is still printed and
    recorded, so `--seed` reproduces any draw."""
    return f"{base}-{token or secrets.token_hex(2)}"


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


def claim_title(rnd: int, seed: str) -> str:
    """The round PR title open_round_prs() reads back (PR_ROUND_RE)."""
    return f"quality: round {rnd} (seed {seed})"


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
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import shallow_repair  # SIGTERM on timeout, so git does not leave .git/shallow.lock behind
        return shallow_repair.fetch(["-q", "--depth=1", "origin", "main"], cwd=ROOT,
                                    timeout=timeout).returncode == 0
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
    # A flagship whose app lives in private-monorepo (flagships.yaml `app:`)
    # has no public path; `sample` still draws it as ventures/<name>.
    if subj and not (ROOT / subj).exists() and subj not in {f"ventures/{n}" for n in flagships(FLAGSHIPS)}:
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
        if "fixed_by" in d and d["fixed_by"] not in (a.get("fix_prs") or []):
            errs.append(f"{name}: defects[{i}].fixed_by must be one of the URLs in fix_prs")
    if not isinstance(a.get("fix_prs", []), list):
        errs.append(f"{name}: fix_prs must be a list")
    if a.get("drawn_by", "sample") not in DRAWN_BY:
        errs.append(f"{name}: drawn_by must be one of {DRAWN_BY}")
    errs += validate_reaudit(a, name)
    errs += validate_detail(a, name)
    return errs


def validate_reaudit(a: dict, name: str) -> list[str]:
    """A re-audit says, for every defect of the audit it re-checks, how that audit counted it (`basis`) and what the
    re-auditor found on arrival (`status`). Three of the first nine re-audits (2026-11-21) wrote this only in prose,
    under three different keys, so the error rate of the blanket "fixed" reading had to be tallied by hand
    (reflection 3, 2026-11-24). `quality_metrics.reaudit_outcomes` counts these rows."""
    if a.get("drawn_by") != "reaudit" or a.get("status") != "audited":
        return []
    import quality_metrics as qm
    errs = []
    pa = a.get("prior_audit")
    if not (isinstance(pa, str) and pa.startswith("portfolio/quality/audits/") and pa.endswith(".json")):
        errs.append(f"{name}: a re-audit names the audit it re-checks ('prior_audit': portfolio/quality/audits/<file>.json)")
    rows = a.get("prior_defects")
    if not isinstance(rows, list) or not rows:
        errs.append(f"{name}: a re-audit lists every earlier defect in 'prior_defects' "
                    f"({{index, severity, basis, status, what}})")
        return errs
    for i, r in enumerate(rows):
        if not isinstance(r.get("index"), int) or isinstance(r.get("index"), bool):
            errs.append(f"{name}: prior_defects[{i}].index must be the defect's index in the prior audit")
        if r.get("basis") not in qm.REAUDIT_BASES:
            errs.append(f"{name}: prior_defects[{i}].basis must be one of {qm.REAUDIT_BASES} "
                        "(how the prior audit counted it before this re-audit: its own fixed_by, the blanket fix_prs reading, or open)")
        if r.get("status") not in qm.REAUDIT_STATUSES:
            errs.append(f"{name}: prior_defects[{i}].status must be one of {qm.REAUDIT_STATUSES} "
                        "(its state when you arrived; a fix your own PR makes goes in closed_by)")
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

def draw(seed: str, k: int = 2, k_platform: int = 1, audits: list[dict] | None = None, pop: dict[str, list[str]] | None = None, today: dt.date | None = None, exclude: set[str] | frozenset = frozenset(), k_research: int | None = None) -> list[dict]:
    """Today's subjects: the least recently audited flagship, then uniform draws per stratum
    (`k_research` research projects, default `k`; the CLI passes 0 while research is paused).

    `exclude` holds subjects another round in flight already drew (held_subjects)."""
    audits = load_audits() if audits is None else audits
    pop = population() if pop is None else pop
    today = today or dt.date.today()
    last = last_audited(audits)
    cutoff = (today - dt.timedelta(days=SKIP_DAYS)).isoformat()
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:16], 16))
    picked: list[dict] = []
    taken: set[str] = set(exclude)
    flag_cutoff = (today - dt.timedelta(days=FLAGSHIP_REAUDIT_DAYS)).isoformat()
    due = [s for s in pop["flagship"] if last.get(s, "") < flag_cutoff and s not in taken]
    if due:
        order = sorted(due, key=lambda s: (last.get(s, ""), pop["flagship"].index(s)))
        picked.append({"stratum": "flagship", "subject": order[0], "last_audited": last.get(order[0])})
        taken.add(order[0])
    flag = set(pop["flagship"])
    for stratum, n in (("venture", k), ("research", k if k_research is None else k_research), ("platform", k_platform)):
        pool = [s for s in pop[stratum] if s not in taken and last.get(s, "") < cutoff and not (stratum == "venture" and s in flag)]
        for s in rng.sample(pool, min(n, len(pool))):
            picked.append({"stratum": stratum, "subject": s, "last_audited": last.get(s), "population": len(pop[stratum])})
            taken.add(s)
    return picked


SEED_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def held_subjects(prs: list[tuple[int, str | None]], audits: list[dict], pop: dict[str, list[str]] | None = None,
                  today: dt.date | None = None, max_age_days: int = 1) -> set[str]:
    """Subjects the open round PRs drew, replayed from the seeds in their titles.

    The flagship pick is deterministic (least recently audited), so two rounds
    in flight both drew ventures/chant-forge on 2026-11-19 (rounds 76 and 77,
    doc_friction on this file); the second audit was renamed -b at merge. A
    round's title carries its seed, so its draw can be replayed with no extra
    API call. Replay in round order, each excluding what earlier rounds hold,
    the way each was drawn. Only seeds dated within `max_age_days`: an older
    PR's draw no longer replays faithfully, and a stale one is not in flight."""
    pop = population() if pop is None else pop
    today = today or dt.date.today()
    held: set[str] = set()
    for _, sd in sorted((r, s) for r, s in prs if s):
        m = SEED_DATE_RE.match(sd)
        if not m:
            continue
        try:
            day = dt.date.fromisoformat(m.group(1))
        except ValueError:
            continue
        if not 0 <= (today - day).days <= max_age_days:
            continue
        held |= {p["subject"] for p in draw(sd, audits=audits, pop=pop, today=day, exclude=held)}
    return held


# --- cli ---------------------------------------------------------------------

# What a session runs and names its post in each mode. The track prompt (owner-held) describes only `sample`, so
# the tool that runs first hands over the other modes' steps (README, "Five modes").
MODE_STEPS = {
    "census": ("python3 platform/ci/quality_audit.py census --n 6", "docs/posts/<date>-quality-census-<slug>.md"),
    "fix": ("python3 platform/ci/quality_audit.py queue --severity high", "docs/posts/<date>-quality-fix-<slug>.md"),
    "reaudit": ("python3 platform/ci/quality_audit.py reaudit", "docs/posts/<date>-quality-reaudit-<slug>.md"),
    "reflect": ("python3 platform/ci/quality_audit.py metrics --md",
                "portfolio/quality/reflections/<date>-<slug>.md and docs/posts/<date>-quality-reflection-<slug>.md"),
}


def mode_note(date: str, audits: list[dict]) -> str | None:
    """What `sample` prints instead of a draw when today's mode is not `sample`, else None.

    The track prompt (prompts/quality/prompt-0.md, step 1) says run `sample`;
    the README's "Five modes" says run `mode` first. Ten quality runs in five
    days reported the two procedures (friction_rank.py, 2026-11-10..14), and
    the prompt is owner-held, so the tool that runs first says it. A one-line
    NOTE above the draw was not enough: five more runs on 2026-11-17 read the
    draw first and reported the clash again, so the draw is now withheld
    (`--anyway` prints it, and that round is a deviation to record).
    """
    sys.path.insert(0, str(Path(__file__).parent))
    import quality_metrics as qm
    m = qm.mode_for(date, None, qm.last_reflection(), len(qm.drop_paused(qm.queue(audits, "high"))[0]),
                    len(qm.drop_paused(qm.reaudit_due(audits))[0]))
    if m["mode"] == "sample":
        return None
    cmd, post = MODE_STEPS.get(m["mode"], ("python3 platform/ci/quality_audit.py mode", "see the README"))
    return (f"Today's quality mode is `{m['mode']}`, not sample ({m['why']}): {qm.MODES[m['mode']]}.\n"
            f"  run:  {cmd}\n"
            f"  post: {post} (not quality-audit-round-<n>, which is for sample rounds)\n"
            "  how:  portfolio/quality/README.md, \"Five modes\"; the track prompt's steps 1 and 5 are for sample rounds.\n"
            "No sample draw printed. `sample --anyway` prints one; a sample round today is a deviation to record.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("sample", help="draw this round's subjects")
    sp.add_argument("--seed", default=None, help="default: today's date, suffixed -b, -c ... past seeds audits already used, plus a random tail so concurrent sessions draw differently")
    sp.add_argument("--k", type=int, default=2, help="subjects per venture stratum (and research, with --research)")
    sp.add_argument("--k-platform", type=int, default=1)
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--offline", action="store_true", help="skip the origin/main fetch and the open-PR read")
    sp.add_argument("--anyway", action="store_true", help="print the draw even when today's mode is not sample")
    paused_help = "include research/ subjects (left out by default: standalone research paused 2026-11-25)"
    sp.add_argument("--research", action="store_true", help=paused_help)
    sub.add_parser("validate", help="check every audit file")
    sm = sub.add_parser("summary", help="the scoreboard over every audit")
    sm.add_argument("--md", action="store_true")
    mt = sub.add_parser("metrics", help="detailed metrics: gates, defect taxonomy, mutations, fixes, coverage")
    mt.add_argument("--md", action="store_true")
    sub.add_parser("coverage", help="share of the whole repository ever audited")
    ce = sub.add_parser("census", help="the full-repository sweep: never-audited subjects first")
    ce.add_argument("--n", type=int, default=6)
    ce.add_argument("--seed", default=None,
                    help="default: today's date plus a random tail, so concurrent census sessions draw differently")
    ce.add_argument("--no-prs", action="store_true", help="skip the open-PR search that passes over subjects in flight")
    ce.add_argument("--research", action="store_true", help=paused_help)
    qu = sub.add_parser("queue", help="open defects with no fix PR, worst first")
    qu.add_argument("--severity", choices=SEVERITIES, default="medium")
    qu.add_argument("--limit", type=int, default=40)
    qu.add_argument("--no-git", action="store_true", help="skip the per-subject 'changed since audit' git check")
    qu.add_argument("--no-prs", action="store_true",
                    help="skip the open-PR search and the claim-branch read that mark rows another session already has")
    qu.add_argument("--seed", default=None,
                    help="default: today's date plus a random tail; subjects are shuffled by it within a severity")
    qu.add_argument("--research", action="store_true", help=paused_help)
    qu.add_argument("--oldest-first", action="store_true", help="the fixed order (oldest audit first), no shuffle")
    qu.add_argument("--no-fetch", action="store_true",
                    help="in a shallow clone, do not fetch main back to the oldest shown audit (the check may say unknown)")
    mf = sub.add_parser("mark-fixed", help="record a fix PR on an audit's defects, editing the file in place (no reformat)")
    mf.add_argument("file", help="audit file (path, or a name in portfolio/quality/audits/)")
    mf.add_argument("defects", nargs="*", type=int, help="defect indices, from 0 as validate numbers them")
    mf.add_argument("--pr", required=True, help="the fix PR's URL")
    mf.add_argument("--all", action="store_true", help="every defect that has no fixed_by yet")
    mf.add_argument("--force", action="store_true", help="replace a different fixed_by")
    mf.add_argument("--dry-run", action="store_true")
    cl = sub.add_parser("claim", help="claim a subject before fixing its defects (create-only branch; exit 4 if taken)")
    cl.add_argument("subject", help="as queue prints it, e.g. research/energy-store-hx")
    cl.add_argument("--note", default="", help="which defects this session fixes")
    cl.add_argument("--release", action="store_true", help="drop your own claim")
    mo = sub.add_parser("mode", help="which mode today's quality session runs")
    mo.add_argument("--date", default=dt.date.today().isoformat())
    mo.add_argument("--seed", default=None)
    mo.add_argument("--research", action="store_true", help="count research/ highs toward fix mode")
    ra = sub.add_parser("reaudit", help="subjects with a recorded fix that no later audit has checked, highs first")
    ra.add_argument("--limit", type=int, default=15)
    ra.add_argument("--seed", default=None, help="default: today's date plus a random tail, so parallel sessions spread out")
    ra.add_argument("--no-prs", action="store_true", help="skip the open-PR search that puts subjects in flight last")
    ra.add_argument("--research", action="store_true", help=paused_help)
    args = ap.parse_args(argv)

    if args.cmd == "sample":
        if not (args.seed or args.json or args.anyway):
            note = mode_note(dt.date.today().isoformat(), load_audits())
            if note:
                print(note)
                return 0
        fetched = False if args.offline else fetch_main()
        prs = [] if args.offline else open_round_prs()
        local = load_audits()
        every = local + remote_audits(local)
        held = [{"seed": sd} for _, sd in prs if sd]  # seeds open round PRs hold
        seed = args.seed or claim_seed(free_seed(dt.date.today().isoformat(), every + held))
        pop = population()
        # --seed reproduces a round, so its own claim PR is not another round in flight
        in_flight = held_subjects([(r, sd) for r, sd in prs if sd != args.seed], every, pop)
        picks = draw(seed, args.k, args.k_platform, audits=every, pop=pop, exclude=in_flight,
                     k_research=None if args.research else 0)
        rnd = next_round(in_flight=tuple(r for r, _ in prs))
        if args.json:
            print(json.dumps({"seed": seed, "round": rnd, "subjects": picks}, indent=1))
        else:
            if args.anyway and not args.seed and mode_note(dt.date.today().isoformat(), local):
                print("NOTE: --anyway: today's mode is not sample, so this round is a deviation to record.")
            print(f"seed {seed}   round {rnd} (next post: docs/posts/<date>-quality-audit-round-{rnd}.md)")
            if not args.offline:
                held_txt = ", ".join(f"{r}/{sd or '?'}" for r, sd in sorted(prs)) or "none"
                print(f"  open round PRs (round/seed, skipped): {held_txt}"
                      + ("" if fetched else "; origin/main NOT fetched, so merged rounds may be missing"))
                if in_flight:
                    print(f"  subjects those rounds drew (replayed from their seeds, skipped): {', '.join(sorted(in_flight))}")
            print(f"  post {post_limits()}")
            # A PR needs a commit, and two quality records (2026-11-19T04:38, 12:39) committed
            # placeholder posts to claim a round; an empty commit is enough, and this title is
            # the one open_round_prs() parses, so the next session skips this round and seed.
            print(f"  claim now: git commit --allow-empty -m \"{claim_title(rnd, seed)}\", push, and open "
                  f"a draft PR with that title (the squash merge drops the empty commit)")
            for p in picks:
                extra = f" (of {p['population']})" if p.get("population") else ""
                print(f"  {p['stratum']:<9} {p['subject']}{extra}  last audited: {p['last_audited'] or 'never'}")
            drawn = {p["stratum"] for p in picks}
            for st in STRATA:
                if st == "research" and not args.research:
                    print(f"  {st:<9} none drawn: standalone research is paused since 2026-11-25 (--research draws it)")
                elif st not in drawn:
                    days = FLAGSHIP_REAUDIT_DAYS if st == "flagship" else SKIP_DAYS
                    print(f"  {st:<9} none drawn: every subject was audited in the last {days} days (or none exist)")
        return 0
    if args.cmd == "mark-fixed":
        if not args.defects and not args.all:
            ap.error("mark-fixed: name defect indices or pass --all")
        sys.path.insert(0, str(Path(__file__).parent))
        import quality_mark_fixed
        return quality_mark_fixed.run(args.file, args.defects, args.pr, args.all, args.force, args.dry_run, validate_audit)
    if args.cmd == "claim":
        sys.path.insert(0, str(Path(__file__).parent))
        import quality_claim
        return quality_claim.claim(args.subject, args.note, args.release)
    audits = load_audits()
    if args.cmd == "census" and not args.seed:
        # The date alone gave every census session on a day the same draw (doc_friction, 2026-11-15T07:08).
        args.seed = claim_seed(dt.date.today().isoformat())
    if args.cmd == "reaudit" and not args.seed:
        args.seed = claim_seed(dt.date.today().isoformat())
    if args.cmd == "queue":
        if not args.no_fetch and not args.no_git:
            fetched = refresh_main()
            audits, gained = with_main_marks(audits)
            if not fetched:
                print("(fetch of origin/main failed: fixes merged since the last fetch may still show as open)",
                      file=sys.stderr)
            if gained:
                print(f"({gained} defect(s) marked fixed on origin/main but not in this checkout: left out)",
                      file=sys.stderr)
        # Two fix sessions took the same top row the same minute (doc_friction, 2026-11-16T16:41).
        args.seed = None if args.oldest_first else (args.seed or claim_seed(dt.date.today().isoformat()))
    if args.cmd in ("metrics", "coverage", "census", "queue", "mode", "reaudit"):
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
