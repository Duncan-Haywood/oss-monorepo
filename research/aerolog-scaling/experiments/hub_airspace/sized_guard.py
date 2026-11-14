"""Milestone 11p: does a simulation guard sized to the gap between candidate splits make disclosure stopping safe, and
does an order that combines traffic share with census-only influence stop earlier and better?

11o: stopping share-ordered disclosure once the paper pick stops changing (stable(share)) uses a mean 1.54 disclosures
for a mean fresh ratio of 1.009; a guard of one 20,000-flight simulation over the distinct picks seen made it worse
(1.012), because the candidates differ by 2% to 8% and one short run's error sometimes exceeds that. Influence order
needed two unchanged disclosures (stable2, 1.004) because its first disclosure often leaves a wrong census pick alone.

Setup as 11o: 11g's 24 eight-operator layouts, census maps C and real maps R, every disclosure set's paper pick, fresh
200,000-flight scoring as a ratio to the closed form's split. Orders:
  share, influence  as 11n.
  alt               interleave: share's first, influence's first, share's second, ... skipping operators already asked.
  prod              largest share x (influence + 0.01) first: big operators whose pair weights could move the pick.
Guards, applied to the distinct picks seen up to the stable stop (guard) or along the full path (guardall):
  g1      one 20,000-flight run (11o's guard, on new seeds).
  g5      five 20,000-flight runs pooled (100,000 flights): conflict counts sum across runs.
  gseq    sequential, sized to the gap: run 20,000-flight batches; from the second batch on, take the pooled leader a
          and runner-up b and the per-batch differences d_t = score_t(b) - score_t(a); stop once
          mean(d) > 2 sd(d) / sqrt(r) (or sd = 0 and mean > 0), else add a batch, at most 5; choose the pooled leader.
          A single candidate needs no batch. Cost: batches run.
  sim100k the best of all 127 splits on the five pooled batches (no disclosure).
Short runs: 3 replicates per layout, each with its own five batches, seeds 40000 + 1000 (5 rep + b) + layout, fresh
relative to 11g (7000 +, 8000 +), 11l (20000 +) and 11o (30000 +).

Predictions (written and committed before any order, guard or short simulation was computed):
 (1) stable(alt) mean fresh ratio <= 1.006 with a mean <= 2.5 disclosures (prior 45%).
 (2) stable(prod) mean fresh ratio <= stable(share)'s (prior 45%).
 (3) g5 guard(share) mean <= stable(share) mean: a 100,000-flight guard no longer hurts (prior 60%).
 (4) gseq guard(share) mean within 0.002 of g5 guard(share), with a mean <= 3 batches over decisions with >= 2
     candidates (prior 45%).
 (5) gseq guardall(influence) puts all 72 layout-replicates within 5% of cf (prior 55%).
 (6) gseq guardall(influence) mean <= 1.003 (prior 40%).
 (7) no guarded rule has a lower mean than gas_d's 1.001 (prior 70%).
Preliminary.

    python3 sized_guard.py > sized_guard_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_stopping_11p", os.path.join(HERE, "stopping.py"))
st = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(st)
dc, od, rs, dw, pw, rl, gp = st.dc, st.od, st.rs, st.dw, st.pw, st.rl, st.gp
M, LAM, CROSS, SUBSETS = st.M, st.LAM, st.CROSS, st.SUBSETS
N_BATCH = 20000
MAX_BATCH = 5
REPS = 3
ORDERS = ("share", "influence", "alt", "prod")
GUARDS = ("g1", "g5", "gseq")


def interleave(a, b):
    out = []
    for x, y in zip(a, b):
        for k in (x, y):
            if k not in out:
                out.append(k)
    return out


def pooled(batches, p):
    return sum(gp.score(w, p) for w in batches)


def choose_fixed(cands, batches):
    """Pooled leader over the given batches; (choice, batches used)."""
    if len(cands) == 1:
        return cands[0], 0
    return min(cands, key=lambda p: (pooled(batches, p), p)), len(batches)


def choose_seq(cands, batches, z=2.0):
    """Sequential guard: add batches until the pooled leader beats the runner-up by z standard errors; (choice, used)."""
    if len(cands) == 1:
        return cands[0], 0
    r = 1
    while True:
        use = batches[:r]
        ranked = sorted(cands, key=lambda p: (pooled(use, p), p))
        a, b = ranked[0], ranked[1]
        if r >= 2:
            d = [gp.score(w, b) - gp.score(w, a) for w in use]
            mu = sum(d) / r
            sd = math.sqrt(sum((x - mu) ** 2 for x in d) / (r - 1))
            if (sd == 0 and mu > 0) or mu > z * sd / math.sqrt(r):
                return a, r
        if r == len(batches):
            return a, r
        r += 1


def guard(name, cands, batches):
    if name == "g1":
        return choose_fixed(cands, batches[:1])
    if name == "g5":
        return choose_fixed(cands, batches)
    return choose_seq(cands, batches)


def run_layout(idx, n_flights=rl.N_FLIGHTS, cf_pairs=rl.CF_PAIRS, n_batch=N_BATCH, reps=REPS, max_batch=MAX_BATCH):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    fn = lambda kind, vx, vy, h: rl.base_layer("semi", kind, vx, vy, h)
    sim_fr, h_fr = gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_flights, seed=8000 + idx)
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
    fl = h_fr * LAM
    base = gp.score(sim_fr, gp.best(parts, cf)) / fl
    fresh = lambda p: gp.score(sim_fr, p) / fl / base
    pick = {D: gp.best(parts, od.mixed(pairw, dc.src_of(D))) for D in SUBSETS}
    wc = od.mixed(pairw, "C" * M)
    infl = dc.influence(parts, wc, pick[frozenset()])
    o_sh = dc.order_by(shares)
    o_in = dc.order_by([infl[k] + 1e-9 * shares[k] for k in range(M)])
    orders = {"share": o_sh, "influence": o_in, "alt": interleave(o_sh, o_in),
              "prod": dc.order_by([shares[k] * (infl[k] + 0.01) for k in range(M)])}
    batches = [[gp.simulate_pairs(mix, speeds, LAM, fn, n_flights=n_batch,
                                  seed=40000 + 1000 * (max_batch * rep + b) + idx)[0] for b in range(max_batch)]
               for rep in range(reps)]
    out = dict(idx=idx, sim100k=[fresh(choose_fixed(parts, bs)[0]) for bs in batches],
               sim20k=[fresh(choose_fixed(parts, bs[:1])[0]) for bs in batches])
    for name, o in orders.items():
        path = st.path_picks(pick, o)
        fr = [fresh(p) for p in path]
        m1, m2 = st.stop_stable(path, 1), st.stop_stable(path, 2)
        cg, ca = st.distinct(path[:m1 + 1]), st.distinct(path)
        d = dict(order=o, fr=fr, m1=m1, m2=m2, nd_stop=len(cg), nd_all=len(ca), stable=fr[m1], stable2=fr[m2])
        for g in GUARDS:
            for tag, cands in (("guard", cg), ("guardall", ca)):
                ch = [guard(g, cands, bs) for bs in batches]
                d[f"{g}_{tag}"] = [fresh(p) for p, _ in ch]
                d[f"{g}_{tag}_n"] = [n for _, n in ch]
        out[name] = d
    return out


def main():
    t0 = time.time()
    P = print
    P(f"# Milestone 11p: sized simulation guards and combined disclosure orders; 11g's {rl.N_LAYOUTS} layouts.")
    P(f"# Fresh {rl.N_FLIGHTS}-flight scoring as a ratio to the closed form's split; guards use {N_BATCH}-flight "
      f"batches (at most {MAX_BATCH}), {REPS} replicates per layout.")
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        res = pool.map(run_layout, range(rl.N_LAYOUTS))
    mean = lambda x: sum(x) / len(x) if x else float("nan")
    w5 = lambda x: sum(v <= 1.05 for v in x)
    summ = {}

    P("\n## Rules (mean, max, within 5% of cf; disclosures used; batches of 20,000 flights per decision, and per "
      "decision with >= 2 candidates)")
    P(f"{'rule':26s} {'mean':>6s} {'max':>6s} {'within5%':>9s} {'discl':>6s} {'batch':>6s} {'batch2+':>7s}")

    def row(name, vals, discl, nb=None):
        summ[name] = mean(vals)
        b = f"{mean(nb):6.2f} {mean([n for n in nb if n > 0]):7.2f}" if nb is not None else f"{0:6.2f} {'-':>7s}"
        P(f"{name:26s} {mean(vals):6.3f} {max(vals):6.3f} {w5(vals):4d}/{len(vals):<4d} {discl:6.2f} {b}")

    row("gas_pj (m=0)", [s["share"]["fr"][0] for s in res], 0)
    row("gas_d (m=8)", [s["share"]["fr"][8] for s in res], 8)
    row("sim20k (all 127)", [v for s in res for v in s["sim20k"]], 0, [1] * (3 * len(res)))
    row("sim100k (all 127)", [v for s in res for v in s["sim100k"]], 0, [MAX_BATCH] * (3 * len(res)))
    for o in ORDERS:
        row(f"stable({o})", [s[o]["stable"] for s in res], mean([s[o]["m1"] for s in res]))
        row(f"stable2({o})", [s[o]["stable2"] for s in res], mean([s[o]["m2"] for s in res]))
    for o in ORDERS:
        for g in GUARDS:
            for tag in ("guard", "guardall"):
                discl = mean([s[o]["m1"] for s in res]) if tag == "guard" else 8
                row(f"{g} {tag}({o})", [v for s in res for v in s[o][f"{g}_{tag}"]], discl,
                    [n for s in res for n in s[o][f"{g}_{tag}_n"]])

    P("\n## Orders and stop points per layout (stable ratio; path p_0..p_8 for alt and prod)")
    P("idx  " + "  ".join(f"{o:>9s} m1 ratio" for o in ORDERS))
    for s in res:
        P(f"{s['idx']:3d}  " + "  ".join(f"{'':>9s} {s[o]['m1']:2d} {s[o]['stable']:.3f}" for o in ORDERS)
          + "   alt " + " ".join(f"{x:.3f}" for x in s["alt"]["fr"]) + "   prod " + " ".join(f"{x:.3f}" for x in s["prod"]["fr"]))

    P("\n## Guards per layout with >= 2 candidates under stable(share) (per replicate ratio / batches)")
    for s in res:
        d = s["share"]
        if d["nd_stop"] >= 2:
            P(f"{s['idx']:3d} stable {d['stable']:.3f}  " + "  ".join(
                f"{g} " + " ".join(f"{v:.3f}/{n}" for v, n in zip(d[f"{g}_guard"], d[f"{g}_guard_n"])) for g in GUARDS))

    P("\n## Sign tests per layout-replicate (two-sided, ties dropped)")
    rep3 = lambda o, key: [s[o][key] for s in res for _ in range(REPS)]
    for a_name, a, b_name, b in (
            ("g5 guard(share)", [v for s in res for v in s["share"]["g5_guard"]], "stable(share)", rep3("share", "stable")),
            ("gseq guard(share)", [v for s in res for v in s["share"]["gseq_guard"]], "stable(share)", rep3("share", "stable")),
            ("gseq guard(share)", [v for s in res for v in s["share"]["gseq_guard"]], "g1 guard(share)",
             [v for s in res for v in s["share"]["g1_guard"]]),
            ("gseq guardall(influence)", [v for s in res for v in s["influence"]["gseq_guardall"]], "sim100k",
             [v for s in res for v in s["sim100k"]])):
        lo, hi, p = rs.sign_test(a, b)
        P(f"{a_name} vs {b_name}: better in {lo}, worse in {hi}, p = {p:.3f}")
    for o in ("alt", "prod"):
        lo, hi, p = rs.sign_test([s[o]["stable"] for s in res], [s["share"]["stable"] for s in res])
        P(f"stable({o}) vs stable(share) per layout: better in {lo}, worse in {hi}, p = {p:.3f}")

    P("\n## Prediction checks")
    ma = mean([s["alt"]["m1"] for s in res])
    P(f"(1) stable(alt) {summ['stable(alt)']:.3f} <= 1.006 with {ma:.2f} <= 2.5 disclosures: "
      f"{summ['stable(alt)'] <= 1.006 and ma <= 2.5}")
    P(f"(2) stable(prod) {summ['stable(prod)']:.3f} <= stable(share) {summ['stable(share)']:.3f}: "
      f"{summ['stable(prod)'] <= summ['stable(share)']}")
    P(f"(3) g5 guard(share) {summ['g5 guard(share)']:.3f} <= stable(share) {summ['stable(share)']:.3f}: "
      f"{summ['g5 guard(share)'] <= summ['stable(share)']}")
    nb = [n for s in res for n in s["share"]["gseq_guard_n"] if n > 0]
    P(f"(4) gseq guard(share) {summ['gseq guard(share)']:.3f} within 0.002 of g5 {summ['g5 guard(share)']:.3f}, "
      f"batches {mean(nb):.2f} <= 3: {abs(summ['gseq guard(share)'] - summ['g5 guard(share)']) <= 0.002 and mean(nb) <= 3}")
    ga = [v for s in res for v in s["influence"]["gseq_guardall"]]
    P(f"(5) gseq guardall(influence) within 5%: {w5(ga)}/{len(ga)}: {w5(ga) == len(ga)}")
    P(f"(6) gseq guardall(influence) mean {mean(ga):.3f} <= 1.003: {mean(ga) <= 1.003}")
    gk = {k: v for k, v in summ.items() if k.startswith(("g1 ", "g5 ", "gseq "))}
    lowest = min(gk, key=gk.get)
    P(f"(7) lowest guarded mean {lowest} {gk[lowest]:.4f} vs gas_d {summ['gas_d (m=8)']:.4f}: "
      f"{gk[lowest] >= summ['gas_d (m=8)']}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
