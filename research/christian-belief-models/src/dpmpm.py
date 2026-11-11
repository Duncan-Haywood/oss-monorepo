"""Truncated Dirichlet-process mixture of product multinomials (DPMPM) for categorical imputation.

The model of Dunson and Xing (2009, JASA, doi:10.1198/jasa.2009.tm08439) as used for survey
imputation by Si and Reiter (2013, J. Educ. Behav. Stat., doi:10.3102/1076998613480394): every
variable is categorical; within latent class k the variables are independent with probabilities
phi[k, j, :]; the class weights follow a stick-breaking prior truncated at K classes, with
concentration alpha ~ Gamma(a_alpha, b_alpha). Missing cells are ignorable (missing at random), so
the Gibbs sampler conditions on the observed cells only: a missing cell contributes a factor of 1 to
its row's class likelihood and nothing to the counts. Imputations are draws from phi[z_i, j, :].

Blocked Gibbs sampler (Ishwaran and James 2001, JASA, doi:10.1198/016214501750332758):
  z_i | . ∝ pi_k prod_{j observed} phi[k, j, x_ij]
  phi[k, j, :] | . ~ Dirichlet(a_phi + counts of x_ij among rows with z_i = k)
  V_k | . ~ Beta(1 + n_k, alpha + sum_{l > k} n_l),  V_K = 1,  pi_k = V_k prod_{l < k} (1 - V_l)
  alpha | . ~ Gamma(a_alpha + K - 1, b_alpha - log pi_K)

Stdlib + numpy only. X is an (N, J) integer array, x_ij in 0..L_j - 1, or -1 where missing.
"""
import numpy as np


class DPMPM:
    def __init__(self, X, levels, K=30, a_phi=1.0, a_alpha=0.25, b_alpha=0.25, seed=0):
        X = np.asarray(X, dtype=np.int64)
        self.N, self.J = X.shape
        self.L = np.asarray(levels, dtype=np.int64)
        if (X.max(0) >= self.L).any() or (X < -1).any():
            raise ValueError('a code is >= its number of levels')
        self.K, self.a_phi, self.a_alpha, self.b_alpha = K, a_phi, a_alpha, b_alpha
        self.rng = np.random.default_rng(seed)
        # Missing coded as level L_j: its log-probability column is fixed at 0.
        self.Xm = np.where(X < 0, self.L[None, :], X)
        self.obs = X >= 0
        self.alpha = 1.0
        self.pi = np.full(K, 1.0 / K)
        self.phi = [self.rng.dirichlet(np.ones(l), size=K) for l in self.L]
        self.z = self.rng.integers(0, K, self.N)

    def _loglik(self):
        """(N, K) log p(x_i observed | z_i = k)."""
        ll = np.zeros((self.N, self.K))
        for j in range(self.J):
            lp = np.hstack([np.log(self.phi[j]), np.zeros((self.K, 1))])  # (K, L_j + 1)
            ll += lp[:, self.Xm[:, j]].T
        return ll

    def step(self):
        rng, K = self.rng, self.K
        # z: Gumbel-max sampling from the class posterior.
        lp = self._loglik() + np.log(self.pi)[None, :]
        self.z = np.argmax(lp + rng.gumbel(size=lp.shape), axis=1)
        # phi
        for j in range(self.J):
            o = self.obs[:, j]
            c = np.bincount(self.z[o] * self.L[j] + self.Xm[o, j], minlength=K * self.L[j]).reshape(K, self.L[j])
            g = rng.gamma(self.a_phi + c)
            self.phi[j] = np.maximum(g / g.sum(1, keepdims=True), 1e-300)
        # stick-breaking weights
        n = np.bincount(self.z, minlength=K).astype(float)
        tail = np.concatenate([np.cumsum(n[::-1])[::-1][1:], [0.0]])
        V = rng.beta(1 + n, self.alpha + tail)
        V[-1] = 1.0
        V = np.clip(V, 1e-12, 1 - 1e-12); V[-1] = 1.0
        self.pi = V * np.concatenate([[1.0], np.cumprod(1 - V[:-1])])
        self.pi = np.maximum(self.pi, 1e-300); self.pi /= self.pi.sum()
        # alpha
        self.alpha = rng.gamma(self.a_alpha + K - 1, 1.0 / (self.b_alpha - np.log(self.pi[-1])))
        return self

    def occupied(self):
        return int((np.bincount(self.z, minlength=self.K) > 0).sum())

    def prob(self, rows, j):
        """(len(rows), L_j) predictive probabilities of variable j given the row's current class."""
        return self.phi[j][self.z[rows]]

    def posterior_prob(self, rows, j):
        """(len(rows), L_j) p(x_j | observed cells of the row), integrating the class out at the current
        parameters (excludes variable j's own cell, which is missing for imputed rows)."""
        lp = self._loglik()[rows] + np.log(self.pi)[None, :]
        lp -= lp.max(1, keepdims=True)
        w = np.exp(lp); w /= w.sum(1, keepdims=True)
        return w @ self.phi[j]

    def impute(self, rows, j):
        """One draw of variable j for each row, from phi[z_i, j, :]."""
        p = self.prob(rows, j)
        u = self.rng.random((len(rows), 1))
        return (p.cumsum(1) < u).sum(1)
