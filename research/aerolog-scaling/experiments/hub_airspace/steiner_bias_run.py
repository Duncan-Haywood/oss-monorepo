"""Milestone 11s driver: experiments E1 to E5 of steiner_bias.py's docstring (predictions there)."""
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


sb = _load("hub_airspace_steiner_bias_11s", "steiner_bias.py")
rl = _load("hub_airspace_random_layouts_11s", "random_layouts.py")
gp = sb.gp
M, LAM = rl.M, rl.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
RUNS = {50.0: (400000, 110000), 25.0: (200000, 120000), 100.0: (200000, 130000)}


def total(w, zone="enr", cross=None):
    return sum(x for (i, j, z), x in w.items() if z == zone and (cross is None or (i != j) == cross))


def pearson(a, b):
    ma, mb = S.mean(a), S.mean(b)
    sa = math.sqrt(sum((x - ma) ** 2 for x in a))
    sb_ = math.sqrt(sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb_)


def run_layout(idx):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    out = {"idx": idx}
    for R, (n, seed) in RUNS.items():
        c0 = time.process_time()
        res = sb.estimate(mix, speeds, LAM, R=R, pairs=n, seed=seed + idx)[0]
        out[R] = res
        out[("cpu", R)] = time.process_time() - c0
    return out


def main():
    t0 = time.time()
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool:
        lays = pool.map(run_layout, range(24))
    print("# Milestone 11s: the closed form's bias as the Steiner start term (steiner_bias.py)")
    print("# en-route conflicts per hour, semi base rule, Lambda = %d/h; common flight pairs per estimator" % LAM)
    print()
    print("## E1/E2 (R = 50 m, 400,000 ordered pairs per layout)")
    print("idx   exact      cf  cf/ex  defS%  defX%  startX  start/defX  cf*/ex  r(cf*,ex)  r(cf,ex)")
    defS = defX = startX = ex_all = 0.0
    within2 = 0
    rmin = 1.0
    rcf_min = 1.0
    ratios = {}
    for L in lays:
        r = L[50.0]
        ex, cf, cs, st = r["exact"], r["cf"], r["cfstar"], r["start"]
        e, c, s = total(ex), total(cf), total(cs)
        dS = total(ex, cross=False) - total(cf, cross=False)
        dX = total(ex, cross=True) - total(cf, cross=True)
        sX = total(st)
        defS, defX, startX, ex_all = defS + dS, defX + dX, startX + sX, ex_all + e
        a = [ex.get((i, j, "enr"), 0.0) for i, j in CROSS]
        rs = pearson(a, [cs.get((i, j, "enr"), 0.0) for i, j in CROSS])
        rc = pearson(a, [cf.get((i, j, "enr"), 0.0) for i, j in CROSS])
        rmin, rcf_min = min(rmin, rs), min(rcf_min, rc)
        within2 += abs(s / e - 1) <= 0.02
        ratios[L["idx"]] = (c / e, s / e)
        print("%3d %7.3f %7.3f %6.4f %6.2f %6.2f %7.3f %10.3f %7.4f %10.5f %9.5f" % (
            L["idx"], e, c, c / e, 100 * dS / e, 100 * dX / e, sX, sX / dX if dX else float("nan"), s / e, rs, rc))
    cfr = [v[0] for v in ratios.values()]
    csr = [v[1] for v in ratios.values()]
    print("cf/exact mean %.4f (min %.4f, max %.4f); cf*/exact mean %.4f (min %.4f, max %.4f)" % (
        S.mean(cfr), min(cfr), max(cfr), S.mean(csr), min(csr), max(csr)))
    sh_x = defX / (defX + defS)
    print("pooled deficit: same-operator %.3f/h, cross-operator %.3f/h (cross share %.3f); start term %.3f/h = %.3f of "
          "the cross deficit" % (defS, defX, sh_x, startX, startX / defX))
    print()
    print("## E3: scaling in R (mean over 24 layouts)")
    print("   R   1-cf/ex   1-cf*/ex   start/cf(X)   cpu s/layout")
    dm = {}
    for R in sorted(RUNS):
        d = [1 - total(L[R]["cf"]) / total(L[R]["exact"]) for L in lays]
        ds = [1 - total(L[R]["cfstar"]) / total(L[R]["exact"]) for L in lays]
        q = [total(L[R]["start"], zone="enr") / total(L[R]["cf"], cross=True) for L in lays]
        dm[R] = S.mean(d)
        print("%5.0f  %8.4f  %9.4f  %11.4f  %8.1f" % (R, S.mean(d), S.mean(ds), S.mean(q),
                                                     S.mean(L[("cpu", R)] for L in lays)))
    print("deficit ratio R=100/R=50 %.3f, R=25/R=50 %.3f" % (dm[100.0] / dm[50.0], dm[25.0] / dm[50.0]))
    print()
    print("## E4: best two-layer split under cf and cf*, scored on the exact weights (R = 50 m)")
    parts = gp.bipartitions()[1:]
    same = 0
    diffs = []
    print("idx  same  exact(cf*)/exact(cf)  exact-best/exact(cf)")
    for L in lays:
        r = L[50.0]
        pc, ps = gp.best(parts, r["cf"]), gp.best(parts, r["cfstar"])
        pe = gp.best(parts, r["exact"])
        sc = gp.score(r["exact"], pc)
        q = gp.score(r["exact"], ps) / sc
        same += pc == ps
        if pc != ps:
            diffs.append(q)
        print("%3d  %4s  %8.4f  %8.4f" % (L["idx"], pc == ps, q, gp.score(r["exact"], pe) / sc))
    print("same split in %d of 24; where different, ratios %s" % (same, ", ".join("%.4f" % x for x in diffs) or "-"))
    print("(exact-best is in-sample on the same pairs: a lower bound, biased low)")
    print()
    print("## E5: flux check (R = 50 m, both zones, cross-operator, pooled)")
    exX = sum(total(L[50.0]["exact"], z, True) for L in lays for z in ("term", "enr"))
    stX = sum(total(L[50.0]["start"], z) for L in lays for z in ("term", "enr"))
    cfX = sum(total(L[50.0]["cf"], z, True) for L in lays for z in ("term", "enr"))
    stS = sum(total(L[50.0]["start_same"], z) for L in lays for z in ("term", "enr"))
    exS = sum(total(L[50.0]["exact"], z, False) for L in lays for z in ("term", "enr"))
    cfS = sum(total(L[50.0]["cf"], z, False) for L in lays for z in ("term", "enr"))
    print("cross: exact %.3f, start %.3f, exact - start %.3f, cf %.3f, (exact - start)/cf %.4f" % (
        exX, stX, exX - stX, cfX, (exX - stX) / cfX))
    print("same-operator (reported only): exact %.3f, cf %.3f, start chords %.3f" % (exS, cfS, stS))
    print()
    print("## Prediction checks")
    print("(1) cross share of deficit %.3f >= 0.75: %s" % (sh_x, sh_x >= 0.75))
    print("(2) start/cross deficit %.3f in [0.7, 1.3]: %s" % (startX / defX, 0.7 <= startX / defX <= 1.3))
    print("(3) cf* within 2%% in %d/24 >= 22: %s; min r(cf*, exact) %.5f >= 0.998: %s" % (
        within2, within2 >= 22, rmin, rmin >= 0.998))
    a, b = dm[100.0] / dm[50.0], dm[25.0] / dm[50.0]
    print("(4) R ratios %.3f in [1.6, 2.4] and %.3f in [0.35, 0.65]: %s" % (a, b, 1.6 <= a <= 2.4 and 0.35 <= b <= 0.65))
    ok5 = same >= 20 and all(abs(x - 1) <= 0.005 for x in diffs)
    print("(5) same split %d/24 >= 20 and differing within 0.5%%: %s" % (same, ok5))
    f = (exX - stX) / cfX
    print("(6) (exact - start)/cf cross %.4f within 2%%: %s" % (f, abs(f - 1) <= 0.02))
    print()
    print("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
