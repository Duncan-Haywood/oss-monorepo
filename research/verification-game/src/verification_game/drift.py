"""Tolerance/stake design under floating-point drift (stdlib only).

Honest replicas disagree by Gaussian drift with scale sigma (non-bitwise
reproducible kernels). A dispute fires when |drift| > tau, so honest solvers
are falsely slashed w.p. p_fp(tau) = 2(1 - Phi(tau/sigma)). A cheater can hide
a deviation of size tau, saving kappa*tau, and imposing harm rho*tau.
Tighter tau => fewer hidden cheats but more false slashes (cf. the
property-elicitation study of drift thresholds in this monorepo).
"""
import math
from dataclasses import dataclass


def _tail(z):
    return math.erfc(z / math.sqrt(2))  # 2(1-Phi(z))


@dataclass(frozen=True)
class DriftModel:
    sigma: float = 1.0
    kappa: float = 1.0     # saving per unit hidden deviation
    rho: float = 5.0       # harm per unit hidden deviation
    margin: float = 1.0    # solver's net honest margin R - c_h
    k: float = 0.05        # check cost
    lam: float = 0.5
    dispute_cost: float = 1.0  # social cost of a (false) dispute
    eps_max: float = 0.05  # max tolerated cheat rate
    capital: float = 0.002  # per-task cost of locking one unit of stake

    def p_fp(self, tau):
        return _tail(tau / self.sigma)

    def evaluate(self, tau, S):
        """Returns dict or None if infeasible (participation or cheat-rate)."""
        pfp = self.p_fp(tau)
        if self.margin - pfp * S < 0:        # honest solver would exit
            return None
        x = self.k / (self.lam * S)          # equilibrium cheat rate (h=0)
        if x > self.eps_max or x > 1:
            return None
        s = self.kappa * tau
        y = s / (s + S)
        loss = y * self.k + pfp * self.dispute_cost + x * self.rho * tau + self.capital * S
        return dict(tau=tau, S=S, p_fp=pfp, cheat=x, audit=y, loss=loss)


def design_frontier(m: DriftModel, taus, Ss):
    out = []
    for t in taus:
        for S in Ss:
            r = m.evaluate(t, S)
            if r:
                out.append(r)
    return out


def best_design(m: DriftModel, taus, Ss):
    f = design_frontier(m, taus, Ss)
    return min(f, key=lambda r: r["loss"]) if f else None
