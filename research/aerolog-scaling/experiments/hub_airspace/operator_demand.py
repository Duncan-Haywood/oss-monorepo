"""Milestone 11m: which operator's demand does the census paper weight get wrong when it picks the wrong layer split?
Operator-by-operator swaps between census (residents + jobs) and real destinations, on 11g's 24 eight-operator layouts.

11h: the paper integral with the real destinations (gas_d) picks the closed form's split in every layout, so every
miss of the census weight gas_pj is a demand error. 11k: the misses are a bias, not noise near ties. 11l: layouts 0
and 17 are missed by every paper weight (21% and 10% above the closed form's split on the fresh run). This milestone
asks where the bias sits: in one operator's demand map, or spread over all of them, and whether a planner could fix
it with one number per operator.

Per layout, each operator k has two line-density maps: census (C, 11j's density_weighted on residents + jobs) and
real (R, 11h's density_dest on the operator's own destinations, which the simulator flies). Pair weights are the
gas integral of the two maps, so every mixed weight vector is built from four per-pair integrals (CC, CR, RC, RR).
  fwd[k]   real map for operator k, census for the other seven (does one operator's real demand fix the pick?).
  rev[k]   census map for k, real for the other seven (does one operator's census demand break gas_d's pick?).
  gas_pjL  census maps rescaled by c_k = L_real,k / L_census,k, the ratio of operator k's mean leg length (each
           operator knows its own; one number per operator). Scaling a map by c_k scales pair (i, j) by c_i c_j.
Scored, as before, on 11g's fresh 200,000-flight run (seed 8000 + layout) as a ratio to the closed form's split.

Diagnostics per operator: L ratio (census / real mean leg length), total-variation distance between the census and
real destination distributions on 500 m cells inside the disc, and e_k, the mean |log| ratio of gas_pj to gas_d over
the seven pairs with k (both vectors normalised to sum 1). Per missed layout, the decision error is decomposed by pair:
with weights normalised to the closed form's cross total, err = [S_pj(P) - S_pj(Q)] - [S_cf(P) - S_cf(Q)], P the
gas_pj pick and Q the closed form's, summed over pairs whose same-group status differs; each pair's term is split
half to each of its operators.

Predictions (written and committed before any swap was computed):
 (1) in layout 0 and in layout 17, some single fwd[k] reaches fresh ratio <= 1.01 (prior 55%).
 (2) in layouts 0 and 17, the operator with the largest share of the decision error carries >= 50% of it (prior 50%).
 (3) of the 6 layouts where gas_pj is > 5% above cf (0, 3, 5, 16, 17, 19), a single fwd[k] reaches <= 1.01 in >= 4
     (prior 50%).
 (4) a single rev[k] pushes gas_d's split > 2% above cf in at least 6 of 24 layouts (prior 50%).
 (5) across the 192 operators, Spearman(e_k, |log L ratio|) >= 0.5 (prior 55%).
 (6) across the 192 operators, Spearman(e_k, TV distance) >= 0.5 (prior 50%).
 (7) gas_pjL has a lower mean fresh ratio than gas_pj's 1.033 (prior 45%).
 (8) gas_pjL fixes (<= 1.01) layout 0 or layout 17 (prior 35%).
Preliminary.

    python3 operator_demand.py > operator_demand_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_robust_selection_11m", os.path.join(HERE, "robust_selection.py"))
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)
dw, lw, pw, rl, gp = rs.dw, rs.lw, rs.pw, rs.rl, rs.gp
M, LAM = rs.M, rs.LAM
CROSS = rs.CROSS
MISSED = (0, 3, 5, 16, 17, 19)
TV_CELL = 500.0


def census_dests(hub, r, counts, h=pw.H):
    """[(weight, x, y)] for the census destinations inside the disc, as dw.density_weighted uses them."""
    cells = [(c, counts[c]) for c in lw.disc_cells(hub, r, h) if counts.get(c, 0) > 0]
    tot = sum(n for _, n in cells)
    return [(n / tot, (i + 0.5) * h, (j + 0.5) * h) for (i, j), n in cells]


def real_dests(mix, k, share):
    return [(w / share, x, y) for w, j, _, _, x, y in mix if j == k]


def mean_leg(dests, hub):
    return sum(w * math.hypot(x - hub[0], y - hub[1]) for w, x, y in dests)


def tv(a, b, cell=TV_CELL):
    pa, pb = {}, {}
    for d, p in ((a, pa), (b, pb)):
        for w, x, y in d:
            c = (math.floor(x / cell), math.floor(y / cell))
            p[c] = p.get(c, 0.0) + w
    return 0.5 * sum(abs(pa.get(c, 0.0) - pb.get(c, 0.0)) for c in set(pa) | set(pb))


def mixed(pairw, src):
    """Weight dict for a per-operator choice of map: src[k] in 'C' or 'R'."""
    return {(i, j, "enr"): pairw[(i, j, src[i] + src[j])] for i, j in CROSS}


def norm(v):
    s = sum(v)
    return [x / s for x in v] if s > 0 else v


def spearman(a, b):
    return rs.spearman(a, b)


def decompose(pj, cf, P, Q):
    """Per-operator share of the decision error of picking P over Q (weights scaled to cf's cross total)."""
    scale = sum(cf.get((i, j, "enr"), 0.0) for i, j in CROSS) / sum(pj[(i, j, "enr")] for i, j in CROSS)
    op = [0.0] * M
    terms = {}
    for i, j in CROSS:
        sp, sq = P[i] == P[j], Q[i] == Q[j]
        if sp == sq:
            continue
        sgn = 1.0 if sp else -1.0
        e = sgn * (scale * pj[(i, j, "enr")] - cf.get((i, j, "enr"), 0.0))
        terms[(i, j)] = e
        op[i] += e / 2
        op[j] += e / 2
    return op, terms


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
    cf = gp.closed_form_pairs(mix, speeds, LAM, "semi", pairs=cf_pairs, seed=3 + idx)
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    cmap = [dw.density_weighted(hubs[k], radii[k], dem["pj"], origin)[0] for k in range(M)]
    rmap = [pw.density_dest(mix, k, shares[k], origin) for k in range(M)]
    maps = {"C": cmap, "R": rmap}
    pairw = {}
    for i, j in CROSS:
        for a in "CR":
            for b in "CR":
                pairw[(i, j, a + b)] = pw.gas_pair(maps[a][i], maps[b][j], hubs[i], hubs[j], speeds[i], speeds[j],
                                                   shares[i], shares[j], origin)
    cd = [census_dests(hubs[k], radii[k], dem["pj"]) for k in range(M)]
    rd = [real_dests(mix, k, shares[k]) for k in range(M)]
    Lr = [mean_leg(cd[k], hubs[k]) / mean_leg(rd[k], hubs[k]) for k in range(M)]
    tvs = [tv(cd[k], rd[k]) for k in range(M)]
    w = {"gas_pj": mixed(pairw, "C" * M), "gas_d": mixed(pairw, "R" * M)}
    c = [1.0 / x for x in Lr]
    w["gas_pjL"] = {(i, j, "enr"): c[i] * c[j] * w["gas_pj"][(i, j, "enr")] for i, j in CROSS}
    for k in range(M):
        w[f"fwd{k}"] = mixed(pairw, "".join("R" if q == k else "C" for q in range(M)))
        w[f"rev{k}"] = mixed(pairw, "".join("C" if q == k else "R" for q in range(M)))
    parts = gp.bipartitions()[1:]
    picks = {"cf": gp.best(parts, cf)}
    picks.update({name: gp.best(parts, x) for name, x in w.items()})
    fl = h_fr * LAM
    base = gp.score(sim_fr, picks["cf"]) / fl
    ratio = {name: gp.score(sim_fr, p) / fl / base for name, p in picks.items()}
    vpj, vd = norm(rs.vec(w["gas_pj"])), norm(rs.vec(w["gas_d"]))
    lerr = {(i, j): abs(math.log(a / b)) if a > 0 and b > 0 else float("nan") for (i, j), a, b in zip(CROSS, vpj, vd)}
    ek = [sum(lerr[p] for p in CROSS if k in p) / (M - 1) for k in range(M)]
    op, terms = decompose(w["gas_pj"], cf, picks["gas_pj"], picks["cf"])
    return dict(idx=idx, ratio=ratio, picks=picks, Lr=Lr, tv=tvs, ek=ek, op=op, terms=terms, shares=shares,
                radii=radii, speeds=speeds, lerr=lerr)


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11m: operator-by-operator swaps between census (residents + jobs) and real destination maps; 11g's {rl.N_LAYOUTS} layouts.")
    P(f"# Scored on the fresh {rl.N_FLIGHTS}-flight run as a ratio to the closed form's split ({rl.CF_PAIRS} pairs).")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    mean = lambda x: sum(x) / len(x)
    fmt = lambda p: "".join(map(str, p))
    P("\n## Per layout: fresh ratio to cf; best and worst single swaps")
    P("idx  gas_pj gas_d  gas_pjL | best fwd[k]   | worst rev[k]  | cf split  gas_pj split")
    for s in res:
        r = s["ratio"]
        bf = min(range(M), key=lambda k: (r[f"fwd{k}"], k))
        wr = max(range(M), key=lambda k: (r[f"rev{k}"], -k))
        P(f"{s['idx']:3d}  {r['gas_pj']:6.3f} {r['gas_d']:6.3f} {r['gas_pjL']:6.3f} | k={bf} {r[f'fwd{bf}']:6.3f}  | "
          f"k={wr} {r[f'rev{wr}']:6.3f}  | {fmt(s['picks']['cf'])}  {fmt(s['picks']['gas_pj'])}")
    for name in ("gas_pj", "gas_d", "gas_pjL"):
        x = [s["ratio"][name] for s in res]
        P(f"{name:8s} mean {mean(x):.3f} median {rl.median(x):.3f} max {max(x):.3f} within5% {sum(v <= 1.05 for v in x)}/24 "
          f"cf's split {sum(s['picks'][name] == s['picks']['cf'] for s in res)}/24")
    lo, hi, p = rs.sign_test([s["ratio"]["gas_pjL"] for s in res], [s["ratio"]["gas_pj"] for s in res])
    P(f"gas_pjL against gas_pj: better in {lo}, worse in {hi}, sign test p = {p:.3f}")

    P("\n## Missed layouts: every single swap, and the decision error by operator")
    for s in res:
        if s["idx"] not in MISSED:
            continue
        r = s["ratio"]
        P(f"\n### layout {s['idx']}: gas_pj {r['gas_pj']:.3f}, gas_pjL {r['gas_pjL']:.3f}")
        P("k  share  radius  speed  L_cen/L_real  TV     e_k    fwd[k]  rev[k]  err share")
        tot = sum(s["op"])
        for k in range(M):
            sh = s["op"][k] / tot if tot else float("nan")
            P(f"{k}  {s['shares'][k]:.3f}  {s['radii'][k]:6.0f}  {s['speeds'][k]:5.1f}  {s['Lr'][k]:12.3f}  {s['tv'][k]:.3f}  "
              f"{s['ek'][k]:.3f}  {r[f'fwd{k}']:6.3f}  {r[f'rev{k}']:6.3f}  {sh:9.3f}")
        if s["terms"]:
            top = sorted(s["terms"].items(), key=lambda kv: -kv[1])[:5]
            P("largest pair terms (per hour, + favours the wrong pick): " +
              ", ".join(f"({i},{j}) {e:+.3f} [log err {s['lerr'][(i, j)]:.2f}]" for (i, j), e in top) +
              f"; total {tot:+.3f}")

    P("\n## Across the 192 operators")
    ek = [x for s in res for x in s["ek"]]
    lr = [abs(math.log(x)) for s in res for x in s["Lr"]]
    tvs = [x for s in res for x in s["tv"]]
    P(f"L_census/L_real: median {rl.median([x for s in res for x in s['Lr']]):.3f}, "
      f"range {min(x for s in res for x in s['Lr']):.3f} to {max(x for s in res for x in s['Lr']):.3f}")
    P(f"TV distance: median {rl.median(tvs):.3f}, range {min(tvs):.3f} to {max(tvs):.3f}")
    P(f"e_k: median {rl.median(ek):.3f}, range {min(ek):.3f} to {max(ek):.3f}")
    s5, s6 = spearman(ek, lr), spearman(ek, tvs)
    P(f"Spearman(e_k, |log L ratio|) = {s5:.3f}; Spearman(e_k, TV) = {s6:.3f}")

    P("\n## Prediction checks")
    fix = lambda s: [k for k in range(M) if s["ratio"][f"fwd{k}"] <= 1.01]
    by = {s["idx"]: s for s in res}
    P(f"(1) single fwd[k] <= 1.01: layout 0 k={fix(by[0])}, layout 17 k={fix(by[17])}: {bool(fix(by[0])) and bool(fix(by[17]))}")
    shares2 = []
    for i in (0, 17):
        op = by[i]["op"]
        shares2.append(max(op) / sum(op) if sum(op) else float("nan"))
    P(f"(2) largest operator share of decision error: layout 0 {shares2[0]:.2f}, layout 17 {shares2[1]:.2f}: {all(x >= 0.5 for x in shares2)}")
    n3 = sum(bool(fix(by[i])) for i in MISSED)
    P(f"(3) missed layouts fixed by a single fwd[k]: {n3}/6: {n3 >= 4}")
    n4 = sum(any(s["ratio"][f"rev{k}"] > 1.02 for k in range(M)) for s in res)
    P(f"(4) layouts where a single rev[k] breaks gas_d by > 2%: {n4}/24: {n4 >= 6}")
    P(f"(5) Spearman(e_k, |log L|) {s5:.3f} >= 0.5: {s5 >= 0.5}")
    P(f"(6) Spearman(e_k, TV) {s6:.3f} >= 0.5: {s6 >= 0.5}")
    a, b = mean([s["ratio"]["gas_pjL"] for s in res]), mean([s["ratio"]["gas_pj"] for s in res])
    P(f"(7) gas_pjL mean {a:.3f} < gas_pj {b:.3f}: {a < b}")
    P(f"(8) gas_pjL layout 0 {by[0]['ratio']['gas_pjL']:.3f}, layout 17 {by[17]['ratio']['gas_pjL']:.3f}: "
      f"{by[0]['ratio']['gas_pjL'] <= 1.01 or by[17]['ratio']['gas_pjL'] <= 1.01}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
