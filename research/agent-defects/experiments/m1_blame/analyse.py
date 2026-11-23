#!/usr/bin/env python3
"""Milestone 1 analysis: do 14-day rework proxies flag the PRs that wrote audited defect lines?

    python3 research/agent-defects/experiments/m1_blame/analyse.py

Reads data/lines.csv.gz and data/prs.csv.gz (written by extract.py) and the run
records in prompts/runs/, and writes experiments/m1_blame/results.txt.

Unit: a blamed line. A *case* is a line an audit names as a defect's location;
a *control* is a random non-blank line of the same file at the same tree, at
least 10 lines from every defect line of that audit. Each line's exposure is a
property of the PR that wrote it, computed from main's history only up to
min(merge + 14 days, the audit's date), so nothing the audit caused counts:

  named_fix   a later PR in the window names #P and its subject reads as a fix
  named_any   a later PR in the window names #P at all
  fix_touch   a later PR in the window with a fix-like subject touches the file
  reverted    a later commit's subject is `Revert "<P's subject>"`
  big         P added files to more than 20 paths (a sweep), a size exposure
  latency     audit date minus P's merge date (cases only; H2)

Odds ratios are Mantel-Haenszel over strata (audit, file) with the
Robins-Breslow-Greenland 95% interval, plus a cluster bootstrap over audits.
Standard library only.
"""
from __future__ import annotations

import csv
import gzip
import sys
import glob
import json
import math
import random
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

csv.field_size_limit(sys.maxsize)
HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
ROOT = PROJECT.parents[1]
DATA = PROJECT / "data"
WINDOW = timedelta(days=14)
FIX = re.compile(r"\b(fix(e[sd])?|bug|wrong|correct(s|ed)?|repair|broken|regression|typo|"
                 r"mistake|off[- ]by|crash|error)\b", re.I)
BIG_FILES = 20
SEVERE = {"high", "medium"}


def parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)


def load_prs(path: Path = DATA / "prs.csv.gz") -> dict[int, dict]:
    prs: dict[int, dict] = {}
    with gzip.open(path, "rt", newline="") as fh:
        for r in csv.DictReader(fh):
            n = int(r["pr"])
            prs[n] = {"pr": n, "merged": parse_time(r["merged"]), "subject": r["subject"],
                      "refs": {int(x) for x in r["refs"].split()},
                      "n_files": int(r["n_files"]),
                      "files": [f for f in r["files"].split("|") if f]}
    return prs


class History:
    """Index main's PRs by referenced number and by file, in merge order."""

    def __init__(self, prs: dict[int, dict]):
        self.prs = prs
        self.by_ref: dict[int, list[dict]] = defaultdict(list)
        self.by_file: dict[str, list[dict]] = defaultdict(list)
        self.by_subject: dict[str, list[dict]] = defaultdict(list)
        for p in sorted(prs.values(), key=lambda p: p["merged"]):
            for x in p["refs"]:
                self.by_ref[x].append(p)
            for f in p["files"]:
                self.by_file[f].append(p)
            m = re.match(r'^Revert "(.*)"', p["subject"])
            if m:
                self.by_subject[m.group(1)].append(p)

    def exposures(self, pr: int, path: str, audit_date: datetime) -> dict | None:
        p = self.prs.get(pr)
        if p is None:
            return None
        start = p["merged"]
        end = min(start + WINDOW, audit_date)

        def within(q):
            return q["pr"] != pr and start < q["merged"] <= end

        named = [q for q in self.by_ref.get(pr, []) if within(q)]
        return {
            "named_any": bool(named),
            "named_fix": any(FIX.search(q["subject"]) for q in named),
            "fix_touch": any(within(q) and FIX.search(q["subject"]) for q in self.by_file.get(path, [])),
            "reverted": any(q["merged"] > start for q in self.by_subject.get(p["subject"], [])),
            "big": p["n_files"] > BIG_FILES,
            "window_days": (end - start).total_seconds() / 86400,
            "latency_days": (audit_date - start).total_seconds() / 86400,
        }


def run_records() -> dict[int, dict]:
    """PR number -> {model, track, prompt_version} from prompts/runs/ (first record wins)."""
    out: dict[int, dict] = {}
    for f in sorted(glob.glob(str(ROOT / "prompts" / "runs" / "*.json"))):
        try:
            d = json.load(open(f))
        except (OSError, ValueError):
            continue
        if not isinstance(d, dict):
            continue
        m = re.search(r"oss-monorepo/pull/(\d+)", str(d.get("pr") or "")) or \
            re.fullmatch(r"#?(\d+)", str(d.get("pr") or "").strip())
        if m and (not d.get("repo") or "oss-monorepo" in str(d.get("repo"))):
            out.setdefault(int(m.group(1)), {"model": d.get("model") or "", "track": d.get("track") or "",
                                             "prompt_version": str(d.get("prompt_version"))})
    return out


