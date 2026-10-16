"""Pick mix and same-track concurrency of merged projects. python3 experiments/run.py > experiments/results.txt"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from swe_pickmix import analysis as a

rows = a.load(os.path.join(os.path.dirname(__file__), "..", "data", "projects.tsv"))
sp = a.spans(rows)
tracked = [r for r in rows if r["merged"].date().isoformat() >= a.FIRST_TRACKED]
pref = [r for r in tracked if a.track(r["slug"])]
print(f"projects on main: {len(rows)}; merged on/after {a.FIRST_TRACKED}: {len(tracked)}; with a track prefix: {len(pref)}; "
      f"no-branch rows: {sum(r['first'] is None for r in pref)}; PR units with a branch: {len(sp)}")
print()
print("1. Pick mix (one count per PR unit, prefixed projects on/after the tracks were set)")
cnt = {t: sum(s[0] == t for s in sp) for t in a.TRACKS}
n = len(sp)
for t in a.TRACKS:
    lo, hi = a.wilson(cnt[t], n)
    print(f" {t:10s} {cnt[t]:3d}  {100*cnt[t]/n:5.1f}%  [{100*lo:4.1f}, {100*hi:4.1f}]  (uniform {100/len(a.TRACKS):.1f}%)")
u = [1 / len(a.TRACKS)] * len(a.TRACKS)
print(f" chi-square vs uniform = {a.chi2_stat([cnt[t] for t in a.TRACKS], u):.1f} on {len(a.TRACKS)-1} df, Monte Carlo p = {a.chi2_mc_p([cnt[t] for t in a.TRACKS], u):.4f}")
print()
start = max(min(r["merged"] for r in rows if a.track(r["slug"]) == t) for t in a.TRACKS)
win = [s for s in sp if s[2] >= start]
wc = {t: sum(s[0] == t for s in win) for t in a.TRACKS}
print(f"1b. Same, restricted to merges after all eleven tracks existed (from {start.isoformat()}Z): n = {len(win)}")
for t in a.TRACKS:
    lo, hi = a.wilson(wc[t], len(win))
    print(f" {t:10s} {wc[t]:3d}  {100*wc[t]/len(win):5.1f}%  [{100*lo:4.1f}, {100*hi:4.1f}]")
print(f" chi-square vs uniform = {a.chi2_stat([wc[t] for t in a.TRACKS], u):.1f} on {len(a.TRACKS)-1} df, Monte Carlo p = {a.chi2_mc_p([wc[t] for t in a.TRACKS], u):.4f}")
print()
print("2. Branch lifetime (first branch commit -> merge), minutes")
sm = a.span_minutes(sp)
print(" " + "  ".join(f"p{int(q*100)}={a.quantile(sm, q):.0f}" for q in (0.1, 0.25, 0.5, 0.75, 0.9)) + f"  mean={sum(sm)/len(sm):.0f}  n={len(sm)}")
print()
print("3. Same-track share among PR units whose branch lifetimes overlap")
pairs = a.overlap_pairs(sp)
obs, p = a.permutation_p(sp, pairs)
p_emp, p_uni = a.expected_same(sp)
k = round(obs * len(pairs))
lo, hi = a.wilson(k, len(pairs))
print(f" overlapping pairs: {len(pairs)}  (units with at least one overlap: {len({i for pr in pairs for i in pr})} of {len(sp)})")
print(f" observed same-track: {k}/{len(pairs)} = {100*obs:.1f}%  [{100*lo:.1f}, {100*hi:.1f}] (pairs are not independent: the interval is indicative)")
print(f" expected if independent, empirical mix: {100*p_emp:.1f}%   uniform over 11: {100*p_uni:.1f}%")
print(f" label-permutation p (observed >= shuffled) = {p:.4f}")
_, pb = a.permutation_p(sp, pairs, block=lambda u: u[2].date())
print(f" same, shuffling only within merge day (the mix drifts as tracks 7-11 appear): p = {pb:.4f}")
wsp = [s for s in sp if s[2] >= start]
wpairs = a.overlap_pairs(wsp)
wobs, wp = a.permutation_p(wsp, wpairs)
wk = round(wobs * len(wpairs)) if wpairs else 0
wpe, _ = a.expected_same(wsp)
print(f" window with all eleven tracks: {wk}/{len(wpairs)} same-track = {100*wobs:.1f}% (empirical-mix expectation {100*wpe:.1f}%), permutation p = {wp:.4f}")
print()
print("4. Same-track pairs by overlap depth: share of branch lifetime that overlaps")
def frac(i, j):
    s, e = max(sp[i][1], sp[j][1]), min(sp[i][2], sp[j][2])
    short = min((sp[i][2] - sp[i][1]).total_seconds(), (sp[j][2] - sp[j][1]).total_seconds()) or 1
    return max(0.0, (e - s).total_seconds()) / short
for lo_f, hi_f in [(0.0, 0.5), (0.5, 0.99), (0.99, 1.01)]:
    sel = [(i, j) for i, j in pairs if lo_f <= frac(i, j) < hi_f]
    if sel:
        print(f" overlap of shorter branch in [{lo_f:.2f}, {min(hi_f,1):.2f}]: {len(sel):4d} pairs, same track {100*a.same_track_share(sp, sel):.1f}%")
print()
print("5. Concurrency: units in flight at each PR's first commit (including itself)")
conc = [sum(1 for t in sp if t[1] <= s[1] <= t[2]) for s in sp]
print(" " + "  ".join(f"p{int(q*100)}={a.quantile(conc, q):.0f}" for q in (0.5, 0.9, 0.99)) + f"  max={max(conc)}  mean={sum(conc)/len(conc):.2f}")
