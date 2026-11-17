"""Milestone 5zh: how many earlier 100-cycle DFN runs does 5zg's per-set plating exponent need? 5zg calibrated kappa
once per parameter set as the median oracle kappa* over 160 earlier hundred-cycle runs of that set, and that removed
the ten-cycle forecast's bias on all four fresh pools. A design search that must pay for 160 long runs before it can
trust its short ones has saved little, so this milestone asks what a budget of k earlier runs buys.

    WORKERS=4 python experiments/fewruns/run.py rows    # kappa* and the error grid of all 768 committed designs (stdlib)
    python experiments/fewruns/run.py report            # resampling, H177 to H181 -> results.txt, summary.json

Every number comes from committed DFN runs (5zb to 5zg: 24 pools of 32 designs, six pools per set); no new simulation.
Each pool is the test pool in turn; its set's other five pools (160 designs) are the earlier runs a search has to hand.
Two ways of spending a budget of k runs, each resampled R times with a fixed seed:
    A (scattered): k designs drawn without replacement from all 160 earlier designs of the set;
    B (one campaign): one of the five earlier pools drawn at random (one current), then k of its 32 designs.
kappa = the median oracle kappa* of the k designs (5zg's 'med'); the test pool's score is its median
|ln(L_pred(99)/L_DFN(99))| at that kappa, read by linear interpolation of each design's error on 5zg's 0.25 /V grid
(checked against the exact forecast at k = 160). Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
import os
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


SK = _mod("setkappa_run", EXP / "setkappa" / "run.py")
KP, B, AS = SK.KP, SK.B, SK.AS
GRID, GSTEP, KAPPA, KMAX = SK.GRID, SK.GSTEP, SK.KAPPA, SK.KMAX
WORKERS = int(os.environ.get("WORKERS", "3"))

SEED = 5     # resampling seed, fixed in the plan
R = 500      # resamples per (pool, protocol, k)
KS_A = (1, 2, 3, 5, 10, 20, 32, 40, 80, 160)
KS_B = (1, 2, 3, 5, 10, 20, 32)
LGSETS = ("Chen2020", "OKane2022")


# ---------- pure helpers (stdlib; tested) ----------

def interp(egrid, x, step=GSTEP):
    """A design's |ln err| at kappa x, linear between the two grid points around it (None if either is None)."""
    x = max(0.0, min(step * (len(egrid) - 1), x))
    i = min(int(x / step), len(egrid) - 2)
    a, b = egrid[i], egrid[i + 1]
    if a is None or b is None:
        return None
    w = x / step - i
    return a + w * (b - a)


def pool_err(test, kappa):
    v = [e for e in (interp(r["egrid"], kappa) for r in test) if e is not None]
    return statistics.median(v) if v else None


def quantile(xs, p):
    """Lower empirical quantile (index floor(p * (n - 1)) of the sorted list)."""
    s = sorted(xs)
    return s[int(p * (len(s) - 1))]


def draw_a(rng, train, k):
    return rng.sample(train, k)


def draw_b(rng, train, k):
    pools = sorted({r["pool"] for r in train})
    p = rng.choice(pools)
    return rng.sample([r for r in train if r["pool"] == p], k)


def resample(test, train, k, draw, rng, r=R):
    """Pool errors of R calibrations from k earlier runs each."""
    out = []
    for _ in range(r):
        ks = statistics.median(x["k_star"] for x in draw(rng, train, k))
        out.append(pool_err(test, ks))
    return out


def smallest_k(per_pool, ks, slack=0.01):
    """The smallest k at which every pool's 90th-percentile error is at most its k = 160 error + slack."""
    for k in ks:
        if all(d["A"][str(k)]["q90"] <= d["full"] + slack for d in per_pool.values()):
            return k
    return None


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "inconclusive")


def verdicts(P):
    lg = [d for d in P.values() if d["set"] in LGSETS]
    allp = list(P.values())
    a10 = lambda d: d["A"]["10"]
    b10 = lambda d: d["B"]["10"]
    n177 = sum(a10(d)["q90"] < d["phys"] for d in lg)
    gap = [a10(d)["med"] - d["full"] for d in allp]
    n179 = sum(d["A"]["1"]["q90"] > d["phys"] for d in allp)
    n180 = sum(abs(b10(d)["med"] - a10(d)["med"]) <= 0.01 for d in allp)
    kmin = smallest_k(P, KS_A)
    return dict(
        H177=verdict(n177 == len(lg), n177 < 9),
        H178=verdict(all(g <= 0.01 for g in gap), any(g > 0.02 for g in gap)),
        H179=verdict(n179 >= 6, n179 < 3),
        H180=verdict(n180 >= 20, n180 < 16),
        H181=verdict(kmin is not None and kmin <= 20, kmin is None or kmin > 40),
        counts=dict(n177=n177, max_gap178=max(gap), n179=n179, n180=n180, kmin181=kmin))


# ---------- rows ----------

