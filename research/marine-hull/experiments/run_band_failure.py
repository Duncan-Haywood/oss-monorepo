"""Milestone 6zzzd: why does no rule beat B at the eight band points (50 to 60 degrees) when they are pooled?

Why: 6zzzc's "Next" item. On hi8 (the nine high-amplitude points without P-30, pooled km and dark hours) no rule,
not even the uncorrected AT_90, dominates B in a single one of the 168 cells at k = 3 in the nasa and reverse worlds,
while in the cross world AP wins 36 and AK 47. A "dominates B" cell needs km >= B's km AND excess dark hours <= B's.
This milestone asks which half of that test fails, by how much, and whether it fails point by point or only once the
eight points are summed.

No new rule. Scored exactly as 6zzzc (`run_clamp_exponent.score`, same worlds, years, packs, 21 shapes, halves, B),
restricted to k = 3 (AP, AK, A1, C15 on each of the 10 three-season sets) plus AT_90. New counts, all on the eight
band points, per (shape, half, pack) cell:
  modes      pooled over the eight points: won, km-short only, dark-over only, both (each over 168 cells).
  B zero     cells where B's pooled excess dark is exactly 0 h (no rule can then tie without also being 0).
  margins    medians over the 168 cells of km/B and of (excess dark - B's) in hours.
  tolerance  pooled wins if the dark test is relaxed by 24, 120 or 480 h per pool (8 points x 5 years), or the km test
             by 1% or 2%.
  per point  each band point on its own five-year totals: won, km-only, dark-only, both (of 8 x 168 point-cells),
             and B zero per point.
Checks: hi8 at k = 3 reproduces 6zzzc in all three worlds (nasa and reverse 0 for every rule; cross AP 36.2 [22, 49],
AK 47.0 [21, 71], A1 45.1 [21, 70], C15 7.9 [3, 15]); AT_90 hi8 0 in all three worlds.

Predictions (priors in brackets), written before any run:
  P1 nasa k = 3: for each of AP, AK, A1 and C15, dark-over-only failures outnumber km-short-only on hi8. [65%]
  P2 nasa: B's pooled excess dark is exactly 0 in at least 42 (a quarter) of the 168 hi8 cells. [40%]
  P3 nasa: with 24 h of dark tolerance per pool, AP k = 3 wins at least 84 hi8 cells on mean. [45%]
  P4 nasa: AP k = 3's median km/B over the hi8 cells is at least 1.000 (the rules go further and pay in dark). [60%]
  P5 nasa: per point, AP k = 3 wins at least half the point-cells at one or more of the eight band points. [70%]
  P6 cross: dark-over-only failures also outnumber km-short-only for AP k = 3 on hi8. [55%]

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_band_failure.py > experiments/results_band_failure.txt
(stdlib, deterministic; each world in its own subprocess with up to 4 worker processes; about 9 minutes on 4 cores)
Post hoc, added after that run: PYTHONPATH=src python3 experiments/run_band_failure.py --posthoc >> experiments/results_band_failure.txt
"""
import json
import os
import statistics as st
import subprocess
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_clamp_exponent as ce  # noqa: E402

K = 3
TAGS = ("AP", "AK", "A1", "C15")
SETS = ce.SETS[K]
WORLDS = ce.WORLDS
BASE = ce.BASE
DARK_TOL = (24.0, 120.0, 480.0)
KM_TOL = (0.01, 0.02)
REF_CROSS = {"AP": (36.2, 22, 49), "AK": (47.0, 21, 71), "A1": (45.1, 21, 70), "C15": (7.9, 3, 15)}


def rules():
    return ("AT_90",) + tuple(ce.rname(t, s) for t in TAGS for s in SETS)


def cell_totals(cells, points):
    """{(shape, half, pack): {point: {rule: [km, ex]}}} on each point's own five-year totals."""
    out = {}
    for sh in ce.SHAPES:
        for hn, yrs in ce.ss.HALVES.items():
            for c in ce.PACKS:
                out[(sh, hn, c)] = {p: {g: v[:2] for g, v in ce.sb.total(cells, [(c, p, yr) + sh for yr in yrs]).items()}
                                    for p in points}
    return out


