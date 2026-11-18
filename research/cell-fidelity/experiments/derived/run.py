"""Milestone 5x: can the self-limiting slope of 5v's correction be derived from the plating law instead of fitted?

    python experiments/derived/run.py report    # H131 to H134 on the ten committed 100-cycle pools (stdlib)

PyBaMM's irreversible plating current is j0 exp(-alpha F (dphi + eta_SEI) / RT), alpha = 0.65 (OKane2022, used on every
set). Lost lithium lowers the negative electrode's stoichiometry at the upper cut-off, so its open-circuit potential at
the end of charge rises by dU(L) = U_n(x1(n_Li - L)) - U_n(x1(n_Li)) and the plating rate falls by exp(-kappa dU(L)),
kappa = alpha F / RT. Then R = int_0^L exp(kappa dU(l)) dl grows at the feedback-free rate, the pool's ten-cycle law
(5u's choice) is fitted to R instead of L, read at cycle 99 and inverted back to L. Nothing is fitted to a 100-cycle
number. Plan in ../../LOG.md (5x plan), written before this predictor was computed on any design.
"""
import importlib.util
import json
import math
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


CS = _mod("crossset_run", EXP / "crossset" / "run.py")
CM, FL, S, B = CS.CM, CS.FL, CS.S, CS.B
K, TO = S.K, S.TO
spearman = B.spearman

ALPHA = 0.65                       # OKane2022 "Lithium plating transfer coefficient" (PyBaMM 26.10.1.1), every set
T_K = 298.15                       # ambient temperature of every set used here
F_CONST, R_GAS = 96485.33212, 8.314462618
KAPPA = ALPHA * F_CONST / (R_GAS * T_K)   # 25.3 per volt
NGRID = 64                         # trapezoid points for the R(L) integral
POOLS = ((EXP / "freshlaw", FL.CONDITIONS), (EXP / "calmap", CM.CONDITIONS), (EXP / "crossset", CS.CONDITIONS))


# ---------- pure helpers (stdlib; tested) ----------

def du_top(l, b):
    """Rise of the negative electrode's open-circuit potential at the upper cut-off after losing l mol of lithium."""
    x_full = B.window(b["n_li"], b)[1]
    x_lost = B.window(b["n_li"] - l, b)[1]
    return B.interp(b["g"], b["Un"], x_lost) - B.interp(b["g"], b["Un"], x_full)


def r_table(b, l_max, kappa=KAPPA, n=NGRID):
    """(L, R) pairs on [0, l_max]: R(L) = int_0^L exp(kappa dU(l)) dl by the trapezoid rule."""
    ls = [l_max * i / n for i in range(n + 1)]
    gs = [math.exp(kappa * du_top(l, b)) for l in ls]
    rs = [0.0]
    for i in range(1, n + 1):
        rs.append(rs[-1] + 0.5 * (gs[i] + gs[i - 1]) * (ls[i] - ls[i - 1]))
    return ls, rs


def l_of_r(table, r):
    """Invert R(L) (increasing) by linear interpolation; beyond the table, extend with the last slope."""
    ls, rs = table
    if r <= rs[-1]:
        return B.interp(rs, ls, r)
    slope = (ls[-1] - ls[-2]) / (rs[-1] - rs[-2])
    return ls[-1] + (r - rs[-1]) * slope


def derived_loss(lost, b, law, kappa=KAPPA):
    """L_der(99): the pool's law fitted to R over cycles 2 to 10, read at cycle 99, inverted to L. None if no fit."""
    l_max = min(0.9 * b["n_li"], max(4 * max(lost[:K]), 1e-12))
    # R must cover the extrapolated R(99): grow the table until it does (the law is not bounded by n_Li)
    for _ in range(6):
        tab = r_table(b, l_max, kappa)
        rk = [B.interp(tab[0], tab[1], v) if v <= l_max else None for v in lost[:K]]
        if None in rk:
            l_max = min(0.95 * b["n_li"], 2 * l_max)
            continue
        r99 = FL.law_l(rk, law, TO - 1)
        if r99 is None:
            return None
        if r99 <= tab[1][-1] or l_max >= 0.95 * b["n_li"] - 1e-15:
            return l_of_r(tab, r99)
        l_max = min(0.95 * b["n_li"], 2 * l_max)
    return l_of_r(tab, r99)


def pool_slope(rows, key):
    """Slope S of ln(L_law / L_key) = A + S ln(L_law / n_Li) over a pool."""
    return CM.fit_correction([(r["l_law"], r[key], r["n_li"]) for r in rows if r.get(key) and r["l_law"]])[1]


# ---------- report ----------

