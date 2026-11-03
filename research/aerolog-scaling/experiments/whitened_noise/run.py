"""Milestone 9n: 9m with a third column, the coloured record fitted with AR(1)-whitened residuals (rho known)

    PY experiments/whitened_noise/run.py > experiments/whitened_noise/results.txt     (run from research/aerolog-scaling)

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
PERIODS = (2,)
STRIDE = 3
DRAWS = 10
RHO = 0.9
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

    def fit(plant, ph_true, noise, periods):
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
        out = np.full((DRAWS, 3, 3), np.nan)
        from scipy.optimize import least_squares
        Aref = np.linalg.inv(np.diag(rms)) @ A @ np.diag(rms)  # state matrix of the normalised states (start of the OE search is the LS fit, not this)

        def modes_of(lam):
            c = sorted([e for e in lam if e.imag > 1e-9], key=abs)
            if len(c) != 2:
                return None
            return np.array([abs(c[0]), abs(c[1]), -c[1].real / abs(c[1])]) / true - 1

        def resid(p, y, wh=False):
            Ac = p[:16].reshape(4, 4)
            x0 = p[16:] if len(p) > 16 else xn[0]
            ph = expm(Ac * dt)
            xs = np.empty_like(y)
            xs[0] = x0
            for i in range(len(y) - 1):
                xs[i + 1] = ph @ xs[i]
            e = xs - y
            if wh:
                e = np.vstack([e[:1] * np.sqrt(1 - RHO ** 2), e[1:] - RHO * e[:-1]])
            return e.ravel()

        for d in range(DRAWS):
            z = rng.standard_normal(xn.shape)
            col = np.empty_like(z)
            col[0] = z[0]
            for i in range(1, len(z)):
                col[i] = RHO * col[i - 1] + np.sqrt(1 - RHO ** 2) * z[i]
            ys = (xn + noise * z, xn + noise * col, xn + noise * col)
            y = ys[0]
            beta, *_ = np.linalg.lstsq(y[:-1], y[1:], rcond=None)
            Phi = beta.T
            lam = np.log(np.linalg.eigvals(Phi).astype(complex)) / dt
            from scipy.linalg import logm
            try:
                A0 = np.real(logm(Phi)) / dt
            except Exception:
                A0 = None
            n1 = int(t_ph / dt)
            for j, free in enumerate((True, True, True)):
                wh = j == 2
                y = ys[j]
                y1 = y[:n1 + 1]
                try:
                    b1, *_ = np.linalg.lstsq(y1[:-1], y1[1:], rcond=None)
                    A1 = np.real(logm(b1.T)) / dt
                    p0 = np.concatenate([A1.ravel(), y[0]]) if free else A1.ravel()
                    s1 = least_squares(resid, p0, args=(y1, wh), method="lm", max_nfev=60 * 20)
                    s2 = least_squares(resid, s1.x, args=(y, wh), method="lm", max_nfev=60 * 20)
                except Exception:
                    continue
                e = modes_of(np.linalg.eigvals(s2.x[:16].reshape(4, 4)).astype(complex))
                if e is not None:
                    out[d, j] = e
        return out

    print("estimator | noise | periods | scale | fit failures | median |err| ph, sp, zeta (%) | median worst gust error | share of draws within 10% gust | designs with >=90% within 10% | median worst mode error")
    f1 = int(np.argmin(np.abs(F - 1.0)))
    for nz in NOISE:
        for per in PERIODS:
            for i, sc in enumerate(SCALES):
                res = {k_: ([], [], [], [], [0]) for k_ in ("white", "coloured", "coloured-whitened")}
                for d, (name, k, ar, sec, frac, art, arm, curves) in enumerate(designs):
                    m_f, g_f, plant = curves[i]
                    e2 = fit(plant, None, nz, per)
                    for j, key in enumerate(("white", "coloured", "coloured-whitened")):
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
                    print(f"{key} | {nz:.2f} | {per} | {sc:.2f} | {fails[0]} of {n * DRAWS} | {med[0]:.2f}, {med[1]:.2f}, {med[2]:.2f} | {np.nanmedian(gust_all):.1f}% | {100*np.nanmean(np.array(gust_all) <= 10):.0f}% | {int((share >= 0.9).sum())} of {n} | {np.nanmedian(mode_all):.1f}%", flush=True)


main()
