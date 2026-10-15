"""Backfill output from committed git history. Prints results.txt."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_backfill.backfill import *

commits = load(os.path.join(HERE, "commits.jsonl"))
P = projects(commits)
pct = lambda x: f"{100 * x:.0f}%"
ci = lambda r: f"{r['k']}/{r['n']} = {pct(r['rate'])} (95% Wilson {pct(r['lo'])} to {pct(r['hi'])})"
first, last = min(when(c) for c in commits), max(when(c) for c in commits)
print(f"commits touching research/<slug>/: {len(commits)}   projects: {len(P)}   span: {first:%Y-%m-%d} to {last:%Y-%m-%d}")
print(f"projects since removed: {sum(p['removed'] for p in P.values())}")

print("\nprojects created per UTC day")
for d, n in per_day(P).items():
    print(f"  {d} {n:4d}")

print("\nper track (slug prefix): projects, commits, test files added")
for t, v in per_track(P).items():
    print(f"  {t:10s} {v['projects']:4d} {v['commits']:5d} {v['tests_added']:5d}")

fams = followup_families(P)
mem = family_members(fams)
print(f"\nfollow-up families (>=3 slugs sharing a stem): {len(fams)}; {len(mem)} of {len(P)} projects "
      f"= {pct(len(mem) / len(P))} sit in one")
for k, v in sorted(fams.items(), key=lambda kv: -len(kv[1]))[:12]:
    print(f"  {k:28s} {len(v)}")

rows = later_touches(P)
print("\nlater commits within 14 days of creation (obs. = creation at least 14 days before the end of the history)")
print("  never touched again, all projects:", ci(never_touched_again(rows)))
print("  with a correction-worded later commit, observed window only:", ci(correction_rate(rows)))
print("  same, all projects incl. partly observed:", ci(correction_rate(rows, False)))
obs = {s: r for s, r in rows.items() if not r["censored"]}
print(f"  fully observed projects: {len(obs)}")
fm = {s: r for s, r in rows.items() if s in mem}
nf = {s: r for s, r in rows.items() if s not in mem}
print("  correction-worded later commit, family members:", ci(correction_rate(fm, False)))
print("  correction-worded later commit, all other projects:", ci(correction_rate(nf, False)))
print("  mean later commits in 14 days: family members %.2f, others %.2f" % (
    sum(r["later"] for r in fm.values()) / max(1, len(fm)), sum(r["later"] for r in nf.values()) / max(1, len(nf))))

gaps = creation_gaps(P)
print(f"\nminutes between consecutive project creations: median {median(gaps):.0f}; "
      f"{sum(g <= 10 for g in gaps)} of {len(gaps)} gaps are 10 minutes or less")
close = same_stem_close(P, fams, 180)
print(f"neighbouring family members created within 3 hours of each other: {len(close)} pairs")

snap = os.path.join(HERE, "..", "..", "swe-ledger", "experiments", "runs_snapshot.jsonl")
if os.path.exists(snap):
    import json
    logged = {s for l in open(snap) if l.strip() for s in (json.loads(l).get("projects") or [])}
    g = log_gap(P, logged)
    print(f"\nrun-log snapshot (swe-ledger) lists {len(logged)} slugs; in git: {len(P)}; both: {g['both']}")
    print(f"  in git, never listed in the run log: {len(g['in_git_not_log'])}")
    print(f"  in the run log, not in git history: {len(g['in_log_not_git'])}")
    bt = per_track({s: P[s] for s in g["in_git_not_log"]})
    print("  unlisted by track:", {t: v["projects"] for t, v in bt.items()})
    # The log starts on 2026-10-13 (one stray record on 10-01); git shows when each project was made.
    cut = "2026-10-13"
    late = {s: p for s, p in P.items() if p["created"]["time"][:10] >= cut}
    early = {s: p for s, p in P.items() if p["created"]["time"][:10] < cut}
    ll = sum(s in logged for s in late)
    el = sum(s in logged for s in early)
    print(f"\nby era (log dense from {cut}): created before: {len(early)}, of which in the log {el}; "
          f"created on or after: {len(late)}, of which in the log {ll} ({pct(ll / len(late))})")
    print("  created on/after, not in the log:", sorted(set(late) - logged))
    print("  tracked-prefix projects created before the cut:", sum(track_of(s) != "other" for s in early))
    print("  untracked projects created on/after the cut:", sum(track_of(s) == "other" for s in late))
