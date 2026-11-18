"""Milestone 11t driver: experiments E1 to E6 of start_term.py's docstring (predictions there)."""
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


st = _load("hub_airspace_start_term_11t", "start_term.py")
rl = _load("hub_airspace_random_layouts_11t", "random_layouts.py")
sb, gp = st.sb, st.gp
M, LAM = rl.M, rl.LAM
CROSS = [(i, j) for i in range(M) for j in range(i + 1, M)]
PAIRS, SEED, BATCHES = 400000, 110000, 10
RADII = (25.0, 50.0, 100.0)


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


def run_layout(idx):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    out = {"idx": idx}
    for R in RADII:
        c0 = time.process_time()
        out[R] = st.start_terms(mix, speeds, LAM, R=R)
        out[("cpu", R)] = time.process_time() - c0
    c0 = time.process_time()
    out["smp"] = sb.estimate(mix, speeds, LAM, R=50.0, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["cpu_smp"] = time.process_time() - c0
    return out


def sd(x):
    return S.stdev(x) if len(x) > 1 else float("nan")


def main():
    t0 = time.time()
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        lays = pool_.map(run_layout, range(24))
    print("# Milestone 11t: the start term computed exactly from destination lists (start_term.py)")
    print("# conflicts per hour, semi base rule, Lambda = %d/h; sampled estimators: %d ordered pairs in %d batches" % (
        LAM, PAIRS, BATCHES))
    print()
    print("## E1 (R = 50 m): analytic against sampled cross-operator en-route start term")
    print("idx  analytic  sampled   se     z")
    an_tot = sm_tot = 0.0
    zok = 0
    for L in lays:
        a = total(L[50.0]["start"])
        b = [total(r["start"]) for r in L["smp"]]
        m, se = S.mean(b), sd(b) / math.sqrt(len(b))
        z = (a - m) / se
        zok += abs(z) <= 3
        an_tot, sm_tot = an_tot + a, sm_tot + m
        print("%3d  %7.4f  %7.4f  %6.4f  %5.2f" % (L["idx"], a, m, se, z))
    print("pooled analytic/sampled %.4f; |z| <= 3 in %d of 24" % (an_tot / sm_tot, zok))
    print()
    print("## E2 (R = 50 m): where start episodes begin (cross-operator, both zones, pooled)")
    hub = sum(L[50.0]["hub"] for L in lays)
    dl = sum(L[50.0]["deliv"] for L in lays)
    co = sum(L[50.0]["coinc"] for L in lays)
    print("hub launches %.3f/h, delivery turnarounds %.3f/h (share %.3f); coincident-point part %.3f/h = %.4f of "
          "delivery" % (hub, dl, dl / (hub + dl), co, co / dl))
    print()
    print("## E3 (R = 50 m): cf+ = cf + analytic start against the exact estimator, en-route totals")
    print("idx   exact    cf/ex   cf*/ex  cf+/ex   sd(cf*/ex)  sd(cf+/ex)  ratio")
    w2 = 0
    rat, cpr = [], []
    for L in lays:
        b = L["smp"]
        S_an = L[50.0]["start"]
        ex = [total(r["exact"]) for r in b]
        cs = [total(r["cfstar"]) / e for r, e in zip(b, ex)]
        cp = [(total(r["cf"]) + total(S_an)) / e for r, e in zip(b, ex)]
        e, c = S.mean(ex), S.mean(total(r["cf"]) for r in b)
        q = (c + total(S_an)) / e
        w2 += abs(q - 1) <= 0.02
        cpr.append(q)
        rat.append(sd(cp) / sd(cs))
        print("%3d  %7.3f  %6.4f  %6.4f  %6.4f  %9.5f  %9.5f  %6.3f" % (
            L["idx"], e, c / e, S.mean(total(r["cfstar"]) for r in b) / e, q, sd(cs), sd(cp), rat[-1]))
    print("cf+/exact mean %.4f (min %.4f, max %.4f); within 2%% in %d of 24; median sd ratio %.3f (min %.3f, max %.3f)" % (
        S.mean(cpr), min(cpr), max(cpr), w2, S.median(rat), min(rat), max(rat)))
    print()
    print("## E4: the analytic start term against R (cross-operator, both zones, pooled)")
    tot = {R: sum(total(L[R]["start"], zone=None) for L in lays) for R in RADII}
    for R in RADII:
        co_ = sum(L[R]["coinc"] for L in lays)
        print("R = %5.1f m: start %.3f/h, ratio to R = 50 m %.4f, coincident part %.4f/h" % (R, tot[R], tot[R] / tot[50.0], co_))
    r100, r25 = tot[100.0] / tot[50.0], tot[25.0] / tot[50.0]
    print()
    print("## E5 (R = 50 m): best two-layer split under cf+ and cf*, scored on the exact weights")
    parts = gp.bipartitions()[1:]
    same = 0
    diffs = []
    print("idx  same  exact(cf+)/exact(cf*)")
    for L in lays:
        b = L["smp"]
        ex, cf, cs = pool(b, "exact"), pool(b, "cf"), pool(b, "cfstar")
        cp = add(cf, L[50.0]["start"])
        ps, pp = gp.best(parts, cs), gp.best(parts, cp)
        q = gp.score(ex, pp) / gp.score(ex, ps)
        same += ps == pp
        if ps != pp:
            diffs.append(q)
        print("%3d  %4s  %8.4f" % (L["idx"], ps == pp, q))
    print("same split in %d of 24; where different, ratios %s" % (same, ", ".join("%.4f" % x for x in diffs) or "-"))
    print()
    print("## E6: CPU seconds per layout")
    for R in RADII:
        c = [L[("cpu", R)] for L in lays]
        print("analytic start, R = %5.1f m: mean %.2f s (max %.2f)" % (R, S.mean(c), max(c)))
    print("sampled estimate (exact + cf + start, 400,000 pairs, R = 50 m): mean %.2f s" % S.mean(L["cpu_smp"] for L in lays))
    print()
    print("## Prediction checks")
    p = an_tot / sm_tot
    print("(1) pooled analytic/sampled %.4f within 1%% and |z| <= 3 in %d/24 >= 23: %s" % (p, zok, abs(p - 1) <= 0.01 and zok >= 23))
    print("(2) delivery share %.3f >= 0.6: %s; coincident/delivery %.4f < 0.1: %s" % (
        dl / (hub + dl), dl / (hub + dl) >= 0.6, co / dl, co / dl < 0.1))
    print("(3) cf+ within 2%% in %d/24 >= 22: %s" % (w2, w2 >= 22))
    print("(4) median sd ratio %.3f in [0.85, 1.0]: %s" % (S.median(rat), 0.85 <= S.median(rat) <= 1.0))
    print("(5) start(100)/start(50) %.3f in [3.4, 4.2] and start(25)/start(50) %.3f in [0.22, 0.28]: %s" % (
        r100, r25, 3.4 <= r100 <= 4.2 and 0.22 <= r25 <= 0.28))
    print("(6) same split %d/24 >= 23: %s" % (same, same >= 23))
    print()
    print("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
