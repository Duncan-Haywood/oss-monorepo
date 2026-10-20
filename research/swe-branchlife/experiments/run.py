"""Branch lifetime (first commit to merge) of research pull requests, and a replay from the branch start.

    git fetch --unshallow origin main   # full history needed
    python3 experiments/run.py > experiments/results.txt

data/branches.csv comes from experiments/fetch.py; the PR timestamps from swe-prlifetime/data/prs.csv.
Same window and same join as swe-prlifetime, so the two are comparable.
"""
import sys
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from swe_branchlife import analyse as a

COVER_FROM = "2026-10-16T11:20:31Z"
repo = str(ROOT.parents[1])
prs = a.read_prs(ROOT.parent / "swe-prlifetime" / "data" / "prs.csv")
branches = a.read_branches(ROOT / "data" / "branches.csv")
merges = a.research_merges(a.ts(COVER_FROM), repo=repo)
kept, no_pr, unknown, fork = a.join(merges, prs)
rows, missing, skewed = a.attach(kept, branches)
print(f"coverage from {COVER_FROM}; research merges joined to a same-repo PR: {len(kept)}; with commit times: {len(rows)} (missing {missing})")
print(f"  first commit dated after the PR was opened (clock or rewrite; start moved back to creation): {skewed}")
print(f"  PRs whose commit list was truncated at 100: {sum(branches[r['pr']][2] for r in rows)}")

bl = a.branch_minutes(rows)
pl = [max(0, r["merged"] - r["created"]) / 60 for r in rows]
nc = [r["n_commits"] for r in rows]
def line(name, xs):
    print(f"  {name:<22} median {median(xs):7.1f}  p25 {a.pctl(xs, .25):7.1f}  p75 {a.pctl(xs, .75):7.1f}  p90 {a.pctl(xs, .90):7.1f}  max {max(xs):7.0f}")
print(f"\nminutes, n={len(rows)}")
line("branch (1st commit->merge)", bl)
line("PR (creation->merge)", pl)
print(f"  commits per PR: median {median(nc):.0f}, max {max(nc)}; single-commit PRs {sum(c == 1 for c in nc)}/{len(nc)}")
for w in (5, 10, 30, 60, 240):
    k = sum(x <= w for x in bl)
    print(f"  branch merged within {w:>3} min of its first commit: {k}/{len(bl)} ({k/len(bl)*100:.0f}%)")
head = [b - p for b, p in zip(bl, pl)]
print(f"  work done before the PR was opened: median {median(head):.1f} min, p90 {a.pctl(head, .9):.1f}")

sh = [r for r in rows if set(r["files"]) & set(a.SHARED)]
print(f"\nPRs touching a shared index file: {len(sh)} of {len(rows)}")
bs = a.branch_minutes(sh)
print(f"  branch lifetime: median {median(bs):.1f}  p75 {a.pctl(bs, .75):.1f}  p90 {a.pctl(bs, .90):.1f} min")
ld_b = [a.landings_between(r, merges, r["first"]) for r in sh]
ld_p = [a.landings_between(r, merges, r["created"]) for r in sh]
print("shared-file merges landing while each such PR existed")
print(f"  from first commit : mean {sum(ld_b)/len(sh):.2f}; at least one {sum(x > 0 for x in ld_b)}/{len(sh)} ({sum(x > 0 for x in ld_b)/len(sh)*100:.0f}%)")
print(f"  from PR creation  : mean {sum(ld_p)/len(sh):.2f}; at least one {sum(x > 0 for x in ld_p)}/{len(sh)} ({sum(x > 0 for x in ld_p)/len(sh)*100:.0f}%)")

print("\nreplay: PR diff applied to main as of the branch start, then merged with main just before the real merge")
res = []
for r, nb in zip(sh, ld_b):
    c = a.conflicts(r["sha"], a.base_at(r["first"], repo=repo), repo)
    res.append((r, nb, c))