def mantel_haenszel(strata: list[tuple[int, int, int, int]]) -> tuple[float, float, float]:
    """MH odds ratio and RBG 95% interval. Each stratum is (a, b, c, d):
    a = exposed cases, b = unexposed cases, c = exposed controls, d = unexposed controls."""
    R = S = PR = PS_QR = QS = 0.0
    for a, b, c, d in strata:
        n = a + b + c + d
        if n == 0:
            continue
        r, s = a * d / n, b * c / n
        P, Q = (a + d) / n, (b + c) / n
        R += r
        S += s
        PR += P * r
        PS_QR += P * s + Q * r
        QS += Q * s
    if R == 0 or S == 0:
        return (float("nan"),) * 3
    orr = R / S
    var = PR / (2 * R * R) + PS_QR / (2 * R * S) + QS / (2 * S * S)
    se = math.sqrt(var)
    return orr, math.exp(math.log(orr) - 1.96 * se), math.exp(math.log(orr) + 1.96 * se)


def strata_for(rows: list[dict], key: str) -> dict[tuple, list[int]]:
    st: dict[tuple, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for r in rows:
        e = bool(r[key])
        i = (0 if e else 1) if r["role"] == "case" else (2 if e else 3)
        st[(r["audit"], r["path"])][i] += 1
    return st


def bootstrap_or(rows: list[dict], key: str, reps: int = 400, seed: int = 7) -> tuple[float, float]:
    by_audit: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_audit[r["audit"]].append(r)
    audits = sorted(by_audit)
    rng = random.Random(seed)
    vals = []
    for _ in range(reps):
        st: list[tuple] = []
        for j, a in enumerate(rng.choice(audits) for _ in audits):
            for (k, v) in strata_for(by_audit[a], key).items():
                st.append(tuple(v))
        o = mantel_haenszel(st)[0]
        if not math.isnan(o):
            vals.append(o)
    vals.sort()
    if not vals:
        return float("nan"), float("nan")
    return vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return float("nan"), float("nan")
    z, p = 1.96, k / n
    den = 1 + z * z / n
    mid = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return mid - half, mid + half


def build_rows() -> tuple[list[dict], Counter]:
    prs = load_prs()
    hist = History(prs)
    status = Counter()
    rows = []
    with gzip.open(DATA / "lines.csv.gz", "rt", newline="") as fh:
        for r in csv.DictReader(fh):
            status[(r["role"], r["status"])] += 1
            if r["status"] != "ok":
                continue
            if not r["pr"]:
                status[(r["role"], "no-pr")] += 1
                continue
            audit_date = datetime.fromisoformat(r["date"]) + timedelta(days=1)
            ex = hist.exposures(int(r["pr"]), r["path"], audit_date)
            if ex is None:
                status[(r["role"], "pr-not-on-chain")] += 1
                continue
            if ex["latency_days"] < 0:
                status[(r["role"], "merged-after-audit")] += 1
                continue
            rows.append({**r, **ex})
    return rows, status


def main() -> int:
    rows, status = build_rows()
    recs = run_records()
    out: list[str] = []
    w = out.append
    w("agent-defects milestone 1: audited defect lines against matched control lines")
    w("generated by experiments/m1_blame/analyse.py from data/lines.csv.gz and data/prs.csv.gz")
    w("")
    w("line status (role, status): count")
    for k, v in sorted(status.items()):
        w(f"  {k[0]:8s} {k[1]:20s} {v}")
    cases = [r for r in rows if r["role"] == "case"]
    ctrls = [r for r in rows if r["role"] == "control"]
    w("")
    w(f"usable lines: {len(cases)} cases from {len({r['audit'] for r in cases})} audits, "
      f"{len(ctrls)} controls; distinct case PRs {len({r['pr'] for r in cases})}, "
      f"control PRs {len({r['pr'] for r in ctrls})}")
    w(f"case lines whose PR also wrote a control line in the same file: "
      f"{sum(1 for r in cases if any(c['pr']==r['pr'] and c['audit']==r['audit'] and c['path']==r['path'] for c in ctrls))}")

    def table(label, sub_cases_filter, both=False):
        sub = [r for r in rows if (r["role"] == "control" and not both) or sub_cases_filter(r)]
        keep = {(r["audit"], r["path"]) for r in sub if r["role"] == "case"}
        sub = [r for r in sub if (r["audit"], r["path"]) in keep]
        nc = sum(r["role"] == "case" for r in sub)
        nk = len(sub) - nc
        w("")
        w(f"[{label}] {nc} case lines, {nk} control lines, {len(keep)} strata (audit, file)")
        w(f"  {'proxy':10s} {'cases flagged':>16s} {'controls flagged':>18s} {'MH OR':>7s} {'95% CI (RBG)':>16s} {'bootstrap 95%':>16s}")
        for key in ("named_fix", "named_any", "fix_touch", "reverted", "big"):
            a = sum(1 for r in sub if r["role"] == "case" and r[key])
            c = sum(1 for r in sub if r["role"] == "control" and r[key])
            o, lo, hi = mantel_haenszel([tuple(v) for v in strata_for(sub, key).values()])
            blo, bhi = bootstrap_or(sub, key) if key != "reverted" else (float("nan"),) * 2
            w(f"  {key:10s} {a:6d} ({100*a/max(nc,1):5.1f}%) {c:8d} ({100*c/max(nk,1):5.1f}%) "
              f"{o:7.2f} [{lo:5.2f}, {hi:5.2f}] [{blo:5.2f}, {bhi:5.2f}]")
        anyp = lambda r: r["named_fix"] or r["fix_touch"] or r["reverted"]
        flagged = sum(1 for r in sub if r["role"] == "case" and anyp(r))
        cf = sum(1 for r in sub if r["role"] == "control" and anyp(r))
        lo, hi = wilson(flagged, nc)
        clo, chi = wilson(cf, nk)
        w(f"  'any fix proxy' (named_fix or fix_touch or reverted): cases {flagged}/{nc} = "
          f"{100*flagged/max(nc,1):.1f}% [{100*lo:.1f}, {100*hi:.1f}], controls {cf}/{nk} = "
          f"{100*cf/max(nk,1):.1f}% [{100*clo:.1f}, {100*chi:.1f}]")
        pr_strata = defaultdict(set)
        for r in sub:
            pr_strata[(r["audit"], r["path"])].add((r["role"], r["pr"]))
        mixed = sum(1 for v in pr_strata.values()
                    if {p for role, p in v if role == "case"} != {p for role, p in v if role == "control"})
        w(f"  strata where case and control lines were not all written by the same PR(s): {mixed} of {len(pr_strata)}")

    table("all severities", lambda r: True)
    table("high severity", lambda r: r["severity"] == "high")
    table("high or medium", lambda r: r["severity"] in SEVERE)
    table("full 14-day window closed before the audit", lambda r: r["window_days"] >= 13.99, both=True)
    table("sampled audits only (uniform draws)", lambda r: r["drawn_by"] == "sample")
    for s in ("venture", "research", "flagship", "platform"):
        table(f"stratum {s}", lambda r, s=s: r["stratum"] == s)

    w("")
    w("H2 latency: days from the case PR's merge to its audit")
    for label, f in (("all", lambda r: True), ("high", lambda r: r["severity"] == "high")):
        lat = sorted(r["latency_days"] for r in cases if f(r))
        if lat:
            q = lambda p: lat[min(len(lat) - 1, int(p * len(lat)))]
            w(f"  {label:5s} n={len(lat)} median {statistics.median(lat):.1f}  p10 {q(.1):.1f}  p25 {q(.25):.1f}  "
              f"p75 {q(.75):.1f}  p90 {q(.9):.1f}  share over 14 days {100*sum(x>14 for x in lat)/len(lat):.1f}%")
    full = [r for r in cases if r["window_days"] >= 13.99]
    w(f"  case lines whose full 14-day window closed before the audit: {len(full)} of {len(cases)}")

    w("")
    w("case lines by the run record of the PR that wrote them (exploratory; records exist for some PRs)")
    for key in ("model", "track"):
        cc = Counter(recs.get(int(r["pr"]), {}).get(key, "(no record)") for r in cases)
        kc = Counter(recs.get(int(r["pr"]), {}).get(key, "(no record)") for r in ctrls)
        w(f"  by {key}: value, case lines, control lines, case share of the value's lines")
        for v in sorted(set(cc) | set(kc), key=lambda v: -(cc[v] + kc[v]))[:8]:
            n = cc[v] + kc[v]
            w(f"    {v or '(blank)':28s} {cc[v]:5d} {kc[v]:6d}  {100*cc[v]/n:5.1f}%")

    w("")
    w("defect category of case lines (audit's own label where set)")
    for k, v in Counter(r["category"] or "(unset)" for r in cases).most_common(12):
        w(f"  {k:28s} {v}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
