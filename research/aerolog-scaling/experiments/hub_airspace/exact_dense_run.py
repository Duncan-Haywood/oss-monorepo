"""Milestone 11aa driver: experiments E1 to E7 of exact_dense.py's docstring (predictions there). Needs numpy.

Per-layout results are cached as pickles in $EXACT_CACHE (default: none) so an interrupted run resumes.

    OMP_NUM_THREADS=1 EXACT_CACHE=/tmp/x /usr/bin/python3.13 exact_dense_run.py > exact_dense_results.txt
"""
import importlib.util
import math
import multiprocessing as mp
import os
import pickle
import statistics as S
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ed = _load("hub_airspace_exact_dense_11aa", "exact_dense.py")
srr = _load("hub_airspace_split_rescore_run_11aa", "split_rescore_run.py")
sr, rl, sb, gp = srr.sr, srr.rl, srr.sb, srr.gp
LAM, R, N = srr.LAM, srr.R, srr.N
PAIRS, SEED, BATCHES = srr.PAIRS, srr.SEED, srr.BATCHES
RULES = srr.RULES
CACHE = os.environ.get("EXACT_CACHE")


def total(w, zone="enr", cross=None):
    return srr.total(w, zone, cross)


def run_layout(idx):
    path = CACHE and os.path.join(CACHE, "layout%02d.pkl" % idx)
    if path and os.path.exists(path):
        return pickle.load(open(path, "rb"))
    out = srr.run_layout(idx)                       # 11z's rule weights, cf_D+, start term, sampled cf and exact
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    smp = sb.estimate(mix, speeds, LAM, R=R, pairs=PAIRS, seed=SEED + idx, batches=BATCHES)
    out["exact_batches"] = [total(b["exact"]) for b in smp]
    stats = {}
    c0 = time.process_time()
    out["E"] = ed.exact_terms(mix, speeds, LAM, R=R, stats=stats)
    out["cpu_E"] = time.process_time() - c0
    out["stats_E"] = stats
    print("layout %d done: exact_D %.0f CPU s" % (idx, out["cpu_E"]), file=sys.stderr, flush=True)
    if path:
        pickle.dump(out, open(path, "wb"))
    return out


