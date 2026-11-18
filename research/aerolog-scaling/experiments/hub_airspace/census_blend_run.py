"""Milestone 11w driver: experiments E1 to E5 of census_blend.py's docstring (predictions there)."""
import importlib.util
import math
import multiprocessing as mp
import os
import pickle
import statistics as S
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cb = _load("hub_airspace_census_blend_11w_run", "census_blend.py")
st = _load("hub_airspace_start_term_11w", "start_term.py")
rl = _load("hub_airspace_random_layouts_11w", "random_layouts.py")
cs, gs, pw, dw = cb.cs, cb.gs, cb.pw, cb.dw
gp, sb = gs.gp, st.sb
M, LAM = rl.M, rl.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
PAIRS, SEED, BATCHES = 400000, 110000, 10   # 11t's, 11u's and 11v's estimator settings
R = 50.0
N = 24


def total(w, zone="enr", cross=None):
    return sum(x for (i, j, z), x in w.items() if (zone is None or z == zone) and (cross is None or (i != j) == cross))


def pair_vec(w, zones=("term", "enr")):
    return [sum(w.get((i, j, z), 0.0) for z in zones) for i, j in CROSS]


def pool(batches, name):
    out = {}
    for r in batches:
        for k, v in r[name].items():
            out[k] = out.get(k, 0.0) + v / len(batches)
    return out


