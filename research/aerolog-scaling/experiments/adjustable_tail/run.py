"""Milestone 9d: how much tail-area adjustment recovers the modes if the true tail slope is 0.75 to 1.0 of NeuralFoil's?

    PY experiments/adjustable_tail/run.py > experiments/adjustable_tail/results.txt

As experiments/robust_tail (same 17 power-matched wings, 270-tail grid and mode model, imported by path), but the
tail area is a flight-adjustable multiplier f on the grid area (a sliding stabilator or a tail with a changeable
incidence-equivalent lift area). For each design that passes within 5% on all three modes at slope scale 1.0
(the 78 of tail_search) and each true slope scale s in SCALES, the smallest f in the grid F that brings the worst
mode error within 5% (and 3%) is found. Result: the range of f an adjustable tail needs, and whether a range
f in [1, 1.33] (the 1/0.75 compensation of the area-slope product) is enough.
"""
import itertools
import sys
import numpy as np
import aerosandbox as asb

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, G

def load(path):
    src = open(path).read().rsplit("\nmain()", 1)[0]
    mod = type(sys)("m")
    mod.__dict__["__name__"] = "m"
    exec(compile(src, path, "exec"), mod.__dict__)
    return mod

nm = load("experiments/nonsimilar_modes/run.py")
rt = load("experiments/robust_tail/run.py")

SCALES = (0.75, 0.8, 0.9, 1.0)
F = np.round(np.arange(0.6, 1.801, 0.05), 2)
TOL = 5.0


def errs(af, k, ar, cl, wing, tail, sec, frac, art, arm, ref, sc, f):
    r = rt.modes_tail(af, k, ar, nm.N, cl, wing, (tail[0] * sc, tail[1]), sec, frac * f, art, arm)
    if r is None:
        return None
    return max(abs(100 * (r[0] / ref[0] - 1)), abs(100 * (r[1] / ref[1] - 1)), abs(100 * (r[2] / ref[2] - 1)))


def main():
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (nm.cd_at(ref_af, full["re"], nm.CL0) + nm.CL0 ** 2 / (np.pi * nm.E * nm.AR0)) / nm.CL0
    r0 = nm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0)
    ref = (r0["ph"], r0["sp"], r0["z"])
    cases = []
    for name in ("naca4412", "naca5406"):
        af = asb.Airfoil(name)
        for k in nm.KS:
            for ar in nm.ARS:
                s = k * s_sim
                re = nm.RHO * v_model * (s / np.sqrt(ar * s)) / nm.MU
                cl = nm.CL0 / k
                cd = nm.cd_at(af, re, cl)
                if np.isnan(cd):
                    continue
                pr = ((cd + cl ** 2 / (np.pi * nm.E * ar)) / cl) / ref_pw
                if abs(pr - 1) <= 0.05:
                    cases.append((name, af, k, ar, cl))
    print(f"{len(cases)} power-matched wings; area multiplier grid {F[0]}..{F[-1]} step 0.05; tolerance {TOL}% on all three modes\n")
    rows = []  # (design label, f_needed per scale or None)
    for name, af, k, ar, cl in cases:
        s_w = k * s_sim
        c = s_w / np.sqrt(ar * s_w)
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        re_w = nm.RHO * v * c / nm.MU
        wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))
        for sec, frac, art in itertools.product(rt.SECTIONS, rt.AREAS, rt.TAR):
            taf = asb.Airfoil(sec)
            b_t = np.sqrt(art * frac * s_sim)
            re_t = nm.RHO * v * (b_t / art) / nm.MU
            tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))
            if np.isnan(tail[1]):
                continue
            for arm in rt.ARMS:
                e1 = errs(af, k, ar, cl, wing, tail, sec, frac, art, arm, ref, 1.0, 1.0)
                if e1 is None or e1 > TOL:
                    continue
                need = []
                for sc in SCALES:
                    ok = [f for f in F if (e := errs(af, k, ar, cl, wing, tail, sec, frac, art, arm, ref, sc, f)) is not None and e <= TOL]
                    # smallest f in the contiguous passing band that contains the compensation 1/sc, else None
                    need.append((min(ok), max(ok)) if ok else None)
                rows.append(((name, k, ar, sec, frac, art, arm), need))
    n = len(rows)
    print(f"{n} designs within {TOL}% at slope scale 1.0 (tail_search count: 78)\n")
    print("true slope scale | designs recoverable by some f in grid | median f_min | median f_max | recoverable with f <= 1.33")
    for i, sc in enumerate(SCALES):
        ok = [r[1][i] for r in rows if r[1][i] is not None]
        lo = [a for a, b in ok]
        hi = [b for a, b in ok]
        c133 = sum(1 for a, b in ok if a <= 1.33)
        print(f"{sc:>15} | {len(ok):>4} of {n} | {np.median(lo) if lo else float('nan'):.2f} | {np.median(hi) if hi else float('nan'):.2f} | {c133} of {n}")
    # one adjustable range covering all four scales: need f_set(s) per scale, single design must be recoverable at every scale
    allok = [r for r in rows if all(x is not None for x in r[1])]
    print(f"\ndesigns recoverable at every scale in {SCALES}: {len(allok)} of {n}")
    if allok:
        best = min(allok, key=lambda r: max(x[0] for x in r[1]) - 1.0)
        print("tightest-range design (wing, k, AR, tail section, area, AR_t, arm):", best[0])
        for sc, x in zip(SCALES, best[1]):
            print(f"  scale {sc}: f in [{x[0]:.2f}, {x[1]:.2f}]")
        fmax = [max(x[0] for x in r[1]) for r in allok]
        print(f"area multiplier needed at scale 0.75 (f_min), over those designs: min {min(r[1][0][0] for r in allok):.2f}, median {np.median([r[1][0][0] for r in allok]):.2f}, max {max(r[1][0][0] for r in allok):.2f}; compensation 1/0.75 = 1.33")
    print("\nper design f_min at 0.75 vs 1/0.75, distribution:")
    f75 = [r[1][0][0] for r in rows if r[1][0] is not None]
    if f75:
        print(f"  f_min at 0.75: min {min(f75):.2f}, 25% {np.percentile(f75,25):.2f}, median {np.median(f75):.2f}, 75% {np.percentile(f75,75):.2f}, max {max(f75):.2f}")


main()
