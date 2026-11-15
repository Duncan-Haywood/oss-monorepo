"""Milestone 11x driver: experiments E1 to E5 of flux_term.py's docstring (predictions there). Needs numpy."""
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


ft = _load("hub_airspace_flux_term_11x_run", "flux_term.py")
gs = _load("hub_airspace_grid_start_11x", "grid_start.py")
rl = _load("hub_airspace_random_layouts_11x", "random_layouts.py")
st, sb, gp = ft.st, ft.sb, ft.gp
pw = gs.pw
M, LAM = rl.M, rl.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
PAIRS, SEED, BATCHES = 400000, 110000, 10   # 11t's estimator settings
R = 50.0
N = 24


def total(w, zone="enr", cross=None):
    return sum(x for (i, j, z), x in w.items() if (zone is None or z == zone) and (cross is None or (i != j) == cross))


def add(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


def pool(batches, name):
    out = {}
    for r in batches:
        for k, v in r[name].items():
            out[k] = out.get(k, 0.0) + v / len(batches)
    return out


def pair_vec(w, zones=("term", "enr")):
    return [sum(w.get((i, j, z), 0.0) for z in zones) for i, j in CROSS]


def pearson(a, b):
    ma, mb = S.mean(a), S.mean(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))


def run_layout(idx):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    sp = [speeds[k] for k in range(M)]
    origin = pw.grid_bounds(hubs, radii)
    out = {"idx": idx}
    c0 = time.process_time()
    out["D"] = ft.flux_terms(mix, speeds, LAM, R=R)
    out["cpu_D"] = time.process_time() - c0
    out["start"] = st.start_terms(mix, speeds, LAM, R=R)["start"]
    c0 = time.process_time()
    out["smp"] = sb.estimate(mix, speeds, LAM, R=R, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["cpu_smp"] = time.process_time() - c0
    g, lg = gs.start_g(mix, hubs, radii, sp, shares, origin, R=R)
    out["start_g"] = g["start"]
    out["gas_d"] = pw.gas_weights(lg, hubs, sp, shares, origin)
    return out


def main():
    t0 = time.time()
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        lays = pool_.map(run_layout, range(N))
    P = print
    P("# Milestone 11x: the flux term summed exactly over destination pairs (flux_term.py)")
    P("# conflicts per hour, semi base rule, R = %.0f m, Lambda = %d/h; sampled estimators: %d ordered pairs in %d "
      "batches, seeds %d + idx" % (R, LAM, PAIRS, BATCHES, SEED))
    P()
    P("## E1: deterministic flux cf_D against the sampled cf (en-route, all pairs)")
    P("idx    cf_D    sampled   se      z     cv(400k)")
    dt = st_ = 0.0
    zok, cvs = 0, []
    for L in lays:
        d = total(L["D"])
        b = [total(r["cf"]) for r in L["smp"]]
        m, se = S.mean(b), S.stdev(b) / math.sqrt(len(b))
        z = (m - d) / se
        zok += abs(z) <= 3
        cvs.append(se / d)
        dt, st_ = dt + d, st_ + m
        P("%3d  %7.4f  %7.4f  %6.4f  %5.2f  %6.4f" % (L["idx"], d, m, se, z, se / d))
    p1 = dt / st_
    P("pooled cf_D/sampled %.4f; |z| <= 3 in %d of 24; cv min %.4f median %.4f max %.4f" % (
        p1, zok, min(cvs), S.median(cvs), max(cvs)))
    P()
    P("## E2: cf_D+ = cf_D + exact start term against the exact estimator (en-route, all pairs)")
    P("idx   exact    se_ex   cf_D+/ex   z     cf+/ex(11t)")
    qd, qs, zs = [], [], []
    ed = ee = 0.0
    for L in lays:
        b = L["smp"]
        ex = [total(r["exact"]) for r in b]
        e, se = S.mean(ex), S.stdev(ex) / math.sqrt(len(ex))
        dplus = total(L["D"]) + total(L["start"])
        splus = S.mean(total(r["cf"]) for r in b) + total(L["start"])
        qd.append(dplus / e)
        qs.append(splus / e)
        zs.append((dplus - e) / se)
        ed, ee = ed + dplus, ee + e
        P("%3d  %7.3f  %6.4f  %7.4f  %6.2f  %7.4f" % (L["idx"], e, se, qd[-1], zs[-1], qs[-1]))
    w2 = sum(abs(q - 1) <= 0.02 for q in qd)
    sdr = S.stdev(qd) / S.stdev(qs)
    P("cf_D+/exact: pooled %.4f, mean %.4f (min %.4f, max %.4f), within 2%% in %d of 24, |z| <= 2 in %d, <= 3 in %d" % (
        ed / ee, S.mean(qd), min(qd), max(qd), w2, sum(abs(z) <= 2 for z in zs), sum(abs(z) <= 3 for z in zs)))
    P("sd over layouts: cf_D+/exact %.5f, cf+/exact %.5f, ratio %.3f; mean z %.2f (sd %.2f)" % (
        S.stdev(qd), S.stdev(qs), sdr, S.mean(zs), S.stdev(zs)))
    P()
    P("## E3: best two-layer split under cf_D+, 11t's cf+ (400k pairs) and ten batch-level cf+ (40k pairs)")
    P("idx  same(400k)  loss400k(D)  loss400k(ex)  batches_same  batch_loss_med(D)  batch_loss_max(D)")
    parts = gp.bipartitions()[1:]
    same400, bsame, blosses, l400 = 0, 0, [], []
    for L in lays:
        b = L["smp"]
        ex = pool(b, "exact")
        D = add(L["D"], L["start"])
        cp = add(pool(b, "cf"), L["start"])
        pd, ps = gp.best(parts, D), gp.best(parts, cp)
        lD = gp.score(D, ps) / gp.score(D, pd) - 1
        lE = gp.score(ex, ps) / gp.score(ex, pd) - 1
        same400 += ps == pd
        l400.append(lD)
        bl, bs = [], 0
        for r in b:
            pb = gp.best(parts, add(r["cf"], L["start"]))
            bs += pb == pd
            bl.append(gp.score(D, pb) / gp.score(D, pd) - 1)
        bsame += bs
        blosses += bl
        P("%3d  %5s  %9.4f%%  %9.4f%%  %5d  %9.4f%%  %9.4f%%" % (
            L["idx"], ps == pd, 100 * lD, 100 * lE, bs, 100 * S.median(bl), 100 * max(bl)))
    P("400k: same split in %d of 24, mean loss on cf_D+ %.4f%%, max %.4f%%" % (same400, 100 * S.mean(l400), 100 * max(l400)))
    P("40k batches: same split in %d of %d (%.3f); loss on cf_D+ median %.4f%%, mean %.4f%%, 90th pct %.4f%%, max %.4f%%" % (
        bsame, N * BATCHES, bsame / (N * BATCHES), 100 * S.median(blosses), 100 * S.mean(blosses),
        100 * sorted(blosses)[int(0.9 * len(blosses))], 100 * max(blosses)))
    P()
    P("## E4: paper weights (11u's gas_d, gas_d+) against noise-free and sampled references (cross, en-route)")
    P("idx  gas_d/cf_D  gas_d/cf   r(gas_d,cf_D)  r(gas_d,cf)  gas_d+/cf_D+  gas_d+/cf+  r(+,D+)  r(+,cf+)")
    rD, rS, gD, gS, gpD, gpS = [], [], [], [], [], []
    for L in lays:
        b = L["smp"]
        cf = pool(b, "cf")
        cfe = {k: v for k, v in cf.items() if k[2] == "enr"}
        De = {k: v for k, v in L["D"].items() if k[2] == "enr"}
        st_e = {k: v for k, v in L["start"].items() if k[2] == "enr"}
        g = L["gas_d"]
        gplus = gs.plus(g, L["start_g"])
        gv = pair_vec(g, ("enr",))
        rD.append(pearson(gv, pair_vec(De, ("enr",))))
        rS.append(pearson(gv, pair_vec(cfe, ("enr",))))
        gD.append(total(g, cross=True) / total(De, cross=True))
        gS.append(total(g, cross=True) / total(cfe, cross=True))
        Dp, Sp = add(De, st_e), add(cfe, st_e)
        gpD.append(total(gplus, cross=True) / total(Dp, cross=True))
        gpS.append(total(gplus, cross=True) / total(Sp, cross=True))
        P("%3d  %8.4f  %8.4f  %9.5f  %9.5f  %9.4f  %9.4f  %7.5f  %7.5f" % (
            L["idx"], gD[-1], gS[-1], rD[-1], rS[-1], gpD[-1], gpS[-1],
            pearson(pair_vec(gplus, ("enr",)), pair_vec(Dp, ("enr",))),
            pearson(pair_vec(gplus, ("enr",)), pair_vec(Sp, ("enr",)))))
    P("median r(gas_d, cf_D) %.5f, r(gas_d, cf) %.5f" % (S.median(rD), S.median(rS)))
    P("gas_d/cf_D median %.4f range %.4f to %.4f (spread %.4f); gas_d/cf median %.4f range %.4f to %.4f (spread %.4f)" % (
        S.median(gD), min(gD), max(gD), max(gD) - min(gD), S.median(gS), min(gS), max(gS), max(gS) - min(gS)))
    P("gas_d+/cf_D+ median %.4f range %.4f to %.4f; gas_d+/cf+ median %.4f range %.4f to %.4f" % (
        S.median(gpD), min(gpD), max(gpD), S.median(gpS), min(gpS), max(gpS)))
    P()
    P("## E5: CPU seconds per layout")
    c = [L["cpu_D"] for L in lays]
    P("cf_D: mean %.1f s, max %.1f s; sampled estimate (exact + cf + start, 400k pairs): mean %.1f s" % (
        S.mean(c), max(c), S.mean(L["cpu_smp"] for L in lays)))
    P()
    P("## Prediction checks")
    P("(1) pooled cf_D/sampled %.4f within 0.5%% and |z| <= 3 in %d/24 >= 23: %s" % (p1, zok, abs(p1 - 1) <= 0.005 and zok >= 23))
    P("(2) cv in [0.003, 0.015] in every layout (min %.4f, max %.4f): %s" % (
        min(cvs), max(cvs), min(cvs) >= 0.003 and max(cvs) <= 0.015))
    P("(3) cf_D+ within 2%% in %d/24 >= 22: %s; pooled %.4f in [0.998, 1.008]: %s" % (
        w2, w2 >= 22, ed / ee, 0.998 <= ed / ee <= 1.008))
    P("(4) sd ratio %.3f <= 0.9: %s" % (sdr, sdr <= 0.9))
    P("(5) 400k same %d/24 >= 21: %s; batches same %.3f >= 0.6: %s; batch median loss %.4f%% <= 0.5%%: %s" % (
        same400, same400 >= 21, bsame / (N * BATCHES), bsame / (N * BATCHES) >= 0.6, 100 * S.median(blosses),
        S.median(blosses) <= 0.005))
    P("(6) median r(gas_d, cf_D) %.5f >= r(gas_d, cf) %.5f: %s; spread ratio %.3f >= 0.8: %s" % (
        S.median(rD), S.median(rS), S.median(rD) >= S.median(rS), (max(gD) - min(gD)) / (max(gS) - min(gS)),
        (max(gD) - min(gD)) / (max(gS) - min(gS)) >= 0.8))
    P("(7) cf_D mean %.1f s <= 300: %s" % (S.mean(c), S.mean(c) <= 300))
    P()
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