def run_layout(idx):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    sp = [speeds[k] for k in range(M)]
    origin = pw.grid_bounds(hubs, radii)
    dem = dw.load_demand()
    out = {"idx": idx}
    out["ex"] = st.start_terms(mix, speeds, LAM, R=R)
    c0 = time.process_time()
    out["S"], out["G"], _, _ = cb.combos(dem["pop"], dem["jobs"], hubs, radii, sp, shares, origin, R=R)
    out["cpu"] = time.process_time() - c0
    out["pj"], lpj = cs.start_census(dem["pj"], hubs, radii, sp, shares, origin, R=R)
    out["gas_pj"] = pw.gas_weights(lpj, hubs, sp, shares, origin)
    smp = sb.estimate(mix, speeds, LAM, R=R, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["exact"], out["cf"] = pool(smp, "exact"), pool(smp, "cf")
    return out


def summary(name, vals, tgt, rr=None):
    rat = [vals[n] / tgt[n] for n in range(N)]
    lg = [abs(math.log(x)) for x in rat]
    s = "%-9s pooled %.4f  median %.4f  min %.4f  max %.4f  median|ln| %.4f  within 5%% %2d/24" % (
        name, sum(vals.values()) / sum(tgt.values()), S.median(rat), min(rat), max(rat), S.median(lg),
        sum(abs(x - 1) <= 0.05 for x in rat))
    if rr is not None:
        s += "  r median %.4f min %.4f" % (S.median(rr), min(rr))
    return s, rat, S.median(lg)


def main():
    t0 = time.time()
    cache = os.environ.get("BLEND_CACHE")   # optional pickle of the per-layout results, to re-run the analysis only
    if cache and os.path.exists(cache):
        lays = pickle.load(open(cache, "rb"))
    else:
        with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
            lays = pool_.map(run_layout, range(N))
        if cache:
            pickle.dump(lays, open(cache, "wb"))
    P = print
    P("# Milestone 11w: a residents/jobs blend fitted out of sample by layout (census_blend.py); R = %.0f m, semi, "
      "Lambda = %d/h, grid %.0f m" % (R, LAM, gs.H))
    P("# exact start term: 11t start_term.start_terms; exact estimator: steiner_bias.estimate, %d pairs, seeds %d + idx" % (PAIRS, SEED))
    ex_s = {n: total(L["ex"]["start"], zone=None) for n, L in enumerate(lays)}
    ex_tot = {n: total(L["exact"], cross=True) for n, L in enumerate(lays)}
    flux = {n: ex_tot[n] - total(L["ex"]["start"], zone="enr") for n, L in enumerate(lays)}
    st_tot = {n: {xy: total(L["S"][xy]["start"], zone=None) for xy in cb.XY} for n, L in enumerate(lays)}
    g_tot = {n: {xy: total(L["G"][xy]) for xy in cb.XY} for n, L in enumerate(lays)}
    spj = {n: total(L["pj"]["start"], zone=None) for n, L in enumerate(lays)}
    gpj = {n: total(L["gas_pj"]) for n, L in enumerate(lays)}
    ex_pairs = [pair_vec(L["ex"]["start"]) for L in lays]
    fl_pairs = [[a - b for a, b in zip(pair_vec(L["exact"], ("enr",)), pair_vec(L["ex"]["start"], ("enr",)))] for L in lays]

    P()
    P("## Reproduction of 11v")
    pp = sum(st_tot[n][("p", "p")] for n in range(N)) / sum(ex_s.values())
    jj = sum(st_tot[n][("j", "j")] for n in range(N)) / sum(ex_s.values())
    P("S[p,p] pooled start ratio %.4f (11v start_p 0.6319); S[j,j] %.4f (11v start_j 1.0557); start_pj %.4f (11v 0.8336)"
      % (pp, jj, sum(spj.values()) / sum(ex_s.values())))
    P("G[p,p] median level %.4f (11v gas_p 0.7285); G[j,j] %.4f (11v gas_j 0.9374); gas_pj %.4f (11v 0.8790)" % (
        S.median(g_tot[n][("p", "p")] / ex_tot[n] for n in range(N)),
        S.median(g_tot[n][("j", "j")] / ex_tot[n] for n in range(N)), S.median(gpj[n] / ex_tot[n] for n in range(N))))

    ALL = list(range(N))
    a_in = cb.fit_grid(st_tot, ex_s, ALL)[0]
    lm_in = cb.fit_grid(st_tot, ex_s, ALL, two=True)
    ks_in = cb.fit_scale(spj, ex_s, ALL)
    b_in = cb.fit_grid(g_tot, flux, ALL)[0]
    kf_in = cb.fit_scale(gpj, flux, ALL)
    loo = []
    for n in range(N):
        rest = [k for k in ALL if k != n]
        loo.append({"a": cb.fit_grid(st_tot, ex_s, rest)[0], "lm": cb.fit_grid(st_tot, ex_s, rest, two=True),
                    "ks": cb.fit_scale(spj, ex_s, rest), "b": cb.fit_grid(g_tot, flux, rest)[0],
                    "kf": cb.fit_scale(gpj, flux, rest)})

    P()
    P("## E1: start term, in-sample fits on all 24 layouts")
    P("a* = %.2f; (a_l*, a_m*) = (%.2f, %.2f); k* (start_pj scale) = %.4f" % (a_in, lm_in[0], lm_in[1], ks_in))
    for nm, (al, am) in (("a*", (a_in, a_in)), ("lm*", lm_in)):
        hub = sum(cb.start_parts(L["S"], al, am)[0] for L in lays) / sum(L["ex"]["hub"] for L in lays)
        dl = sum(cb.start_parts(L["S"], al, am)[1] for L in lays) / sum(L["ex"]["deliv"] for L in lays)
        P("in-sample %-4s hub part %.4f, delivery part %.4f of exact" % (nm, hub, dl))
    P()
    P("## E1: start term, leave-one-layout-out")
    P("idx   a_loo  al_loo am_loo  k_loo    exact   start_a  start_lm start_k  start_pj (ratios)")
    sa, slm, sk, ra, rlm, rpj = {}, {}, {}, [], [], []
    Wa = {}
    for n, L in enumerate(lays):
        f = loo[n]
        A = cb.start_blend(L["S"], f["a"], f["a"])
        B = cb.start_blend(L["S"], *f["lm"])
        Wa[n] = A
        sa[n], slm[n], sk[n] = total(A, zone=None), total(B, zone=None), f["ks"] * spj[n]
        ra.append(gp.pearson(pair_vec(A), ex_pairs[n]))
        rlm.append(gp.pearson(pair_vec(B), ex_pairs[n]))
        rpj.append(gp.pearson(pair_vec(L["pj"]["start"]), ex_pairs[n]))
        P("%3d   %.2f   %.2f   %.2f  %.4f  %7.4f  %7.4f  %7.4f  %7.4f  %7.4f" % (
            L["idx"], f["a"], f["lm"][0], f["lm"][1], f["ks"], ex_s[n], sa[n] / ex_s[n], slm[n] / ex_s[n],
            sk[n] / ex_s[n], spj[n] / ex_s[n]))
    s1, rat_a, mla = summary("start_a", sa, ex_s, ra)
    s2, _, mllm = summary("start_lm", slm, ex_s, rlm)
    s3, _, mlk = summary("start_k", sk, ex_s, rpj)
    s4, _, mlpj = summary("start_pj", spj, ex_s, rpj)
    for s in (s1, s2, s3, s4):
        P(s)

    P()
    P("## E2: flux term (target: exact cross en-route minus exact en-route start), in-sample b* = %.2f, k* = %.4f" % (b_in, kf_in))
    P("idx   b_loo   k_loo   flux     gas_b    gas_k    gas_pj (ratios to the flux part)")
    gb, gk, rb, rgpj = {}, {}, [], []
    Wb = {}
    for n, L in enumerate(lays):
        f = loo[n]
        Gb = cb.gas_blend(L["G"], f["b"])
        Wb[n] = Gb
        gb[n], gk[n] = total(Gb), f["kf"] * gpj[n]
        rb.append(gp.pearson(pair_vec(Gb, ("enr",)), fl_pairs[n]))
        rgpj.append(gp.pearson(pair_vec(L["gas_pj"], ("enr",)), fl_pairs[n]))
        P("%3d   %.2f  %.4f  %7.3f  %7.4f  %7.4f  %7.4f" % (L["idx"], f["b"], f["kf"], flux[n], gb[n] / flux[n],
                                                          gk[n] / flux[n], gpj[n] / flux[n]))
    t1, _, mlb = summary("gas_b", gb, flux, rb)
    t2, _, mlgk = summary("gas_k", gk, flux, rgpj)
    t3, _, _ = summary("gas_pj", gpj, flux, rgpj)
    for s in (t1, t2, t3):
        P(s)

    P()
    P("## E3: cross-operator en-route totals against the exact estimator (leave-one-layout-out fits)")
    W = {}
    comb, combk, gpjp = {}, {}, {}
    for n, L in enumerate(lays):
        f = loo[n]
        w = {"cf": {k: v for k, v in L["cf"].items() if k[0] != k[1]}}
        w["cf+"] = gs.plus(w["cf"], L["ex"]["start"])
        w["gas_pj"] = L["gas_pj"]
        w["gas_pj+"] = gs.plus(L["gas_pj"], L["pj"]["start"])
        w["gas_b"] = Wb[n]
        w["comb"] = gs.plus(Wb[n], Wa[n])
        w["combk"] = gs.plus({k: f["kf"] * v for k, v in L["gas_pj"].items()},
                             {k: f["ks"] * v for k, v in L["pj"]["start"].items()})
        W[n] = w
        comb[n], combk[n], gpjp[n] = total(w["comb"], cross=True), total(w["combk"], cross=True), total(w["gas_pj+"], cross=True)
    u1, rat_c, _ = summary("comb", comb, ex_tot)
    u2, _, _ = summary("combk", combk, ex_tot)
    u3, _, _ = summary("gas_pj+", gpjp, ex_tot)
    for s in (u1, u2, u3):
        P(s)

    P()
    P("## E4: best two-layer split under each weight, scored on the pooled exact weights, ratio to cf+'s split")
    parts = gp.bipartitions()[1:]
    names = ["gas_pj", "gas_pj+", "gas_b", "comb", "combk"]
    P("idx  " + " ".join("%8s" % k for k in names))
    sc = {k: [] for k in names}
    for n, L in enumerate(lays):
        ex = L["exact"]
        ref = gp.score(ex, gp.best(parts, W[n]["cf+"]))
        for k in names:
            sc[k].append(gp.score(ex, gp.best(parts, W[n][k])) / ref)
        P("%3d  " % L["idx"] + " ".join("%8.4f" % sc[k][-1] for k in names))
    for k in names:
        x = sc[k]
        P("%-8s mean %.4f median %.4f max %.4f within 0.5%% in %d/24" % (k, S.mean(x), S.median(x), max(x), sum(v <= 1.005 for v in x)))

    P()
    P("## E5: spread of the 24 leave-one-out fits")
    la, lb = [f["a"] for f in loo], [f["b"] for f in loo]
    P("a: min %.2f max %.2f (span %.2f); b: min %.2f max %.2f (span %.2f); a_l %.2f..%.2f, a_m %.2f..%.2f" % (
        min(la), max(la), max(la) - min(la), min(lb), max(lb), max(lb) - min(lb), min(f["lm"][0] for f in loo),
        max(f["lm"][0] for f in loo), min(f["lm"][1] for f in loo), max(f["lm"][1] for f in loo)))
    P("CPU seconds per layout for the four start combos and four flux combos: mean %.2f max %.2f" % (
        S.mean(L["cpu"] for L in lays), max(L["cpu"] for L in lays)))

    P()
    P("## Prediction checks")
    P("(1) in-sample a* %.2f in [0.55, 0.90]: %s" % (a_in, 0.55 <= a_in <= 0.90))
    pa = sum(sa.values()) / sum(ex_s.values())
    n5 = sum(abs(x - 1) <= 0.05 for x in rat_a)
    P("(2) LOO start_a pooled %.4f in [0.95, 1.05] and within 5%% in %d >= 8: %s" % (pa, n5, 0.95 <= pa <= 1.05 and n5 >= 8))
    P("(3) in-sample a_l* %.2f > a_m* %.2f: %s" % (lm_in[0], lm_in[1], lm_in[0] > lm_in[1]))
    P("(4) LOO median|ln| start_lm %.4f < start_a %.4f: %s" % (mllm, mla, mllm < mla))
    P("(5) LOO median|ln| start_a %.4f < start_k %.4f: %s" % (mla, mlk, mla < mlk))
    P("(6) median r(start_a, exact) %.4f >= 0.9876: %s" % (S.median(ra), S.median(ra) >= 0.9876))
    P("(7) in-sample b* %.2f in [0.50, 0.95]: %s" % (b_in, 0.50 <= b_in <= 0.95))
    mc, nc = S.median(rat_c), sum(abs(x - 1) <= 0.05 for x in rat_c)
    P("(8) LOO comb median %.4f in [0.97, 1.03] and within 5%% in %d >= 10: %s" % (mc, nc, 0.97 <= mc <= 1.03 and nc >= 10))
    P("(9) comb mean split ratio %.4f <= gas_pj+'s %.4f: %s" % (S.mean(sc["comb"]), S.mean(sc["gas_pj+"]),
                                                              S.mean(sc["comb"]) <= S.mean(sc["gas_pj+"])))
    P("(10) LOO a span %.2f <= 0.10 and b span %.2f <= 0.10: %s" % (max(la) - min(la), max(lb) - min(lb),
                                                                    max(la) - min(la) <= 0.10 and max(lb) - min(lb) <= 0.10))
    P("(other) median|ln| start_pj %.4f; gas_b %.4f, gas_k %.4f" % (mlpj, mlb, mlgk))
    P()
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