def mode(t, g, km_tol=0.0, dark_tol=0.0):
    """'won', 'km', 'dark' or 'both' for rule g against B in totals t."""
    fk = t[g][0] < t[BASE][0] * (1.0 - km_tol)
    fd = t[g][1] > t[BASE][1] + dark_tol
    return "both" if fk and fd else "km" if fk else "dark" if fd else "won"


def pool(per_point):
    t = {}
    for v in per_point.values():
        for g, (km, ex) in v.items():
            x = t.setdefault(g, [0.0, 0.0])
            x[0] += km
            x[1] += ex
    return t


def analyse(tot, band, rs):
    """Every count of the docstring for one world."""
    M = ("won", "km", "dark", "both")
    res = {"modes": {g: dict.fromkeys(M, 0) for g in rs},
           "tol": {g: {f"d{d:g}": 0 for d in DARK_TOL} | {f"k{k:g}": 0 for k in KM_TOL} for g in rs},
           "pp": {g: {p: dict.fromkeys(M, 0) for p in band} for g in rs},
           "bzero": 0, "bzero_pp": dict.fromkeys(band, 0)}
    kmr, dex, bex, bkm = {g: [] for g in rs}, {g: [] for g in rs}, [], []
    for cell, pts in tot.items():
        t = pool({p: pts[p] for p in band})
        res["bzero"] += t[BASE][1] == 0
        bex.append(t[BASE][1])
        bkm.append(t[BASE][0])
        for p in band:
            res["bzero_pp"][p] += pts[p][BASE][1] == 0
        for g in rs:
            res["modes"][g][mode(t, g)] += 1
            for d in DARK_TOL:
                res["tol"][g][f"d{d:g}"] += mode(t, g, dark_tol=d) == "won"
            for k in KM_TOL:
                res["tol"][g][f"k{k:g}"] += mode(t, g, km_tol=k) == "won"
            if t[BASE][0] > 0:
                kmr[g].append(t[g][0] / t[BASE][0])
            dex[g].append(t[g][1] - t[BASE][1])
            for p in band:
                res["pp"][g][p][mode(pts[p], g)] += 1
    res["kmr"] = {g: st.median(v) for g, v in kmr.items()}
    res["dex"] = {g: st.median(v) for g, v in dex.items()}
    res["bex"] = (st.median(bex), min(bex), max(bex))
    res["bkm"] = st.median(bkm)
    return res


def only_k3():
    """corrections() reads ce.KS: build only the k = 3 rules (set in the world subprocess, inherited by its workers)."""
    ce.KS = (K,)


def run_world(world, procs=4):
    only_k3()
    hi = ce.ls.high_amp_points()
    band = tuple(p for p in hi if ce.ka.in_band(p))
    pts = hi
    if world == "cross":
        ce.lv.check_swap(world, pts, ce.cs.use_cross(pts))
    elif world == "reverse":
        ce.lv.check_swap(world, pts, ce.lv.use_reverse(pts))
    elif world != "nasa":
        raise ValueError(world)
    ce.fy.prepare()
    keys = [(world, c, p, yr) + sh for p in pts for yr in ce.YEARS for c in ce.PACKS for sh in ce.SHAPES]
    with Pool(procs) as pool_:
        cells = dict(pool_.map(ce.score, keys, chunksize=8))
    rs = rules()
    tot = cell_totals(cells, pts)
    out = analyse(tot, band, rs)
    # P-30 alone, for contrast: modes on its own totals
    p30 = [p for p in hi if p not in band]
    out["p30"] = {g: dict.fromkeys(("won", "km", "dark", "both"), 0) for g in rs}
    out["p30_bzero"] = 0
    for cell, ptsd in tot.items():
        for p in p30:
            out["p30_bzero"] += ptsd[p][BASE][1] == 0
            for g in rs:
                out["p30"][g][mode(ptsd[p], g)] += 1
    out["band"] = band
    return out


def over_sets(d, tag, f):
    xs = [f(d[ce.rname(tag, s)]) for s in SETS]
    return st.mean(xs), min(xs), max(xs)


def fm(x):
    return "{:6.1f} [{:g}, {:g}]".format(*x) if not isinstance(x[1], float) or x[1].is_integer() else \
        "{:7.3f} [{:.3f}, {:.3f}]".format(*x)


