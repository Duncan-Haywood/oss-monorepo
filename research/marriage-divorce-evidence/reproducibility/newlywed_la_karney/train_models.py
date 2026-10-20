"""Does observed conflict behaviour predict divorce beyond what newlyweds say about their marriage?

368 low-income, mostly Hispanic newlywed couples in Los Angeles County (Smith, Block & Karney;
OSF hxn84), baseline 2009-10, followed for about 12 years (145 divorces). Discrete-time
(wave-interval) logistic hazard models with feature blocks:

  ses           demographics/socioeconomic: education, income, household size, low-income status,
                unemployment, financial strain, census-tract unemployment and median income
  vulnerabilities  each spouse's substance use, ACEs, abuse history, negative affect, parents' divorce
  satisfaction  each spouse's 8-item relationship satisfaction (self-report)
  observed      each spouse's positivity, negativity and effective communication, coded by trained
                observers (IFIRS) from three videotaped discussions
  hostility     each spouse's report of verbal and physical aggression (victimisation and
                perpetration, last 9 months): SELF-REPORT, not observed, although the paper puts it
                in its couple-behaviour factor
and their combinations. L2 (and one L1) logistic hazards with nested tuning, and a small tree.

Evaluation: 20 repeats x 5-fold cross-validation by couple (stratified on divorce), inner
3-fold couple CV choosing the penalty. Per-period log loss, AUC at about 2.3, 4.2, 8.8 and 12
years, Harrell's C, Brier, quintile calibration, couple-bootstrap 95% CIs (paired for the block
ablations). Effects: odds ratio of the per-period hazard per SD of each input, adjusted for the
period only and for every input. Writes CSVs here and ../../app/models/newlywed_la_couples.json
plus Python test vectors.

Run from this folder after `sh download.sh`:  python3 train_models.py   (about 10-20 minutes)
"""
from pathlib import Path
import json, os, sys, time, warnings

for _v in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(_v, '1')   # one BLAS thread per worker; oversubscription made fits ~15x slower

import numpy as np
import pandas as pd
import sklearn
from joblib import Parallel, delayed
from scipy.stats import rankdata
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

import nl_data as N

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent.parent / 'app' / 'tools'))
from bundle_export import export  # noqa: E402
import ood  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
REPEATS, FOLDS, INNER = int(os.environ.get('NL_REPEATS', 20)), 5, 3   # NL_* overrides are for quick smoke tests only
BOOT = int(os.environ.get('NL_BOOT', 1000))
C_GRID = [0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3]
L1_GRID = [0.02, 0.05, 0.1, 0.2, 0.5]
TREE_GRID = [(1, 60), (2, 60), (2, 120), (3, 120), (3, 240)]
OUT = HERE.parent.parent / 'app' / 'models'
NP = len(N.PERIODS)
# Horizon = last period included: T4 (about 2.3 y), T5 (4.2 y), T6 (8.8 y), T10 (12.0 y). No wave
# falls between 4.2 and 8.8 years, so a 6-year horizon is not observed.
HORIZONS = {'2.3y': 2, '4.2y': 3, '8.8y': 4, '12y': 8}  # index of the last period included

BLOCKS = dict(ses=N.SES, vulnerabilities=N.VUL, satisfaction=N.SAT, observed=N.OBS, hostility=N.HOST)
MODELS = [  # key, label, numeric inputs, estimator
    ('period_only', 'Wave interval only (baseline hazard)', [], 'none'),
    ('ses', 'Socioeconomic block', N.SES, 'l2'),
    ('vulnerabilities', 'Individual vulnerabilities, both spouses', N.VUL, 'l2'),
    ('satisfaction', 'Self-reported satisfaction, both spouses', N.SAT, 'l2'),
    ('observed', 'Observed interaction (IFIRS codes), both spouses', N.OBS, 'l2'),
    ('hostility', 'Self-reported hostility/aggression, both spouses', N.HOST, 'l2'),
    ('sat_observed', 'Satisfaction + observed interaction', N.SAT + N.OBS, 'l2'),
    ('ses_vul_sat', 'SES + vulnerabilities + satisfaction', N.SES + N.VUL + N.SAT, 'l2'),
    ('ses_vul_sat_host', 'SES + vulnerabilities + satisfaction + hostility', N.SES + N.VUL + N.SAT + N.HOST, 'l2'),
    ('ses_vul_sat_obs', 'SES + vulnerabilities + satisfaction + observed interaction', N.SES + N.VUL + N.SAT + N.OBS, 'l2'),
    ('all', 'All inputs (ridge)', N.ALL, 'l2'),
    ('all_lasso', 'All inputs (lasso)', N.ALL, 'l1'),
    ('tree', 'Small tree, all inputs', N.ALL, 'tree'),
]
KEYS = [m[0] for m in MODELS]
SPEC = {m[0]: m for m in MODELS}
EXPORTED = ['period_only', 'satisfaction', 'ses_vul_sat', 'ses_vul_sat_obs', 'all', 'all_lasso', 'tree']
ABLATIONS = [  # (better, reference, question)
    ('ses_vul_sat_obs', 'ses_vul_sat', 'Observed interaction over SES + vulnerabilities + satisfaction (the Gottman test)'),
    ('sat_observed', 'satisfaction', 'Observed interaction over satisfaction alone'),
    ('sat_observed', 'observed', 'Satisfaction over observed interaction alone'),
    ('ses_vul_sat_host', 'ses_vul_sat', 'Self-reported hostility over SES + vulnerabilities + satisfaction'),
    ('all', 'ses_vul_sat', 'Observed interaction + hostility over SES + vulnerabilities + satisfaction'),
    ('all', 'ses_vul_sat_obs', 'Self-reported hostility over everything else'),
    ('ses_vul_sat', 'satisfaction', 'SES + vulnerabilities over satisfaction'),
    ('observed', 'period_only', 'Observed interaction over the baseline hazard'),
    ('satisfaction', 'period_only', 'Satisfaction over the baseline hazard'),
    ('all_lasso', 'all', 'Lasso vs ridge, all inputs'),
    ('tree', 'all', 'Small tree vs ridge, all inputs'),
]


