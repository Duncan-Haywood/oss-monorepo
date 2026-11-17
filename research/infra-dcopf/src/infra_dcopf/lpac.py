"""LPAC-C: the cold-start linear-programming approximation of AC power flow (milestone 4a of
research/grid-linopf), as a one-shot dispatch baseline.

Coffrin and Van Hentenryck, "A linear-programming approximation of AC power flows", INFORMS J.
Computing 26(4):718-734, 2014 (doi:10.1287/ijoc.2014.0594), in the form PowerModels.jl implements
as LPACCPowerModel (Coffrin et al., PSCC 2018): per bus an angle theta and a voltage deviation phi
(|V| = 1 + phi); per branch a cosine variable cs. The AC branch model (MATPOWER's, with taps and
phase shifts) is written in the lifted terms
    w_i  = |V_i|^2                       -> 1 + 2 phi_i
    wr_ij = |V_i||V_j| cos(theta_i - theta_j) -> cs_ij + phi_i + phi_j
    wi_ij = |V_i||V_j| sin(theta_i - theta_j) -> theta_i - theta_j
so every flow is linear. The cosine is bounded by PowerModels' relaxation
    cos(delta) <= cs <= 1 - (1 - cos delta) / delta^2 * (theta_i - theta_j)^2,
delta the branch's largest angle limit (capped at 90 deg). Thermal limits p^2 + q^2 <= RATE_A^2 at
both ends, unit P and Q limits, bus |V| limits through phi, angle-difference limits, the case's
quadratic costs. Clarabel solves it as a conic QP (cosine and thermal rows as second-order cones).

branch_terms() gives the coefficients of each end's (p, q) in (w_from, w_to, wr, wi); flows_exact()
evaluates them with the exact trigonometric terms, which the tests compare with PYPOWER's flows.
"""
import numpy as np
from scipy.sparse import coo_matrix, csc_matrix
from pypower.idx_brch import ANGMAX, ANGMIN, BR_B, BR_R, BR_STATUS, BR_X, F_BUS, RATE_A, SHIFT, T_BUS, TAP
from pypower.idx_bus import BS, BUS_I, BUS_TYPE, GS, PD, QD, REF, VMAX, VMIN
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PMAX, PMIN, QMAX, QMIN

from .aclin import quad_costs

DELTA_CAP = np.deg2rad(90.0)


def branch_terms(ppc):
    """For in-service branches: (idx, f, t, C) with C[k] a 4x4 array, rows (pf, qf, pt, qt) and
    columns (w_f, w_t, wr, wi), per unit; f, t are bus row positions."""
    br, bus = ppc["branch"], ppc["bus"]
    pos = {int(b): i for i, b in enumerate(bus[:, BUS_I])}
    idx = np.where(br[:, BR_STATUS] > 0)[0]
    r, x, bsh = br[idx, BR_R], br[idx, BR_X], br[idx, BR_B]
    tap = np.where(br[idx, TAP] == 0, 1.0, br[idx, TAP])
    sh = np.deg2rad(br[idx, SHIFT])
    z2 = r * r + x * x
    g, b = r / z2, -x / z2
    tr, ti, tm2 = tap * np.cos(sh), tap * np.sin(sh), tap * tap
    bfr = bto = bsh / 2.0
    C = np.zeros((len(idx), 4, 4))
    # from end (PowerModels ACP: sin term in (theta_f - theta_t))
    C[:, 0, 0] = g / tm2
    C[:, 0, 2] = (-g * tr + b * ti) / tm2
    C[:, 0, 3] = (-b * tr - g * ti) / tm2
    C[:, 1, 0] = -(b + bfr) / tm2
    C[:, 1, 2] = -(-b * tr - g * ti) / tm2
    C[:, 1, 3] = (-g * tr + b * ti) / tm2
    # to end (sin term in (theta_t - theta_f) = -wi)
    C[:, 2, 1] = g
    C[:, 2, 2] = (-g * tr - b * ti) / tm2
    C[:, 2, 3] = -(-b * tr + g * ti) / tm2
    C[:, 3, 1] = -(b + bto)
    C[:, 3, 2] = -(-b * tr + g * ti) / tm2
    C[:, 3, 3] = -(-g * tr - b * ti) / tm2
    f = np.array([pos[int(v)] for v in br[idx, F_BUS]], dtype=int)
    t = np.array([pos[int(v)] for v in br[idx, T_BUS]], dtype=int)
    return idx, f, t, C


def flows_exact(ppc, vm, va_rad):
    """(pf, qf, pt, qt) in MW/MVAr for in-service branches from bus voltages, exact AC terms."""
    idx, f, t, C = branch_terms(ppc)
    d = va_rad[f] - va_rad[t]
    w = np.stack([vm[f] ** 2, vm[t] ** 2, vm[f] * vm[t] * np.cos(d), vm[f] * vm[t] * np.sin(d)], axis=1)
    return np.einsum("kij,kj->ki", C, w) * ppc["baseMVA"], idx


