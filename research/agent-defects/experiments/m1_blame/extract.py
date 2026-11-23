#!/usr/bin/env python3
"""Milestone 1: link every audited defect to the pull request that wrote its line.

    python3 research/agent-defects/experiments/m1_blame/extract.py [--jobs 12] [--limit N]

For each defect in portfolio/quality/audits/*.json whose `where` names
`path:line`, find the main commit that added the audit file, blame the file at
that commit's first parent (the tree the auditor read), and record the commit
that last wrote the defect line (the *case*). For the same file and commit, draw
three *control* lines: non-blank lines at least 10 lines from every defect line
the audit names in that file, uniformly at random (seeded by audit and path).

Every blamed commit is mapped to the pull request that put it on main: a
squash commit on main's first-parent chain carries `(#N)`; a commit that came in
through a merge commit belongs to that merge's PR.

Writes, next to the project:
  data/lines.csv.gz   one row per blamed line (case or control)
  data/prs.csv.gz     one row per PR on main's first-parent chain: number, merge
                   time, subject, files touched (count), proxies (see analyse.py)

Needs the full history (`git fetch --unshallow --filter=blob:none origin main`
is enough; blame fetches the blobs it needs). Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import glob
import hashlib
import json
import random
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
ROOT = PROJECT.parents[1]
DATA = PROJECT / "data"
AUDITS = ROOT / "portfolio" / "quality" / "audits"

WHERE = re.compile(r"^([\w./@+-]+?):(\d+)(?:\s*[-–]\s*(\d+))?")
SQUASH = re.compile(r"\(#(\d+)\)\s*$")
MERGE = re.compile(r"^Merge pull request #(\d+)")
N_CONTROLS = 3
MIN_GAP = 10


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], check=True,
                          capture_output=True).stdout.decode("utf-8", "replace")


def parse_where(where: str) -> tuple[str, int] | None:
    """`path:line` (or `path:a-b`, which takes a) from a defect's `where`, else None."""
    m = WHERE.match((where or "").strip())
    if not m or "/" not in m.group(1):
        return None
    return m.group(1), int(m.group(2))


def first_parent_table() -> tuple[dict[str, dict], dict[str, int]]:
    """Commits on main's first-parent chain (sha -> info) and sha -> PR for every commit on main."""
    out = git("log", "--first-parent", "--format=%H%x1f%P%x1f%cI%x1f%s", "HEAD")
    fp: dict[str, dict] = {}
    owner: dict[str, int] = {}
    merges = []
    for line in out.splitlines():
        sha, parents, when, subj = line.split("\x1f", 3)
        ps = parents.split()
        m = SQUASH.search(subj) or MERGE.match(subj)
        pr = int(m.group(1)) if m else None
        fp[sha] = {"pr": pr, "when": when, "subject": subj, "parents": ps}
        if pr is not None:
            owner[sha] = pr
        if len(ps) == 2 and pr is not None:
            merges.append((sha, ps, pr))
    for sha, ps, pr in merges:
        for c in git("rev-list", f"{ps[0]}..{ps[1]}").split():
            owner.setdefault(c, pr)
    return fp, owner


def audit_commits() -> dict[str, str]:
    """Audit file name -> the first-parent main commit that first added it."""
    out = git("log", "--first-parent", "--reverse", "--diff-filter=A", "--format=@%H",
              "--name-only", "HEAD", "--", "portfolio/quality/audits")
    added: dict[str, str] = {}
    cur = ""
    for ln in out.splitlines():
        if ln.startswith("@"):
            cur = ln[1:]
        elif ln.strip():
            added.setdefault(Path(ln.strip()).name, cur)
    return added


def blame(rev: str, path: str) -> list[tuple[str, str]] | None:
    """[(sha, content)] for every line of path at rev, or None if the file is absent."""
    try:
        out = git("blame", "--porcelain", rev, "--", path)
    except subprocess.CalledProcessError:
        return None
    lines: list[tuple[str, str]] = []
    cur = None
    for ln in out.splitlines():
        if ln.startswith("\t"):
            lines.append((cur, ln[1:]))
        else:
            tok = ln.split(" ", 1)[0]
            if len(tok) == 40 and all(c in "0123456789abcdef" for c in tok):
                cur = tok
    return lines


def pick_controls(n_lines: int, blank: set[int], defect_lines: list[int], seed: str,
                  k: int = N_CONTROLS, gap: int = MIN_GAP) -> list[int]:
    """k distinct 1-based line numbers, non-blank and >= gap from every defect line."""
    pool = [i for i in range(1, n_lines + 1)
            if i not in blank and all(abs(i - d) >= gap for d in defect_lines)]
    rng = random.Random(int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16))
    return sorted(rng.sample(pool, min(k, len(pool))))


