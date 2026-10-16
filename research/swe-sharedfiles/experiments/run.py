"""Print shared-file exposure for research merges on origin/main since 2026-10-14.

    git fetch --unshallow origin main   # full history needed
    python3 experiments/run.py > experiments/results.txt
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from swe_sharedfiles.analyse import read_history, shared_times, exposure, mean_moves, summary

SINCE = "2026-10-14"
rows = read_history(SINCE, repo=str(Path(__file__).resolve().parents[3]))
s = summary(rows)
print(f"first-parent commits touching research/ since {SINCE}: {s['merges']}")
print(f"touching research/README.md: {s['readme']*100:.1f}%   touching projects.json: {s['projects']*100:.1f}%")
print(f"touching either: {s['shared']} ({s['shared']/s['merges']*100:.1f}%)")
print(f"gap between consecutive shared-file merges: median {s['median_gap']:.1f} min; <10 min {s['gap_lt10']*100:.0f}%; <30 min {s['gap_lt30']*100:.0f}%")
print("\nwindow (min)  share of shared-file merges with an earlier one inside the window   mean earlier moves")
ts = shared_times(rows)
for w in (5, 10, 20, 30, 60, 120, 240):
    print(f"{w:>8}      {exposure(ts, w)*100:5.1f}%                                                  {mean_moves(ts, w):.2f}")

from swe_sharedfiles.analyse import shared_commits, replay_conflict_rate
repo = str(Path(__file__).resolve().parents[3])
cs = shared_commits(SINCE, repo=repo)
print("\nreplay test: later merge b re-applied to a's parent, then merged with earlier a (git merge-tree)")
print("window (min)  pairs  conflict anywhere  conflict in a shared file")
for w in (10, 30, 60):
    tot, bad, sh = replay_conflict_rate(cs, w, repo)
    print(f"{w:>8}  {tot:>8}  {bad:>8} ({bad/tot*100:.1f}%)  {sh:>8} ({sh/tot*100:.1f}%)")