def _items():
    yield from SK._seen()
    last = {}
    for f in B._load(EXP / "setkappa" / "bench.jsonl"):
        last[(f["cond"], f["j"])] = f
    for _, f in sorted(last.items()):
        if AS._full(f) and len(f.get("q_ch", [])) >= SK.K:
            yield "setkappa", f, f


def rows():
    full = SK._rows(list(_items()))
    for r in full:   # the exact forecast error at the k = 160 calibration, to check the grid interpolation
        k160 = statistics.median(x["k_star"] for x in full if x["set"] == r["set"] and x["pool"] != r["pool"])
        r["e_full"] = SK.err_at(r, k160)
    out = [SK._strip(r) | {"egrid": r["egrid"], "l_true": r["l_true"]} for r in full]
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs,", len({r["pool"] for r in out}), "pools")


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    rng = random.Random(SEED)
    P = {}
    for p in sorted({r["pool"] for r in rs}):
        test = [r for r in rs if r["pool"] == p]
        st = test[0]["set"]
        train = [r for r in rs if r["set"] == st and r["pool"] != p]
        k160 = statistics.median(r["k_star"] for r in train)
        ex = [r["e_full"] for r in test if r["e_full"] is not None]
        d = dict(set=st, n=len(test), ntrain=len(train), k160=k160, phys=pool_err(test, KAPPA),
                 full=pool_err(test, k160), full_exact=statistics.median(ex), A={}, B={})
        for name, draw, ks in (("A", draw_a, KS_A), ("B", draw_b, KS_B)):
            for k in ks:
                e = [x for x in resample(test, train, k, draw, rng) if x is not None]
                d[name][str(k)] = dict(med=statistics.median(e), q90=quantile(e, 0.9),
                                       beat_phys=sum(x < d["phys"] for x in e) / len(e))
        P[p] = d
    V = verdicts(P)
    L = ["cell-fidelity milestone 5zh: how many earlier 100-cycle DFN runs does the per-set plating exponent need?",
         "24 committed pools (5zb to 5zg, 32 designs each, six per set); each pool's kappa = median oracle kappa* of k",
         "designs from its set's other five pools (160 designs). A = k scattered over those pools; B = k from one pool.",
         f"{R} resamples per cell, seed {SEED}. Cell = median [90th percentile] over resamples of the pool's median",
         "|ln(L_pred(99)/L_DFN(99))|. phys = kappa 25.3; k=160 = all earlier runs (5zg's med).", ""]
    hdr = f"{'pool':34s}{'phys':>7s}{'k=160':>7s}" + "".join(f"{'A' + str(k):>14s}" for k in (1, 3, 10, 32)) \
        + "".join(f"{'B' + str(k):>14s}" for k in (3, 10))
    L.append(hdr)
    cell = lambda c: f"{c['med']:7.3f}[{c['q90']:.3f}]".rjust(14)
    for p, d in P.items():
        L.append(f"{p:34s}{d['phys']:7.3f}{d['full']:7.3f}" + "".join(cell(d["A"][str(k)]) for k in (1, 3, 10, 32))
                 + "".join(cell(d["B"][str(k)]) for k in (3, 10)))
    gap = max(abs(d["full"] - d["full_exact"]) for d in P.values())
    L += ["", f"Interpolation check: largest |grid - exact| pool error at k=160 is {gap:.4f}."]
    L += ["", "Budget curve (A): pools whose 90th percentile beats phys, and worst pool's median and 90th percentile:"]
    for k in KS_A:
        c = [d["A"][str(k)] for d in P.values()]
        L.append(f"  k {k:3d}: q90 < phys on {sum(x['q90'] < d['phys'] for x, d in zip(c, P.values())):2d}/24; "
                 f"worst med {max(x['med'] for x in c):.3f}, worst q90 {max(x['q90'] for x in c):.3f}")
    L += ["", "Budget curve (B, one earlier campaign):"]
    for k in KS_B:
        c = [d["B"][str(k)] for d in P.values()]
        L.append(f"  k {k:3d}: q90 < phys on {sum(x['q90'] < d['phys'] for x, d in zip(c, P.values())):2d}/24; "
                 f"worst med {max(x['med'] for x in c):.3f}, worst q90 {max(x['q90'] for x in c):.3f}")
    cn = V["counts"]
    L += ["", f"H177 (A, k=10: q90 below phys on all 12 LG M50 pools): {V['H177']} ({cn['n177']}/12)",
          f"H178 (A, k=10: median within 0.01 of k=160 on all 24 pools): {V['H178']} (largest gap {cn['max_gap178']:+.3f})",
          f"H179 (A, k=1: q90 above phys on at least 6 of 24 pools): {V['H179']} ({cn['n179']}/24)",
          f"H180 (B, k=10 median within 0.01 of A, k=10 on at least 20 of 24): {V['H180']} ({cn['n180']}/24)",
          f"H181 (smallest k with every q90 <= k=160 + 0.01 is at most 20): {V['H181']} (k = {cn['kmin181']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(pools=P, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
