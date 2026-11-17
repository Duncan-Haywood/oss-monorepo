"""Milestone 11q: do 11g to 11p's headline rankings survive a pooled 1,000,000-flight reference that gives every
per-layout ratio an interval?

11p's post-hoc diagnostic found that one fresh 200,000-flight scoring run keeps about 3,000 to 3,750 en-route
conflicts per split, so the per-run sd of a ratio between two distinct splits is about 1% to 2%; layout 22's "4.5%
miss" was about 2% on ten pooled runs. Every table since 11g scores rules on one such run (seed 8000 + layout). This
step re-scores the splits that the headline rules choose on five new 200,000-flight runs per layout (seeds
70000 + 1000 k + layout, k = 0..4; fresh relative to 7000 +, 8000 +, 20000 +, 30000 +, 40000 +, 50000 + and
60000 +), so each ratio to the closed form's split carries a 95% t-interval over the five per-run ratios (4 df).

Splits re-scored per layout (as chosen in 11n to 11p; nothing is re-chosen on the reference):
  cf              the closed form's split (the denominator).
  gas_pj, gas_d   the paper pick with no disclosure (census maps) and with all eight real maps.
  stable(share)   11o's free stopping rule; stable2(influence) its two-unchanged variant under influence order.
  sim20k, sim100k 11p's best-of-127 on one 20,000-flight batch and on five pooled batches (11p's seeds, 3 replicates).
  g5 guardall(share) 11p's guard over the full share path on five pooled batches (3 replicates).
  best200k        the best of all 127 splits on 11g's own scoring run (in-sample on the run every table used).
  halfbest        the best of all 127 splits on reference runs 0 and 1, scored on runs 2 to 4 only (an honest
                  estimate of how much a split better than cf exists; its ratio uses runs 2 to 4 for cf too).

Predictions (written and committed before any reference run was simulated):
 (1) For gas_pj, gas_d, stable(share) and stable2(influence), the reference mean ratio is within 0.005 of the
     200,000-flight mean (prior 70%).
 (2) Ranking by reference mean: gas_d <= stable2(influence) <= stable(share) <= gas_pj (prior 50%).
 (3) Layout 22's gas_pj split (fresh 1.045 on 11g's run) has a reference ratio in [1.005, 1.035] (prior 70%; informed
     by 11p's post-hoc ten-run diagnostic, which put it near 1.02).
 (4) stable(share) stays > 1.05 in layouts 16 and 17, with interval lower bounds > 1.00 (prior 80%).
 (5) Winner's curse: best200k's mean ratio on 11g's run is at least 0.01 below its reference mean (prior 65%).
 (6) gas_d's interval contains 1.000 or lies below it in >= 20 of 24 layouts (prior 60%).
 (7) Over layouts where stable(share)'s split differs from cf's, the median 95% half-width is in [0.005, 0.03]
     (prior 65%).
 (8) halfbest beats cf by more than 2% (ratio < 0.98) in at most 4 of 24 layouts (prior 55%).
Preliminary.

    python3 reference_rescore.py > reference_rescore_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import statistics as S
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_sized_guard_11q", os.path.join(HERE, "sized_guard.py"))
sg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sg)
st, dc, od, rs, dw, pw, rl, gp = sg.st, sg.dc, sg.od, sg.rs, sg.dw, sg.pw, sg.rl, sg.gp
M, LAM, CROSS, SUBSETS = sg.M, sg.LAM, sg.CROSS, sg.SUBSETS
N_REF = 200000
K_REF = 5
T4 = 2.776  # two-sided 95% t quantile, 4 df
T2 = 4.303  # two-sided 95% t quantile, 2 df (halfbest scored on three runs)
RULES = ("gas_pj", "gas_d", "stable(share)", "stable2(influence)", "best200k")
REP_RULES = ("sim20k", "sim100k", "g5 guardall(share)")


def interval(runs, p, q):
    """Pooled ratio of split p to split q over the runs, and a t half-width over the per-run ratios."""
    r = [gp.score(w, p) / gp.score(w, q) for w in runs]
    pooled = sum(gp.score(w, p) for w in runs) / sum(gp.score(w, q) for w in runs)
    t = T4 if len(r) == 5 else T2
    hw = t * S.stdev(r) / math.sqrt(len(r)) if len(r) > 1 else float("nan")
    return pooled, hw


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS, n_ref=N_REF, k_ref=K_REF,
               n_batch=sg.N_BATCH, reps=sg.REPS, max_batch=sg.MAX_BATCH):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_fr, _ = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    maps = {"C": [dw.density_weighted(hubs[k], radii[k], dem["pj"], origin)[0] for k in range(M)],
            "R": [pw.density_dest(mix, k, shares[k], origin) for k in range(M)]}
    pairw = {}
    for i, j in CROSS:
        for a in "CR":
            for b in "CR":
                pairw[(i, j, a + b)] = pw.gas_pair(maps[a][i], maps[b][j], hubs[i], hubs[j], speeds[i], speeds[j],
                                                   shares[i], shares[j], origin)
    parts = gp.bipartitions()[1:]
    p_cf = gp.best(parts, cf)
    pick = {D: gp.best(parts, od.mixed(pairw, dc.src_of(D))) for D in SUBSETS}
    wc = od.mixed(pairw, "C" * M)
    infl = dc.influence(parts, wc, pick[frozenset()])
    o_sh = dc.order_by(shares)
    o_in = dc.order_by([infl[k] + 1e-9 * shares[k] for k in range(M)])
    path_sh, path_in = st.path_picks(pick, o_sh), st.path_picks(pick, o_in)
    splits = {"gas_pj": path_sh[0], "gas_d": path_sh[M],
              "stable(share)": path_sh[st.stop_stable(path_sh, 1)],
              "stable2(influence)": path_in[st.stop_stable(path_in, 2)],
              "best200k": gp.best(parts, sim_fr)}
    batches = [[gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_batch,
                                  seed=40000 + 1000 * (max_batch * rep + b) + idx)[0] for b in range(max_batch)]
               for rep in range(reps)]
    rep_splits = {"sim20k": [sg.choose_fixed(parts, bs[:1])[0] for bs in batches],
                  "sim100k": [sg.choose_fixed(parts, bs)[0] for bs in batches],
                  "g5 guardall(share)": [sg.choose_fixed(st.distinct(path_sh), bs)[0] for bs in batches]}
    ref = [gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_ref, seed=70000 + 1000 * k + idx)[0]
           for k in range(k_ref)]
    one = lambda p: gp.score(sim_fr, p) / gp.score(sim_fr, p_cf)
    out = dict(idx=idx, same={}, r200={}, ref={}, hw={})
    for name, p in splits.items():
        out["same"][name] = p == p_cf
        out["r200"][name] = one(p)
        out["ref"][name], out["hw"][name] = interval(ref, p, p_cf)
    for name, ps in rep_splits.items():
        out["r200"][name] = [one(p) for p in ps]
        out["ref"][name] = [interval(ref, p, p_cf)[0] for p in ps]
    hb = min(parts, key=lambda p: (gp.score(ref[0], p) + gp.score(ref[1], p), p))
    out["same"]["halfbest"] = hb == p_cf
    out["ref"]["halfbest"], out["hw"]["halfbest"] = interval(ref[2:], hb, p_cf)
    out["cf_kept"] = S.mean(gp.score(w, p_cf) for w in ref)
    return out


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11q: headline rules re-scored on a pooled {K_REF} x {N_REF:,}-flight reference; 11g's "
      f"{rl.N_LAYOUTS} layouts.")
    P("# Ratios are to the closed form's split; 200k = 11g's single scoring run (seed 8000 + layout); ref = pooled "
      "over five new runs (seeds 70000 + 1000 k + layout) with a 95% t half-width over per-run ratios.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    mean = lambda x: sum(x) / len(x) if x else float("nan")
    w5 = lambda x: sum(v <= 1.05 for v in x)

    P("\n## Rule means: 11g's 200k run against the 1M reference")
    P(f"{'rule':22s} {'200k mean':>9s} {'ref mean':>9s} {'diff':>7s} {'200k w5%':>9s} {'ref w5%':>8s} "
      f"{'ref max':>8s} {'sig>1':>6s} {'sig<1':>6s}")
    summ = {}
    for name in RULES:
        a = [s["r200"][name] for s in res]
        b = [s["ref"][name] for s in res]
        hw = [s["hw"][name] for s in res]
        up = sum(r - h > 1.0 for r, h in zip(b, hw))
        dn = sum(r + h < 1.0 for r, h in zip(b, hw))
        summ[name] = (mean(a), mean(b))
        P(f"{name:22s} {mean(a):9.4f} {mean(b):9.4f} {mean(b) - mean(a):+7.4f} {w5(a):5d}/24 {w5(b):5d}/24 "
          f"{max(b):8.3f} {up:6d} {dn:6d}")
    for name in REP_RULES:
        a = [v for s in res for v in s["r200"][name]]
        b = [v for s in res for v in s["ref"][name]]
        summ[name] = (mean(a), mean(b))
        P(f"{name:22s} {mean(a):9.4f} {mean(b):9.4f} {mean(b) - mean(a):+7.4f} {w5(a):5d}/72 {w5(b):5d}/72 "
          f"{max(b):8.3f} {'-':>6s} {'-':>6s}")
    hb = [s["ref"]["halfbest"] for s in res]
    P(f"{'halfbest (runs 2-4)':22s} {'-':>9s} {mean(hb):9.4f} {'-':>7s} {'-':>9s} {w5(hb):5d}/24 {max(hb):8.3f}")
    P(f"mean kept en-route conflicts of cf's split per 200,000-flight reference run: "
      f"{mean([s['cf_kept'] for s in res]):.0f}")

    P("\n## Per layout: ratio 200k -> ref +- 95% half-width ('=' when the rule picks cf's split)")
    P("idx  " + "  ".join(f"{n:>24s}" for n in RULES + ("halfbest",)))
    for s in res:
        cells = []
        for n in RULES:
            cells.append("=" .rjust(24) if s["same"][n] else
                         f"{s['r200'][n]:.3f} -> {s['ref'][n]:.3f}+-{s['hw'][n]:.3f}".rjust(24))
        cells.append("=".rjust(24) if s["same"]["halfbest"] else
                     f"ref {s['ref']['halfbest']:.3f}+-{s['hw']['halfbest']:.3f}".rjust(24))
        P(f"{s['idx']:3d}  " + "  ".join(cells))

    P("\n## Per layout, replicated rules (ref ratio per replicate)")
    for s in res:
        P(f"{s['idx']:3d}  " + "  ".join(f"{n} " + " ".join(f"{v:.3f}" for v in s["ref"][n]) for n in REP_RULES))

    P("\n## Sign tests on the reference (per layout, two-sided, ties dropped)")
    for a_n, b_n in (("gas_d", "stable2(influence)"), ("stable2(influence)", "stable(share)"),
                     ("stable(share)", "gas_pj"), ("gas_d", "best200k")):
        lo, hi, p = rs.sign_test([s["ref"][a_n] for s in res], [s["ref"][b_n] for s in res])
        P(f"{a_n} vs {b_n}: better in {lo}, worse in {hi}, p = {p:.3f}")

    P("\n## Prediction checks")
    d1 = {n: abs(summ[n][1] - summ[n][0]) for n in ("gas_pj", "gas_d", "stable(share)", "stable2(influence)")}
    P("(1) |ref - 200k| <= 0.005: " + ", ".join(f"{n} {v:.4f}" for n, v in d1.items()) +
      f": {all(v <= 0.005 for v in d1.values())}")
    r = [summ[n][1] for n in ("gas_d", "stable2(influence)", "stable(share)", "gas_pj")]
    P(f"(2) gas_d {r[0]:.4f} <= stable2(influence) {r[1]:.4f} <= stable(share) {r[2]:.4f} <= gas_pj {r[3]:.4f}: "
      f"{r[0] <= r[1] <= r[2] <= r[3]}")
    l22 = res[22]["ref"]["gas_pj"]
    P(f"(3) layout 22 gas_pj ref {l22:.4f} in [1.005, 1.035]: {1.005 <= l22 <= 1.035}")
    ok4 = all(res[i]["ref"]["stable(share)"] > 1.05 and res[i]["ref"]["stable(share)"] - res[i]["hw"]["stable(share)"] > 1.0
              for i in (16, 17))
    P("(4) layouts 16, 17 stable(share) " + ", ".join(
        f"{res[i]['ref']['stable(share)']:.3f}+-{res[i]['hw']['stable(share)']:.3f}" for i in (16, 17)) + f": {ok4}")
    P(f"(5) best200k 200k {summ['best200k'][0]:.4f} vs ref {summ['best200k'][1]:.4f}, gap "
      f"{summ['best200k'][1] - summ['best200k'][0]:.4f} >= 0.01: {summ['best200k'][1] - summ['best200k'][0] >= 0.01}")
    n6 = sum(s["ref"]["gas_d"] - s["hw"]["gas_d"] <= 1.0 for s in res)
    P(f"(6) gas_d interval contains or lies below 1 in {n6}/24 >= 20: {n6 >= 20}")
    hws = [s["hw"]["stable(share)"] for s in res if not s["same"]["stable(share)"]]
    med = S.median(hws) if hws else float("nan")
    P(f"(7) median half-width over {len(hws)} layouts where stable(share) != cf: {med:.4f} in [0.005, 0.03]: "
      f"{0.005 <= med <= 0.03}")
    n8 = sum(v < 0.98 for v in hb)
    P(f"(8) halfbest < 0.98 in {n8}/24 <= 4: {n8 <= 4}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