class PeriodFreeScaler(StandardScaler):
    """StandardScaler whose last `n_free` columns (the period indicators) are divided by a scale
    100 times smaller than their SD. Their coefficients are then ~100x smaller for the same
    effect, so the L1/L2 penalty on the baseline hazard is negligible while every input block
    is penalised as usual. app/engine.js reproduces it exactly: it only reads mean_ and scale_."""

    def __init__(self, n_free=0, factor=100.0):
        super().__init__()
        self.n_free, self.factor = n_free, factor

    def fit(self, X, y=None, sample_weight=None):
        super().fit(X, y, sample_weight)
        if self.n_free:
            self.scale_ = self.scale_.copy()
            self.scale_[-self.n_free:] /= self.factor
        return self


def pipeline(key, hp=None):
    _, _, cols, est = SPEC[key]
    if est == 'tree':
        d, m = hp
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), cols + ['period_years'])])
        return Pipeline([('prep', prep), ('fit', DecisionTreeRegressor(max_depth=d, min_samples_leaf=m, random_state=SEED))])
    num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', PeriodFreeScaler(n_free=len(N.PERIOD_COLS)))])
    prep = ColumnTransformer([('num', num, cols + N.PERIOD_COLS)])
    if est == 'none':
        fit = LogisticRegression(C=1e6, solver='newton-cholesky', max_iter=200, tol=1e-10)
    elif est == 'l2':
        fit = LogisticRegression(C=hp, solver='newton-cholesky', max_iter=200, tol=1e-10)
    else:  # liblinear penalises the intercept too; a large intercept_scaling makes that negligible
        fit = LogisticRegression(C=hp, penalty='l1', solver='liblinear', intercept_scaling=100.0, max_iter=10000, tol=1e-8)
    return Pipeline([('prep', prep), ('fit', fit)])


def proba(pipe, X):
    if isinstance(pipe.named_steps['fit'], DecisionTreeRegressor):
        return np.clip(pipe.predict(X), 1e-4, 1 - 1e-4)
    return pipe.predict_proba(X)[:, 1]


def raw(pipe, X):
    """What the browser engine computes: the tree's leaf mean unclipped, else the logistic probability."""
    if isinstance(pipe.named_steps['fit'], DecisionTreeRegressor):
        return pipe.predict(X)
    return pipe.predict_proba(X)[:, 1]


