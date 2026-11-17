"""Milestone 11r driver: experiments E1 to E4 of exact_timing.py's docstring (predictions there)."""
import importlib.util
import math
import multiprocessing as mp
import os
import statistics as S
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


et = _load("hub_airspace_exact_timing_11r", "exact_timing.py")
rr = _load("hub_airspace_reference_rescore_11r", "reference_rescore.py")
sg, st, dc, od, rs, dw, pw, rl, gp = rr.sg, rr.st, rr.dc, rr.od, rr.rs, rr.dw, rr.pw, rr.rl, rr.gp
M, LAM, CROSS, SUBSETS = rr.M, rr.LAM, rr.CROSS, rr.SUBSETS
RULES = rr.RULES
N_REF, K_REF = rr.N_REF, rr.K_REF
EX_PAIRS, EX_BATCHES = 1000000, 10
T9 = 2.262  # two-sided 95% t quantile, 9 df
T4 = rr.T4
EX_SEED = 90000


def enr_total(w):
    return sum(x for k, x in w.items() if k[2] == "enr")


def ratio_iv(runs, p, q, t):
    r = [gp.score(w, p) / gp.score(w, q) for w in runs]
    pooled = sum(gp.score(w, p) for w in runs) / sum(gp.score(w, q) for w in runs)
    return pooled, t * S.stdev(r) / math.sqrt(len(r)), S.stdev(r)


def pearson(a, b):
    ma, mb = S.mean(a), S.mean(b)
    sa = math.sqrt(sum((x - ma) ** 2 for x in a))
    sb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb) if sa and sb else float("nan")


