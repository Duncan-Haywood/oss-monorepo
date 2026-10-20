"""Real pull-request lifetimes for research merges, and a per-PR replay from the real creation time.

    git fetch --unshallow origin main   # full history needed
    python3 experiments/run.py > experiments/results.txt

data/prs.csv holds the creation and merge times of the closed pull requests the GitHub API listed
(see the README for how it was fetched). Coverage starts at COVER_FROM.
"""
import sys
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from swe_prlifetime import analyse as a

COVER_FROM = "2026-10-16T11:20:31Z"   # earliest update time in the fetched pages: every PR merged after it is listed
repo = str(ROOT.parents[1])
prs = a.read_prs(ROOT / "data" / "prs.csv")
t0 = a.ts(COVER_FROM)
merges = [m for m in a.research_merges(t0, repo=repo)]
kept, no_pr, unknown, fork = a.join(merges, prs)
print(f"coverage from {COVER_FROM}; first-parent commits touching research/: {len(merges)}")
print(f"  joined to a same-repo merged PR: {len(kept)}; subject names no PR: {no_pr}; PR not in the data: {unknown}; fork head: {fork}")

lt = a.lifetimes_min(kept)
print(f"\nlifetime (creation to merge), minutes, n={len(lt)}")
print(f"  median {median(lt):.1f}  p25 {a.pctl(lt, .25):.1f}  p75 {a.pctl(lt, .75):.1f}  p90 {a.pctl(lt, .90):.1f}  max {max(lt):.0f}")
for w in (5, 10, 30, 60, 240):
    k = sum(x <= w for x in lt)
    print(f"  merged within {w:>3} min of creation: {k}/{len(lt)} ({k/len(lt)*100:.0f}%)")

sh = [k for k in kept if set(k["files"]) & set(a.SHARED)]
ls = a.lifetimes_min(sh)
print(f"\nPRs touching a shared index file: {len(sh)} of {len(kept)}")
print(f"  their lifetime: median {median(ls):.1f}  p75 {a.pctl(ls, .75):.1f}  p90 {a.pctl(ls, .90):.1f} min")
ld = [a.landings_during(k, merges) for k in sh]
print("\nshared-file merges that landed on main while each such PR was open (real creation to real merge)")
print(f"  mean {sum(ld)/len(ld):.2f}; PRs with at least one: {sum(x > 0 for x in ld)}/{len(ld)} ({sum(x > 0 for x in ld)/len(ld)*100:.0f}%)")

print("\nreplay: each such PR's diff applied to main as of its creation, then merged with main just before its merge")
bad = bad_sh = 0
bad_with = n_with = 0
for k, n in zip(sh, ld):
    c = a.conflicts(k["sha"], a.base_at(k["created"], repo=repo), repo)
    bad += bool(c)
    bad_sh += bool(c & set(a.SHARED))
    if n > 0:
        n_with += 1
        bad_with += bool(c)
lo, hi = a.wilson(bad_sh, len(sh))
print(f"  conflict anywhere: {bad}/{len(sh)} ({bad/len(sh)*100:.1f}%)")
print(f"  conflict in a shared index file: {bad_sh}/{len(sh)} ({bad_sh/len(sh)*100:.1f}%, Wilson 95% {lo*100:.1f}-{hi*100:.1f}%)")
if n_with:
    print(f"  among PRs that saw at least one shared-file landing: {bad_with}/{n_with} conflict anywhere ({bad_with/n_with*100:.1f}%)")
print(f"  among PRs that saw none: {bad - bad_with}/{len(sh) - n_with} conflict anywhere")

print("\nby lifetime band (PRs touching a shared file): n, mean landings seen, conflict anywhere")
rows = list(zip(sh, ld, ls))
for lo_, hi_ in ((0, 10), (10, 30), (30, 120), (120, 1e9)):
    sel = [(k, n) for k, n, l in rows if lo_ <= l < hi_]
    if not sel:
        continue
    cb = sum(bool(a.conflicts(k["sha"], a.base_at(k["created"], repo=repo), repo)) for k, _ in sel)
    print(f"  {lo_:>4}-{hi_ if hi_ < 1e9 else 'inf':>4} min: n={len(sel):>3}  mean landings {sum(n for _, n in sel)/len(sel):.2f}  conflict {cb}/{len(sel)}")