def posthoc(procs=4):
    """Post hoc (added after the run above): per band point, five-year km and excess dark of B, AT_90 and AP k = 3
    (mean over the 10 sets) on the real shape, nasa world, summed over both halves and the four packs."""
    only_k3()
    hi = ce.ls.high_amp_points()
    ce.fy.prepare()
    keys = [("nasa", c, p, yr) + ce.ls.REAL for p in hi for yr in ce.YEARS for c in ce.PACKS]
    with Pool(procs) as pool_:
        cells = dict(pool_.map(ce.score, keys, chunksize=4))
    print("Post hoc, nasa world, real shape, ten years x four packs per point: km and excess dark (h)")
    print("  point            lat  |  B km  B dark | AT_90 km  dark | AP k=3 km  dark | km share of B's hi8 total")
    rows = {}
    for p in hi:
        t = ce.sb.total(cells, [(c, p, yr) + ce.ls.REAL for yr in ce.YEARS for c in ce.PACKS])
        ap = [t[ce.rname("AP", s)] for s in SETS]
        rows[p] = (t[BASE][0], t[BASE][1], t["AT_90"][0], t["AT_90"][1], st.mean(x[0] for x in ap),
                   st.mean(x[1] for x in ap))
    band_km = sum(rows[p][0] for p in hi if ce.ka.in_band(p))
    for p, r in rows.items():
        share = f"{r[0] / band_km:5.2f}" if ce.ka.in_band(p) else "  -  "
        print(f"  {p:15s} {ce.yp.lat_of(p):+4.0f} | {r[0]:7.0f} {r[1]:6.0f} | {r[2]:7.0f} {r[3]:6.0f} | "
              f"{r[4]:8.0f} {r[5]:6.0f} | {share}")


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--posthoc":
        posthoc()
        return
    if len(sys.argv) == 3 and sys.argv[1] == "--world":
        json.dump(run_world(sys.argv[2]), sys.stdout)
        return
    env = dict(os.environ, PYTHONPATH=os.path.join(HERE, "..", "src"))
    R = {w: json.loads(subprocess.run([sys.executable, __file__, "--world", w], env=env, check=True,
                                      capture_output=True, text=True).stdout) for w in WORLDS}
    band = R["nasa"]["band"]
    print("Milestone 6zzzd: why no rule beats B at the eight band points pooled (hi8); k = 3 sets, AT_90 for "
          "reference; 2005 to 2014 scored, 2015 to 2024 climatology (50 W)")
    print(f"band points: {', '.join(band)}; 168 cells = 21 shapes x 2 halves x 4 packs")

    print("\nChecks:")
    ok_all = True
    for w in WORLDS:
        m = R[w]["modes"]
        got = m["AT_90"]["won"]
        ok = got == 0
        ok_all &= ok
        print(f"  {w} AT_90 hi8 {got} (6zzzc 0)" + ("  ok" if ok else "  MISMATCH"))
        for t in TAGS:
            got = over_sets(m, t, lambda x: x["won"])
            want = REF_CROSS[t] if w == "cross" else (0.0, 0, 0)
            ok = abs(got[0] - want[0]) < 0.05 and got[1:] == want[1:]
            ok_all &= ok
            print(f"  {w} {t} hi8 {fm(got)} (6zzzc {want})" + ("  ok" if ok else "  MISMATCH"))
    print("  all checks " + ("passed" if ok_all else "DID NOT PASS"))

    for w in WORLDS:
        r = R[w]
        print(f"\n== {w} world ==")
        print(f"B on hi8: excess dark exactly 0 in {r['bzero']} of 168 cells; median excess dark {r['bex'][0]:.1f} h "
              f"[{r['bex'][1]:.1f}, {r['bex'][2]:.1f}]; median km {r['bkm']:.0f}")
        print("B excess dark exactly 0, per point (of 168): " + ", ".join(f"{p} {r['bzero_pp'][p]}" for p in band) +
              f"; P-30 {r['p30_bzero']}")
        print("Pooled hi8 modes, mean [min, max] over the 10 sets (AT_90 one value): won / km-short only / dark-over only "
              "/ both")
        m = r["modes"]
        print("  AT_90: " + " / ".join(str(m["AT_90"][x]) for x in ("won", "km", "dark", "both")))
        for t in TAGS:
            print(f"  {t:5s}: " + " / ".join(fm(over_sets(m, t, lambda v, x=x: v[x])) for x in ("won", "km", "dark",
                                                                                                "both")))
        print("Median over the 168 cells of km/B and of excess dark minus B's (h), mean [min, max] over the sets")
        print(f"  AT_90: km/B {r['kmr']['AT_90']:.4f}; dark {r['dex']['AT_90']:+.1f} h")
        for t in TAGS:
            print(f"  {t:5s}: km/B {fm(over_sets(r['kmr'], t, lambda v: v))}; dark "
                  f"{fm(over_sets(r['dex'], t, lambda v: v))} h")
        print("Pooled wins with a relaxed test (dark + 24 / 120 / 480 h per pool; km - 1% / 2%)")
        keys = [f"d{d:g}" for d in DARK_TOL] + [f"k{k:g}" for k in KM_TOL]
        print("  AT_90: " + " / ".join(str(r["tol"]["AT_90"][x]) for x in keys))
        for t in TAGS:
            print(f"  {t:5s}: " + " / ".join(fm(over_sets(r["tol"], t, lambda v, x=x: v[x])) for x in keys))
        print("Per point (each band point on its own totals, 168 cells each): won / km / dark / both, mean over sets")
        for t in ("AT_90",) + TAGS:
            for p in band:
                if t == "AT_90":
                    v = r["pp"]["AT_90"][p]
                    s = " / ".join(f"{v[x]:5.1f}" for x in ("won", "km", "dark", "both"))
                else:
                    s = " / ".join(f"{over_sets(r['pp'], t, lambda d, x=x, p=p: d[p][x])[0]:5.1f}"
                                   for x in ("won", "km", "dark", "both"))
                print(f"  {t:5s} {p:15s}: {s}")
        print("P-30 on its own totals, won / km / dark / both: AT_90 " +
              " / ".join(str(r["p30"]["AT_90"][x]) for x in ("won", "km", "dark", "both")) + "; " +
              "; ".join(f"{t} " + " / ".join(f"{over_sets(r['p30'], t, lambda d, x=x: d[x])[0]:.1f}"
                                             for x in ("won", "km", "dark", "both")) for t in TAGS))

    v = lambda b: "held" if b else "refuted"  # noqa: E731
    n = R["nasa"]
    print("\nPredictions")
    dk = {t: (over_sets(n["modes"], t, lambda x: x["dark"])[0], over_sets(n["modes"], t, lambda x: x["km"])[0])
          for t in TAGS}
    print(f"P1 nasa dark-only > km-only for AP, AK, A1, C15: {v(all(a > b for a, b in dk.values()))} (" +
          ", ".join(f"{t} {a:.1f} vs {b:.1f}" for t, (a, b) in dk.items()) + ")")
    print(f"P2 nasa B excess dark 0 in >= 42 cells: {v(n['bzero'] >= 42)} ({n['bzero']})")
    x = over_sets(n["tol"], "AP", lambda d: d["d24"])[0]
    print(f"P3 nasa AP wins >= 84 with 24 h dark tolerance: {v(x >= 84)} ({x:.1f})")
    x = over_sets(n["kmr"], "AP", lambda d: d)[0]
    print(f"P4 nasa AP median km/B >= 1.000: {v(x >= 1.0)} ({x:.4f})")
    best = max((over_sets(n["pp"], "AP", lambda d, p=p: d[p]["won"])[0], p) for p in band)
    print(f"P5 nasa AP per point wins >= 84 of 168 at some band point: {v(best[0] >= 84)} (best {best[1]} {best[0]:.1f})")
    c = R["cross"]["modes"]
    a, b = over_sets(c, "AP", lambda x: x["dark"])[0], over_sets(c, "AP", lambda x: x["km"])[0]
    print(f"P6 cross AP dark-only > km-only: {v(a > b)} ({a:.1f} vs {b:.1f})")


if __name__ == "__main__":
    main()
