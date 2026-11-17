"""Milestone 5zi: is the plating exponent the ten-cycle forecast needs (the oracle kappa* of 5zf to 5zh) the physical
alpha F / RT scaled by how much faster the loaded separator-surface potential rises than the law's own lever? 5zd's
law reads the potential lever dU_eta(L), the rise of the negative OCP at the top of the eta-shortened window as lithium
L is lost. The DFN records u(n), the negative OCP at the separator-side particle surface at the end of each charge
(5z's lever). If the true lever is a multiple rho of the law's, the law's effective exponent is kappa = 25.3 rho.

    WORKERS=4 python experiments/lever/run.py rows    # per design: rho, kappa*, errors (stdlib; about a minute)
    python experiments/lever/run.py report            # H182 to H186 -> results.txt, summary.json

Per design (all 768 committed DFN designs of 5zb to 5zg, 24 pools, no new simulation):
    D_n = dU_eta(L_n) - dU_eta(L_2)   the law's lever rise from cycle 2 to n (5zd's eta, from cycles 2..10)
    M_n = u(n) - u(2)                 the measured separator-surface OCP rise
    rho_path = sum M_n D_n / sum D_n^2 over n = 3..99 (least squares through the origin; uses cycle 99, a diagnosis)
    rho_10   = the same over n = 3..10 (readable from the first ten cycles, a forecast)
    kappa_path = 25.3 rho_path, kappa_10 = 25.3 rho_10, each clamped to [0, KMAX]
Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m   # so multiprocessing can pickle the imported worker function
    spec.loader.exec_module(m)
    return m


FR = _mod("fewruns_run", EXP / "fewruns" / "run.py")
SK = FR.SK
KP, B, AS, CN, LD, SF = SK.KP, SK.B, SK.AS, SK.CN, SK.LD, SK.SF
K, TO, KAPPA, KMAX = SK.K, SK.TO, SK.KAPPA, SK.KMAX
spearman = SK.spearman
WORKERS = int(os.environ.get("WORKERS", "3"))
LGSETS = FR.LGSETS
TOL = 0.25   # |kappa_path / kappa* - 1| counted as a match (pool medians), fixed in the plan


# ---------- pure helpers (stdlib; tested) ----------

def ratio(ms, ds):
    """Least-squares slope through the origin of ms on ds; None when the ds carry no signal."""
    sdd = sum(d * d for d in ds)
    if sdd <= 1e-18:
        return None
    return sum(m * d for m, d in zip(ms, ds)) / sdd


def clamp(x, lo=0.0, hi=KMAX):
    return max(lo, min(hi, x))


def rises(u, du_of_l, lost, n_hi):
    """(M_n, D_n) for n = 3..n_hi: measured and law lever rises from cycle 2 (lists are 1-based cycles, index n-1)."""
    ms = [u[n - 1] - u[1] for n in range(3, n_hi + 1)]
    ds = [du_of_l(lost[n - 1]) - du_of_l(lost[1]) for n in range(3, n_hi + 1)]
    return ms, ds


def match(a, b, tol=TOL):
    return b > 0 and abs(a / b - 1.0) <= tol


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "inconclusive")


def verdicts(P):
    lg = [d for d in P.values() if d["set"] in LGSETS]
    ct = [d for d in P.values() if d["set"] not in LGSETS]
    n182 = sum(match(d["k_path"], d["k_star"]) for d in lg)
    n183 = sum(match(d["k_path"], d["k_star"]) for d in ct)
    r184 = spearman([d["k_path"] for d in P.values()], [d["k_star"] for d in P.values()])
    r185 = statistics.median(d["rho_within"] for d in lg)
    n186 = sum(d["err_10"] < d["err_phys"] for d in lg)
    return dict(H182=verdict(n182 >= 10, n182 < 6), H183=verdict(n183 >= 8, n183 < 4),
                H184=verdict(r184 >= 0.6, r184 < 0.3), H185=verdict(r185 >= 0.4, r185 < 0.15),
                H186=verdict(n186 >= 9, n186 < 6),
                counts=dict(n182=n182, n183=n183, r184=r184, r185=r185, n186=n186))


# ---------- rows ----------

_BALS = {}


def _one(item):
    d, f, s = item
    if d not in _BALS:
        _BALS[d] = SF._bal(EXP / d)
    bal, ocp = _BALS[d]
    b = CN._b(bal, ocp, (f["cond"], f["j"]))
    r = SK.design(b, f, s)
    eta = LD.eta_of(s["q_ch"], s["lost_mol"], b, K)
    du = lambda l: CN.du_eta(l, b, eta)
    lost, u = f["lost_mol"], f["u_end"]
    mp, dp = rises(u, du, lost, TO - 1)
    m10, d10 = rises(u, du, lost, K)
    rp, r10 = ratio(mp, dp), ratio(m10, d10)
    kp = None if rp is None else clamp(KAPPA * rp)
    k10 = None if r10 is None else clamp(KAPPA * r10)
    return dict(pool=f"{d}/{f['cond']}", cond=f["cond"], set=SK.pset(f["cond"]), j=f["j"], eta=eta,
                k_star=r["k_star"], rho_path=rp, rho_10=r10, k_path=kp, k_10=k10,
                m99_mV=1e3 * mp[-1], d99_mV=1e3 * dp[-1], m10_mV=1e3 * m10[-1], d10_mV=1e3 * d10[-1],
                err_phys=SK.err_at(r, KAPPA), err_path=None if kp is None else SK.err_at(r, kp),
                err_10=None if k10 is None else SK.err_at(r, k10), egrid=SK.errs_on_grid(r))


def rows():
    import multiprocessing
    with multiprocessing.Pool(WORKERS) as pool:
        out = list(pool.imap(_one, list(FR._items()), chunksize=4))
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs,", len({r["pool"] for r in out}), "pools")


def _med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    P = {}
    for p in sorted({r["pool"] for r in rs}):
        t = [r for r in rs if r["pool"] == p]
        st = t[0]["set"]
        k160 = statistics.median(r["k_star"] for r in rs if r["set"] == st and r["pool"] != p)
        both = [r for r in t if r["k_path"] is not None]
        P[p] = dict(set=st, n=len(t), k_star=_med(r["k_star"] for r in t), k_path=_med(r["k_path"] for r in t),
                    k_10=_med(r["k_10"] for r in t), rho_path=_med(r["rho_path"] for r in t),
                    rho_10=_med(r["rho_10"] for r in t), m99=_med(r["m99_mV"] for r in t),
                    d99=_med(r["d99_mV"] for r in t), m10=_med(r["m10_mV"] for r in t), d10=_med(r["d10_mV"] for r in t),
                    rho_within=spearman([r["k_path"] for r in both], [r["k_star"] for r in both]),
                    err_phys=_med(r["err_phys"] for r in t), err_path=_med(r["err_path"] for r in t),
                    err_10=_med(r["err_10"] for r in t), k160=k160, err_med160=FR.pool_err(t, k160),
                    none_10=sum(r["k_10"] is None for r in t), none_path=len(t) - len(both))
    V = verdicts(P)
    L = ["cell-fidelity milestone 5zi: is the needed plating exponent kappa* = 25.3 x (measured separator-surface OCP",
         "rise) / (the law's lever rise)? All 768 committed designs (24 pools); no new simulation. Pool medians.",
         "m99, d99: measured and law lever rise from cycle 2 to 99 (mV); m10, d10: to cycle 10. k_path = 25.3 rho_path",
         "(cycles 3..99, diagnosis); k_10 = 25.3 rho_10 (cycles 3..10, forecast); clamped to [0, 100]. rho_in =",
         "within-pool Spearman(k_path, k*). Errors: median |ln(L_pred(99)/L_DFN(99))| at kappa 25.3 (phys), k_path,",
         "k_10 and 5zg's med over the set's other 160 designs (med160).", "",
         f"{'pool':34s}{'k*':>6s}{'k_path':>7s}{'k_10':>7s}{'m99':>6s}{'d99':>6s}{'m10':>6s}{'d10':>6s}{'rho_in':>7s}"
         f"{'phys':>7s}{'path':>7s}{'k_10':>7s}{'med160':>7s}"]
    f = lambda x, w, p: (f"{x:{w}.{p}f}" if x is not None else "-".rjust(w))
    for p, d in P.items():
        L.append(f"{p:34s}{f(d['k_star'], 6, 1)}{f(d['k_path'], 7, 1)}{f(d['k_10'], 7, 1)}{f(d['m99'], 6, 1)}"
                 f"{f(d['d99'], 6, 1)}{f(d['m10'], 6, 1)}{f(d['d10'], 6, 1)}{f(d['rho_within'], 7, 2)}"
                 f"{f(d['err_phys'], 7, 3)}{f(d['err_path'], 7, 3)}{f(d['err_10'], 7, 3)}{f(d['err_med160'], 7, 3)}")
    c = V["counts"]
    L += ["", f"H182 (LG M50: pool k_path within 25% of k* on at least 10 of 12): {V['H182']} ({c['n182']}/12)",
          f"H183 (controls: the same on at least 8 of 12): {V['H183']} ({c['n183']}/12)",
          f"H184 (Spearman of pool k_path against pool k* over 24 pools >= 0.6): {V['H184']} ({c['r184']:.3f})",
          f"H185 (LG M50: median within-pool Spearman(k_path, k*) >= 0.4): {V['H185']} ({c['r185']:.3f})",
          f"H186 (LG M50: the ten-cycle k_10 forecast beats phys on at least 9 of 12 pools): {V['H186']} ({c['n186']}/12)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(pools=P, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
