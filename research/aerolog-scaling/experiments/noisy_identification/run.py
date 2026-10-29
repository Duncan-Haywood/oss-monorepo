"""Milestone 9f: how much noise in the identified modes does the adjustable tail (9d, 9e) tolerate?

    PY experiments/noisy_identification/run.py > experiments/noisy_identification/results.txt     (run from research/aerolog-scaling)

Same 78 mode-matched designs and true tail-slope scales as 9e. In flight the pilot sees the modes with
multiplicative Gaussian error (sigma SIGMAS, independent on phugoid frequency, short-period frequency and
short-period damping ratio) and sets the area multiplier f on the grid F that minimises the worst error between
the *observed* modes and the n = 1 reference. The true model at that f is then scored on modes and on the three gust
peaks. The model curves over F are computed once per design and scale; the noise draws are Monte Carlo.
"""
import itertools
import sys
import numpy as np
import aerosandbox as asb

sys.path.insert(0, "src")
from aerolog_scaling.scaling import airframe, G


def load(path, name, patch=None):
    src = open(path).read().rsplit("\nmain()", 1)[0]
    if patch:
        src = src.replace(*patch)
    mod = type(sys)(name)
    mod.__dict__["__name__"] = name
    exec(compile(src, name, "exec"), mod.__dict__)
    return mod


ts = load("experiments/tail_search/run.py", "ts",
          ("    return abs(ph), abs(sp), -sp.real / abs(sp)",
           "    return abs(ph), abs(sp), -sp.real / abs(sp), dict(ok=True, A=A, v=v, c=c, l_f=l_f, cla=cla, q=q, s_w=s_w, m=m, cl_w=cl_w)"))
nm, gm = ts.nm, load("experiments/gust_response/run.py", "gm")
HS = gm.HS
SCALES = (0.75, 0.9, 1.0)
SIGMAS = (0.0, 0.02, 0.05, 0.10)
DRAWS = 200
F = np.round(np.arange(0.6, 1.801, 0.05), 2)
rng = np.random.default_rng(20261029)


def main():
    full = airframe(nm.M_FULL, nm.B_FULL, nm.AR0, nm.CL0, 1.25, 2.1, nm.E)
    v_model = full["v"] * nm.N ** 0.5
    s_sim = full["s_ref"] * nm.N ** 2
    c_full = np.sqrt(full["s_ref"] / nm.AR0)
    ref_af = asb.Airfoil("naca4412")
    ref_pw = (nm.cd_at(ref_af, full["re"], nm.CL0) + nm.CL0 ** 2 / (np.pi * nm.E * nm.AR0)) / nm.CL0
    ref = nm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0)
    refv = np.array([ref["ph"], ref["sp"], ref["z"]])
    base = {h: gm.gust_peaks(gm.modes(ref_af, 1.0, nm.AR0, 1.0, nm.CL0), h, c_full) for h in HS}
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

    def ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, sc, f):
        return ts.modes_tail(af, k, ar, nm.N, cl, wing, (tail[0] * sc, tail[1]), sec, frac * f, art, arm)

    print(f"noise: sigma {SIGMAS} on each observed mode, {DRAWS} draws per design and scale; true tail-slope scales {SCALES}")
    designs = []
    for name, af, k, ar, cl in cases:
        s_w = k * s_sim
        c = s_w / np.sqrt(ar * s_w)
        v = np.sqrt(2 * nm.M_FULL * nm.N ** 3 * G / (nm.RHO * s_w * cl))
        re_w = nm.RHO * v * c / nm.MU
        wing = (nm.cd_at(af, re_w, cl), nm.slope_at(af, ar, re_w, cl))
        for sec, frac, art in itertools.product(ts.SECTIONS, ts.AREAS, ts.TAR):
            taf = asb.Airfoil(sec)
            b_t = np.sqrt(art * frac * s_sim)
            re_t = nm.RHO * v * (b_t / art) / nm.MU
            tail = (nm.slope_at(taf, art, re_t, 0.05), nm.cd_at(taf, re_t, 0.05))
            if np.isnan(tail[1]):
                continue
            for arm in ts.ARMS:
                e1 = ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, 1.0, 1.0)
                if e1 is None:
                    continue
                if max(abs(100 * (e1[0] / refv[0] - 1)), abs(100 * (e1[1] / refv[1] - 1)), abs(100 * (e1[2] / refv[2] - 1))) > 5:
                    continue
                curves = []
                for sc in SCALES:
                    m_f, g_f = [], []
                    for f in F:
                        r = ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, sc, f)
                        if r is None:
                            m_f.append([np.nan] * 3)
                            g_f.append(np.nan)
                            continue
                        m_f.append([r[0], r[1], r[2]])
                        g_f.append(max(abs(100 * (a / b - 1)) for h in HS for a, b in zip(gm.gust_peaks(r[3], h, c_full), base[h])))
                    curves.append((np.array(m_f), np.array(g_f)))
                designs.append((name, k, ar, sec, frac, art, arm, curves))
    n = len(designs)
    print(f"{n} mode-matched designs\n")
    # noise draws, common random numbers across sigma
    eps = rng.standard_normal((n, len(SCALES), DRAWS, 3))
    print("sigma | scale | median f error vs noiseless f | median worst gust error | share of draws within 10% gust | designs with >=90% of draws within 10% gust | median worst mode error")
    summary = {}
    for sg in SIGMAS:
        for i, sc in enumerate(SCALES):
            gust_all, mode_all, share, ferr = [], [], [], []
            for d, (name, k, ar, sec, frac, art, arm, curves) in enumerate(designs):
                m_f, g_f = curves[i]
                with np.errstate(invalid="ignore"):
                    true_err = 100 * np.abs(m_f / refv - 1)
                    f0 = np.nanargmin(np.nanmax(true_err, axis=1))
                    obs_err = np.abs(m_f[None, :, :] * (1 + sg * eps[d, i][:, None, :]) / refv - 1)
                    pick = np.nanargmin(np.nanmax(obs_err, axis=2), axis=1)
                gd = g_f[pick]
                gust_all.extend(gd)
                mode_all.extend(np.nanmax(true_err, axis=1)[pick])
                share.append(np.mean(gd <= 10))
                ferr.extend(np.abs(F[pick] - F[f0]))
            share = np.array(share)
            print(f"{sg:.2f} | {sc:.2f} | {np.median(ferr):.2f} | {np.nanmedian(gust_all):.1f}% | {100*np.nanmean(np.array(gust_all) <= 10):.0f}% | {int((share >= 0.9).sum())} of {n} | {np.nanmedian(mode_all):.1f}%")


main()
