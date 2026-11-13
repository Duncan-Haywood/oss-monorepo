"""Milestone 11k: when the paper weights' best split sits on a near-tie, does a robust choice avoid the loss? Selection
rules over the 127 bipartitions that hedge against error in the paper pair weights, on 11g's 24 layouts.

11j: residents plus jobs (gas_pj) is the first paper weight whose median matches the closed form (median 1.000, mean
1.033, worst 1.213, within 5% of cf in 18 of 24), and its pair weights track the simulator closely (gas_j median
Pearson r 0.990). Yet better weights did not give better splits one for one. Its candidate cause, untested: with eight
operators the max-cut often sits on near-ties, where a small pair-weight error flips the choice. Its "Next": robust
selection over the top-k splits.

Rules (all use only the paper weights; no traffic data):
  argmax     11j's rule: the split with the least same-group weight.
  vote(s)    multiply every pair weight by an independent mean-one lognormal factor exp(s z - s^2/2), K = 400 draws;
             pick the split that is best in the most draws (ties: lower unperturbed score).
  cvar(s)    per draw, each split's regret = its score / that draw's best score; pick the split with the least mean
             regret over its worst 10% of draws.
  ens        argmax on the mean of the five paper weights (gas_u, gas_l, gas_p, gas_j, gas_pj), each normalised to sum 1.
s in {0.10, 0.25, 0.50}; 0.25 is the primary (chosen before the run as roughly the spread a pair weight has between
proxies; not fitted). The perturbation draws use seed 11000 + layout. Everything else is 11j's: layouts, seeds,
simulator (200,000 flights in sample and fresh), closed form (400,000 pairs), scoring on the fresh run.

Diagnostics planned before the run: the paper weight's relative margin (second-best score / best score - 1) against
the loss (fresh ratio to cf - 1), Spearman over the 24 layouts; and the rank of the oracle's split in each paper
weight's ordering (top 1, 3, 5, 10).

Predictions (written and committed before any perturbed choice was computed):
 (1) gas_pj vote(0.25): mean ratio to cf below argmax's 1.033 (prior 45%).
 (2) gas_pj cvar(0.25): worst ratio below argmax's 1.213 (prior 30%; layouts 0 and 17 are missed by every weight).
 (3) near ties explain the loss: Spearman(margin, loss) <= -0.3 for gas_pj (prior 55%).
 (4) the oracle's split is in gas_pj's top 5 in at least 20 of 24 layouts (prior 60%).
 (5) robust choice rarely hurts: gas_pj vote(0.25) is more than 2% worse than gas_pj argmax in at most 2 layouts (prior 70%).
 (6) for the weakest paper weight, gas_u, vote(0.25) lowers the mean ratio to cf by at least 0.01 (prior 40%).
 (7) ens mean ratio to cf at or below gas_pj argmax's (prior 40%).
 (8) gas_pj vote(0.50) has a higher mean ratio than vote(0.25) (prior 50%).
Preliminary.

    python3 robust_selection.py > robust_selection_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_demand_weights_11k", os.path.join(HERE, "demand_weights.py"))
dw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dw)
lw, pw, rl, gp = dw.lw, dw.pw, dw.rl, dw.gp
M, LAM = dw.M, dw.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
SIGMAS = (0.10, 0.25, 0.50)
K = 400
GAS = ("gas_u", "gas_l", "gas_p", "gas_j", "gas_pj")
ROBUST_ON = ("gas_u", "gas_j", "gas_pj")


def vec(w):
    return [w.get((i, j, "enr"), 0.0) for i, j in CROSS]


def masks(parts):
    """Per partition, the indices of the cross pairs it leaves in the same group."""
    return [[k for k, (i, j) in enumerate(CROSS) if p[i] == p[j]] for p in parts]


def scores(v, mk):
    return [sum(v[k] for k in m) for m in mk]


def ranked(parts, v, mk):
    s = scores(v, mk)
    return sorted(range(len(parts)), key=lambda a: (s[a], parts[a])), s


def draws(v, sigma, rng, k=K):
    return [[x * math.exp(sigma * rng.gauss(0.0, 1.0) - sigma * sigma / 2) for x in v] for _ in range(k)]


def vote(parts, v, mk, dr):
    base = scores(v, mk)
    cnt = [0] * len(parts)
    for d in dr:
        s = scores(d, mk)
        cnt[min(range(len(parts)), key=lambda a: (s[a], parts[a]))] += 1
    return min(range(len(parts)), key=lambda a: (-cnt[a], base[a], parts[a]))


def cvar(parts, v, mk, dr, tail=0.10):
    base = scores(v, mk)
    reg = [[] for _ in parts]
    for d in dr:
        s = scores(d, mk)
        lo = max(min(s), 1e-300)
        for a in range(len(parts)):
            reg[a].append(s[a] / lo)
    n = max(1, int(round(tail * len(dr))))
    cv = [sum(sorted(r)[-n:]) / n for r in reg]
    return min(range(len(parts)), key=lambda a: (cv[a], base[a], parts[a]))


def normalised_mean(vs):
    out = [0.0] * len(CROSS)
    for v in vs:
        t = sum(v)
        for k, x in enumerate(v):
            out[k] += x / t / len(vs)
    return out


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_in, _ = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=7000 + idx)
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    origin = pw.grid_bounds(hubs, radii)
    w = {"gas_u": pw.gas_weights([pw.density_uniform(hubs[k], radii[k], origin) for k in range(M)], hubs, speeds, shares, origin)}
    land = lw.load_land()
    w["gas_l"] = pw.gas_weights([lw.density_cells(hubs[k], radii[k], land, origin)[0] for k in range(M)], hubs, speeds, shares, origin)
    dem = dw.load_demand()
    for name, key in zip(dw.PROXIES, ("pop", "jobs", "pj")):
        w[name] = pw.gas_weights([dw.density_weighted(hubs[k], radii[k], dem[key], origin)[0] for k in range(M)],
                                 hubs, speeds, shares, origin)
    parts = gp.bipartitions()[1:]
    mk = masks(parts)
    V = {k: vec(x) for k, x in w.items()}
    V["ens"] = normalised_mean([V[g] for g in GAS])
    picks = {"cf": gp.best(parts, cf), "oracle": gp.best(parts, sim_in)}
    rank_oracle, margin = {}, {}
    t0 = time.process_time()
    for g in GAS + ("ens",):
        order, s = ranked(parts, V[g], mk)
        picks[g] = parts[order[0]]
        rank_oracle[g] = order.index(parts.index(picks["oracle"])) + 1
        margin[g] = s[order[1]] / s[order[0]] - 1 if s[order[0]] > 0 else float("inf")
    rng = random.Random(11000 + idx)
    for g in ROBUST_ON:
        for sg in SIGMAS:
            dr = draws(V[g], sg, rng)
            picks[f"{g}:vote{sg:.2f}"] = parts[vote(parts, V[g], mk, dr)]
            picks[f"{g}:cvar{sg:.2f}"] = parts[cvar(parts, V[g], mk, dr)]
    t_rob = time.process_time() - t0
    fl = h_fr * LAM
    fresh = {k: gp.score(sim_fr, p) / fl for k, p in picks.items()}
    return dict(idx=idx, picks=picks, fresh=fresh, rank_oracle=rank_oracle, margin=margin, t_rob=t_rob)


def spearman(a, b):
    def rk(x):
        o = sorted(range(len(x)), key=lambda i: x[i])
        r = [0.0] * len(x)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and x[o[j + 1]] == x[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    return gp.pearson(rk(a), rk(b))


def sign_test(a, b):
    """Two-sided sign test of a < b against a > b, ties dropped."""
    lo = sum(x < y - 1e-12 for x, y in zip(a, b))
    hi = sum(x > y + 1e-12 for x, y in zip(a, b))
    n = lo + hi
    p = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(lo, hi) + 1)) / 2 ** n) if n else 1.0
    return lo, hi, p


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11k: robust selection over the paper weights' splits, 11g's {rl.N_LAYOUTS} random eight-operator layouts.")
    P(f"# {rl.N_FLIGHTS} flights per simulation, {rl.CF_PAIRS} closed-form pairs; {K} lognormal draws per rule, sigma {SIGMAS}.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    meth = ["oracle"] + list(GAS) + ["ens"] + [f"{g}:{r}{s:.2f}" for g in ROBUST_ON for r in ("vote", "cvar") for s in SIGMAS]
    ratio = {m: [s["fresh"][m] / s["fresh"]["cf"] for s in res] for m in meth}
    P("\n## Per layout: fresh ratio to cf (primary rules), gas_pj margin and oracle rank in gas_pj's order")
    show = ["gas_pj", "gas_pj:vote0.25", "gas_pj:cvar0.25", "gas_u", "gas_u:vote0.25", "ens"]
    P("idx  " + " ".join(f"{m:>16s}" for m in show) + "   margin_pj  rank_pj")
    for k, s in enumerate(res):
        P(f"{s['idx']:3d}  " + " ".join(f"{ratio[m][k]:16.3f}" for m in show) + f"   {s['margin']['gas_pj']:9.4f}  {s['rank_oracle']['gas_pj']:7d}")
    P("\n## Summary (fresh ratio to cf over 24 layouts)")
    for m in meth:
        x = ratio[m]
        same = sum(s["picks"][m] == s["picks"]["oracle"] for s in res)
        P(f"{m:18s} median {rl.median(x):.3f}  mean {sum(x) / len(x):.3f}  max {max(x):.3f}  within 5% {sum(v <= 1.05 for v in x):2d}/24  oracle's split {same:2d}/24")
    P("\n## Robust rule against its own argmax (sign test, two-sided; 'worse >2%' = layouts where it loses more than 2%)")
    for g in ROBUST_ON:
        for r in ("vote", "cvar"):
            for sg in SIGMAS:
                m = f"{g}:{r}{sg:.2f}"
                lo, hi, p = sign_test(ratio[m], ratio[g])
                w2 = sum(a > b * 1.02 for a, b in zip(ratio[m], ratio[g]))
                P(f"{m:18s} better {lo:2d} worse {hi:2d} p = {p:.3f}  worse >2% {w2}  changed pick {sum(s['picks'][m] != s['picks'][g] for s in res)}")
    P("\n## Near ties: Spearman(margin, loss) and the oracle's rank in each paper order")
    for g in GAS + ("ens",):
        mg = [s["margin"][g] for s in res]
        loss = [x - 1 for x in ratio[g]]
        rk = [s["rank_oracle"][g] for s in res]
        P(f"{g:7s} Spearman {spearman(mg, loss):+.3f}  median margin {rl.median(mg):.4f}  oracle in top1 {sum(r <= 1 for r in rk):2d} "
          f"top3 {sum(r <= 3 for r in rk):2d} top5 {sum(r <= 5 for r in rk):2d} top10 {sum(r <= 10 for r in rk):2d}  worst rank {max(rk)}")
    mg = [s["margin"]["gas_pj"] for s in res]
    lo_m = sorted(mg)[len(mg) // 2]
    for lab, sel in (("margin below median", [m < lo_m for m in mg]), ("margin at or above median", [m >= lo_m for m in mg])):
        x = [r for r, k in zip(ratio["gas_pj"], sel) if k]
        P(f"gas_pj {lab}: {len(x)} layouts, mean ratio {sum(x) / len(x):.3f}, max {max(x):.3f}")
    P(f"CPU seconds per layout for all ranking and robust rules: {sum(s['t_rob'] for s in res) / len(res):.2f}")
    mean = {m: sum(ratio[m]) / 24 for m in meth}
    P("\n## Prediction checks")
    P(f"(1) gas_pj vote0.25 mean {mean['gas_pj:vote0.25']:.3f} < argmax {mean['gas_pj']:.3f}: {mean['gas_pj:vote0.25'] < mean['gas_pj']}")
    a, b = max(ratio["gas_pj:cvar0.25"]), max(ratio["gas_pj"])
    P(f"(2) gas_pj cvar0.25 worst {a:.3f} < argmax worst {b:.3f}: {a < b}")
    sp = spearman(mg, [x - 1 for x in ratio["gas_pj"]])
    P(f"(3) Spearman(margin, loss) for gas_pj {sp:+.3f} <= -0.3: {sp <= -0.3}")
    n4 = sum(s["rank_oracle"]["gas_pj"] <= 5 for s in res)
    P(f"(4) oracle in gas_pj top 5 in {n4}/24 (>= 20: {n4 >= 20})")
    n5 = sum(x > y * 1.02 for x, y in zip(ratio["gas_pj:vote0.25"], ratio["gas_pj"]))
    P(f"(5) gas_pj vote0.25 >2% worse than argmax in {n5} layouts (<= 2: {n5 <= 2})")
    d6 = mean["gas_u"] - mean["gas_u:vote0.25"]
    P(f"(6) gas_u vote0.25 lowers mean by {d6:+.4f} (>= 0.01: {d6 >= 0.01})")
    P(f"(7) ens mean {mean['ens']:.3f} <= gas_pj mean {mean['gas_pj']:.3f}: {mean['ens'] <= mean['gas_pj']}")
    P(f"(8) gas_pj vote0.50 mean {mean['gas_pj:vote0.50']:.3f} > vote0.25 {mean['gas_pj:vote0.25']:.3f}: {mean['gas_pj:vote0.50'] > mean['gas_pj:vote0.25']}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