def ll_rows(y, p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return -(y * np.log(p) + (1 - y) * np.log1p(-p))


def grid(key):
    return {'l2': C_GRID, 'l1': L1_GRID, 'tree': TREE_GRID}.get(SPEC[key][3], [None])


def tune(d, key, seed):
    g = grid(key)
    if len(g) == 1:
        return g[0]
    loss = np.zeros(len(g))
    for tr, te in StratifiedKFold(INNER, shuffle=True, random_state=seed).split(d, d.divorced):
        rtr, rte = N.rows(d.iloc[tr]), N.rows(d.iloc[te])
        for j, hp in enumerate(g):
            loss[j] += ll_rows(rte.event.to_numpy(), proba(pipeline(key, hp).fit(rtr, rtr.event), rte)).sum()
    return g[int(np.argmin(loss))]


def hazards(pipe, d):
    return proba(pipe, N.expand(d)).reshape(len(d), NP)


def outer_split(d, r, f, tr, te):
    dtr, dte = d.iloc[tr].reset_index(drop=True), d.iloc[te].reset_index(drop=True)
    rtr = N.rows(dtr)
    out = dict(r=r, f=f, te=te, const=float(rtr.event.mean()), H={}, hp={})
    for k in KEYS:
        hp = tune(dtr, k, SEED + 1000 * r + f)
        out['hp'][k] = hp
        out['H'][k] = hazards(pipeline(k, hp).fit(rtr, rtr.event), dte)
    return out


# ------------------------------------------------------------------ metrics on one prediction set
class Ev:
    """Per-couple outcome structure for fast metrics on any couple index (bootstrap resample)."""

    def __init__(self, d):
        self.n = len(d)
        self.E = np.where(d.divorced == 1, d.event_wave.fillna(0).astype(int) - 2, NP)  # event period index or NP
        self.at_risk = np.arange(NP)[None, :] <= self.E[:, None]
        self.ev = (np.arange(NP)[None, :] == self.E[:, None]).astype(float)


def auc(score, y):
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    if n1 == 0 or n0 == 0:
        return np.nan
    r = rankdata(score)
    return (r[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


def cindex(score, E):
    """Harrell's C for discrete event periods (E = NP: no divorce by T10). Pairs with an earlier
    event vs a later event or no event; ties in score count 1/2; same-period events not comparable."""
    ev = E < NP
    a = E[:, None] < E[None, :]                       # i failed before j
    a &= ev[:, None]
    s = score[:, None] - score[None, :]
    conc = (a & (s > 0)).sum() + 0.5 * (a & (s == 0)).sum()
    return conc / a.sum()


def metrics(H, const, ev, idx):
    """H: couples x periods hazards (held out); const: per-couple constant rate from its training fold."""
    H, E, R, Y = H[idx], ev.E[idx], ev.at_risk[idx], ev.ev[idx]
    L = ll_rows(Y, H)[R].sum()
    Lc = ll_rows(Y, np.broadcast_to(const[idx][:, None], H.shape))[R].sum()
    F = 1 - np.cumprod(1 - H, axis=1)
    out = dict(pp_logloss=L / R.sum(), pp_const_logloss=Lc / R.sum(), c_index=cindex(F[:, -1], E))
    for h, k in HORIZONS.items():
        y = (E <= k).astype(float)
        out[f'auc_{h}'] = auc(F[:, k], y)
        out[f'brier_{h}'] = float(np.mean((F[:, k] - y) ** 2))
        out[f'logloss_{h}'] = float(np.mean(ll_rows(y, F[:, k])))
        out[f'oe_{h}'] = float(y.sum() / F[:, k].sum())
    return out


def main():
    t0 = time.time()
    d = N.load()
    rows = N.rows(d)
    n = len(d)
    ev = Ev(d)
    assert int(ev.ev.sum()) == int(d.divorced.sum()) == 145
    assert int(ev.at_risk.sum()) == len(rows)

    # ------------------------------------------------------------ repeated nested cross-validation
    splits = []
    for r in range(REPEATS):
        for f, (tr, te) in enumerate(StratifiedKFold(FOLDS, shuffle=True, random_state=SEED + r).split(d, d.divorced)):
            splits.append((r, f, tr, te))
    # Held-out hazards are cached in raw/ (git-ignored: they are per-couple predictions) so an
    # interrupted run can resume. The CV is deterministic (fixed seeds), so a rerun reproduces them.
    cache = N.RAW / f'cv_cache_r{REPEATS}.npz'
    if cache.exists():
        z = np.load(cache, allow_pickle=True)
        Hcv = {k: z[f'H_{k}'] for k in KEYS}
        const = z['const']
        chosen = json.loads(str(z['chosen']))
        chosen = {k: [tuple(v) if isinstance(v, list) else v for v in vs] for k, vs in chosen.items()}
        print('cross-validation loaded from cache', flush=True)
    else:
        res = Parallel(n_jobs=-1, verbose=5)(delayed(outer_split)(d, r, f, tr, te) for r, f, tr, te in splits)
        Hcv = {k: np.zeros((REPEATS, n, NP)) for k in KEYS}
        const = np.zeros((REPEATS, n))
        chosen = {k: [] for k in KEYS}
        for o in res:
            const[o['r'], o['te']] = o['const']
            for k in KEYS:
                Hcv[k][o['r'], o['te']] = o['H'][k]
                chosen[k].append(o['hp'][k])
        np.savez(cache, const=const, chosen=json.dumps(chosen), **{f'H_{k}': Hcv[k] for k in KEYS})
        print(f'cross-validation done in {time.time() - t0:.0f}s', flush=True)

    # Point estimates: metric per repeat on all 368 couples, averaged over repeats.
    full = np.arange(n)
    per_rep = {k: pd.DataFrame([metrics(Hcv[k][r], const[r], ev, full) for r in range(REPEATS)]) for k in KEYS}
    # 12-year base rate log loss: the period-only model's cumulative risk (training life table).
    def derived(m, base):
        out = dict(m)
        out['gain_vs_constant_pct'] = 100 * (1 - m['pp_logloss'] / m['pp_const_logloss'])
        out['gain_vs_period_only_pct'] = 100 * (1 - m['pp_logloss'] / base['pp_logloss'])
        for h in HORIZONS:
            out[f'gain_{h}_vs_base_pct'] = 100 * (1 - m[f'logloss_{h}'] / base[f'logloss_{h}'])
            out[f'brier_skill_{h}_pct'] = 100 * (1 - m[f'brier_{h}'] / base[f'brier_{h}'])
        return out

    point = {}
    for k in KEYS:
        reps = [derived(per_rep[k].iloc[r].to_dict(), per_rep['period_only'].iloc[r].to_dict()) for r in range(REPEATS)]
        point[k] = pd.DataFrame(reps).mean().to_dict()
        point[k]['repeat_sd'] = pd.DataFrame(reps).std().to_dict()
    folds_rows = []
    for k in KEYS:
        for r in range(REPEATS):
            folds_rows.append(dict(model=k, repeat=r, **derived(per_rep[k].iloc[r].to_dict(), per_rep['period_only'].iloc[r].to_dict())))
    pd.DataFrame(folds_rows).to_csv(HERE / 'cv_repeats.csv', index=False, float_format='%.6g')

    # Couple bootstrap of the repeat-averaged metrics (same resamples for every model -> paired deltas).
    rng = np.random.default_rng(SEED)
    boots = [rng.integers(0, n, n) for _ in range(BOOT)]

    def boot_one(idx):
        out = {}
        base = [metrics(Hcv['period_only'][r], const[r], ev, idx) for r in range(REPEATS)]
        for k in KEYS:
            ms = base if k == 'period_only' else [metrics(Hcv[k][r], const[r], ev, idx) for r in range(REPEATS)]
            out[k] = pd.DataFrame([derived(m, b) for m, b in zip(ms, base)]).mean().to_dict()
        return out

    METRICS = ['gain_vs_constant_pct', 'gain_vs_period_only_pct', 'c_index']
    for h in HORIZONS:
        METRICS += [f'auc_{h}', f'brier_{h}', f'gain_{h}_vs_base_pct', f'brier_skill_{h}_pct', f'oe_{h}']
    reuse = os.environ.get('NL_REUSE_BOOTSTRAP') == '1' and (HERE / 'block_ablation.csv').exists()
    if reuse:
        # Resume: the bootstrap CSVs from the interrupted run are reused only if this run's point
        # estimates (recomputed from the held-out predictions) equal theirs.
        comp = pd.read_csv(HERE / 'heldout_model_comparison.csv')
        abl = pd.read_csv(HERE / 'block_ablation.csv')
        for k in KEYS:
            for m in METRICS:
                old = float(comp.loc[comp.model == k, m].iloc[0])
                assert abs(old - point[k][m]) <= 1e-4 * max(1, abs(old)), (k, m, old, point[k][m])
        print('bootstrap CIs reused: point estimates match the saved comparison', flush=True)
    else:
        B = Parallel(n_jobs=-1)(delayed(boot_one)(idx) for idx in boots)
        print(f'bootstrap done in {time.time() - t0:.0f}s', flush=True)
        comp = []
        for k in KEYS:
            row = dict(model=k, label=SPEC[k][1], inputs=len(SPEC[k][2]))
            for m in METRICS:
                vals = np.array([b[k][m] for b in B])
                row[m] = point[k][m]
                row[m + '_lo'], row[m + '_hi'] = np.nanpercentile(vals, [2.5, 97.5])
            comp.append(row)
        comp = pd.DataFrame(comp)
        comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.5g')

        abl = []
        for a, b, q in ABLATIONS:
            for m in ['gain_vs_period_only_pct', 'c_index', 'auc_12y', 'auc_4.2y', 'brier_skill_12y_pct', 'gain_12y_vs_base_pct']:
                delta = point[a][m] - point[b][m]
                vals = np.array([bb[a][m] - bb[b][m] for bb in B])
                lo, hi = np.nanpercentile(vals, [2.5, 97.5])
                abl.append(dict(question=q, model=a, reference=b, metric=m, model_value=point[a][m], reference_value=point[b][m],
                                delta=delta, ci_lo=lo, ci_hi=hi, share_of_bootstraps_positive=float(np.mean(vals > 0))))
        abl = pd.DataFrame(abl)
        abl.to_csv(HERE / 'block_ablation.csv', index=False, float_format='%.5g')
    # How often each penalty / tree size was chosen by the inner CV across the 100 outer folds.
    comp['tuned'] = [json.dumps({str(h): [str(x) for x in chosen[k]].count(str(h)) for h in grid(k)}) if SPEC[k][3] != 'none' else ''
                     for k in comp.model]
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.5g')

    # Calibration at 12 years by quintile of held-out risk (within each repeat, then averaged).
    cal = []
    y12 = (ev.E <= HORIZONS['12y']).astype(float)
    for k in KEYS:
        qs = []
        for r in range(REPEATS):
            F = 1 - np.prod(1 - Hcv[k][r], axis=1)
            q = pd.qcut(rankdata(F, method='ordinal'), 5, labels=False)
            qs.append(pd.DataFrame(dict(q=q, pred=F, obs=y12)).groupby('q').agg(couples=('obs', 'size'), predicted=('pred', 'mean'), observed=('obs', 'mean')))
        avg = sum(qs) / REPEATS
        for qi, rr in avg.iterrows():
            cal.append(dict(model=k, quintile=int(qi) + 1, couples=float(rr.couples), predicted_12y=rr.predicted, observed_12y=rr.observed))
    cal = pd.DataFrame(cal)
    cal.to_csv(HERE / 'heldout_calibration_12y.csv', index=False, float_format='%.4f')

    # ------------------------------------------------------------ effects per SD (odds ratio of the per-period hazard)
    def logit_fit(X, y):
        lr = LogisticRegression(penalty=None, max_iter=10000, tol=1e-12).fit(X, y)
        b = np.r_[lr.intercept_, lr.coef_[0]]
        Xa = np.column_stack([np.ones(len(X)), X])
        p = lr.predict_proba(X)[:, 1]
        V = np.linalg.inv(Xa.T @ (Xa * (p * (1 - p))[:, None]))
        return b[1:], np.sqrt(np.diag(V))[1:]

    Zc = d[N.ALL].fillna(d[N.ALL].median())
    Zc = (Zc - Zc.mean()) / Zc.std()
    Z = Zc.iloc[rows.couple.to_numpy()].reset_index(drop=True)
    P = pd.get_dummies(rows.period, drop_first=True).astype(float).to_numpy()
    yv = rows.event.to_numpy()
    blocks_of = {c: b for b, cols in BLOCKS.items() for c in cols}
    eff = []
    adj_b, adj_se = logit_fit(np.column_stack([P, Z.to_numpy()]), yv)
    sat_obs_cols = N.SAT + N.OBS + N.HOST
    so_b, so_se = logit_fit(np.column_stack([P, Z[sat_obs_cols].to_numpy()]), yv)
    for j, c in enumerate(N.ALL):
        b1, s1 = logit_fit(np.column_stack([P, Z[[c]].to_numpy()]), yv)
        row = dict(input=c, block=blocks_of[c], sd=float(d[c].std()), missing=int(d[c].isna().sum()),
                   or_period_adjusted=np.exp(b1[-1]), lo_period_adjusted=np.exp(b1[-1] - 1.96 * s1[-1]), hi_period_adjusted=np.exp(b1[-1] + 1.96 * s1[-1]),
                   or_all_adjusted=np.exp(adj_b[P.shape[1] + j]), lo_all_adjusted=np.exp(adj_b[P.shape[1] + j] - 1.96 * adj_se[P.shape[1] + j]),
                   hi_all_adjusted=np.exp(adj_b[P.shape[1] + j] + 1.96 * adj_se[P.shape[1] + j]))
        if c in sat_obs_cols:
            jj = P.shape[1] + sat_obs_cols.index(c)
            row.update(or_sat_obs_host_adjusted=np.exp(so_b[jj]), lo_sat_obs_host_adjusted=np.exp(so_b[jj] - 1.96 * so_se[jj]),
                       hi_sat_obs_host_adjusted=np.exp(so_b[jj] + 1.96 * so_se[jj]))
        eff.append(row)
    eff = pd.DataFrame(eff)
    # Couple-bootstrap CIs for the period-adjusted effects of the relationship inputs (no normal approximation).
    rngb = np.random.default_rng(SEED + 7)
    bo = {c: [] for c in sat_obs_cols}
    for _ in range(500):
        idx = rngb.integers(0, n, n)
        rb = N.rows(d.iloc[idx].reset_index(drop=True))
        Pb = pd.get_dummies(rb.period, drop_first=True).astype(float).to_numpy()
        Zb = Zc.iloc[idx].reset_index(drop=True).iloc[rb.couple.to_numpy()]
        for c in sat_obs_cols:
            bo[c].append(logit_fit(np.column_stack([Pb, Zb[[c]].to_numpy()]), rb.event.to_numpy())[0][-1])
    for c in sat_obs_cols:
        lo, hi = np.exp(np.percentile(bo[c], [2.5, 97.5]))
        eff.loc[eff.input == c, 'boot_lo_period_adjusted'] = lo
        eff.loc[eff.input == c, 'boot_hi_period_adjusted'] = hi
    eff.to_csv(HERE / 'effects_per_sd.csv', index=False, float_format='%.4f')

    # Divorce by 12 years by tercile of each relationship input (descriptive aggregate, cells >= 100 couples).
    terc = []
    for c in N.SAT + N.OBS + N.HOST + ['couple_satisfaction']:
        x = (d.H_sat_sum + d.W_sat_sum) / 2 if c == 'couple_satisfaction' else d[c]
        q = pd.qcut(x.rank(method='first'), 3, labels=['low', 'middle', 'high'])
        for lab in ['low', 'middle', 'high']:
            m = (q == lab).to_numpy()
            terc.append(dict(input=c, tercile=lab, couples=int(m.sum()), range_lo=float(x[m].min()), range_hi=float(x[m].max()),
                             divorced_by_12y=int(d.divorced[m].sum()), share=float(d.divorced[m].mean())))
    terc = pd.DataFrame(terc)
    terc.to_csv(HERE / 'divorce_by_tercile.csv', index=False, float_format='%.4f')

    # ------------------------------------------------------------ final fits (tuned on all couples)
    final_hp = {k: tune(d, k, SEED) for k in KEYS}
    pipes = {k: pipeline(k, final_hp[k]).fit(rows, rows.event) for k in KEYS}
    tree = pipes['tree']
    (HERE / 'tree.txt').write_text(export_text(tree.named_steps['fit'], feature_names=tree.named_steps['prep'].get_feature_names_out().tolist(), decimals=3))
    coefs = []
    for k in ('satisfaction', 'ses_vul_sat', 'ses_vul_sat_obs', 'all', 'all_lasso'):
        pre, est = pipes[k].named_steps['prep'], pipes[k].named_steps['fit']
        for name, b in zip(pre.get_feature_names_out(), est.coef_[0]):
            coefs.append(dict(model=k, feature=name, coef_per_sd_or_vs_reference=b, odds_ratio=np.exp(b)))
    pd.DataFrame(coefs).to_csv(HERE / 'final_coefficients.csv', index=False, float_format='%.5f')

    # ------------------------------------------------------------ population reference (held-out, aggregates only)
    # Shape read by app/population.js: { horizons: [years], overall: { n, quantiles: { p1..p99: [one value per
    # horizon] } }, subgroups: { var: { level: { n, quantiles } } }, subgroup_defs }. Horizons are years
    # since baseline (couples were married under about 6 months then), at the follow-up waves.
    QS = list(range(1, 100))
    REF_MODEL = 'all'
    sat_c = ((d.H_sat_sum + d.W_sat_sum) / 2).to_numpy()
    c1, c2 = np.percentile(sat_c, [100 / 3, 200 / 3])
    sat_bins = [dict(level='lowest third', min=None, max=float(c1)), dict(level='middle third', min=float(c1), max=float(c2)),
                dict(level='highest third', min=float(c2), max=None)]
    sat_level = np.where(sat_c < c1, 'lowest third', np.where(sat_c < c2, 'middle third', 'highest third'))
    sub = {'Low_income_D': {'1': (d.Low_income_D == 1).to_numpy(), '0': (d.Low_income_D == 0).to_numpy()},
           'couple_satisfaction': {b['level']: sat_level == b['level'] for b in sat_bins}}
    hz = list(HORIZONS.values())

    def qcell(Hm, m):
        cum = np.stack([1 - np.prod(1 - Hm[m, :k + 1], axis=1) for k in hz], axis=1)   # couples x horizons
        vals = np.percentile(cum, QS, axis=0)                                            # quantiles x horizons
        return dict(n=int(m.sum()), divorced_by_12y=int(d.divorced[m].sum()), small_cell=bool(m.sum() < 100),
                    quantiles={f'p{q}': [round(float(v), 5) for v in vals[i]] for i, q in enumerate(QS)})

    def reference(k):
        Hm = Hcv[k].mean(axis=0)
        out = dict(overall=qcell(Hm, np.ones(n, bool)), subgroups={}, suppressed=[])
        for var, levels in sub.items():
            out['subgroups'][var] = {}
            for lv, m in levels.items():
                if m.sum() < 50:
                    out['suppressed'].append(f'{var}={lv} ({int(m.sum())} couples)')
                else:
                    out['subgroups'][var][lv] = qcell(Hm, m)
        return out

    popref = dict(
        model=REF_MODEL, horizons=[N.END_YEARS[k] for k in hz], horizon_labels=list(HORIZONS),
        quantity=('predicted probability of divorce by each horizon (1 - product of (1 - per-interval probability)), years since '
                  'baseline; the couples had married within about 6 months of baseline'),
        method=(f'HELD-OUT predictions ({REPEATS}x{FOLDS}-fold couple cross-validation, per-interval probabilities averaged over '
                f'repeats) of the {REF_MODEL!r} model; unweighted quantiles (no sampling weights exist). Subgroup cells need >=50 '
                'couples (small_cell marks <100). Aggregates only.'),
        small_sample_warning=('Only 368 couples (145 divorces). Each subgroup holds 100-250 couples, so the outer percentiles '
                              '(below p5 and above p95) are set by a handful of couples and are very imprecise; prefer p5-p95. '
                              'This sample (low-income, mostly Hispanic Los Angeles newlyweds) is not a general population.'),
        subgroup_defs=dict(
            Low_income_D=dict(label='Household income below 200% of the 2010 poverty line (1 yes, 0 no)', column='Low_income_D'),
            couple_satisfaction=dict(label="Couple satisfaction third: mean of the two spouses' 8-item sums (H_sat_sum, W_sat_sum)",
                                     column='couple_satisfaction', bins=sat_bins)),
        **reference(REF_MODEL))
    pr_rows = []
    for k in EXPORTED:
        ref = reference(k)
        cells = [('overall', 'all', ref['overall'])] + [(v, lv, c) for v, cs in ref['subgroups'].items() for lv, c in cs.items()]
        for var, lv, c in cells:
            for j, h in enumerate(HORIZONS):
                for q in QS:
                    pr_rows.append(dict(model=k, variable=var, level=lv, n=c['n'], horizon=h, quantile=f'p{q}', value=c['quantiles'][f'p{q}'][j]))
    pd.DataFrame(pr_rows).to_csv(HERE / 'population_reference_quantiles.csv', index=False, float_format='%.5f')

    # ------------------------------------------------------------ OOD on the couple-level inputs
    fold = np.zeros(n, int)
    for f, (_, te) in enumerate(StratifiedKFold(FOLDS, shuffle=True, random_state=SEED).split(d, d.divorced)):
        fold[te] = f
    ood_spec, ood_held, ood_fit = ood.build(d, fold, N.ALL, [], {})

    # ------------------------------------------------------------ bundle
    cmp = comp.set_index('model')

    def held(k):
        r = cmp.loc[k]
        ci = lambda m: [round(float(r[m + '_lo']), 4), round(float(r[m + '_hi']), 4)]
        c = cal[cal.model == k]
        out = dict(logloss_improvement_percent=round(float(r.gain_vs_constant_pct), 3), logloss_improvement_ci=ci('gain_vs_constant_pct'),
                   improvement_over_period_only_percent=round(float(r.gain_vs_period_only_pct), 3),
                   improvement_over_period_only_ci=ci('gain_vs_period_only_pct'),
                   deviance_improvement_percent=round(float(r.gain_vs_constant_pct), 3),
                   c_index=round(float(r.c_index), 4), c_index_ci=ci('c_index'))
        for h in HORIZONS:
            out[f'auc_{h}'] = round(float(r[f'auc_{h}']), 4)
            out[f'auc_{h}_ci'] = ci(f'auc_{h}')
            out[f'brier_{h}'] = round(float(r[f'brier_{h}']), 5)
            out[f'logloss_gain_{h}_vs_base_rate_percent'] = round(float(r[f'gain_{h}_vs_base_pct']), 3)
            out[f'logloss_gain_{h}_vs_base_rate_ci'] = ci(f'gain_{h}_vs_base_pct')
            out[f'observed_expected_{h}'] = round(float(r[f'oe_{h}']), 3)
        out['calibration_12y_quintiles'] = [dict(predicted=round(float(a), 4), observed=round(float(b), 4))
                                            for a, b in zip(c.predicted_12y, c.observed_12y)]
        return out

    def exported(k):
        e = export(pipes[k])
        if e['numeric'] is None:
            e['numeric'] = dict(columns=[], impute=[])
        return e

    q = lambda c, p: float(np.nanpercentile(d[c], p))

    def ifirs(c, what, question):
        spouse = 'husband' if c.startswith('H_') else 'wife'
        return dict(
            description=(f"{spouse.capitalize()}'s {what}, coded by trained observers with the Iowa Family Interaction Rating Scales (IFIRS, "
                         f'1-9 scale), averaged over three videotaped discussions at baseline. Sample range {d[c].min():.2f}-{d[c].max():.2f}, '
                         f'median {d[c].median():.2f}.'),
            measured_by='trained observers (IFIRS), not self-report',
            self_report_proxy=dict(
                question=question.format(spouse=spouse),
                answers={'Almost never': round(q(c, 10), 3), 'Rarely': round(q(c, 30), 3), 'Sometimes': round(q(c, 50), 3),
                         'Often': round(q(c, 70), 3), 'Almost always': round(q(c, 90), 3)},
                mapping='Each answer maps to the sample\'s 10th/30th/50th/70th/90th percentile of the observed code.',
                caveat=('APPROXIMATION. The model was trained on codes from trained observers watching the couple discuss a problem, '
                        'not on anyone\'s self-rating. Self-ratings of conflict behaviour are known to differ from observer codes; '
                        'this mapping by percentile has not been validated. Treat the result as a rough what-if, not a measurement.')))

    POS_Q = 'When the two of you discuss a disagreement, how often does the {spouse} show warmth, humour, affection or attentive listening?'
    NEG_Q = 'When the two of you discuss a disagreement, how often is the {spouse} hostile, critical, contemptuous, defensive or domineering?'
    EFF_Q = ('When the two of you discuss a disagreement, how often does the {spouse} state their view clearly and calmly, consider the other\'s view '
             'and propose realistic solutions?')
    sat_items = ('Sum of 8 items (each 1-4 or 1-5): satisfaction with time together, trust, sharing thoughts and feelings, sexual relations, '
                 'support in difficult times, help with chores, being understood (hopes and dreams), and the marriage overall. Range 8-37; '
                 'sample median {m:.0f}, 10th percentile {p10:.0f}.')
    host = ('{who}\'s report of the past 9 months: 14 items, each 0 never / 1 once or twice / 2 several times / 3 often, about insults or swearing, '
            'stomping out, threats to hit, throwing things, pushing/grabbing, slapping/kicking/biting/punching and beating up, BOTH done to them by '
            'the spouse and done by them to the spouse. Sum 0-42; sample median {m:.0f}, 90th percentile {p90:.0f}. Self-report (not observed). '
            'If any of this is happening, safety comes first: in the U.S. the National Domestic Violence Hotline is 1-800-799-7233.')
    inputs = dict(
        period="wave interval '02'-'10' (see periods); not a model input itself: the app sets the period_XX indicators from it",
        **{c: f"1 when scoring interval {c[-2:]}, else 0 (all zero = interval 02); the app sets these, not the user" for c in N.PERIOD_COLS},
        period_years='length of the interval in years (see periods); used by the tree; the app sets it',
        H_educ_D='Husband has less than a 4-year college degree: 1 yes, 0 no', W_educ_D='Wife has less than a 4-year college degree: 1 yes, 0 no',
        income_k='Annual household income, thousands of dollars (2009-10; mean of the spouses\' reports; sample range 2.5-100, top-coded near 100)',
        Household_comp='People living in the household, including the couple',
        Low_income_D='Household income below 200% of the 2010 federal poverty threshold for its size: 1 yes, 0 no',
        Couple_unemployment_D='At least one spouse unemployed and looking for work last week: 1 yes, 0 no',
        Couple_fin_strain_D='Financial strain in the sample\'s top quartile (difficulty paying bills, putting off purchases, not enough at month end): 1 yes, 0 no',
        Neighborhood_unemploy='Census-tract unemployment rate, percent (circa 2010)',
        Neighborhood_income_k='Census-tract median household income, thousands of dollars (circa 2010)',
        H_Hostility=host.format(who='Husband', m=d.H_Hostility.median(), p90=q('H_Hostility', 90)),
        W_Hostility=host.format(who='Wife', m=d.W_Hostility.median(), p90=q('W_Hostility', 90)),
        H_sat_sum='Husband\'s relationship satisfaction (self-report). ' + sat_items.format(m=d.H_sat_sum.median(), p10=q('H_sat_sum', 10)),
        W_sat_sum='Wife\'s relationship satisfaction (self-report). ' + sat_items.format(m=d.W_sat_sum.median(), p10=q('W_sat_sum', 10)),
        H_Positivity=ifirs('H_Positivity', 'positivity (positive mood, warmth/support, affection, humour, endearment, listener responsiveness)', POS_Q),
        W_Positivity=ifirs('W_Positivity', 'positivity (positive mood, warmth/support, affection, humour, endearment, listener responsiveness)', POS_Q),
        H_Negativity=ifirs('H_Negativity', 'negativity (hostility, contempt, denial, angry coercion, dominance, verbal attack, disruptive process)', NEG_Q),
        W_Negativity=ifirs('W_Negativity', 'negativity (hostility, contempt, denial, angry coercion, dominance, verbal attack, disruptive process)', NEG_Q),
        H_Effective=ifirs('H_Effective', 'effective communication (assertiveness, communication, effective process, solution quantity and quality)', EFF_Q),
        W_Effective=ifirs('W_Effective', 'effective communication (assertiveness, communication, effective process, solution quantity and quality)', EFF_Q),
    )
    vul_text = dict(substance_D='any of 7 problem drinking/drug-use signs in the past 9 months', ACE_D='any of 5 adverse childhood experiences',
                    abuse_D='any of 5 kinds of abuse or assault (childhood family violence, sexual assault, prior partner threats or violence)',
                    neg_affect_D='negative affect (sad, hopeless, restless, effortful, worthless, nervous; last 30 days) in the sample\'s top quartile',
                    parent_marriage_D='parents did not stay married and together until age 18 (divorce, never married, death, or not raised by both)')
    for s, who in (('H', 'Husband'), ('W', 'Wife')):
        for v, t in vul_text.items():
            inputs[f'{s}_{v}'] = f'{who}: {t}: 1 yes, 0 no'
    support = {c: [float(d[c].min()), float(d[c].max())] for c in N.ALL}
    support['period_years'] = [min(N.PERIOD_YEARS.values()), max(N.PERIOD_YEARS.values())]
    events_by_period = {p: int(v) for p, v in rows.groupby('period').event.sum().items()}
    bundle = dict(
        id='newlywed_la_couples', version=1,
        source=('Smith, Block & Karney, "Baseline Predictors of Divorce", OSF project hxn84 (https://osf.io/hxn84), data for "Individual, '
                'Interpersonal, and Socioeconomic Predictors of Divorce: A 12-Year Prospective Study". Divorce_Data.csv (osf.io/download/srdwb), '
                'SHA-256 9fcea8b4...5ed5a08. No licence is stated, so couple rows are not redistributed here: only fitted parameters and aggregates.'),
        target=('Probability that a couple still married at the start of a follow-up interval is divorced by its end (couple-level status from '
                'both spouses\' reports), for nine intervals from baseline (2009-10) to about 12 years later (2021-22). A per-interval '
                'probability, not an annual rate; intervals differ in length (see periods).'),
        outcome='probability_per_period',
        population=('Newlywed (married under about 6 months at baseline), first-married, different-sex couples in Los Angeles County recruited '
                    'from marriage licences in low-income neighbourhoods, 2009-10; both spouses aged 18+, mostly Hispanic (76%), 11% White, 13% '
                    'Black. The 368 couples whose status at the last follow-up is known (63 of 431 lost to attrition are excluded). Not '
                    'representative of U.S. or Los Angeles marriages.'),
        weights='none: the study has no sampling weights; every couple counts once. Results describe these 368 couples, not a population.',
        training=dict(couples=n, person_periods=int(len(rows)), events=int(rows.event.sum()), divorced_by_12y=int(d.divorced.sum()),
                      events_by_period=events_by_period,
                      events_reported_after_a_missed_wave=int(d.event_after_missed_wave.sum()),
                      note=('Couple-level dates are not public: intervals are placed at the sample mean years since baseline from the '
                            'supplement\'s study timeline. A divorce first reported after a missed wave is placed at the wave that reports it.')),
        constant_rate=float(rows.event.mean()),
        periods=N.PERIODS,
        how_to_combine=('P(still married after interval k) = product over j<=k of (1 - p_j), with p_j the model prediction for interval j '
                        '(period_XX indicators for the logistic models, period_years for the tree) and every other input as at baseline. Interval ends are about 0.8, 1.6, 2.3, 4.2, '
                        '8.8, 9.9, 10.8, 11.4 and 12.0 years after baseline. No follow-up falls between 4.2 and 8.8 years.'),
        support=support,
        inputs=inputs,
        input_blocks=dict(BLOCKS, observed_note='Only positivity, negativity and effective communication are observer-coded (IFIRS). '
                          'Hostility is a self-report questionnaire, even though the paper places it in its couple-behaviour factor.'),
        evaluation=(f'{REPEATS} repeats x {FOLDS}-fold cross-validation by couple (stratified on divorce); penalty chosen by inner {INNER}-fold '
                    f'couple CV on per-period log loss (ridge C grid {C_GRID}, lasso C grid {L1_GRID}, tree depth x min leaf {TREE_GRID}); '
                    f'{BOOT} couple-bootstrap resamples of the repeat-averaged held-out metrics for 95% CIs (evaluation-sample uncertainty, '
                    'not refitting). AUC at a horizon: divorced by then vs still married then. 6-year horizon not observed.'),
        abstain=['couples who are not newlyweds (the models know only the first ~6 months of marriage)', 'same-sex couples (not in the study)',
                 'any input outside the support', 'profiles above the out-of-distribution threshold (ood)',
                 'horizons beyond period 10 (about 12 years)',
                 'presenting observed-interaction inputs from self-ratings as if they were observer codes (see each input\'s self_report_proxy.caveat)'],
        models=[dict(key=k, label=SPEC[k][1], heldout=held(k), **exported(k)) for k in EXPORTED],
        not_exported={k: dict(label=SPEC[k][1], heldout={kk: vv for kk, vv in held(k).items() if kk != 'calibration_12y_quintiles'})
                      for k in KEYS if k not in EXPORTED},
        block_ablation=[dict(question=r.question, model=r.model, reference=r.reference, metric=r.metric, delta=round(float(r.delta), 4),
                             ci=[round(float(r.ci_lo), 4), round(float(r.ci_hi), 4)])
                        for r in abl[abl.metric.isin(['gain_vs_period_only_pct', 'c_index', 'auc_12y'])].itertuples()],
        effects_per_sd=[dict(input=r.input, block=r.block, sd=round(r.sd, 4),
                             odds_ratio_period_adjusted=round(r.or_period_adjusted, 3), ci_period_adjusted=[round(r.lo_period_adjusted, 3), round(r.hi_period_adjusted, 3)],
                             odds_ratio_all_adjusted=round(r.or_all_adjusted, 3), ci_all_adjusted=[round(r.lo_all_adjusted, 3), round(r.hi_all_adjusted, 3)])
                        for r in eff.itertuples()],
        divorce_by_tercile=json.loads(terc.to_json(orient='records')),
        population_reference=popref,
        ood=ood_spec,
        sklearn=sklearn.__version__,
    )
    OUT.mkdir(exist_ok=True)
    (OUT / 'newlywed_la_couples.json').write_text(json.dumps(bundle, separators=(',', ':')))

    # Test vectors: random rows across (and beyond) the support, missing values, unseen period.
    rng = np.random.default_rng(SEED)
    tv = []
    for i in range(60):
        r = {}
        for c in N.ALL:
            lo, hi = support[c]
            if set(d[c].dropna().unique()) <= {0, 1}:
                r[c] = None if i % 13 == 5 else float(rng.integers(0, 2))
            else:
                span = hi - lo
                r[c] = None if i % 11 == 3 else float(rng.uniform(lo - 0.1 * span, hi + 0.1 * span))
        per = N.PERIOD_LABELS[i % NP] if i % 23 else '11'
        r['period'] = per
        r['period_years'] = N.PERIOD_YEARS.get(per, 1.0)
        tv.append(r)
    tdf = N.add_period_indicators(pd.DataFrame(tv))
    vectors = dict(rows=json.loads(tdf.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: raw(pipes[k], tdf).tolist() for k in EXPORTED},
                   ood_d2=ood.score(ood_fit, tdf, N.ALL, [], {}).tolist())
    (OUT / 'newlywed_la_couples_testvectors.json').write_text(json.dumps(vectors))

    audit = dict(couples=n, divorced=int(d.divorced.sum()), person_periods=int(len(rows)), events_by_period=events_by_period,
                 events_reported_after_a_missed_wave=int(d.event_after_missed_wave.sum()), status_reversals=int(d.status_reversal.sum()),
                 missing_inputs={c: int(d[c].isna().sum()) for c in N.ALL if d[c].isna().any()},
                 tuned_choices_outer={k: {str(h): chosen[k].count(h) for h in sorted(set(chosen[k]), key=str)} for k in KEYS},
                 final_hyperparameters={k: (list(v) if isinstance(v, tuple) else v) for k, v in final_hp.items()},
                 ood_heldout_d2_p99=float(np.percentile(ood_held, 99)), python_sklearn=sklearn.__version__,
                 runtime_seconds=round(time.time() - t0))
    (HERE / 'sample_audit.json').write_text(json.dumps(audit, indent=1) + '\n')

    pd.set_option('display.width', 250)
    cols = ['model', 'gain_vs_constant_pct', 'gain_vs_period_only_pct', 'gain_vs_period_only_pct_lo', 'gain_vs_period_only_pct_hi',
            'c_index', 'c_index_lo', 'c_index_hi', 'auc_2.3y', 'auc_4.2y', 'auc_8.8y', 'auc_12y', 'auc_12y_lo', 'auc_12y_hi',
            'brier_12y', 'brier_skill_12y_pct', 'gain_12y_vs_base_pct', 'oe_12y']
    print(comp[cols].round(3).to_string(index=False))
    print(abl.round(3).to_string(index=False))
    print(eff.round(3).to_string(index=False))
    print(cal.round(3).to_string(index=False))
    print(json.dumps(audit, indent=1))


if __name__ == '__main__':
    main()