def delta_of(ppc, idx):
    """Per-branch cosine domain: the largest angle limit, 90 deg when unlimited or larger."""
    br = ppc["branch"]
    a = np.maximum(np.abs(br[idx, ANGMIN]), np.abs(br[idx, ANGMAX]))
    a = np.where((a <= 0) | (a >= 360), 90.0, a)
    return np.minimum(np.deg2rad(a), DELTA_CAP)


def solve(ppc, solver="clarabel"):
    """Solve LPAC-C (solver "clarabel", or "scs" as a second opinion). Returns a dict with ok, status, pg (MW), vg (|V| = 1 + phi at each unit's bus),
    vm, va (deg), obj (the case's cost of pg, $/h) and the per-unit cs, or ok False."""
    import clarabel

    bus, gen = ppc["bus"], ppc["gen"]
    base = ppc["baseMVA"]
    nb = bus.shape[0]
    pos = {int(b): i for i, b in enumerate(bus[:, BUS_I])}
    live = np.where(gen[:, GEN_STATUS] > 0)[0]
    ng = len(live)
    gbus = np.array([pos[int(b)] for b in gen[live, GEN_BUS]], dtype=int)
    idx, f, t, C = branch_terms(ppc)
    nl = len(idx)
    # variable offsets
    o_va, o_phi, o_cs, o_pg, o_qg = 0, nb, 2 * nb, 2 * nb + nl, 2 * nb + nl + ng
    o_fl = 2 * nb + nl + 2 * ng           # pf, qf, pt, qt blocks of nl each
    n = o_fl + 4 * nl

    rows_eq, cols_eq, vals_eq, b_eq = [], [], [], []
    r = [0]

    def eq(cols, vals, rhs):
        rows_eq.extend([r[0]] * len(cols))
        cols_eq.extend(cols)
        vals_eq.extend(vals)
        b_eq.append(rhs)
        r[0] += 1

    ref = np.where(bus[:, BUS_TYPE] == REF)[0]
    eq([o_va + int(ref[0])], [1.0], 0.0)
    # flow definitions: flow - C @ [1+2phi_f, 1+2phi_t, cs+phi_f+phi_t, th_f-th_t] = 0
    for k in range(nl):
        fk, tk = int(f[k]), int(t[k])
        for e in range(4):
            c = C[k, e]
            cols = [o_fl + e * nl + k, o_phi + fk, o_phi + tk, o_cs + k, o_va + fk, o_va + tk]
            vals = [1.0, -(2 * c[0] + c[2]), -(2 * c[1] + c[2]), -c[2], -c[3], c[3]]
            eq(cols, vals, c[0] + c[1])
    # bus balance: sum gen - load - shunt*(1+2phi) - sum flows out = 0
    gs, bs = bus[:, GS] / base, bus[:, BS] / base
    pd, qd = bus[:, PD] / base, bus[:, QD] / base
    for i in range(nb):
        out_f, out_t = np.where(f == i)[0], np.where(t == i)[0]
        gi = np.where(gbus == i)[0]
        cols = list(o_pg + gi) + [o_phi + i] + list(o_fl + out_f) + list(o_fl + 2 * nl + out_t)
        vals = [1.0] * len(gi) + [-2 * gs[i]] + [-1.0] * (len(out_f) + len(out_t))
        eq(cols, vals, pd[i] + gs[i])
        cols = list(o_qg + gi) + [o_phi + i] + list(o_fl + nl + out_f) + list(o_fl + 3 * nl + out_t)
        vals = [1.0] * len(gi) + [2 * bs[i]] + [-1.0] * (len(out_f) + len(out_t))
        eq(cols, vals, qd[i] - bs[i])
    A_eq = coo_matrix((vals_eq, (rows_eq, cols_eq)), shape=(r[0], n))

    # inequalities A x <= b (Nonnegative cone on b - A x)
    ri, ci, vi, bi = [], [], [], []
    m = [0]

    def le(cols, vals, rhs):
        ri.extend([m[0]] * len(cols))
        ci.extend(cols)
        vi.extend(vals)
        bi.append(rhs)
        m[0] += 1

    for i in range(nb):
        le([o_phi + i], [1.0], bus[i, VMAX] - 1.0)
        le([o_phi + i], [-1.0], 1.0 - bus[i, VMIN])
    for j, k in enumerate(live):
        le([o_pg + j], [1.0], gen[k, PMAX] / base)
        le([o_pg + j], [-1.0], -gen[k, PMIN] / base)
        le([o_qg + j], [1.0], gen[k, QMAX] / base)
        le([o_qg + j], [-1.0], -gen[k, QMIN] / base)
    br = ppc["branch"]
    delta = delta_of(ppc, idx)
    for k in range(nl):
        fk, tk = int(f[k]), int(t[k])
        lo, hi = br[idx[k], ANGMIN], br[idx[k], ANGMAX]
        if -360 < hi < 360:
            le([o_va + fk, o_va + tk], [1.0, -1.0], np.deg2rad(hi))
        if -360 < lo < 360:
            le([o_va + fk, o_va + tk], [-1.0, 1.0], -np.deg2rad(lo))
        le([o_cs + k], [-1.0], -np.cos(delta[k]))
    A_le = coo_matrix((vi, (ri, ci)), shape=(m[0], n))

    # second-order cones: cosine relaxation and thermal limits, 3 rows each
    rs, cs_, vs, bsoc = [], [], [], []
    s = [0]
    for k in range(nl):
        fk, tk = int(f[k]), int(t[k])
        kk = (1.0 - np.cos(delta[k])) / delta[k] ** 2
        a = 2.0 * np.sqrt(kk)
        # s = [2 - cs, a (th_f - th_t), -cs]
        rs += [s[0], s[0] + 1, s[0] + 1, s[0] + 2]
        cs_ += [o_cs + k, o_va + fk, o_va + tk, o_cs + k]
        vs += [1.0, -a, a, 1.0]
        bsoc += [2.0, 0.0, 0.0]
        s[0] += 3
    rated = [k for k in range(nl) if br[idx[k], RATE_A] > 0]
    for k in rated:
        rate = br[idx[k], RATE_A] / base
        for e0 in (0, 2):  # from end (pf, qf), to end (pt, qt)
            rs += [s[0] + 1, s[0] + 2]
            cs_ += [o_fl + e0 * nl + k, o_fl + (e0 + 1) * nl + k]
            vs += [-1.0, -1.0]
            bsoc += [rate, 0.0, 0.0]
            s[0] += 3
    A_soc = coo_matrix((vs, (rs, cs_)), shape=(s[0], n))

    from scipy.sparse import vstack, triu
    A = vstack([A_eq, A_le, A_soc]).tocsc()
    b = np.concatenate([b_eq, bi, bsoc])
    cones = [clarabel.ZeroConeT(A_eq.shape[0]), clarabel.NonnegativeConeT(A_le.shape[0])]
    cones += [clarabel.SecondOrderConeT(3)] * (s[0] // 3)

    c2, c1 = quad_costs(ppc)
    scale = 1.0 / max(1.0, float(np.max(np.abs(c1[live]) * base)))  # objective scaling only
    P = np.zeros(n)
    q = np.zeros(n)
    P[o_pg:o_pg + ng] = 2.0 * c2[live] * base * base * scale
    q[o_pg:o_pg + ng] = c1[live] * base * scale
    Pm = csc_matrix((P, (np.arange(n), np.arange(n))), shape=(n, n))
    if solver == "scs":
        # second opinion (milestone 4a audit): the same conic data solved by SCS 3
        import scs
        data = {"P": triu(Pm).tocsc(), "A": A, "b": b, "c": q}
        cone = {"z": A_eq.shape[0], "l": A_le.shape[0], "q": [3] * (s[0] // 3)}
        res = scs.SCS(data, cone, verbose=False, eps_abs=1e-7, eps_rel=1e-7, max_iters=200000).solve()
        status = str(res["info"]["status"])
        ok = status in ("solved", "solved_inaccurate")
        x = np.asarray(res["x"], float)
    else:
        st = clarabel.DefaultSettings()
        st.verbose = False
        sol = clarabel.DefaultSolver(triu(Pm).tocsc(), q, A, b, cones, st).solve()
        status = str(sol.status)
        ok = status in ("Solved", "AlmostSolved")
        x = np.asarray(sol.x, float)
    out = {"ok": ok, "status": status}
    if not ok:
        return out
    pg = np.zeros(gen.shape[0])
    pg[live] = x[o_pg:o_pg + ng] * base
    phi = x[o_phi:o_phi + nb]
    vm = 1.0 + phi
    vg = np.ones(gen.shape[0])
    vg[live] = vm[gbus]
    from pypower.totcost import totcost
    out.update(pg=pg, vg=vg, vm=vm, va=np.rad2deg(x[o_va:o_va + nb]), cs=x[o_cs:o_cs + nl],
               qg=x[o_qg:o_qg + ng] * base,
               obj=float(totcost(ppc["gencost"][live], pg[live]).sum()),
               losses=float(pg.sum() - bus[:, PD].sum()))
    return out