def pearson(x, y):
    mx, my = S.mean(x), S.mean(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    return sxy / math.sqrt(sum((a - mx) ** 2 for a in x) * sum((b - my) ** 2 for b in y))


def main():
    t0 = time.time()
    if CACHE:
        os.makedirs(CACHE, exist_ok=True)
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        lays = sorted(pool_.imap_unordered(run_layout, range(N)), key=lambda L: L["idx"])
    srr.blends(lays)
    parts = gp.bipartitions()[1:]
    P = print
    P("# Milestone 11aa: the exact estimator summed over destination pairs (exact_dense.py)")
    P("# semi, R = %.0f m, Lambda = %d/h, 11g's 24 layouts; exact_D = exact_dense.exact_terms (K = %d midpoint zone"
      % (R, LAM, ed.K_ZONE))
    P("# points); cf_D+ = fast_flux (sym_same) + start_term; sampled exact = steiner_bias.estimate, %d pairs, %d"
      " batches, seeds %d + idx" % (PAIRS, BATCHES, SEED))
    P()
    P("## E1 dense against sampled exact estimator, and E2 closed form against dense (en-route totals, all pairs)")
    P("idx   exact_D  sampled      z   all_D   cfD+  cfD+/E  cfD+/samp  even/all  odd/all  CPU_E  cand")
    zs, rE, rS, qe = [], [], [], []
    for L in lays:
        E = L["E"]["all"]
        e = total(E)
        b = L["exact_batches"]
        m = S.mean(b)
        se = S.stdev(b) / math.sqrt(len(b))
        z = (m - e) / se
        c = total(L["cfD+"])
        ev, od = total(L["E"]["even"]) / e, total(L["E"]["odd"]) / e
        zs.append(z)
        rE.append(c / e)
        rS.append(c / m)
        qe.append(max(abs(ev - 1), abs(od - 1)))
        st = L["stats_E"]
        P("%3d  %8.4f %8.4f %+6.2f %7.3f %7.4f  %.4f   %.4f    %.5f  %.5f  %5.0f  %.3f" % (
            L["idx"], e, m, z, total(E, zone=None), c, c / e, c / m, ev, od, L["cpu_E"], st["cand"] / st["pairs"]))
    pe = sum(total(L["cfD+"]) for L in lays) / sum(total(L["E"]["all"]) for L in lays)
    ps = sum(S.mean(L["exact_batches"]) for L in lays) / sum(total(L["E"]["all"]) for L in lays)
    P("E1: |z| <= 3 in %d of %d; pooled sampled/exact_D %.4f; mean z %+.2f, sd z %.2f" % (
        sum(abs(z) <= 3 for z in zs), N, ps, S.mean(zs), S.stdev(zs)))
    P("E2: pooled cfD+/exact_D %.4f; per layout %.4f to %.4f, mean %.4f, sd %.4f; within 1%% in %d, within 2%% in %d"
      % (pe, min(rE), max(rE), S.mean(rE), S.stdev(rE), sum(abs(r - 1) <= 0.01 for r in rE),
         sum(abs(r - 1) <= 0.02 for r in rE)))
    P("    (against the sampled exact estimator: sd %.4f, as 11x)" % S.stdev(rS))
    P("E5: max over layouts of the 4-point sub-rules' en-route deviation from the 8-point rule: %.5f (median %.5f)"
      % (max(qe), S.median(qe)))
    cpu = [L["cpu_E"] for L in lays]
    P("E6: exact_D CPU s per layout: mean %.0f, median %.0f, max %.0f" % (S.mean(cpu), S.median(cpu), max(cpu)))
    P()
    P("## E7 per-pair weights: cross-operator en-route weights, cfD+ against exact_D")
    rs, sm = [], []
    for L in lays:
        E, C = L["E"]["all"], L["cfD+"]
        ks = sorted(k for k in set(E) | set(C) if k[2] == "enr" and k[0] != k[1])
        x, y = [C.get(k, 0.0) for k in ks], [E.get(k, 0.0) for k in ks]
        rs.append(pearson(x, y))
        same_c = sum(v for k, v in C.items() if k[2] == "enr" and k[0] == k[1])
        same_e = sum(v for k, v in E.items() if k[2] == "enr" and k[0] == k[1])
        sm.append((same_c, same_e))
    P("r per layout: " + " ".join("%.4f" % r for r in rs))
    P("min r %.4f, median %.4f" % (min(rs), S.median(rs)))
    P("same-operator en-route, cfD+ / exact_D per layout: " + " ".join("%.3f" % (a / b if b else float("nan"))
                                                                       for a, b in sm))
    P("cross-operator en-route, cfD+ / exact_D per layout: " + " ".join(
        "%.4f" % (total(L["cfD+"], cross=True) / total(L["E"]["all"], cross=True)) for L in lays))
    P()
    P("## E3/E4 splits scored on exact_D: loss_E = score(exact_D, split) / score(exact_D, best under exact_D)")
    LE, LD, agreeE = {k: [] for k in RULES + ["cfD+"]}, {k: [] for k in RULES + ["cfD+"]}, {k: 0 for k in RULES + ["cfD+"]}
    gapsE = []
    for L in lays:
        E, D = L["E"]["all"], L["cfD+"]
        be, bd = sr.best(parts, E), sr.best(parts, D)
        gapsE.append(sr.gap(E, parts))
        for k in RULES + ["cfD+"]:
            s = sr.best(parts, L[k])
            LE[k].append(sr.loss(E, s, parts, be))
            LD[k].append(sr.loss(D, s, parts, bd))
            agreeE[k] += s == be
    P("idx " + " ".join("%7s" % k for k in RULES + ["cfD+"]) + "   gapE")
    for n in range(N):
        P("%3d " % n + " ".join("%7.4f" % LE[k][n] for k in RULES + ["cfD+"]) + "  %.4f" % gapsE[n])
    P()
    P("rule      meanE   meanD  E-D      medE    maxE   <=0.5%E <=0.5%D  =bestE")
    for k in RULES + ["cfD+"]:
        e, d = LE[k], LD[k]
        P("%-8s  %.4f  %.4f  %+.4f  %.4f  %.4f  %5d   %5d   %5d" % (
            k, S.mean(e), S.mean(d), S.mean(e) - S.mean(d), S.median(e), max(e), sum(v <= 1.005 for v in e),
            sum(v <= 1.005 for v in d), agreeE[k]))
    oe = sorted(RULES[:-2], key=lambda k: S.mean(LE[k]))
    od = sorted(RULES[:-2], key=lambda k: S.mean(LD[k]))
    P("order of the 13 rules by mean loss_E: " + " ".join(oe))
    P("order of the 13 rules by mean loss_D: " + " ".join(od))
    flips = sum(1 for i, a in enumerate(RULES[:-2]) for b in RULES[:-2][i + 1:]
                if (S.mean(LE[a]) - S.mean(LE[b])) * (S.mean(LD[a]) - S.mean(LD[b])) < 0)
    P("pairwise order flips between loss_E and loss_D among the 13 rules: %d of 78" % flips)
    P("exact_D best-vs-second gap: median %.4f, min %.4f, max %.4f, below 0.5%% in %d" % (
        S.median(gapsE), min(gapsE), max(gapsE), sum(g < 1.005 for g in gapsE)))
    P("layout 6: cf+ loss_E %.4f, loss_D %.4f" % (LE["cf+"][6], LD["cf+"][6]))
    P()
    P("# wall time %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