def splits_for(idx, mix, hubs, radii, speeds, shares, sim_fr, cf):
    """11q's headline splits (as reference_rescore.run_layout chooses them)."""
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
    return parts, p_cf, {"gas_pj": path_sh[0], "gas_d": path_sh[M],
                         "stable(share)": path_sh[st.stop_stable(path_sh, 1)],
                         "stable2(influence)": path_in[st.stop_stable(path_in, 2)],
                         "best200k": gp.best(parts, sim_fr)}


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS, n_ref=N_REF, k_ref=K_REF,
               ex_pairs=EX_PAIRS, ex_batches=EX_BATCHES):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_fr, _ = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    c0 = time.process_time()
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    t_cf = time.process_time() - c0
    parts, p_cf, splits = splits_for(idx, mix, hubs, radii, speeds, shares, sim_fr, cf)
    ref, hrs = [], None
    c0 = time.process_time()
    for k in range(k_ref):
        c, hrs = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_ref, seed=70000 + 1000 * k + idx)
        ref.append({kk: v / hrs for kk, v in c.items()})   # per hour, comparable with the estimators
    t_sim = (time.process_time() - c0) / k_ref
    c0 = time.process_time()
    ex = et.exact_pairs(mix, speeds, LAM, pairs=ex_pairs, seed=EX_SEED + idx, batches=ex_batches)
    t_ex = (time.process_time() - c0) / ex_batches
    pooled_ex = {k: S.mean(b.get(k, 0.0) for b in ex) for k in set().union(*ex)}

    out = dict(idx=idx, t_sim=t_sim, t_ex=t_ex, t_cf=t_cf, same={}, ref={}, hw_ref={}, ex={}, hw_ex={},
               sd_sim={}, sd_ex={}, cf_kept_per_run=S.mean(gp.score(w, p_cf) for w in ref) * hrs)
    # E1: semi en-route totals
    tr = [enr_total(w) for w in ref]
    te = [enr_total(b) for b in ex]
    out["E1"] = dict(ref=S.mean(tr), ref_hw=T4 * S.stdev(tr) / math.sqrt(k_ref), ref_sd=S.stdev(tr),
                     ex=S.mean(te), ex_hw=T9 * S.stdev(te) / math.sqrt(ex_batches), ex_sd=S.stdev(te))
    # E3 (and E2 for each rule's ratio)
    for name, p in splits.items():
        out["same"][name] = p == p_cf
        if p == p_cf:
            out["ref"][name] = out["ex"][name] = 1.0
            out["hw_ref"][name] = out["hw_ex"][name] = 0.0
            continue
        out["ref"][name], out["hw_ref"][name], out["sd_sim"][name] = ratio_iv(ref, p, p_cf, T4)
        out["ex"][name], out["hw_ex"][name], out["sd_ex"][name] = ratio_iv(ex, p, p_cf, T9)
    half = len(ex) // 2
    eb = min(parts, key=lambda p: (sum(gp.score(b, p) for b in ex[:half]), p))
    out["same"]["exact-best"] = eb == p_cf
    if eb == p_cf:
        out["ex"]["exact-best"], out["hw_ex"]["exact-best"] = 1.0, 0.0
    else:
        r = [gp.score(b, eb) / gp.score(b, p_cf) for b in ex[half:]]
        out["ex"]["exact-best"] = sum(gp.score(b, eb) for b in ex[half:]) / sum(gp.score(b, p_cf) for b in ex[half:])
        out["hw_ex"]["exact-best"] = 2.776 * S.stdev(r) / math.sqrt(len(r))   # 5 batches, 4 df
    # true optimum under the pooled exact weights (in-sample, for reference)
    out["ex_opt"] = gp.score(pooled_ex, gp.best(parts, pooled_ex)) / gp.score(pooled_ex, p_cf)
    # E4: 11d's closed form against the exact estimator
    cross = [(i, j) for i in range(M) for j in range(i + 1, M)]
    out["E4"] = dict(cf=enr_total(cf), ex=enr_total(pooled_ex),
                     r=pearson([cf.get((i, j, "enr"), 0.0) for i, j in cross],
                               [pooled_ex.get((i, j, "enr"), 0.0) for i, j in cross]),
                     r_ref=pearson([S.mean(w.get((i, j, "enr"), 0.0) for w in ref) for i, j in cross],
                                   [pooled_ex.get((i, j, "enr"), 0.0) for i, j in cross]))
    # E1 per pair: share of the 36 pair weights whose exact value lies in the reference's 95% interval
    keys = [(i, j, "enr") for i in range(M) for j in range(i, M)]
    inside = 0
    for k in keys:
        v = [w.get(k, 0.0) for w in ref]
        hw = T4 * S.stdev(v) / math.sqrt(k_ref)
        inside += abs(pooled_ex.get(k, 0.0) - S.mean(v)) <= hw + 1e-12
    out["E1"]["pairs_inside"] = inside
    out["E1"]["pairs"] = len(keys)
    return out


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11r: exact-timing (Rao-Blackwell) conflict estimator; 11g's {rl.N_LAYOUTS} layouts, semi base rule.")
    P(f"# Simulator reference: {K_REF} x {N_REF:,}-flight runs (seeds 70000 + 1000 k + layout, as 11q). Exact estimator: "
      f"{EX_PAIRS:,} flight pairs in {EX_BATCHES} batches (seed {EX_SEED} + layout). Rates are conflicts per hour.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    mean = lambda x: sum(x) / len(x) if x else float("nan")

    P("\n## E1: semi en-route total, simulator reference (5 runs) against the exact estimator (10 batches)")
    P(f"{'idx':>3s} {'ref/h':>8s} {'+-95%':>7s} {'exact/h':>8s} {'+-95%':>7s} {'ex/ref':>7s} {'inside':>6s} "
      f"{'pairs in':>8s}")
    n_in = 0
    for s in res:
        e = s["E1"]
        ins = abs(e["ex"] - e["ref"]) <= e["ref_hw"]
        n_in += ins
        P(f"{s['idx']:3d} {e['ref']:8.3f} {e['ref_hw']:7.3f} {e['ex']:8.3f} {e['ex_hw']:7.3f} {e['ex'] / e['ref']:7.4f} "
          f"{str(ins):>6s} {e['pairs_inside']:4d}/{e['pairs']}")
    pool_ratio = sum(s["E1"]["ex"] for s in res) / sum(s["E1"]["ref"] for s in res)
    pin = sum(s["E1"]["pairs_inside"] for s in res)
    pn = sum(s["E1"]["pairs"] for s in res)
    P(f"exact inside the reference interval in {n_in}/24 layouts; pooled exact/ref {pool_ratio:.4f}; "
      f"pair weights inside their reference interval {pin}/{pn} ({pin / pn:.1%}; 95% expected)")

    P("\n## E2: efficiency = (var x CPU s)_simulator run / (var x CPU s)_exact batch")
    P(f"mean CPU s: simulator run {mean([s['t_sim'] for s in res]):.2f}, exact batch "
      f"({EX_PAIRS // EX_BATCHES:,} pairs) {mean([s['t_ex'] for s in res]):.2f}, 11d closed form "
      f"({rl.CF_PAIRS:,} pairs) {mean([s['t_cf'] for s in res]):.2f}")
    eff_tot = []
    eff_rule = {n: [] for n in RULES}
    P(f"{'idx':>3s} {'total':>7s} " + " ".join(f"{n:>18s}" for n in RULES))
    for s in res:
        e = s["E1"]
        g = (e["ref_sd"] ** 2 * s["t_sim"]) / (e["ex_sd"] ** 2 * s["t_ex"])
        eff_tot.append(g)
        cells = []
        for n in RULES:
            if s["same"][n]:
                cells.append("=".rjust(18))
                continue
            gr = (s["sd_sim"][n] ** 2 * s["t_sim"]) / (s["sd_ex"][n] ** 2 * s["t_ex"])
            eff_rule[n].append(gr)
            cells.append(f"{gr:18.2f}")
        P(f"{s['idx']:3d} {g:7.2f} " + " ".join(cells))
    P(f"median efficiency: total {S.median(eff_tot):.2f} (min {min(eff_tot):.2f}, max {max(eff_tot):.2f})")
    for n in RULES:
        v = eff_rule[n]
        if v:
            P(f"  {n:20s} median {S.median(v):.2f} over {len(v)} layouts (min {min(v):.2f}, max {max(v):.2f})")
    P("(each sd comes from 5 runs or 10 batches, so each per-layout gain is itself uncertain by a factor of about 2)")

    P("\n## E3: headline rules, ratio to cf's split: 11q's reference (5 runs, 4 df) and the exact estimator (10 batches, 9 df)")
    P(f"{'rule':20s} {'ref mean':>9s} {'exact mean':>10s} {'diff':>7s} {'ex sig>1':>8s} {'ex sig<1':>8s} "
      f"{'med hw ref':>10s} {'med hw ex':>9s}")
    summ = {}
    for n in RULES:
        a = [s["ref"][n] for s in res]
        b = [s["ex"][n] for s in res]
        up = sum(s["ex"][n] - s["hw_ex"][n] > 1.0 for s in res if not s["same"][n])
        dn = sum(s["ex"][n] + s["hw_ex"][n] < 1.0 for s in res if not s["same"][n])
        hr = [s["hw_ref"][n] for s in res if not s["same"][n]]
        he = [s["hw_ex"][n] for s in res if not s["same"][n]]
        summ[n] = (mean(a), mean(b), S.median(hr) if hr else float("nan"), S.median(he) if he else float("nan"))
        P(f"{n:20s} {mean(a):9.4f} {mean(b):10.4f} {mean(b) - mean(a):+7.4f} {up:8d} {dn:8d} {summ[n][2]:10.4f} "
          f"{summ[n][3]:9.4f}")
    ebv = [s["ex"]["exact-best"] for s in res]
    P(f"{'exact-best (b5-9)':20s} {'-':>9s} {mean(ebv):10.4f}; in-sample optimum under pooled exact weights: mean "
      f"{mean([s['ex_opt'] for s in res]):.4f}, min {min(s['ex_opt'] for s in res):.4f}")
    P(f"mean kept en-route conflicts of cf's split per 200,000-flight reference run: "
      f"{mean([s['cf_kept_per_run'] for s in res]):.0f}")

    P("\n## Per layout: ref ratio +- hw -> exact ratio +- hw ('=' when the rule picks cf's split)")
    P("idx  " + "  ".join(f"{n:>27s}" for n in RULES) + f"  {'exact-best':>14s} {'opt':>6s}")
    for s in res:
        cells = []
        for n in RULES:
            cells.append("=".rjust(27) if s["same"][n] else
                         f"{s['ref'][n]:.3f}+-{s['hw_ref'][n]:.3f} -> {s['ex'][n]:.3f}+-{s['hw_ex'][n]:.3f}".rjust(27))
        cells.append("=".rjust(14) if s["same"]["exact-best"] else
                     f"{s['ex']['exact-best']:.3f}+-{s['hw_ex']['exact-best']:.3f}".rjust(14))
        P(f"{s['idx']:3d}  " + "  ".join(cells) + f" {s['ex_opt']:6.3f}")

    P("\n## Sign tests under the exact estimator (per layout, two-sided, ties dropped)")
    for a_n, b_n in (("gas_d", "stable2(influence)"), ("stable2(influence)", "stable(share)"),
                     ("stable(share)", "gas_pj"), ("gas_d", "best200k")):
        lo, hi, p = rs.sign_test([s["ex"][a_n] for s in res], [s["ex"][b_n] for s in res])
        P(f"{a_n} vs {b_n}: better in {lo}, worse in {hi}, p = {p:.3f}")

    P("\n## E4: 11d's closed form against the exact estimator (semi en-route)")
    P(f"{'idx':>3s} {'cf/h':>8s} {'exact/h':>8s} {'cf/ex':>7s} {'r(cf,ex)':>8s} {'r(ref,ex)':>9s}")
    for s in res:
        e = s["E4"]
        P(f"{s['idx']:3d} {e['cf']:8.3f} {e['ex']:8.3f} {e['cf'] / e['ex']:7.4f} {e['r']:8.4f} {e['r_ref']:9.4f}")
    cfr = [s["E4"]["cf"] / s["E4"]["ex"] for s in res]
    P(f"cf/exact: mean {mean(cfr):.4f}, min {min(cfr):.4f}, max {max(cfr):.4f}; min r(cf, exact) "
      f"{min(s['E4']['r'] for s in res):.4f}")

    P("\n## Prediction checks")
    P(f"(1) exact inside ref interval in {n_in}/24 >= 22 and pooled exact/ref {pool_ratio:.4f} in [0.98, 1.02]: "
      f"{n_in >= 22 and 0.98 <= pool_ratio <= 1.02}")
    v = eff_rule["stable(share)"]
    P(f"(2) stable(share)/cf efficiency median {S.median(v):.2f} >= 3: {S.median(v) >= 3}; min {min(v):.2f} >= 1: "
      f"{min(v) >= 1}")
    P(f"(3) total efficiency median {S.median(eff_tot):.2f} >= 2: {S.median(eff_tot) >= 2}")
    d = {n: abs(summ[n][1] - summ[n][0]) for n in ("gas_pj", "gas_d", "stable(share)", "stable2(influence)")}
    r = [summ[n][1] for n in ("gas_d", "stable2(influence)", "stable(share)", "gas_pj")]
    P("(4) |exact - ref| " + ", ".join(f"{n} {x:.4f}" for n, x in d.items()) +
      f"; order {' <= '.join(f'{x:.4f}' for x in r)}: {all(x <= 0.005 for x in d.values()) and r == sorted(r)}")
    cpu_ex = EX_BATCHES * mean([s["t_ex"] for s in res])
    cpu_ref = K_REF * mean([s["t_sim"] for s in res])
    P(f"(5) stable(share) median hw exact {summ['stable(share)'][3]:.4f} < 0.018 at CPU {cpu_ex:.1f} s vs 11q's "
      f"{cpu_ref:.1f} s: {summ['stable(share)'][3] < 0.018 and cpu_ex <= cpu_ref}")
    n6 = sum(s["ex"]["exact-best"] < 0.99 and s["ex"]["exact-best"] + s["hw_ex"]["exact-best"] < 1.0 for s in res)
    P(f"(6) exact-best < 0.99 with interval below 1 in {n6}/24 <= 3: {n6 <= 3}")
    w10 = sum(abs(x - 1) <= 0.10 for x in cfr)
    rmin = min(s["E4"]["r"] for s in res)
    P(f"(7) cf within 10% of exact in {w10}/24 (all: {w10 == 24}); min r {rmin:.4f} >= 0.95: {rmin >= 0.95}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
