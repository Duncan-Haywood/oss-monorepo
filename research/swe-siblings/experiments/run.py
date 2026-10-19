"""Overlap of what sibling projects ask, within slug families vs across them.

    python3 experiments/run.py > experiments/results.txt
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from swe_siblings import analyse as a

projects = a.load(ROOT.parent)
fams, across = a.summarise(projects)
n_all = len(projects)
print(f"projects with a title and Question section: {n_all}")
print(f"cross-family pairs: {len(across)}; mean Jaccard {a.mean(across):.3f}")
allw = [j for v in fams.values() for j, _, _ in v]
print(f"within-family pairs (families with >=5 projects: {len(fams)}): {len(allw)}; mean Jaccard {a.mean(allw):.3f}")
print("\nfamily            projects  pairs  mean   max")
rows = []
for f, v in fams.items():
    members = {x for _, p, q in v for x in (p, q)}
    rows.append((a.mean(j for j, _, _ in v), f, len(members), len(v), max(j for j, _, _ in v)))
for m, f, n, p, mx in sorted(rows, reverse=True):
    print(f"{f:<16} {n:>8} {p:>6} {m:6.3f} {mx:5.3f}")
print("\nclosest 15 sibling pairs (Jaccard of title+Question words):")
top = sorted(((j, p, q) for v in fams.values() for j, p, q in v), reverse=True)[:15]
for j, p, q in top:
    print(f"  {j:.3f}  {p}  {q}")
