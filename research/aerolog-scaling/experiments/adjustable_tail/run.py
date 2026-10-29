"""Milestone 9d: how much tail-area adjustment recovers the modes if the true tail slope is 0.75 to 1.0 of NeuralFoil's?

    PY experiments/adjustable_tail/run.py > experiments/adjustable_tail/results.txt

Wings, tail grid and mode model as experiments/robust_tail (imported by path). The designs are the ones within 5% on all
three modes at slope scale 1.0; each is re-evaluated at slope scales SCALES with the tail area multiplied by m in MS
(same section, aspect ratio and arm, so tail drag and downwash move with it).
"""
import itertools
import sys
import numpy as np
import aerosandbox as asb

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, G

src = open("experiments/robust_tail/run.py").read().rsplit("\nmain()", 1)[0]
rt = type(sys)("rt")
rt.__dict__["__name__"] = "rt"
exec(compile(src, "rt", "exec"), rt.__dict__)
nm = rt.nm

SCALES = (0.75, 0.8, 0.9, 1.0)
MS = np.round(np.arange(0.80, 1.6001, 0.025), 4)


def err(r, rph, rsp, rz):
    return max(abs(100 * (r[0] / rph - 1)), abs(100 * (r[1] / rsp - 1)), abs(100 * (r[2] / rz - 1)))


def main():
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    ref = nm.modes(asb.Airfoil("naca4412"), 1.0, nm.AR0, 1.0, nm.CL0)
    rph, rsp, rz = ref["ph"], ref["sp"], ref["z"]
    ref_pw = (nm.cd_at(asb.Airfoil("naca4412"), full["re"], nm.CL0) + nm.CL0 ** 2 / (np.pi * nm.E * nm.AR0)) / nm.CL0
    designs = []
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
                if abs(pr - 1) > 0.05:
                    continue
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
                        r = rt.modes_tail(af, k, ar, nm.N, cl, wing, tail, sec, frac, art, arm)
                        if r is not None and err(r, rph, rsp, rz) <= 5:
                            designs.append((name, af, k, ar, cl, wing, sec, frac, art, arm, tail, v))
    print(f"{len(designs)} designs within 5% on all three modes at slope scale 1.0 (reference n=1 NACA 4412: phugoid {rph:.3f}, short period {rsp:.3f}, zeta {rz:.3f})")
    print(f"tail area multiplier m searched: {MS[0]:.2f} to {MS[-1]:.2f} step 0.025; slope scales {SCALES}\n")
    rec = 0
    dev, fixed_gap, spans, mmax = [], [], [], []
    rows = []
    for d in designs:
        name, af, k, ar, cl, wing, sec, frac, art, arm, tail, v = d
        best_m, best_e, fix_e = [], [], []
        for sc in SCALES:
            es = []
            for m in MS:
                r = rt.modes_tail(af, k, ar, nm.N, cl, wing, (tail[0] * sc, tail[1]), sec, frac * m, art, arm)
                es.append(np.inf if r is None else err(r, rph, rsp, rz))
            es = np.array(es)
            i = int(np.argmin(es))
            best_m.append(MS[i])
            best_e.append(es[i])
            j = int(np.argmin(abs(MS - 1 / sc)))
            fix_e.append(es[j])
        ok = all(e <= 5 for e in best_e)
        rec += ok
        if ok:
            dev.extend(abs(m * sc - 1) for m, sc in zip(best_m, SCALES))
            spans.append(max(best_m) - min(best_m))
            mmax.append(max(best_m))
        fixed_gap.append(max(f - b for f, b in zip(fix_e, best_e)))
        rows.append((ok, name, k, ar, sec, frac, art, arm, best_m, best_e))
    rows.sort(key=lambda r: (not r[0], max(r[9])))
    print(f"{'airfoil':>9} {'k':>5} {'AR':>3}  tail (section, area, AR_t, arm)   best m at scale {SCALES}   worst% at best m   recoverable")
    for ok, name, k, ar, sec, frac, art, arm, bm, be in rows[:15]:
        print(f"{name:>9} {k:5.2f} {ar:3d}  {sec} {frac:.2f} {art:.1f} {arm:.1f}   " + " ".join(f"{x:5.3f}" for x in bm) + "   " + " ".join(f"{x:5.2f}" for x in be) + f"   {ok}")
    print(f"\nrecoverable within 5% at every scale with m in [0.8, 1.6]: {rec} of {len(designs)}")
    if dev:
        print(f"over recoverable designs: median |m*scale - 1| = {np.median(dev):.3f}, 90th percentile {np.percentile(dev, 90):.3f}; "
              f"median m span needed {np.median(spans):.3f}, median largest m {np.median(mmax):.3f}, largest {max(mmax):.3f}")
    fg = np.array(fixed_gap)
    print(f"rule m = 1/scale versus the best m: worst-mode error higher by more than 2 points for {int((fg > 2).sum())} of {len(designs)} designs; median gap {np.median(fg):.2f}, max {fg.max():.2f} points")


main()
