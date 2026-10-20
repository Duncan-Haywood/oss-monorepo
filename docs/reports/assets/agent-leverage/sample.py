#!/usr/bin/env python3
"""Draw the merged-PR sample for the human-time study and build blind diff packs.

    python3 docs/reports/assets/agent-leverage/sample.py draw   # rewrite sample.json (seeded)
    python3 docs/reports/assets/agent-leverage/sample.py packs OUT_DIR

`draw` samples merged pull requests from prompts/derived/runs.json, stratified
by track, with a fixed seed, and records each run's own human-hours estimate
(runcost.py `human_equivalent`) next to it. `packs` writes one text file per PR
(commit message, diff stat, diff truncated at 30,000 characters, run records
excluded) that does NOT contain the run's own estimate, so an estimator reading
it is blind to it. See HANDOFF.md for the rest of the study.

Standard library only; needs `git` and network access to fetch merge commits.
"""
from __future__ import annotations

import glob
import json
import random
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
SEED = 20261020
QUOTA = {"research": 14, "ventures": 10, "process": 4, "redteam": 4, "explore": 4, "review": 4}


def draw() -> None:
    g = json.loads((ROOT / "prompts/derived/github.json").read_text())
    rows = json.loads((ROOT / "prompts/derived/runs.json").read_text())["rows"]
    recs = {}
    for f in glob.glob(str(ROOT / "prompts/runs/*.json")):
        try:
            recs[Path(f).name] = json.loads(Path(f).read_text())
        except (OSError, ValueError):
            pass
    pool = []
    for r in rows:
        m = r.get("measured") or {}
        if not m.get("merged") or not r["pr"].lower().startswith("duncan-haywood/oss-monorepo#"):
            continue
        u = recs.get(r["record"], {}).get("usage") or {}
        pool.append(dict(pr=int(r["pr"].split("#")[1]), track=r["track"],
                         sha=(g.get(r["pr"].lower()) or {}).get("merge_commit_sha"),
                         self_h=(u.get("human_equivalent") or {}).get("hours"),
                         active=(u.get("time") or {}).get("active_minutes"),
                         cost=(u.get("totals") or {}).get("api_equivalent_usd"),
                         model=u.get("primary_model"), add=m.get("additions"), dele=m.get("deletions")))
    rng = random.Random(SEED)
    sample = []
    for track, n in QUOTA.items():
        sample += rng.sample([p for p in pool if p["track"] == track and p["sha"]], n)
    out = dict(pool_size=len(pool), seed=SEED, quota=QUOTA, sample=sample)
    (HERE / "sample.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"pool {len(pool)}, sampled {len(sample)}")


def packs(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    sample = json.loads((HERE / "sample.json").read_text())["sample"]
    subprocess.run(["git", "fetch", "-q", "--depth=2", "origin", *[x["sha"] for x in sample]], cwd=ROOT, check=True)
    for x in sample:
        sha = x["sha"]
        git = lambda *a: subprocess.check_output(["git", *a], cwd=ROOT, text=True, errors="replace")
        parent = git("rev-parse", sha + "^1").strip()
        diff = git("diff", parent, sha, "--", ".", ":(exclude)prompts/runs/*")
        if len(diff) > 30000:
            diff = diff[:30000] + "\n... [diff truncated at 30,000 chars; see stat above for full size]\n"
        (out / f"pr{x['pr']}.txt").write_text(
            f"PR #{x['pr']}\nMESSAGE:\n{git('log', '-1', '--format=%s%n%n%b', sha)}\n"
            f"STAT:\n{git('diff', '--stat=120', parent, sha)}\nDIFF:\n{diff}")
    print(f"wrote {len(sample)} packs to {out}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["draw"]:
        draw()
    elif sys.argv[1:2] == ["packs"] and len(sys.argv) == 3:
        packs(sys.argv[2])
    else:
        sys.exit(__doc__)