def collect_defects() -> list[dict]:
    rows = []
    for f in sorted(glob.glob(str(AUDITS / "*.json"))):
        d = json.load(open(f))
        for i, x in enumerate(d.get("defects") or []):
            loc = parse_where(x.get("where", ""))
            rows.append({"audit": Path(f).name, "idx": i, "date": d.get("date"),
                         "stratum": d.get("stratum"), "drawn_by": d.get("drawn_by", "sample"),
                         "subject": d.get("subject"), "severity": x.get("severity"),
                         "category": x.get("category") or "", "origin": x.get("origin") or "",
                         "fixed_by": x.get("fixed_by") or "",
                         "path": loc[0] if loc else "", "line": loc[1] if loc else 0})
    return rows


def write_prs(fp: dict[str, dict], paths: set[str]) -> None:
    """data/prs.csv.gz: every PR on main's first-parent chain, oldest first, with the
    PRs it names, how many paths it touched, and which of `paths` (the audited
    files) it touched. Only audited paths are kept so the file stays small."""
    log = git("log", "--first-parent", "--reverse", "--format=@@@%H%x1f%cI%x1f%s%x1f%b%x1e",
              "--name-only", "--no-renames", "HEAD")
    with gzip.open(DATA / "prs.csv.gz", "wt", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["pr", "sha", "merged", "subject", "refs", "n_files", "files"])
        for chunk in log.split("@@@")[1:]:
            head, _, rest = chunk.partition("\x1e")
            sha, when, subj, body = head.split("\x1f", 3)
            info = fp.get(sha)
            if not info or info["pr"] is None:
                continue
            refs = sorted({int(x) for x in re.findall(r"#(\d{2,5})\b", subj + "\n" + body)} - {info["pr"]})
            files = [f for f in rest.split("\n") if f.strip()]
            w.writerow([info["pr"], sha, when, subj, " ".join(map(str, refs)), len(files),
                        "|".join(f for f in files if f in paths)])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=12)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--prs-only", action="store_true", help="rewrite data/prs.csv.gz from data/lines.csv.gz")
    a = ap.parse_args()

    fp, owner = first_parent_table()
    if a.prs_only:
        with gzip.open(DATA / "lines.csv.gz", "rt", newline="") as fh:
            write_prs(fp, {r["path"] for r in csv.DictReader(fh) if r["path"]})
        return 0
    defects = collect_defects()
    commits = audit_commits()

    groups: dict[tuple[str, str], list[dict]] = {}
    for r in defects:
        c = commits.get(r["audit"])
        r["audit_commit"] = c or ""
        if r["path"] and c:
            base = fp.get(c, {}).get("parents", [None])[0] or f"{c}^"
            r["base"] = base
            groups.setdefault((r["audit"], r["path"]), []).append(r)
    keys = sorted(groups)
    if a.limit:
        keys = keys[: a.limit]

    def work(key):
        audit, path = key
        rs = groups[key]
        bl = blame(rs[0]["base"], path)
        out = []
        if bl is None:
            for r in rs:
                out.append({**r, "role": "case", "status": "no-file"})
            return out
        blank = {i + 1 for i, (_, t) in enumerate(bl) if not t.strip()}
        dls = [r["line"] for r in rs]
        for r in rs:
            if not 1 <= r["line"] <= len(bl):
                out.append({**r, "role": "case", "status": "out-of-range"})
                continue
            sha, text = bl[r["line"] - 1]
            out.append({**r, "role": "case", "status": "ok" if text.strip() else "blank",
                        "blamed": sha, "pr": owner.get(sha, ""), "text": text.strip()[:120]})
        for ln in pick_controls(len(bl), blank, dls, f"{audit}|{path}"):
            sha, text = bl[ln - 1]
            out.append({**rs[0], "idx": "", "severity": "", "category": "", "origin": "",
                        "fixed_by": "", "line": ln, "role": "control", "status": "ok",
                        "blamed": sha, "pr": owner.get(sha, ""), "text": text.strip()[:120]})
        return out

    rows: list[dict] = []
    with ThreadPoolExecutor(a.jobs) as ex:
        for i, out in enumerate(ex.map(work, keys)):
            rows.extend(out)
            if i % 200 == 0:
                print(f"{i}/{len(keys)} files", file=sys.stderr, flush=True)
    for r in defects:
        if not r["path"]:
            rows.append({**r, "role": "case", "status": "no-line"})
        elif not r.get("audit_commit"):
            rows.append({**r, "role": "case", "status": "no-audit-commit"})

    DATA.mkdir(exist_ok=True)
    cols = ["role", "status", "audit", "idx", "date", "stratum", "drawn_by", "subject", "severity",
            "category", "origin", "fixed_by", "path", "line", "audit_commit", "blamed", "pr", "text"]
    with gzip.open(DATA / "lines.csv.gz", "wt", newline="") as fh:
        w = csv.DictWriter(fh, cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r["audit"], r["path"], r["role"], int(r["line"] or 0))))

    write_prs(fp, {r["path"] for r in rows if r.get("path")})
    print(f"ok: {sum(r['role']=='case' for r in rows)} cases, "
          f"{sum(r['role']=='control' for r in rows)} controls", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