bad = sum(bool(c) for _, _, c in res)
bad_sh = sum(bool(c & set(a.SHARED)) for _, _, c in res)
lo, hi = a.wilson(bad_sh, len(sh))
print(f"  conflict anywhere: {bad}/{len(sh)} ({bad/len(sh)*100:.1f}%)")
print(f"  conflict in a shared index file: {bad_sh}/{len(sh)} ({bad_sh/len(sh)*100:.1f}%, Wilson 95% {lo*100:.1f}-{hi*100:.1f}%)")
w = [(nb, c) for _, nb, c in res if nb > 0]
print(f"  among PRs that saw at least one shared-file landing: {sum(bool(c) for _, c in w)}/{len(w)}")
print(f"  among PRs that saw none: {sum(bool(c) for _, n, c in res if n == 0)}/{sum(n == 0 for _, n, _ in res)}")
print("  conflicting PRs (number, branch min, PR min, shared landings from first commit, files):")
for r, nb, c in res:
    if c:
        print(f"    #{r['pr']}  branch {max(0, r['merged']-r['first'])/60:6.1f}  PR {max(0, r['merged']-r['created'])/60:6.1f}  landings {nb}  {sorted(c)}")

# PR-lifetime replay on the same PRs, to isolate what the earlier start adds
bad_p = sum(bool(a.conflicts(r["sha"], a.base_at(r["created"], repo=repo), repo)) for r in sh)
print(f"  same PRs replayed from PR creation instead (swe-prlifetime method): {bad_p}/{len(sh)} conflict")

print("\nby branch-lifetime band (PRs touching a shared file): n, mean shared landings, conflict anywhere")
for lo_, hi_ in ((0, 10), (10, 30), (30, 120), (120, 1e9)):
    sel = [(r, nb, c) for (r, nb, c), l in zip(res, bs) if lo_ <= l < hi_]
    if sel:
        print(f"  {lo_:>4}-{hi_ if hi_ < 1e9 else 'inf':>4} min: n={len(sel):>3}  mean landings {sum(n for _, n, _ in sel)/len(sel):.2f}  conflict {sum(bool(c) for _, _, c in sel)}/{len(sel)}")

def summ(c):
    """Conflict paths, with runs of generated files under one directory collapsed to a count."""
    by = {}
    for x in sorted(c):
        by.setdefault(x.rsplit("/", 1)[0] if x.count("/") > 2 else x, []).append(x)
    return [f"{d}/ ({len(v)} files)" if len(v) > 1 else v[0] for d, v in by.items()]


print("\nall research PRs (not only shared-file ones): replay from branch start, conflict anywhere")
allc = [(r, a.conflicts(r["sha"], a.base_at(r["first"], repo=repo), repo)) for r in rows]
allb = sum(bool(c) for _, c in allc)
lo, hi = a.wilson(allb, len(rows))
print(f"  {allb}/{len(rows)} ({allb/len(rows)*100:.1f}%, Wilson 95% {lo*100:.1f}-{hi*100:.1f}%)")
print("  conflicting PRs that do not touch a shared index file (number, files):")
for r, c in allc:
    if c and not set(r["files"]) & set(a.SHARED):
        print(f"    #{r['pr']}  {summ(c)}")

PJ = "research/PROJECTS.md"
pj = [(r, c) for r, c in allc if PJ in r["files"]]
print(f"\nPRs that edit {PJ}: {len(pj)} of {len(rows)}; replay conflict in it: {sum(PJ in c for _, c in pj)}/{len(pj)}")
nonpj = [c for r, c in allc if PJ not in r["files"]]
print(f"  conflicts among the {len(nonpj)} that do not: {sum(bool(c) for c in nonpj)}")
others = {}
for r in rows:
    for f in r["files"]:
        if f.count("/") == 1:
            others[f] = others.get(f, 0) + 1
print("  PRs per top-level research file (all PRs):", dict(sorted(others.items(), key=lambda kv: -kv[1])))
