"""Two structural alternatives to a single divorce hazard.

cure <lens>     Mixture cure model: a share of marriages is "never at risk" of dissolution
                (logistic incidence, P(susceptible | x)) and the susceptible ones dissolve on a
                Weibull proportional-hazards clock (latency | x). Fitted by penalised maximum
                likelihood on the same person folds; compared held out with a Weibull PH model
                without a cure fraction and with the lens's Poisson GLM and tuned LightGBM on the
                per-marriage log-likelihood of the observed follow-up (all are densities of the
                same continuous time), Harrell's C and the integrated Brier score (years 1-10).
                Needs <scratch>/flex_data/surv_<lens>.npz (export_survival.py) and the main-stage
                cache (row-level held-out rates).
competing <lens> Divorce vs widowhood (cause-specific hazards): the lens's GLM and LightGBM are
                fitted for each cause; the cumulative incidence of divorce with death of a spouse
                as a competing event is compared with the usual 1 - exp(-H_divorce) (widowhood
                treated as censoring) and with the held-out Aalen-Johansen estimate.

Writes results/<lens>.json keys 'cure_model' / 'competing_risks'.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import flex  # noqa: E402
from lenses import _common as c  # noqa: E402

RESULTS = HERE.parent / 'results'
CACHE = Path(os.environ.get('FLEX_CACHE', '/tmp/flex_cache'))


def save(lens, key, value):
    p = RESULTS / f'{lens}.json'
    d = json.loads(p.read_text())
    from run_lens import jsonable
    d[key] = jsonable(value)
    p.write_text(json.dumps(d, indent=1))


# ----------------------------------------------------------------------------- cure model
class Cure:
    """Mixture cure: pi(x) = sigmoid(b0 + x b); S_u(t|x) = exp(-exp(a + x g) t^k)."""

    def __init__(self, cure=True, l2=1.0):
        self.cure, self.l2 = cure, l2

    def _unpack(self, th, p):
        if self.cure:
            b0, b, a, lk, g = th[0], th[1:p + 1], th[p + 1], th[p + 2], th[p + 3:]
        else:
            b0, b, a, lk, g = 30.0, np.zeros(p), th[0], th[1], th[2:]
        return b0, b, a, lk, g

    def nll(self, th, X, t, d, w):
        p = X.shape[1]
        b0, b, a, lk, g = self._unpack(th, p)
        k = np.exp(lk)
        eta = np.clip(b0 + X @ b, -30, 30)
        pi = 1 / (1 + np.exp(-eta))
        theta = np.clip(a + X @ g, -30, 30)
        lt = np.log(t)
        Lam = np.exp(theta + k * lt)
        S = np.exp(-Lam)
        A = np.maximum(1 - pi + pi * S, 1e-300)
        ev = d > 0
        ll = np.where(ev, np.log(np.maximum(pi, 1e-300)) + lk + (k - 1) * lt + theta - Lam, np.log(A))
        # gradients
        g_eta = np.where(ev, 1 - pi, -pi * (1 - pi) * (1 - S) / A)
        g_theta = np.where(ev, 1 - Lam, -pi * Lam * S / A)
        g_lk = np.where(ev, 1 + k * lt * (1 - Lam), -pi * S * Lam * k * lt / A)
        W = w / w.sum()
        f = -np.dot(W, ll)
        grad_parts = []
        if self.cure:
            grad_parts += [[-np.dot(W, g_eta)], -(X.T @ (W * g_eta))]
        grad_parts += [[-np.dot(W, g_theta)], [-np.dot(W, g_lk)], -(X.T @ (W * g_theta))]
        grad = np.concatenate([np.atleast_1d(np.asarray(x, float)) for x in grad_parts])
        pen = self.l2 / len(t)
        coef = np.concatenate([b, g]) if self.cure else g
        f += 0.5 * pen * np.dot(coef, coef)
        if self.cure:
            grad[1:p + 1] += pen * b
            grad[p + 3:] += pen * g
        else:
            grad[2:] += pen * g
        return f, grad

    def fit(self, X, t, d, w):
        p = X.shape[1]
        rate = d.sum() / t.sum()
        th0 = (np.r_[0.5, np.zeros(p), np.log(rate), 0.0, np.zeros(p)] if self.cure else np.r_[np.log(rate), 0.0, np.zeros(p)])
        r = minimize(self.nll, th0, args=(X, t, d, w), jac=True, method='L-BFGS-B', options=dict(maxiter=3000))
        self.th, self.p, self.converged = r.x, p, bool(r.success)
        return self

    def parts(self, X):
        b0, b, a, lk, g = self._unpack(self.th, self.p)
        pi = 1 / (1 + np.exp(-np.clip(b0 + X @ b, -30, 30)))
        return pi, np.clip(a + X @ g, -30, 30), np.exp(lk)

    def loglik(self, X, t, d):
        pi, theta, k = self.parts(X)
        Lam = np.exp(theta + k * np.log(t))
        S = np.exp(-Lam)
        return np.where(d > 0, np.log(np.maximum(pi, 1e-300)) + np.log(k) + (k - 1) * np.log(t) + theta - Lam,
                        np.log(np.maximum(1 - pi + pi * S, 1e-300)))

    def surv(self, X, times):
        pi, theta, k = self.parts(X)
        Su = np.exp(-np.exp(theta[:, None] + k * np.log(times)[None, :]))
        return 1 - pi[:, None] + pi[:, None] * Su


def ibs(S, T, D, times):
    """IPCW integrated Brier score over `times` (Graf et al.), censoring KM from the same data."""
    order = np.argsort(T)
    ts, cs = T[order], 1 - D[order]
    uniq, idx = np.unique(ts, return_index=True)
    cens = np.add.reduceat(cs, idx)
    out = np.add.reduceat(np.ones_like(cs), idx)
    at = len(ts) - np.r_[0, np.cumsum(out)[:-1]]
    G = np.cumprod(1 - cens / at)

    def Gm(u):  # G just before u
        i = np.searchsorted(uniq, u, side='left') - 1
        return np.where(i >= 0, G[np.maximum(i, 0)], 1.0)

    def Gat(u):
        i = np.searchsorted(uniq, u, side='right') - 1
        return np.where(i >= 0, G[np.maximum(i, 0)], 1.0)
    bs = []
    for j, u in enumerate(times):
        died = (T <= u) & (D > 0)
        alive = T > u
        wd = np.where(died, 1 / np.maximum(Gm(T), 1e-6), 0.0)
        wa = np.where(alive, 1 / max(float(Gat(np.array([u]))[0]), 1e-6), 0.0)
        bs.append(np.mean(wd * S[:, j] ** 2 + wa * (1 - S[:, j]) ** 2))
    bs = np.array(bs)
    return float(np.trapezoid(bs, times) / (times[-1] - times[0])), float(bs[-1])


def run_cure(lens):
    z = np.load(c.SCRATCH / 'flex_data' / f'surv_{lens}.npz', allow_pickle=True)
    X, T, D, W, fold, group = z['X'].astype(float), z['T'], z['D'], z['W'], z['fold'], z['group']
    T = np.maximum(T, 1e-3)
    bench = pd.read_pickle(CACHE / f'{lens}_main.pkl')
    mod = __import__(f'lenses.{lens_module(lens)}', fromlist=['load'])
    L = mod.load()
    P0 = bench['preds'][0]
    # per-person held-out log-likelihood of the Poisson (piecewise-exponential) models
    ll_pois = {}
    for k in ('baseline', 'lightgbm_tuned', 'ebm', 'stack_glm_lgbm'):
        if k in P0:
            r = P0[k]
            rowll = L.y * np.log(np.maximum(r, 1e-300)) - r * L.e
            ll_pois[k] = np.bincount(L.person, weights=rowll, minlength=len(T))
    times = np.arange(1, 11, dtype=float)
    LL = {k: np.zeros(len(T)) for k in ('cure_weibull', 'weibull_ph')}
    S = {k: np.zeros((len(T), 10)) for k in ('cure_weibull', 'weibull_ph')}
    PI = np.zeros(len(T))
    info = []
    for f in np.unique(fold[fold >= 0]):
        tr, te = np.flatnonzero((fold != f) & (fold >= 0)), np.flatnonzero(fold == f)
        for name, cure in (('cure_weibull', True), ('weibull_ph', False)):
            m = Cure(cure=cure, l2=1.0).fit(X[tr], T[tr], D[tr], W[tr])
            LL[name][te] = m.loglik(X[te], T[te], D[te])
            S[name][te] = m.surv(X[te], times)
            if cure:
                PI[te] = m.parts(X[te])[0]
                info.append(dict(fold=int(f), converged=m.converged, weibull_shape=float(np.exp(m.th[m.p + 2]))))
        print('cure fold', f, flush=True)
    ok = fold >= 0
    rows = []
    allll = dict(LL, **ll_pois)
    gi = np.unique(group[ok], return_inverse=True)[1]
    rng = np.random.default_rng(flex.SEED)
    sums = {k: np.bincount(gi, weights=W[ok] * v[ok]) for k, v in allll.items()}
    boots = {k: [] for k in allll}
    for _ in range(1000):
        cnt = np.bincount(rng.integers(0, gi.max() + 1, gi.max() + 1), minlength=gi.max() + 1)
        for k in allll:
            boots[k].append(cnt @ sums[k] / (cnt @ np.bincount(gi, weights=W[ok])))
    for k in allll:
        r = dict(model=k, mean_loglik=float(np.dot(W[ok], allll[k][ok]) / W[ok].sum()))
        d = np.array(boots[k]) - np.array(boots['baseline'])
        r['diff_vs_baseline'] = r['mean_loglik'] - float(np.dot(W[ok], allll['baseline'][ok]) / W[ok].sum())
        r['diff_ci'] = np.percentile(d, [2.5, 97.5]).tolist()
        if k in S:
            r['c10'] = flex.harrell_c(T[ok], D[ok], 1 - S[k][ok][:, -1], W[ok])
            r['ibs10'], r['brier10'] = ibs(S[k][ok], T[ok], D[ok], times)
        rows.append(r)
    Sb = z['S_baseline'][:, :10]
    rows.append(dict(model='baseline (curves)', c10=flex.harrell_c(T[ok], D[ok], 1 - Sb[ok][:, -1], W[ok]),
                     **dict(zip(('ibs10', 'brier10'), ibs(Sb[ok], T[ok], D[ok], times)))))
    cure_share = float(1 - np.average(PI[ok], weights=W[ok]))
    qs = np.percentile(1 - PI[ok], [10, 25, 50, 75, 90]).tolist()
    save(lens, 'cure_model', dict(rows=rows, info=info, predicted_never_dissolve_share=cure_share,
                                  never_dissolve_percentiles_10_25_50_75_90=qs,
                                  note='mean held-out log-likelihood per marriage (weighted); Poisson rows = piecewise-exponential '
                                       'likelihood from the main-stage held-out rates; IBS unweighted IPCW, years 1-10'))
    for r in rows:
        print(r)
    print('never-dissolve share', cure_share, qs)


def lens_module(lens):
    return {'nsfg_pooled': 'nsfg_pooled', 'nlsy97': 'nlsy97', 'canada_gss': 'canada_gss', 'sipp_retro': 'sipp_retro',
            'nlsy79_full': 'nlsy79_full'}[lens]


# ----------------------------------------------------------------------------- competing risks
def aalen_johansen(t, d1, d2, w, times):
    """Weighted Aalen-Johansen cumulative incidence of cause 1 at `times`."""
    order = np.argsort(t, kind='stable')
    t, d1, d2, w = t[order], d1[order], d2[order], w[order]
    uniq, idx = np.unique(t, return_index=True)
    e1 = np.add.reduceat(w * d1, idx)
    e2 = np.add.reduceat(w * d2, idx)
    leave = np.add.reduceat(w, idx)
    at = w.sum() - np.r_[0, np.cumsum(leave)[:-1]]
    S = np.cumprod(1 - (e1 + e2) / at)
    Sprev = np.r_[1, S[:-1]]
    F = np.cumsum(Sprev * e1 / at)
    return np.array([F[np.searchsorted(uniq, u, side='right') - 1] if u >= uniq[0] else 0.0 for u in times])


def run_competing(lens, years=30):
    mod = __import__(f'lenses.{lens_module(lens)}', fromlist=['load'])
    L = mod.load()
    P = L.people.reset_index(drop=True)
    res = json.loads((RESULTS / f'{lens}.json').read_text())
    info = {i['fold']: i for i in res['main']['info'] if i['repeat'] == 0}
    # widowhood event on the person's last interval (same follow-up cap as the lens)
    if 'widowed' not in P:
        raise SystemExit('lens has no widowhood indicator')
    wid = (P.widowed.to_numpy() == 1) & (P['D'].to_numpy() == 0)
    T_ = P['T'].to_numpy(float)
    if 't' in P:  # widowhood after the follow-up cap is censoring
        wid &= P['t'].to_numpy(float) <= T_ + 1e-9
    last = np.r_[np.diff(L.person) != 0, True]
    yw = (wid[L.person] & last).astype(float)
    import copy
    Lw = copy.copy(L)
    Lw.y = yw
    Lw.df = L.df.copy()
    Lw.df[L.ycol] = yw
    pfold = np.full(len(P), -1)
    pfold[L.person] = L.folds[0]
    times = np.arange(1, years + 1, dtype=float)
    out = {k: np.zeros((len(P), years)) for k in ('glm_cif', 'glm_naive', 'lgbm_cif', 'lgbm_naive')}
    for f in np.unique(pfold[pfold >= 0]):
        tr = np.flatnonzero(L.folds[0] != f)
        te_p = np.flatnonzero(pfold == f)
        g = P.iloc[te_p].loc[P.index[te_p].repeat(years)].copy()
        g[L.dur] = np.tile(np.arange(years, dtype=float), len(te_p))
        cfg = info[int(f)]['lightgbm_tuned']
        for tag, mk in (('glm', lambda LL: flex.Baseline().fit(LL, tr)),
                        ('lgbm', lambda LL: flex.LGBM(params=(cfg['config'], cfg['rounds'])).fit(LL, tr))):
            hd = mk(L).predict(L, df=g).reshape(len(te_p), years)
            hw = mk(Lw).predict(Lw, df=g).reshape(len(te_p), years)
            q = 1 - np.exp(-(hd + hw))
            S = np.cumprod(np.c_[np.ones(len(te_p)), 1 - q[:, :-1]], axis=1)
            share = hd / np.maximum(hd + hw, 1e-300)
            out[f'{tag}_cif'][te_p] = np.cumsum(S * q * share, axis=1)
            out[f'{tag}_naive'][te_p] = 1 - np.exp(-np.cumsum(hd, axis=1))
        print('competing fold', f, flush=True)
    ok = pfold >= 0
    Dd, W = P['D'].to_numpy(float), P['W'].to_numpy(float)
    aj = aalen_johansen(T_[ok], Dd[ok], wid[ok].astype(float), W[ok], times)
    km_naive = aalen_johansen(T_[ok], Dd[ok], np.zeros(ok.sum()), W[ok], times)   # 1 - KM (widowhood censored)
    rows = []
    for h in (10, 20, 30):
        if h > years:
            continue
        r = dict(horizon=h, aalen_johansen=float(aj[h - 1]), one_minus_km_widowhood_censored=float(km_naive[h - 1]))
        for k, v in out.items():
            r[k] = float(np.average(v[ok][:, h - 1], weights=W[ok]))
        # 30-year calibration by decile of the GLM's cause-specific CIF
        rows.append(r)
    h = years
    dec = pd.qcut(out['glm_cif'][ok][:, h - 1], 10, labels=False, duplicates='drop')
    deciles = []
    for q in range(int(dec.max()) + 1):
        s = dec == q
        deciles.append(dict(decile=q + 1, aalen_johansen=float(aalen_johansen(T_[ok][s], Dd[ok][s], wid[ok][s].astype(float), W[ok][s], times)[h - 1]),
                            glm_cif=float(np.average(out['glm_cif'][ok][s][:, h - 1], weights=W[ok][s])),
                            glm_naive=float(np.average(out['glm_naive'][ok][s][:, h - 1], weights=W[ok][s]))))
    save(lens, 'competing_risks', dict(rows=rows, deciles_at_max_horizon=deciles, horizon_years=years,
                                       widowed=int(wid.sum()), divorces=int(Dd.sum()),
                                       note='cause-specific hazards (divorce, widowhood), held-out person folds; CIF averaged over '
                                            'held-out marriages with survey weights; Aalen-Johansen = nonparametric target'))
    for r in rows:
        print(r)
    for r in deciles:
        print(r)


if __name__ == '__main__':
    {'cure': run_cure, 'competing': run_competing}[sys.argv[1]](sys.argv[2])
