"""Can an adaptive optimality-criteria move limit match a fixed small one in robust topology optimisation?

The robust loop of ``simdesign_robust.robust_topopt`` is re-written here (same formulas, imported
building blocks) with one change: the move limit may change from iteration to iteration. Rule
``adaptive``: start at ``move0``; after an iteration whose worst-case compliance exceeds
``spike`` times the previous one, halve the move (floor ``mmin``); after ``calm`` consecutive
iterations without a spike, multiply it by ``grow`` (cap ``move0``).
"""
import os, sys
HERE = os.path.dirname(__file__)
for p in ("simdesign-robust", "simdesign-robustmove", "simdesign-heaviside", "simdesign-robustradius", "simdesign-topopt"):
    sys.path.insert(0, os.path.join(HERE, "..", "..", "..", p, "src"))
import numpy as np
from simdesign_heaviside import density_filter_matrix, project, dproject, grey_share  # noqa: E402
from simdesign_topopt import fe_compliance, mbb_problem  # noqa: E402
from simdesign_robustmove import spikes, failed  # noqa: E402

D_EVAL = 0.2


class MoveRule:
    """Move-limit schedule. ``fixed(m)`` never changes; ``adaptive(...)`` shrinks after a spike."""

    def __init__(self, move0=0.2, adaptive=False, spike=3.0, mmin=0.025, grow=1.25, calm=10):
        self.move0, self.adaptive, self.spike, self.mmin, self.grow, self.calm = move0, adaptive, spike, mmin, grow, calm
        self.move, self._calm = move0, 0

    def update(self, prev, cur):
        """Call after each iteration with the previous and current worst-case compliance."""
        if not self.adaptive or prev is None:
            return self.move
        if cur > self.spike * prev:
            self.move, self._calm = max(self.mmin, self.move / 2), 0
        else:
            self._calm += 1
            if self._calm >= self.calm:
                self.move, self._calm = min(self.move0, self.move * self.grow), 0
        return self.move


def fixed(m):
    return MoveRule(move0=m)


def robust_adaptive(nelx, nely, rmin, rule, volfrac=0.5, penal=3.0,
                    betas=(1, 2, 4, 8, 16, 32, 64), iters_per_beta=30, d_eta=0.2):
    """Worst-of-three (eroded / blueprint / dilated) compliance minimisation, beta continuation,
    with the move limit supplied by ``rule``. Returns the final filtered field, beta and histories."""
    etas = (0.5 + d_eta, 0.5, 0.5 - d_eta)
    f, fixed_dofs = mbb_problem(nelx, nely)
    Hn = density_filter_matrix(nelx, nely, rmin)
    x = np.full(nelx * nely, volfrac)
    hist, moves = [], []
    for beta in [b for b in betas for _ in range(iters_per_beta)]:
        xt = Hn @ x
        cs, dcs = [], []
        for eta in etas:
            xp = project(xt, beta, eta)
            c, _, dc = fe_compliance(xp.reshape(nely, nelx), nelx, nely, f, fixed_dofs, penal)
            cs.append(c); dcs.append(dc.reshape(-1) * dproject(xt, beta, eta))
        k = int(np.argmax(cs))
        hist.append(cs[k])
        move = rule.move
        moves.append(move)
        dcdx = Hn.T @ dcs[k]
        dvdx = np.maximum(Hn.T @ dproject(xt, beta, 0.5), 1e-9)
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
        rule.update(hist[-2] if len(hist) > 1 else None, hist[-1])
    return {"xt": (Hn @ x), "beta": beta, "history": hist, "moves": moves}


def run_rule(nx, ny, rmin, rule, **kw):
    """One run, re-analysed at thresholds 0.5 +/- 0.2 like the earlier projects."""
    r = robust_adaptive(nx, ny, rmin, rule, **kw)
    f, fx = mbb_problem(nx, ny)
    fields = [project(r["xt"], r["beta"], e) for e in (0.5 + D_EVAL, 0.5, 0.5 - D_EVAL)]
    cs = [fe_compliance(p.reshape(ny, nx), nx, ny, f, fx, 3.0)[0] for p in fields]
    n_spike, max_ratio = spikes(r["history"])
    return {"c_e": cs[0], "c_b": cs[1], "c_d": cs[2], "grey": grey_share(fields[1]), "n_spike": n_spike,
            "max_ratio": max_ratio, "history": r["history"], "moves": r["moves"], "mean_move": float(np.mean(r["moves"]))}
