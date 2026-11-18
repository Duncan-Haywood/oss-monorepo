"""Milestone 9af (incidence-channel offset): 9ae harness with a constant bias on the alpha channel (state 1) of eps degrees (random sign), no gain error. The bias is converted to the normalised channel by dividing by the alpha rms (rad). Not sourced from a datasheet (web hosts unreachable this session): swept 0.25 to 2 degrees as a range.

Derived from 9ae: Milestone 9ae (gain-only arm of 9ac): gain (1+eps) on u with NO eps*V0 offset, so the sign-random gain is the only error. Derived from 9ac:

Milestone 9ac: 9ab with a scale-factor (gain) error on indicated airspeed, V_ind = (1+eps)(V0+u): gain (1+eps) on u plus a constant eps*V0.

Derived from 9ab (airspeed_offset_fit). A pure gain on one state is a diagonal similarity transform, so it cannot move the eigenvalues; the constant eps*V0 is 9ab's offset.

Original 9ab docstring: 9y's fit with a constant offset on the airspeed (u) channel only, sized from 9aa's pitot error

    PY experiments/airspeed_gain_only/run.py > experiments/airspeed_gain_only/results.txt     (run from research/aerolog-scaling)

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
OFFSETS = (0.0, 0.25, 0.5, 1.0, 2.0)  # alpha bias in degrees  # EPS: fractional scale-factor error of the airspeed channel (0.25%, 1% from 9aa; 5% a gross fault)   # total drift over the record per channel (end minus start), fraction of channel rms, random sign
PERIODS = (1, 2)
import os as _os
if _os.environ.get('AEROLOG_OFFSETS'):  # e.g. AEROLOG_OFFSETS=2.0 AEROLOG_PERIODS=2 to re-run only some rows (the rng stream then differs from the full run)
    OFFSETS = tuple(float(x) for x in _os.environ['AEROLOG_OFFSETS'].split(','))
if _os.environ.get('AEROLOG_PERIODS'):
    PERIODS = tuple(int(x) for x in _os.environ['AEROLOG_PERIODS'].split(','))
GAIN = float(_os.environ.get('AEROLOG_GAIN', '0'))  # 9ak: fractional gain error on the alpha channel (0.19 = Sasse et al. CFD upwash slope 1.19); the offset in OFFSETS is in sensor degrees
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
    est_cache = {}

    def fit(plant, ph_true, noise, periods, off):
        """relative errors (ph, sp, zeta) of the LS-fitted modes at f = 1, one per draw; nan where the fit has no two complex pairs."""
        A, l_f = plant["A"], plant["l_f"]
        w = np.linalg.eigvals(A)
        cp = sorted([e for e in w if e.imag > 1e-9], key=abs)
        t_sp = 2 * np.pi / abs(cp[1])
        t_ph = 2 * np.pi / abs(cp[0])
        dt = t_sp / 20
        steps = int(periods * t_ph / dt)
        phi = expm(A * dt)
        x = np.empty((steps + 1, 4))
        x[0] = [0.1 * plant["v"], 0.05, 0.0, 0.0]
        for i in range(steps):
            x[i + 1] = phi @ x[i]
        rms = np.sqrt((x ** 2).mean(axis=0))
        xn = x / rms
        true = np.array([abs(cp[0]), abs(cp[1]), -cp[1].real / abs(cp[1])])
        out = np.full((DRAWS, 4, 3), np.nan)
        from scipy.optimize import least_squares
        x0 = xn[0] * np.array([1.0, 1.0 + GAIN, 1.0, 1.0])  # the model's initial state is in the gain-scaled channel units (9ak; found when the first run left it unscaled)
        Aref = np.linalg.inv(np.diag(rms)) @ A @ np.diag(rms)  # state matrix of the normalised states (start of the OE search is the LS fit, not this)

        def modes_of(lam):
            c = sorted([e for e in lam if e.imag > 1e-9], key=abs)
            if len(c) != 2:
                return None
            return np.array([abs(c[0]), abs(c[1]), -c[1].real / abs(c[1])]) / true - 1

        def resid(p, y):
            Ac = p.reshape(4, 4)
            ph = expm(Ac * dt)
            xs = np.empty_like(y)
            xs[0] = x0
            for i in range(len(y) - 1):
                xs[i + 1] = ph @ xs[i]
            return (xs - y).ravel()

        ramp = np.linspace(0.0, 1.0, steps + 1)[:, None]

        def resid_b(p, y):
            return resid(p[:16], y - p[16:])

        def resid_d(p, y):
            return resid(p[:16], y - p[16:20] - ramp * p[20:24])

        for d in range(DRAWS):
            # random walk per channel, starts at 0, its standard deviation at the record's end is `off` of channel rms
            walk = np.zeros((steps + 1, 4))
            sg = rng.choice([-1.0, 1.0])
            xg = xn.copy()
            xg[:, 1] = (1 + GAIN) * xn[:, 1] + sg * np.deg2rad(off) / rms[1]
            # 9ae: offset removed on purpose (gain-only arm)
            y = xg + walk + noise * rng.standard_normal(xn.shape)
            beta, *_ = np.linalg.lstsq(y[:-1], y[1:], rcond=None)
            Phi = beta.T
            lam = np.log(np.linalg.eigvals(Phi).astype(complex)) / dt
            e = modes_of(lam)
            if e is not None:
                out[d, 0] = e
            from scipy.linalg import logm
            try:
                A0 = np.real(logm(Phi)) / dt
            except Exception:
                continue
            sol = least_squares(resid, A0.ravel(), args=(y,), method="lm", max_nfev=60 * 16)
            e = modes_of(np.linalg.eigvals(sol.x.reshape(4, 4)).astype(complex))
            if e is not None:
                out[d, 1] = e
            sol = least_squares(resid_b, np.concatenate([A0.ravel(), np.zeros(4)]), args=(y,), method="lm", max_nfev=60 * 20)
            e = modes_of(np.linalg.eigvals(sol.x[:16].reshape(4, 4)).astype(complex))
            if e is not None:
                out[d, 2] = e
            sol = least_squares(resid_d, np.concatenate([A0.ravel(), np.zeros(8)]), args=(y,), method="lm", max_nfev=60 * 24)
            e = modes_of(np.linalg.eigvals(sol.x[:16].reshape(4, 4)).astype(complex))
            if e is not None:
                out[d, 3] = e
        return out

    print("estimator | alpha bias (deg) | noise | periods | scale | fit failures | median |err| ph, sp, zeta (%) | median worst gust error | share of draws within 10% gust | designs with >=90% within 10% | median worst mode error")
    f1 = int(np.argmin(np.abs(F - 1.0)))
    for off in OFFSETS:
      for nz in NOISE:
        for per in PERIODS:
            for i, sc in enumerate(SCALES):
                res = {"LS": ([], [], [], [], [0]), "OE": ([], [], [], [], [0]), "OE+b": ([], [], [], [], [0]), "OE+b+d": ([], [], [], [], [0])}
                for d, (name, k, ar, sec, frac, art, arm, curves) in enumerate(designs):
                    m_f, g_f, plant = curves[i]
                    e2 = fit(plant, None, nz, per, off)
                    for j, key in enumerate(("LS", "OE", "OE+b", "OE+b+d")):
                        gust_all, mode_all, share, errs, fails = res[key]
                        e = e2[:, j, :]
                        bad = np.isnan(e[:, 0])
                        fails[0] += int(bad.sum())
                        errs.append(e[~bad])
                        with np.errstate(invalid="ignore"):
                            true_err = 100 * np.abs(m_f / refv - 1)
                            ee = np.where(bad[:, None], 0.0, e)
                            obs_err = np.abs(m_f[None, :, :] * (1 + ee[:, None, :]) / refv - 1)
                            pick = np.nanargmin(np.nanmax(obs_err, axis=2), axis=1)
                        pick = np.where(bad, f1, pick)
                        gd = g_f[pick]
                        gust_all.extend(gd)
                        mode_all.extend(np.nanmax(true_err, axis=1)[pick])
                        share.append(np.mean(gd <= 10))
                for key, (gust_all, mode_all, share, errs, fails) in res.items():
                    allerr = 100 * np.abs(np.concatenate(errs))
                    med = np.median(allerr, axis=0)
                    share = np.array(share)
                    print(f"{key} | {off:.2f} deg | {nz:.2f} | {per} | {sc:.2f} | {fails[0]} of {n * DRAWS} | {med[0]:.2f}, {med[1]:.2f}, {med[2]:.2f} | {np.nanmedian(gust_all):.1f}% | {100*np.nanmean(np.array(gust_all) <= 10):.0f}% | {int((share >= 0.9).sum())} of {n} | {np.nanmedian(mode_all):.1f}%", flush=True)


main()
