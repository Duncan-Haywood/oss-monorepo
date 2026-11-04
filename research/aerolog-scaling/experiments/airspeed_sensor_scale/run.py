"""Milestone 9aa: a published airspeed (pitot differential-pressure) sensor error against the 10% channel noise 9x/9y assumed

    PY experiments/airspeed_sensor_scale/run.py > experiments/airspeed_sensor_scale/results.txt     (run from research/aerolog-scaling)

Same 78 designs as 9f. The 4-state model at f = 1 (true tail-slope scale 0.75 or 1.0) is released from an initial
disturbance, sampled with white sensor noise, and x[k+1] = Phi x[k] is fitted by least squares; the eigenvalues give the
phugoid and short-period modes. The relative error of the three fitted modes at f = 1 is carried to every f on the grid
(as 9f does with assumed noise), f is picked as in 9f, and the true model at that f is scored on modes and gust peaks.
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
SCALES = (0.75,)
NOISE = (0.10,)
OFFSETS = (0.0, 0.10, 0.20)   # total drift over the record per channel (end minus start), fraction of channel rms, random sign
PERIODS = (1, 2)
DRAWS = 8
STRIDE = 4                          # every third mode-matched design, for run time
F = np.round(np.arange(0.6, 1.801, 0.05), 2)
rng = np.random.default_rng(20261103)


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

    print(f"noise {NOISE} of channel rms, records {PERIODS} phugoid periods, {DRAWS} draws per design and scale; scales {SCALES}")
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
                    m_f, g_f, plant = [], [], None
                    for f in F:
                        r = ev(af, k, ar, cl, wing, tail, sec, frac, art, arm, sc, f)
                        if r is None:
                            m_f.append([np.nan] * 3)
                            g_f.append(np.nan)
                            continue
                        if f == 1.0:
                            plant = r[3]
                        m_f.append([r[0], r[1], r[2]])
                        g_f.append(max(abs(100 * (a / b - 1)) for h in HS for a, b in zip(gm.gust_peaks(r[3], h, c_full), base[h])))
                    curves.append((np.array(m_f), np.array(g_f), plant))
                designs.append((name, k, ar, sec, frac, art, arm, curves))
    designs = designs[::STRIDE]
    n = len(designs)
    print(f"{n} mode-matched designs\n")
    from scipy.linalg import expm
    # TE/Measurement Specialties MS4525DO datasheet (search extract; PDF not opened): accuracy +/-0.25 % of span, total error band
    # +/-1.0 % of span (+/-2.0 % for spans of 4 inH2O and below), 14-bit pressure output. Span 1 psi = 6894.76 Pa assumed (the part
    # exists in 1 psi spans; not confirmed in the extract). Error treated as a constant dynamic-pressure offset over the record
    # (the generous reading: TEB includes thermal error, which is slow), and as an uncorrelated 1-LSB quantisation.
    span = 6894.76
    sens = {"accuracy 0.25 % span": 0.0025 * span, "TEB 1.0 % span": 0.01 * span, "TEB 2.0 % span": 0.02 * span, "1 LSB (14 bit)": span / 16383}
    rows = []
    for name, k, ar, sec, frac, art, arm, curves in designs:
        plant = curves[0][2]
        A = plant["A"]
        w = np.linalg.eigvals(A)
        cp = sorted([e for e in w if e.imag > 1e-9], key=abs)
        t_sp, t_ph = 2 * np.pi / abs(cp[1]), 2 * np.pi / abs(cp[0])
        dt = t_sp / 20
        phi = expm(A * dt)
        steps = int(t_ph / dt)
        x = np.empty((steps + 1, 4)); x[0] = [0.1 * plant["v"], 0.05, 0.0, 0.0]
        for i in range(steps):
            x[i + 1] = phi @ x[i]
        rows.append((plant["v"], np.sqrt((x[:, 0] ** 2).mean())))
    v = np.array([r[0] for r in rows]); u = np.array([r[1] for r in rows])
    print(f"{len(rows)} designs; model trim speed median {np.median(v):.2f} m/s (min {v.min():.2f}); u-channel rms over 1 phugoid period median {np.median(u):.3f} m/s")
    print("error | dynamic-pressure error (Pa) | speed error dV = dq/(rho V) median (m/s) | as fraction of u rms: median, max | assumed in 9x/9y")
    for nme, dq in sens.items():
        dv = dq / (nm.RHO * v)
        fr = dv / u
        print(f"{nme} | {dq:.2f} | {np.median(dv):.3f} | {np.median(fr):.2f}, {fr.max():.2f} | noise 0.10, drift 0.10-0.20")
    q = 0.5 * nm.RHO * v ** 2
    print(f"\ndynamic pressure at trim: median {np.median(q):.0f} Pa = {100*np.median(q)/span:.1f} % of a 1 psi span; speed error at 1 % span is {100*np.median(0.01*span/(2*q)):.1f} % of trim speed")


main()