def pool(c, runs, bal, ocp):
    rows, b_med, law, dropped = CM.rows_of(c, runs, bal, ocp)
    for r in rows:
        r["l_der"] = derived_loss(r["lost"], r["b"], law)
        r["du99"] = du_top(r["l_true"], r["b"])
    rows = [r for r in rows if r["l_der"] and r["l_law"]]
    err = lambda k: statistics.median(CM.log_err(r[k], r["l_true"]) for r in rows)
    # held-out ranks, the same split as 5w
    cal, held = CS.split(len(rows))
    a1 = CS.fit_intercept(CS.triples(rows, cal))
    H = [rows[i] for i in held]
    sc = [r["score"] for r in H]
    for r in H:
        r["e_der"] = CM.map_energy(r["b"], r["lost"], r["wh10"], r["l_der"]) / r["m"]
        r["e_one"] = CM.map_energy(r["b"], r["lost"], r["wh10"], CM.corrected(r["l_law"], r["n_li"], a1, CS.S_FROZEN)) / r["m"]
        r["e_law"] = CM.map_energy(r["b"], r["lost"], r["wh10"], r["l_law"]) / r["m"]
    rho = lambda k: spearman([r[k] for r in H], sc)
    return dict(n=len(rows), dropped=dropped, law=law,
                lerr_law=err("l_law"), lerr_der=err("l_der"),
                s_true=pool_slope(rows, "l_true"), s_der=pool_slope(rows, "l_der"),
                du99_median=statistics.median(r["du99"] for r in rows),
                frac_median=statistics.median(r["l_true"] / r["n_li"] for r in rows),
                n_held=len(H), rho_der=rho("e_der"), rho_one=rho("e_one"), rho_law=rho("e_law"),
                rho_sqrt=rho("sqrt"), rho_raw=rho("raw10"),
                rhoL_der=spearman([r["l_der"] for r in rows], [r["l_true"] for r in rows])), rows


def verdicts(C):
    T = list(C.values())
    n = len(T)
    w131 = sum(c["lerr_der"] < c["lerr_law"] for c in T)
    w132 = sum(c["lerr_der"] <= 0.06 for c in T)
    w133 = sum(abs(c["s_der"] - c["s_true"]) <= 0.15 for c in T)
    r133 = spearman([c["s_der"] for c in T], [c["s_true"] for c in T])
    w134a = sum(c["rho_der"] > c["rho_sqrt"] for c in T)
    w134b = sum(c["rho_der"] >= c["rho_one"] - 0.05 for c in T)
    return dict(n=n, H131=S.verdict(w131 == n, w131 <= n - 3), H131_wins=w131,
                H132=S.verdict(w132 >= 7, w132 <= 3), H132_wins=w132,
                H133=S.verdict(w133 >= 7 and r133 >= 0.6, w133 <= 3), H133_wins=w133, H133_rho=r133,
                H134=S.verdict(w134a >= 8 and w134b >= 7, w134a <= 5), H134_sqrt=w134a, H134_one=w134b)


def report():
    C, Rows = {}, {}
    for d, conds in POOLS:
        runs, bal, ocp = CM._load(d)
        for c in conds:
            C[c], rows = pool(c, runs, bal, ocp)
            Rows[c] = [dict(j=r["j"], n_li=r["n_li"], l_true=r["l_true"], l_law=r["l_law"], l_der=r["l_der"],
                            du99=r["du99"]) for r in rows]
    V = verdicts(C)
    L = [f"cell-fidelity milestone 5x: the self-limiting correction derived from the plating law, no fitted constant",
         f"(alpha = {ALPHA}, T = {T_K} K, kappa = {KAPPA:.2f} /V; dU = rise of U_n at the open-circuit upper cut-off);",
         "ten committed 100-cycle pools (5u, 5v, 5w); ranks on 5w's held-out split of every pool", "",
         f"{'condition':20s}{'n':>4s}{'law':>6s}{'|lnerr| law':>12s}{'der':>7s}{'S true':>8s}{'S der':>7s}"
         f"{'dU99 mV':>8s}{'lost':>6s}{'rhoE sqrt':>10s}{'law':>7s}{'one':>7s}{'der':>7s}{'raw':>7s}{'rhoL der':>9s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:4d}{d['law']:>6s}{d['lerr_law']:12.3f}{d['lerr_der']:7.3f}{d['s_true']:8.3f}{d['s_der']:7.3f}"
                 f"{1000 * d['du99_median']:8.1f}{d['frac_median']:6.3f}{d['rho_sqrt']:10.3f}{d['rho_law']:7.3f}"
                 f"{d['rho_one']:7.3f}{d['rho_der']:7.3f}{d['rho_raw']:7.3f}{d['rhoL_der']:9.3f}")
    n = V["n"]
    L += ["",
          f"H131 (derived |ln err| at cycle 99 below the uncorrected law's on all {n}): {V['H131']} ({V['H131_wins']} of {n})",
          f"H132 (derived median |ln err| <= 0.06 on at least 7 of {n}): {V['H132']} ({V['H132_wins']} of {n})",
          f"H133 (derived slope within 0.15 of the fitted slope on at least 7 of {n}, Spearman >= 0.6): {V['H133']}"
          f" ({V['H133_wins']} of {n}; Spearman {V['H133_rho']:.3f})",
          f"H134 (derived map above the sqrt fit on >= 8 of {n} and within 0.05 of the one-constant map on >= 7): {V['H134']}"
          f" (above sqrt {V['H134_sqrt']}, within 0.05 of one-constant {V['H134_one']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
