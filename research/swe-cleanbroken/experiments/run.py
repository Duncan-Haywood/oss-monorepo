"""For pairs of research merges close together in time, replay them and classify the result.

    git fetch --unshallow origin main   # full history needed
    python3 experiments/run.py > experiments/results.txt
"""
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "swe-sharedfiles" / "src"))
from swe_cleanbroken.check import classify, pairs, tree_errors  # noqa: E402
from swe_sharedfiles.analyse import shared_commits  # noqa: E402

SINCE, TIP = "2026-10-14", "560a599a7bffa966fe73f9391d22336a43db2f82"  # origin/main when run; pinned so numbers do not move
REPO = str(ROOT.parents[1])
import subprocess  # noqa: E402

out = subprocess.run(["git", "-C", REPO, "log", TIP, "--first-parent", f"--since={SINCE}", "--format=%ct %H", "--", *("research/README.md", "research/_homepage/projects.json")],
                     capture_output=True, text=True, check=True).stdout
cs = sorted((int(l.split()[0]), l.split()[1]) for l in out.splitlines())
print(f"first-parent commits on origin/main touching an index file, since {SINCE}, up to {TIP[:9]}: {len(cs)}")

states = [(sha, tree_errors(sha + "^{tree}", REPO)) for _, sha in cs]
bad = [(s, e) for s, e in states if e]
print(f"commits whose own tree fails the checks: {len(bad)} of {len(cs)}")
prev = set()
for sha, errs in states:  # report each error where it first appears
    new = set(errs) - prev
    prev = set(errs)
    for k, v in sorted(new):
        subj = subprocess.run(["git", "-C", REPO, "log", "-1", "--format=%s", sha], capture_output=True, text=True).stdout.strip()
        print(f"  first seen at {sha[:9]}: {k}: {v}  [{subj[:70]}]")
print(f"errors still present at the last commit: {sorted(prev)}")

print("\nwindow (min)  pairs  conflict   clean+consistent   clean but broken")
detail = Counter()
for w in (10, 30, 60):
    c = Counter()
    for a, b in pairs(cs, w):
        kind, info = classify(a, b, REPO)
        c[kind] += 1
        if kind == "broken":
            detail.update(k for k, _ in info)
    n = sum(c.values())
    pct = lambda k: f"{c[k]:>4} ({c[k]/n*100:4.1f}%)"
    print(f"{w:>8}  {n:>8}  {pct('conflict')}  {pct('ok')}      {pct('broken')}")
print("\nkinds of breakage among clean-but-broken pairs, all windows:", dict(detail) or "none")
