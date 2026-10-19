"""Does reject-and-retry rescue a robust topology optimisation that a fixed move limit of 0.2 breaks?

The robust loop of ``simdesign_robustadapt.robust_adaptive`` is re-written with one change. After
evaluating the field produced by an optimality-criteria (OC) update, if its worst-case compliance
exceeds ``spike`` times the previous accepted iteration's, the update is thrown away: the OC step is
redone from the previous field (same gradient) at half the move, up to ``max_retry`` times and down to
``mmin``. The halved move then stays, and grows back by ``grow`` after ``calm`` calm iterations.
With ``spike=inf`` no step is ever rejected and the run equals a fixed ``move0`` run.
"""
import os, sys
HERE = os.path.dirname(__file__)
for p in ("simdesign-robustadapt", "simdesign-robust", "simdesign-robustmove", "simdesign-heaviside", "simdesign-robustradius", "simdesign-topopt"):
    sys.path.insert(0, os.path.join(HERE, "..", "..", "..", p, "src"))
import numpy as np
from simdesign_heaviside import density_filter_matrix, project, dproject, grey_share  # noqa: E402
from simdesign_topopt import fe_compliance, mbb_problem  # noqa: E402
from simdesign_robustmove import spikes, failed  # noqa: E402
from simdesign_robustadapt import MoveRule, fixed, D_EVAL  # noqa: E402


def oc_update(x, dcdx, dvdx, Hn, beta, move, volfrac):
    """Bisection OC step with move limit ``move`` (same formula as simdesign-robustadapt)."""
    l1, l2 = 0.0, 1e9
    while (l2 - l1) / (l1 + l2) > 1e-4:
        lmid = 0.5 * (l1 + l2)
        xnew = np.clip(x * np.sqrt(np.maximum(-dcdx, 0) / (lmid * dvdx)),
                       np.maximum(0.0, x - move), np.minimum(1.0, x + move))
        if project(Hn @ xnew, beta, 0.5).mean() > volfrac:
            l1 = lmid
        else:
            l2 = lmid
    return xnew


def robust_retry(nelx, nely, rmin, move0=0.2, spike=3.0, mmin=0.025, max_retry=3, grow=1.25, calm=10,
                 volfrac=0.5, penal=3.0, betas=(1, 2, 4, 8, 16, 32, 64), iters_per_beta=30, d_eta=0.2):
    """Robust (eroded / blueprint / dilated) compliance minimisation with reject-and-retry.
    Returns the final filtered field, beta, accepted-iteration history, move used per accepted
    iteration, the number of rejected steps and the number of finite-element evaluations."""
    etas = (0.5 + d_eta, 0.5, 0.5 - d_eta)
    f, fixed_dofs = mbb_problem(nelx, nely)
    Hn = density_filter_matrix(nelx, nely, rmin)
    x = np.full(nelx * nely, volfrac)
    hist, moves, prev = [], [], None
    move, calm_n, rejects, evals = move0, 0, 0, 0
    for beta in [b for b in betas for _ in range(iters_per_beta)]:
        tries = 0
        while True:
            xt = Hn @ x
            cs, dcs = [], []
            for eta in etas:
                xp = project(xt, beta, eta)
                c, _, dc = fe_compliance(xp.reshape(nely, nelx), nelx, nely, f, fixed_dofs, penal)
                cs.append(c); dcs.append(dc.reshape(-1) * dproject(xt, beta, eta))
            evals += 1
            k = int(np.argmax(cs))
            if prev is not None and cs[k] > spike * hist[-1] and tries < max_retry and move / 2 >= mmin:
                px, pd, pv, pbeta = prev
                move, tries, calm_n = move / 2, tries + 1, 0
                x = oc_update(px, pd, pv, Hn, pbeta, move, volfrac)
                rejects += 1
                continue
            break
        hist.append(cs[k]); moves.append(move)
        dcdx = Hn.T @ dcs[k]
        dvdx = np.maximum(Hn.T @ dproject(xt, beta, 0.5), 1e-9)
        prev = (x, dcdx, dvdx, beta)
        if tries == 0:
            calm_n += 1
            if calm_n >= calm:
                move, calm_n = min(move0, move * grow), 0
        x = oc_update(x, dcdx, dvdx, Hn, beta, move, volfrac)
    return {"xt": Hn @ x, "beta": beta, "history": hist, "moves": moves, "rejects": rejects, "evals": evals}


def run_retry(nx, ny, rmin, **kw):
    """One run, re-analysed at thresholds 0.5 +/- 0.2 like the earlier projects."""
    r = robust_retry(nx, ny, rmin, **kw)
    f, fx = mbb_problem(nx, ny)
    fields = [project(r["xt"], r["beta"], e) for e in (0.5 + D_EVAL, 0.5, 0.5 - D_EVAL)]
    cs = [fe_compliance(p.reshape(ny, nx), nx, ny, f, fx, 3.0)[0] for p in fields]
    n_spike, max_ratio = spikes(r["history"])
    return {"c_e": cs[0], "c_b": cs[1], "c_d": cs[2], "grey": grey_share(fields[1]), "n_spike": n_spike,
            "max_ratio": max_ratio, "history": r["history"], "moves": r["moves"], "mean_move": float(np.mean(r["moves"])),
            "rejects": r["rejects"], "evals": r["evals"]}
