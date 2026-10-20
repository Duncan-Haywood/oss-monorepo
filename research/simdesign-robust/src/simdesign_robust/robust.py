"""Robust (eroded / blueprint / dilated) projection topology optimisation.

Builds on ``simdesign-heaviside`` (density filter, tanh projection, measures), imported rather
than copied. New here: the three-field robust formulation after Wang, Lazarov and Sigmund (2011),
"On projection methods, convergence and robust formulations in topology optimization", Struct.
Multidisc. Optim. 43(6):767-784. The same filtered field xt is projected with three thresholds,
eta_e > eta_b = 0.5 > eta_d (eroded, blueprint, dilated). The optimiser minimises the worst of the
three compliances (almost always the eroded one) with the volume fraction on the blueprint.
Independent re-implementation from the published idea; no code copied.
"""
import os, sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "simdesign-heaviside", "src"))
from simdesign_heaviside import density_filter_matrix, project, dproject  # noqa: E402
from simdesign_topopt import fe_compliance, mbb_problem  # noqa: E402


def robust_topopt(nelx, nely, volfrac, rmin, problem=mbb_problem, penal=3.0,
                  betas=(1, 2, 4, 8, 16, 32, 64), iters_per_beta=30, d_eta=0.2, move=0.2):
    """Worst-case-of-three compliance minimisation with beta continuation.

    d_eta = 0 makes the three thresholds equal, i.e. the plain Heaviside formulation of
    ``simdesign-heaviside`` (the same fields, 3x the work). Returns design x, filtered xt, the three
    projected fields at the final beta, compliances of the three, and the history of the worst.
    """
    etas = (0.5 + d_eta, 0.5, 0.5 - d_eta)  # eroded, blueprint, dilated
    f, fixed = problem(nelx, nely)
    Hn = density_filter_matrix(nelx, nely, rmin)
    x = np.full(nelx * nely, volfrac)
    hist = []
    schedule = [b for b in betas for _ in range(iters_per_beta)]
    for beta in schedule:
        xt = Hn @ x
        cs, dcs = [], []
        for eta in etas:
            xp = project(xt, beta, eta)
            c, _, dc = fe_compliance(xp.reshape(nely, nelx), nelx, nely, f, fixed, penal)
            cs.append(c); dcs.append(dc.reshape(-1) * dproject(xt, beta, eta))
        k = int(np.argmax(cs))
        hist.append(cs[k])
        dcdx = Hn.T @ dcs[k]
        dpr_b = dproject(xt, beta, 0.5)
        dvdx = np.maximum(Hn.T @ dpr_b, 1e-9)
        l1, l2 = 0.0, 1e9
        while (l2 - l1) / (l1 + l2) > 1e-4:
            lmid = 0.5 * (l1 + l2)
            xnew = np.clip(x * np.sqrt(np.maximum(-dcdx, 0) / (lmid * dvdx)),
                           np.maximum(0.0, x - move), np.minimum(1.0, x + move))
            if project(Hn @ xnew, beta, 0.5).mean() > volfrac:
                l1 = lmid
            else:
                l2 = lmid
        x = xnew
    beta = schedule[-1]
    xt = Hn @ x
    fields = [project(xt, beta, e) for e in etas]
    cs = [fe_compliance(p.reshape(nely, nelx), nelx, nely, f, fixed, penal)[0] for p in fields]
    return {"x": x.reshape(nely, nelx), "xt": xt.reshape(nely, nelx),
            "eroded": fields[0].reshape(nely, nelx), "blueprint": fields[1].reshape(nely, nelx),
            "dilated": fields[2].reshape(nely, nelx), "c_eroded": cs[0], "c_blueprint": cs[1],
            "c_dilated": cs[2], "history": hist, "beta": beta}
