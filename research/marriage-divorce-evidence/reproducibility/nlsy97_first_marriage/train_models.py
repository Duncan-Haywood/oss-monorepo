"""NLSY97 first marriages: per-year separation-or-divorce models from the wedding month.

Builds marriage-year intervals from the NLSY97 public release (build_marriages.py), compares a
constant rate, a duration-only curve, an additive spline Poisson GLM, the same GLM with pair
interactions, Poisson trees and Poisson gradient boosting, held out BY PERSON (grouped 5-fold,
repeated 3 times), with person-bootstrap 95% intervals for deviance gain, Harrell's C, Uno's
time-dependent AUC at 5 and 10 years and decile lift. Runs feature-block ablations. Exports the
fitted models to ../../app/models/nlsy97_first_marriage.json (+ test vectors) and aggregate CSVs
here. Person-level rows never leave the work directory.

Run (after `sh download.sh`, which streams the extract into $NLSY97_WORK):
    NLSY97_WORK=/path/to/work python3 train_models.py
Needs numpy, pandas, scikit-learn 1.7.2 (requirements.txt).
"""
from pathlib import Path
import json, os, sys, time, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(ROOT / 'app' / 'tools'))
import build_marriages  # noqa: E402
from bundle_export import export as export_pipe  # noqa: E402
import ood  # noqa: E402

warnings.simplefilter('ignore')
assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2 (requirements.txt)'
SEED = 20261020
REPEATS = int(os.environ.get('NLSY97_REPEATS', 3))
BOOT = int(os.environ.get('NLSY97_BOOT', 400))
WORK = Path(os.environ.get('NLSY97_WORK', HERE / 'work'))
OUT = ROOT / 'app' / 'models'

GROUPS = {
    # wedding_year is left out: in a five-year birth cohort it is almost birth year + age at marriage,
    # its contrasts at fixed age are extrapolations, and a wedding today lies outside 1995-2024.
    'demographics': ['sex', 'race_ethnicity', 'age_at_marriage', 'region', 'urban'],
    'relationship history': ['cohabited_first', 'cohab_months_before', 'prior_cohabitations_band',
                             'children_before_marriage', 'pregnant_at_wedding'],
    'family background': ['parent_max_grade', 'family_at_12', 'poverty_ratio_1997', 'religion_raised',
                          'parent_attendance_1997'],
    'cognitive (AFQT)': ['afqt_percentile'],
    'behaviour': ['delinquency_1997', 'substance_1997', 'first_sex', 'attendance_before', 'mhi5_before'],
    'economics and education': ['education_at_marriage', 'enrolled_at_marriage', 'hours_year_before',
                                'earnings_year_before_k', 'net_worth_before_k'],
    'partner traits': ['spouse_age_gap', 'spouse_education', 'spouse_race_ethnicity', 'same_race_ethnicity',
                       'spouse_married_before', 'spouse_has_children'],
}
NUMERIC_ALL = ['marriage_years', 'age_at_marriage', 'cohab_months_before', 'parent_max_grade',
               'poverty_ratio_1997', 'afqt_percentile', 'delinquency_1997', 'substance_1997', 'mhi5_before',
               'hours_year_before', 'earnings_year_before_k', 'net_worth_before_k', 'spouse_age_gap']
PAIRS = ['pair_sex_age', 'pair_education', 'pair_cohab_age']
FIXED_NUMERIC = [c for c in NUMERIC_ALL if c != 'marriage_years']
FEATURES = [c for g in GROUPS.values() for c in g]
CATEGORICAL = [c for c in FEATURES if c not in NUMERIC_ALL]
CLIP = dict(cohab_months_before=(0, 120), poverty_ratio_1997=(0, 10), hours_year_before=(0, 4000),
            earnings_year_before_k=(0, 150), net_worth_before_k=(-50, 250), spouse_age_gap=(-15, 25))


def age_band(a):
    return np.where(a < 22, 'under 22', np.where(a < 26, '22-25', np.where(a < 30, '26-29', '30+')))


def edu3(e):
    return np.where(np.isin(e, ['No high school credential', 'High school or GED', '12 years', 'Less than 12 years']), 'HS or less',
                    np.where(np.isin(e, ['Associate', '13-15 years']), 'Some college', 'BA+'))


def add_pairs(d):
    """Pair features: crossed categories the app derives from the inputs (see bundle `inputs`)."""
    d = d.copy()
    ab = age_band(d.age_at_marriage.to_numpy())
    d['pair_sex_age'] = d.sex.astype(str) + ' x ' + ab
    d['pair_education'] = edu3(d.education_at_marriage.to_numpy()) + ' x spouse ' + edu3(d.spouse_education.to_numpy())
    d['pair_cohab_age'] = d.cohabited_first.astype(str) + ' x ' + ab
    return d


def prepare(m):
    m = m[~m.same_sex_marriage].copy()
    m['earnings_year_before_k'] = m.earnings_year_before / 1000
    m['net_worth_before_k'] = m.net_worth_before / 1000
    for c, (lo, hi) in CLIP.items():
        m[c] = m[c].clip(lo, hi)
    m['enrolled_at_marriage'] = m.enrolled_at_marriage.replace({'Unknown': 'No'})
    # Spouse traits the survey did not record (6-7% of marriages, disproportionately couples who
    # separated before the next interview) are imputed WITHOUT an outcome-aware category: schooling
    # by the most common spouse schooling for the respondent's own schooling, race-ethnicity by the
    # respondent's own group, the age gap by the sex-specific median. METHODS.md reports a
    # sensitivity analysis on marriages with every spouse trait observed.
    m['spouse_traits_observed'] = ((m.spouse_education != 'Unknown') & (m.spouse_race_ethnicity != 'Unknown')
                                   & m.spouse_age_gap.notna())
    known = m[m.spouse_education != 'Unknown']
    mode = known.groupby('education_at_marriage').apply(
        lambda g: g.groupby('spouse_education').weight97.sum().idxmax()).to_dict()
    u = m.spouse_education == 'Unknown'
    m.loc[u, 'spouse_education'] = m.loc[u, 'education_at_marriage'].map(mode)
    u = m.spouse_race_ethnicity == 'Unknown'
    m.loc[u, 'spouse_race_ethnicity'] = m.loc[u, 'race_ethnicity']
    m['same_race_ethnicity'] = np.where(m.spouse_race_ethnicity == m.race_ethnicity, 'Same', 'Different')
    gap_med = m.groupby('sex').spouse_age_gap.median().to_dict()
    m['spouse_age_gap'] = m.spouse_age_gap.fillna(m.sex.map(gap_med))
    m.attrs['imputation'] = dict(spouse_education_mode_by_own_education=mode,
                                 spouse_age_gap_median_by_sex={k: round(float(v), 3) for k, v in gap_med.items()})
    m['weight'] = m.weight97 / m.weight97.mean()
    return add_pairs(m.reset_index(drop=True))


def intervals(m):
    rec = []
    for r in m.itertuples(index=False):
        t, k = r.years, 0
        while k < t:
            rec.append((r.id, k, min(t, k + 1) - k, int(r.event and t <= k + 1)))
            k += 1
    iv = pd.DataFrame(rec, columns=['id', 'marriage_years', 'exposure', 'event'])
    return iv.merge(m.drop(columns=['event']), on='id', how='left')


# ---------------------------------------------------------------- models
def spline_num(cols, n_knots=5, knots='uniform'):
    # Uniform knots over the (clipped) training range: quantile knots repeat for inputs piled up at
    # zero (cohabitation months, delinquency, substance use), and repeated knots make the basis
    # ill-defined at the boundary, so the browser engine could not reproduce it exactly.
    num = Pipeline([('impute', SimpleImputer(strategy='median')),
                    ('spline', SplineTransformer(n_knots=n_knots, degree=2, knots=knots, include_bias=False,
                                                 extrapolation='linear')),
                    ('scale', StandardScaler())])
    return ('num', num, cols)


def onehot(cols):
    return ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), cols)


def make(kind, features, alpha=1e-3):
    num = [c for c in NUMERIC_ALL if c in features or c == 'marriage_years']
    cat = [c for c in features if c not in NUMERIC_ALL]
    if kind == 'duration_only':
        prep = ColumnTransformer([spline_num(['marriage_years'], 5, 'quantile')])
        est = PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    elif kind in ('additive_spline', 'spline_pairs'):
        if kind == 'spline_pairs':
            cat = cat + PAIRS
        prep = ColumnTransformer([spline_num(num), onehot(cat)])
        est = PoissonRegressor(alpha=alpha, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    else:
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), num), onehot(cat)])
        if kind == 'tree_depth3':
            est = DecisionTreeRegressor(criterion='poisson', max_depth=3, min_samples_leaf=2000, random_state=SEED)
        elif kind == 'tree_depth5':
            est = DecisionTreeRegressor(criterion='poisson', max_depth=5, min_samples_leaf=1000, random_state=SEED)
        elif kind == 'gradient_boosting':
            est = HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=150, learning_rate=0.05,
                                                min_samples_leaf=400, l2_regularization=1.0, early_stopping=False,
                                                random_state=SEED)
        else:
            raise KeyError(kind)
    return Pipeline([('prep', prep), ('fit', est)])


def fit(kind, d, features=FEATURES, alpha=1e-3):
    p = make(kind, features, alpha)
    p.fit(d, d.event / d.exposure, fit__sample_weight=d.weight * d.exposure)
    return p


def deviance(y, e, w, rate):
    mu = e * rate
    term = np.zeros(len(y))
    ok = y > 0
    term[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * np.dot(w, term - y + mu) / np.dot(w, e)


# Ridge penalty fixed before any held-out score was seen (no tuning against the reported folds).
ALPHA = 1e-3


MODELS = [('duration_only', 'Marriage length only (baseline curve)'),
          ('additive_spline', 'Additive spline Poisson GLM'),
          ('spline_pairs', 'Spline Poisson GLM with pair interactions'),
          ('tree_depth3', 'Poisson tree, depth 3'),
          ('tree_depth5', 'Poisson tree, depth 5'),
          ('gradient_boosting', 'Poisson gradient boosting (150 trees, depth 3)')]
GLMS = {'additive_spline', 'spline_pairs'}
HORIZONS = (5, 10, 20)


def grid(people, horizon=20):
    """Each person scored at marriage years 0..horizon-1 (fixed inputs, full years)."""
    g = people.loc[people.index.repeat(horizon)].copy()
    g['marriage_years'] = np.tile(np.arange(horizon, dtype=float), len(people))
    return g


def cumulative(pipe, people, horizon=20):
    r = pipe.predict(grid(people, horizon)).reshape(len(people), horizon)
    return np.cumsum(r, axis=1)    # H[:, t-1] = cumulative hazard to t years


# ---------------------------------------------------------------- discrimination metrics
def km_censoring(t, ev, w):
    """Weighted KM of the censoring distribution; returns G(s-) evaluator."""
    order = np.argsort(t, kind='stable')
    ts, cs, ws = t[order], 1 - ev[order], w[order]
    uniq, start = np.unique(ts, return_index=True)
    at_risk = np.cumsum(ws[::-1])[::-1][start]
    dc = np.add.reduceat(ws * cs, start)
    surv = np.cumprod(1 - np.where(at_risk > 0, dc / np.maximum(at_risk, 1e-300), 0))

    def G_minus(s):
        k = np.searchsorted(uniq, s, side='left') - 1
        return np.where(k >= 0, surv[np.clip(k, 0, None)], 1.0)
    return G_minus


def uno_auc(score, t, ev, w, horizon):
    G = km_censoring(t, ev, w)
    case = (t <= horizon) & (ev == 1)
    ctrl = t > horizon
    wc = np.where(case, w / np.maximum(G(t), 1e-12), 0)
    wn = np.where(ctrl, w, 0)
    return _pairwise_auc(score, wc, wn)


def _pairwise_auc(score, wc, wn):
    order = np.argsort(score, kind='stable')
    s = score[order]
    uniq, start = np.unique(s, return_index=True)
    cn = np.add.reduceat(wn[order], start)
    cc = np.add.reduceat(wc[order], start)
    below = np.cumsum(cn) - cn
    num = np.dot(cc, below + 0.5 * cn)
    den = wc.sum() * wn.sum()
    return num / den if den > 0 else np.nan


def harrell_c(score, t, ev, w, tau=20.0):
    """Weighted Harrell's C: pairs (i, j) with t_i < t_j, i an event before tau; concordant if score_i > score_j."""
    order = np.argsort(t, kind='stable')
    t, ev, w, score = t[order], ev[order], w[order], score[order]
    num = den = 0.0
    n = len(t)
    for start in range(0, n, 400):
        i = np.arange(start, min(n, start + 400))
        i = i[(ev[i] == 1) & (t[i] <= tau)]
        if not len(i):
            continue
        later = t[None, :] > t[i, None]
        wj = w[None, :] * later
        conc = (score[None, :] < score[i, None]) + 0.5 * (score[None, :] == score[i, None])
        num += np.dot(w[i], (wj * conc).sum(axis=1))
        den += np.dot(w[i], wj.sum(axis=1))
    return num / den


def weighted_quantile_bins(x, w, q=10):
    order = np.argsort(x, kind='stable')
    cw = np.cumsum(w[order]) / w.sum()
    b = np.empty(len(x), int)
    b[order] = np.minimum((cw * q - 1e-12).astype(int), q - 1)
    return b


def km_at(t, ev, w, horizon):
    order = np.argsort(t, kind='stable')
    t, ev, w = t[order], ev[order], w[order]
    s, at = 1.0, w.sum()
    for u in np.unique(t):
        if u > horizon:
            break
        sel = t == u
        d = (w * ev)[sel].sum()
        if at > 0:
            s *= 1 - d / at
        at -= w[sel].sum()
    return s


def person_metrics(H, t, ev, w):
    """Discrimination of risk scores at the wedding: H[:, k] cumulative hazard to k+1 years."""
    r5, r10 = H[:, 4], H[:, 9]
    out = dict(harrell_c=harrell_c(r10, t, ev, w), auc_5y=uno_auc(r5, t, ev, w, 5.0), auc_10y=uno_auc(r10, t, ev, w, 10.0))
    b = weighted_quantile_bins(r10, w)
    # Observed separation-or-divorce rate per person-year in the first 10 years, top vs bottom decile.
    exp10 = np.minimum(t, 10.0)
    ev10 = (ev == 1) & (t <= 10)
    rate = lambda s: np.dot(w[s], ev10[s]) / np.dot(w[s], exp10[s])
    out['top_decile_rate'] = rate(b == 9)
    out['bottom_decile_rate'] = rate(b == 0)
    out['decile_lift'] = out['top_decile_rate'] / out['bottom_decile_rate']
    return out


def bootstrap(people_ix_of_interval, n_people, iv_y, iv_e, iv_w, iv_preds, base, H, t, ev, w, reps, seed):
    """Paired person bootstrap (folds fixed): deviance gain vs constant and the person metrics."""
    rng = np.random.default_rng(seed)

    def unit_dev(rate):
        mu = iv_e * rate
        tt = np.zeros(len(iv_y))
        ok = iv_y > 0
        tt[ok] = iv_y[ok] * np.log(iv_y[ok] / mu[ok])
        return 2 * iv_w * (tt - iv_y + mu)
    per = {k: np.bincount(people_ix_of_interval, weights=unit_dev(p), minlength=n_people) for k, p in iv_preds.items()}
    pb = np.bincount(people_ix_of_interval, weights=unit_dev(base), minlength=n_people)
    draws = rng.integers(0, n_people, size=(reps, n_people))
    counts = np.stack([np.bincount(dd, minlength=n_people) for dd in draws]).astype(float)
    res = {k: dict(gain=100 * (1 - counts @ per[k] / (counts @ pb))) for k in iv_preds}
    for k in H:
        vals = {m: [] for m in ('harrell_c', 'auc_5y', 'auc_10y', 'decile_lift')}
        for r in range(reps):
            c = counts[r]
            keep = c > 0
            ww = (w * c)[keep]
            pm = person_metrics(H[k][keep], t[keep], ev[keep], ww)
            for m in vals:
                vals[m].append(pm[m])
        res[k].update({m: np.array(v) for m, v in vals.items()})
    return res, counts


def ci(a):
    a = np.asarray(a)
    a = a[np.isfinite(a)]
    return [round(float(np.quantile(a, 0.025)), 4), round(float(np.quantile(a, 0.975)), 4)]


def wquant(x, w, qs):
    order = np.argsort(x)
    x, w = x[order], w[order]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(qs, c, x)


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    raw = pd.read_pickle(WORK / 'marriages.pkl') if (WORK / 'marriages.pkl').exists() else build_marriages.build(WORK)
    m = prepare(raw)
    iv = intervals(m)
    assert abs(iv.exposure.sum() - m.years.sum()) < 1e-6 and iv.event.sum() == m.event.sum()
    print(f'{len(m)} marriages, {int(m.event.sum())} dissolutions, {len(iv)} intervals ({time.time() - t0:.0f}s)', flush=True)

    keys = ['constant'] + [k for k, _ in MODELS]
    cache = WORK / f'cv_cache_r{REPEATS}.pkl'
    if os.environ.get('NLSY97_RESUME') and cache.exists():
        preds, Hs, folds = pd.read_pickle(cache)
    else:
        preds, Hs, folds = cross_validate(m, iv, keys, t0)
        pd.to_pickle((preds, Hs, folds), cache)
    main_rest(m, iv, raw, keys, preds, Hs, folds, t0)


def cross_validate(m, iv, keys, t0):
    preds = {r: {k: np.zeros(len(iv)) for k in keys} for r in range(REPEATS)}
    Hs = {r: {k: np.zeros((len(m), 20)) for k in keys if k != 'constant'} for r in range(REPEATS)}
    folds = {}
    for r in range(REPEATS):
        ids = m.id.to_numpy().copy()
        np.random.default_rng(SEED + r).shuffle(ids)
        fold_of = {i: k % 5 for k, i in enumerate(ids)}
        folds[r] = m.id.map(fold_of).to_numpy()
        ivf = iv.id.map(fold_of).to_numpy()
        for f in range(5):
            tr, te = iv[ivf != f], iv[ivf == f]
            ix = np.where(ivf == f)[0]
            pte = m[folds[r] == f]
            pix = np.where(folds[r] == f)[0]
            preds[r]['constant'][ix] = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
            for k, _ in MODELS:
                p = fit(k, tr, FEATURES, ALPHA)
                preds[r][k][ix] = p.predict(te)
                Hs[r][k][pix] = cumulative(p, pte)
            print(f'repeat {r} fold {f} done ({time.time() - t0:.0f}s)', flush=True)
    for r in range(REPEATS):
        Hs[r]['constant'] = np.outer(np.ones(len(m)), np.arange(1, 21)) * np.nan  # filled below
        for f in range(5):
            tr = iv[iv.id.map(dict(zip(m.id, folds[r]))) != f]
            c = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
            Hs[r]['constant'][folds[r] == f] = c * np.arange(1, 21)
    return preds, Hs, folds


def main_rest(m, iv, raw, keys, preds, Hs, folds, t0):
    pid = {i: k for k, i in enumerate(m.id)}
    iv_pix = iv.id.map(pid).to_numpy()
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    T, EV, WP = m.years.to_numpy(), m.event.to_numpy(), m.weight.to_numpy()

    # Per-repeat metrics (spread over fold assignments).
    rows = []
    for r in range(REPEATS):
        base = deviance(y, e, w, preds[r]['constant'])
        dur = deviance(y, e, w, preds[r]['duration_only'])
        for k in keys:
            d = deviance(y, e, w, preds[r][k])
            pm = person_metrics(Hs[r][k], T, EV, WP) if k != 'constant' else dict(harrell_c=0.5, auc_5y=0.5, auc_10y=0.5, decile_lift=np.nan)
            rows.append(dict(repeat=r, model=k, deviance_gain_percent=100 * (1 - d / base),
                             gain_over_duration_percent=100 * (1 - d / dur),
                             observed_expected=float(np.dot(w, y) / np.dot(w, e * preds[r][k])),
                             **{kk: pm[kk] for kk in ('harrell_c', 'auc_5y', 'auc_10y', 'decile_lift')}))
    per_repeat = pd.DataFrame(rows)
    per_repeat.to_csv(HERE / 'heldout_per_repeat.csv', index=False, float_format='%.6g')
    # Point estimates, intervals, calibration and the population reference use repeat 0 (one
    # ordinary 5-fold person split, so each prediction comes from a single fitted model); the other
    # repeats give the spread over fold assignments. Averaging predictions across repeats would
    # turn each model into a 3-model bag and flatter the trees.
    avg = {k: preds[0][k] for k in keys}
    Havg = {k: Hs[0][k] for k in keys}

    print('bootstrap...', flush=True)
    boot, counts = bootstrap(iv_pix, len(m), y, e, w, avg, avg['constant'], {k: Havg[k] for k in keys if k != 'constant'},
                             T, EV, WP, BOOT, SEED)
    base = deviance(y, e, w, avg['constant'])
    dur = deviance(y, e, w, avg['duration_only'])
    comp = []
    for k in keys:
        d = deviance(y, e, w, avg[k])
        pr = per_repeat[per_repeat.model == k]
        row = dict(model=k, deviance_gain_percent=100 * (1 - d / base), gain_ci95=ci(boot[k]['gain']),
                   gain_over_duration_percent=100 * (1 - d / dur),
                   gain_repeat_range=[round(pr.deviance_gain_percent.min(), 3), round(pr.deviance_gain_percent.max(), 3)],
                   gain_repeat_mean=round(pr.deviance_gain_percent.mean(), 3),
                   observed_expected=float(np.dot(w, y) / np.dot(w, e * avg[k])))
        if k != 'constant':
            pm = person_metrics(Havg[k], T, EV, WP)
            for mm in ('harrell_c', 'auc_5y', 'auc_10y', 'decile_lift'):
                row[mm] = pm[mm]
                row[mm + '_ci95'] = ci(boot[k][mm])
                row[mm + '_repeat_range'] = [round(pr[mm].min(), 4), round(pr[mm].max(), 4)]
            row['top_decile_rate'], row['bottom_decile_rate'] = pm['top_decile_rate'], pm['bottom_decile_rate']
        comp.append(row)
    comp_df = pd.DataFrame(comp)
    flat = comp_df.copy()
    for c in [c for c in flat.columns if c.endswith('_ci95') or c.endswith('_range')]:
        flat[c + '_low'] = flat[c].map(lambda v: v[0] if isinstance(v, list) else np.nan)
        flat[c + '_high'] = flat[c].map(lambda v: v[1] if isinstance(v, list) else np.nan)
        flat = flat.drop(columns=c)
    flat.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.6g')
    print(flat.round(4).to_string(index=False), flush=True)

    # Interval-level calibration (exposure-weighted deciles of predicted rate) and person-level
    # calibration of the predicted 5/10-year dissolution against weighted Kaplan-Meier.
    cal, pcal = [], []
    for k in keys[1:]:
        p = avg[k]
        b = weighted_quantile_bins(p, w * e)
        for j in range(10):
            s = b == j
            cal.append(dict(model=k, bin=j + 1, intervals=int(s.sum()), events=int(y[s].sum()),
                            observed_rate=float(np.dot(w[s], y[s]) / np.dot(w[s], e[s])),
                            predicted_rate=float(np.dot(w[s], e[s] * p[s]) / np.dot(w[s], e[s]))))
        for hz in (5, 10):
            risk = 1 - np.exp(-Havg[k][:, hz - 1])
            b = weighted_quantile_bins(risk, WP)
            for j in range(10):
                s = b == j
                pcal.append(dict(model=k, horizon_years=hz, decile=j + 1, marriages=int(s.sum()),
                                 predicted=float(np.average(risk[s], weights=WP[s])),
                                 observed_km=float(1 - km_at(T[s], EV[s], WP[s], hz))))
    cal = pd.DataFrame(cal)
    cal.to_csv(HERE / 'heldout_calibration.csv', index=False, float_format='%.6g')
    pcal = pd.DataFrame(pcal)
    pcal.to_csv(HERE / 'heldout_person_calibration.csv', index=False, float_format='%.6g')

    # Sensitivity: the same held-out predictions scored only on marriages with every spouse trait observed.
    obs = m.spouse_traits_observed.to_numpy()
    ivobs = obs[iv_pix]
    sens = []
    for k in keys[1:]:
        bb = deviance(y[ivobs], e[ivobs], w[ivobs], avg['constant'][ivobs])
        dd = deviance(y[ivobs], e[ivobs], w[ivobs], avg[k][ivobs])
        pm = person_metrics(Havg[k][obs], T[obs], EV[obs], WP[obs])
        sens.append(dict(model=k, marriages=int(obs.sum()), deviance_gain_percent=100 * (1 - dd / bb),
                         harrell_c=pm['harrell_c'], auc_10y=pm['auc_10y']))
    pd.DataFrame(sens).to_csv(HERE / 'sensitivity_spouse_traits_observed.csv', index=False, float_format='%.6g')

    # ------------------------------------------------ feature-block ablations (additive spline, repeat 0 folds)
    print('ablations...', flush=True)
    ivf0 = iv.id.map(dict(zip(m.id, folds[0]))).to_numpy()
    variants = [('duration + demographics', GROUPS['demographics'])]
    for g in GROUPS:
        if g != 'demographics':
            variants.append((f'duration + demographics + {g}', GROUPS['demographics'] + GROUPS[g]))
    variants.append(('all blocks', FEATURES))
    for g in GROUPS:
        variants.append((f'all blocks minus {g}', [c for c in FEATURES if c not in GROUPS[g]]))
    variants.append(('all blocks minus partner traits and relationship history',
                     [c for c in FEATURES if c not in GROUPS['partner traits'] + GROUPS['relationship history']]))
    if os.environ.get('NLSY97_SMOKE'):
        variants = [v for v in variants if v[0] in ('duration + demographics', 'all blocks', 'all blocks minus cognitive (AFQT)')]
    abl_cache = WORK / f'ablation_cache_{len(variants)}.pkl'
    abl_pred, abl_H = pd.read_pickle(abl_cache) if os.environ.get('NLSY97_RESUME') and abl_cache.exists() else ({}, {})
    for name, feats in variants:
        if name in abl_pred:
            continue
        p_iv, H = np.zeros(len(iv)), np.zeros((len(m), 20))
        for f in range(5):
            tr = iv[ivf0 != f]
            p = fit('additive_spline', tr, feats, ALPHA)
            p_iv[ivf0 == f] = p.predict(iv[ivf0 == f])
            H[folds[0] == f] = cumulative(p, m[folds[0] == f])
        abl_pred[name], abl_H[name] = p_iv, H
        print('  ', name, f'({time.time() - t0:.0f}s)', flush=True)
        pd.to_pickle((abl_pred, abl_H), abl_cache)
    base0 = preds[0]['constant']
    aboot, _ = bootstrap(iv_pix, len(m), y, e, w, {**abl_pred, 'duration_only': preds[0]['duration_only']}, base0,
                         {}, T, EV, WP, BOOT, SEED + 1)
    abl = []
    for name, feats in variants:
        d = deviance(y, e, w, abl_pred[name])
        pm = person_metrics(abl_H[name], T, EV, WP)
        row = dict(variant=name, inputs=len(feats), deviance_gain_percent=100 * (1 - d / deviance(y, e, w, base0)),
                   gain_ci95_low=ci(aboot[name]['gain'])[0], gain_ci95_high=ci(aboot[name]['gain'])[1],
                   harrell_c=pm['harrell_c'], auc_10y=pm['auc_10y'], decile_lift=pm['decile_lift'])
        if name.startswith('all blocks minus'):
            diff = aboot['all blocks']['gain'] - aboot[name]['gain']
            row['full_minus_this_gain_points'] = float(100 * (1 - deviance(y, e, w, abl_pred['all blocks']) / deviance(y, e, w, base0))) - row['deviance_gain_percent']
            row['full_minus_this_ci95_low'], row['full_minus_this_ci95_high'] = ci(diff)
        abl.append(row)
    abl = pd.DataFrame(abl)
    abl.to_csv(HERE / 'ablation_feature_blocks.csv', index=False, float_format='%.6g')
    print(abl.round(4).to_string(index=False), flush=True)

    # ------------------------------------------------ final fits on everyone, exported for the browser
    pipes = {k: fit(k, iv, FEATURES, ALPHA) for k, _ in MODELS}
    for k in ('tree_depth3', 'tree_depth5'):
        (HERE / f'{k}.txt').write_text(export_text(pipes[k].named_steps['fit'], decimals=4,
                                                   feature_names=pipes[k].named_steps['prep'].get_feature_names_out().tolist()))
    add = pipes['additive_spline']
    pd.DataFrame(dict(feature=add.named_steps['prep'].get_feature_names_out(), coef=add.named_steps['fit'].coef_)).to_csv(
        HERE / 'coefficients_additive_spline.csv', index=False, float_format='%.6g')

    # Rate ratios of the additive model at a reference profile, with person-bootstrap intervals.
    ref = {c: float(m[c].median()) for c in FIXED_NUMERIC}
    ref['marriage_years'] = 2.0
    ref.update({c: m.groupby(c).weight.sum().idxmax() for c in CATEGORICAL})
    ref.update(spouse_married_before='No', spouse_has_children='No')
    ref_row = add_pairs(pd.DataFrame([ref]))
    contrasts = []
    for c in FIXED_NUMERIC:
        lo, hi = np.nanquantile(m[c], [0.1, 0.9])
        contrasts.append((c, f'{lo:.4g} (p10)', f'{hi:.4g} (p90)', {c: lo}, {c: hi}))
    for c in CATEGORICAL:
        for v in sorted(m[c].unique()):
            if v != ref[c]:
                contrasts.append((c, str(ref[c]), str(v), {}, {c: v}))

    def rr_table(pipe):
        out = []
        for c, a, b, da, db in contrasts:
            ra = pipe.predict(add_pairs(pd.DataFrame([{**ref, **da}])))[0]
            rb = pipe.predict(add_pairs(pd.DataFrame([{**ref, **db}])))[0]
            out.append(rb / ra)
        return np.array(out)
    rr = rr_table(add)
    rb = []
    rng = np.random.default_rng(SEED + 5)
    nb = int(os.environ.get('NLSY97_RR_BOOT', 100))
    groups = iv.groupby('id').indices
    idlist = m.id.to_numpy()
    rr_cache = WORK / f'rr_cache_{nb}_{len(contrasts)}.pkl'
    if os.environ.get('NLSY97_RESUME') and rr_cache.exists():
        rb = pd.read_pickle(rr_cache)
    else:
        for b in range(nb):
            pick = rng.choice(idlist, size=len(idlist), replace=True)
            ix = np.concatenate([groups[i] for i in pick])
            rb.append(rr_table(fit('additive_spline', iv.iloc[ix], FEATURES, ALPHA)))
        rb = np.array(rb)
        pd.to_pickle(rb, rr_cache)
    rr_df = pd.DataFrame([dict(input=c, reference=a, value=b, rate_ratio=rr[j],
                               ci95_low=np.quantile(rb[:, j], 0.025), ci95_high=np.quantile(rb[:, j], 0.975))
                          for j, (c, a, b, _, _) in enumerate(contrasts)])
    rr_df.to_csv(HERE / 'additive_rate_ratios.csv', index=False, float_format='%.4f')
    print(rr_df.round(3).to_string(index=False), flush=True)

    # Weighted Kaplan-Meier (aggregate) overall and by groups.
    def km_curve(g, years=(1, 2, 3, 5, 10, 15, 20)):
        return {f'still_married_{yr}y': km_at(g.years.to_numpy(), g.event.to_numpy(), g.weight.to_numpy(), yr) for yr in years}
    lt = [dict(group='All first marriages', marriages=len(m), dissolutions=int(m.event.sum()), **km_curve(m))]
    for c in ['sex', 'race_ethnicity', 'cohabited_first', 'education_at_marriage', 'children_before_marriage', 'family_at_12']:
        for v in sorted(m[c].unique()):
            g = m[m[c] == v]
            if len(g) >= 100:
                lt.append(dict(group=f'{c}: {v}', marriages=len(g), dissolutions=int(g.event.sum()), **km_curve(g)))
    ab = age_band(m.age_at_marriage.to_numpy())
    for v in ['under 22', '22-25', '26-29', '30+']:
        g = m[ab == v]
        lt.append(dict(group=f'age at marriage: {v}', marriages=len(g), dissolutions=int(g.event.sum()), **km_curve(g)))
    lt = pd.DataFrame(lt)
    lt.to_csv(HERE / 'weighted_survival.csv', index=False, float_format='%.4f')

    # Best model by held-out deviance (excluding the baseline).
    order = comp_df[comp_df.model.isin([k for k, _ in MODELS if k != 'duration_only'])].sort_values('deviance_gain_percent', ascending=False)
    best = order.model.iloc[0]

    # Population reference in the shape app/population.js reads: weighted quantiles p1..p99 of each
    # marriage's HELD-OUT predicted chance of separation or divorce within 5, 10 and 20 years of the
    # wedding (each pK a list aligned to horizons). The lens's number is 1 minus the mean, over the
    # scoring models (baseline excluded), of each model's survival exp(-cumulative hazard), as in
    # the NSFG lenses (app/tools/population_reference.py).
    scoring = [k for k, _ in MODELS if k != 'duration_only']
    surv = np.mean([np.exp(-Havg[k]) for k in scoring], axis=0)
    risk = np.column_stack([1 - surv[:, hz - 1] for hz in HORIZONS])
    pcts = list(range(1, 100))
    MIN_CELL = 100

    def ref_cell(sel):
        vals = [wquant(risk[sel, j], WP[sel], [p / 100 for p in pcts]) for j in range(len(HORIZONS))]
        return dict(n=int(sel.sum()), quantiles={f'p{p}': [round(float(vals[j][i]), 6) for j in range(len(HORIZONS))]
                                                 for i, p in enumerate(pcts)})
    afqt_cuts = [float(v) for v in np.nanquantile(m.afqt_percentile, [1 / 3, 2 / 3])]
    defs = dict(
        sex=dict(label='Sex', column='sex'),
        age_at_marriage_band=dict(label='Age at the wedding', column='age_at_marriage',
                                  bins=[dict(level='under 22', min=None, max=22), dict(level='22-25', min=22, max=26),
                                        dict(level='26-29', min=26, max=30), dict(level='30+', min=30, max=None)]),
        education_at_marriage=dict(label='Education at the wedding', column='education_at_marriage'),
        race_ethnicity=dict(label='Race-ethnicity', column='race_ethnicity'),
        cohabited_first=dict(label='Lived together before marrying', column='cohabited_first'),
        family_at_12=dict(label='Lived with at age 12 (proxy for parental separation)', column='family_at_12'),
        afqt_tercile=dict(label='AFQT (ASVAB math-verbal) tercile', column='afqt_percentile',
                          bins=[dict(level='lowest third', min=None, max=round(afqt_cuts[0], 3)),
                                dict(level='middle third', min=round(afqt_cuts[0], 3), max=round(afqt_cuts[1], 3)),
                                dict(level='highest third', min=round(afqt_cuts[1], 3), max=None)]),
        attendance_before=dict(label='Own worship attendance before the wedding', column='attendance_before'),
    )

    def levels_of(spec):
        x = m[spec['column']]
        if 'bins' not in spec:
            return np.array([v if isinstance(v, str) else 'Unknown' for v in x])
        out = np.full(len(m), None, dtype=object)
        xv = x.to_numpy(dtype=float)
        for bn in spec['bins']:
            ok = ~np.isnan(xv)
            if bn['min'] is not None:
                ok &= xv >= bn['min']
            if bn['max'] is not None:
                ok &= xv < bn['max']
            out[ok] = bn['level']
        return out
    subs = {}
    for name, spec in defs.items():
        lv = levels_of(spec)
        cells = {}
        for v in ([bn['level'] for bn in spec['bins']] if 'bins' in spec else sorted(set(lv))):
            sel = lv == v
            if sel.sum() >= MIN_CELL:
                cells[str(v)] = ref_cell(sel)
        subs[name] = cells
    pop = dict(
        about=('Survey-weighted quantiles of held-out predicted separation or divorce of a first marriage within 5, 10 '
               'and 20 years of the wedding, scored with inputs at the wedding by models fitted on the other person folds '
               '(first 5-fold split). Lens number = 1 - mean over the scoring models of exp(-cumulative hazard). Each pK is '
               'a list aligned to horizons. Subgroup cells have at least 100 unweighted marriages; n is that count. '
               'Nothing person-level. The 20-year horizon rests on about 300 marriages still at risk in year 20.'),
        quantity='cumulative_dissolution_probability', horizons=list(HORIZONS), scoring_models=scoring,
        weights='NLSY97 round-1 sampling weights', min_cell=MIN_CELL,
        overall=ref_cell(np.ones(len(m), bool)), subgroups=subs, subgroup_defs=defs)

    # Partner distribution: spouse traits given respondent traits (observed spouse traits only).
    md = m[m.spouse_traits_observed]
    gap_band = pd.cut(md.spouse_age_gap, [-99, -2, 2, 5, 99], labels=['spouse 2+ years younger', 'within 2 years', 'spouse 2-5 years older', 'spouse 5+ years older'], right=False).astype(str)
    resp_band = md.sex + ', ' + pd.Series(age_band(md.age_at_marriage.to_numpy()), index=md.index) + ', ' + pd.Series(edu3(md.education_at_marriage.to_numpy()), index=md.index)

    def dist(cond, target, min_cell=30):
        out = []
        for cv in sorted(cond.unique()):
            s = cond == cv
            if s.sum() < min_cell:
                continue
            tw = md.weight[s].groupby(target[s]).sum()
            tn = target[s].value_counts()
            shares, suppressed = {}, 0.0
            for tv in tw.index:
                if tn.get(tv, 0) >= min_cell:
                    shares[str(tv)] = round(float(tw[tv] / tw.sum()), 4)
                else:
                    suppressed += float(tw[tv] / tw.sum())
            out.append(dict(respondent=str(cv), marriages=int(s.sum()), shares=shares, suppressed_share=round(suppressed, 4)))
        return out
    partner = dict(
        note=('Survey-weighted shares of spouse traits among first marriages with every spouse trait observed, conditional on '
              'the respondent (sex, age at marriage band, own education). Rows need at least 30 marriages; a spouse category '
              'with fewer than 30 marriages is folded into suppressed_share. Describes who married whom in this cohort; not a '
              'recommendation.'),
        min_cell=30,
        spouse_age_gap_given_sex_age_education=dist(resp_band, gap_band),
        spouse_education_given_sex_age_education=dist(resp_band, md.spouse_education),
        spouse_race_ethnicity_given_race_ethnicity=dist(md.race_ethnicity, md.spouse_race_ethnicity),
        spouse_married_before_given_sex_age=dist(md.sex + ', ' + pd.Series(age_band(md.age_at_marriage.to_numpy()), index=md.index),
                                                 md.spouse_married_before.where(md.spouse_married_before != 'Unknown', 'not asked (partner first listed before 2011)')))

    # Out-of-distribution score on the couple's fixed inputs.
    levels = {c: sorted(m[c].unique()) for c in CATEGORICAL}
    ood_spec, ood_held, ood_fit = ood.build(m, folds[0], FIXED_NUMERIC, CATEGORICAL, levels)

    # Support: central 99% of marriages for numeric inputs; marriage years with >= 50 at risk.
    at_risk = iv.groupby('marriage_years').size()
    support = {'marriage_years': [0.0, float(at_risk[at_risk >= 50].index.max())]}
    support.update({c: [round(float(np.nanquantile(m[c], 0.005)), 3), round(float(np.nanquantile(m[c], 0.995)), 3)] for c in FIXED_NUMERIC})

    audit = dict(
        respondents_in_release=build_marriages.N_RESPONDENTS,
        weighted_round1_population_millions=round(raw.attrs['weighted_total_1997'] / 1e6, 2),
        ever_married_created_variable=raw.attrs['ever_married_created'],
        first_marriage_date_known=raw.attrs['first_marriage_date_known'],
        dropped_inconsistent_dates=raw.attrs['dropped_inconsistent_dates'],
        dropped_same_sex=int(raw.same_sex_marriage.sum()),
        first_marriages=len(m), dissolutions=int(m.event.sum()),
        dissolutions_by_first_status={k: int(v) for k, v in m[m.event == 1].end_how.value_counts().items()},
        widowed_censored=int((m.end_how == 'widowed').sum()),
        intervals=len(iv), person_years=round(float(iv.exposure.sum()), 1),
        wedding_years=[int(m.wedding_year.min()), int(m.wedding_year.max())],
        age_at_marriage_range=[round(float(m.age_at_marriage.min()), 2), round(float(m.age_at_marriage.max()), 2)],
        spouse_traits_observed=int(m.spouse_traits_observed.sum()),
        spouse_source={k: int(v) for k, v in m.spouse_source.value_counts().items()},
        missing_share={c: round(float(m[c].isna().mean()), 4) for c in FIXED_NUMERIC},
        imputation=m.attrs['imputation'], glm_ridge_alpha=ALPHA,
        folds=f'5 folds by respondent, {REPEATS} seeded repeats; hyperparameters fixed in advance',
        bootstrap_replicates=BOOT, python_sklearn=sklearn.__version__)
    (HERE / 'sample_audit.json').write_text(json.dumps(audit, indent=1, default=str) + '\n')

    held = comp_df.set_index('model')

    def heldout(k):
        h = held.loc[k]
        out = dict(deviance_improvement_percent=round(float(h.deviance_gain_percent), 3), ci95=h.gain_ci95,
                   improvement_over_duration_only_percent=round(float(h.gain_over_duration_percent), 3),
                   repeat_mean=h.gain_repeat_mean, repeat_range=h.gain_repeat_range,
                   observed_expected_ratio=round(float(h.observed_expected), 4))
        for mm in ('harrell_c', 'auc_5y', 'auc_10y', 'decile_lift'):
            out[mm] = round(float(h[mm]), 4)
            out[mm + '_ci95'] = h[mm + '_ci95']
            out[mm + '_repeat_range'] = h[mm + '_repeat_range']
        out['top_decile_rate'] = round(float(h.top_decile_rate), 5)
        out['bottom_decile_rate'] = round(float(h.bottom_decile_rate), 5)
        out['calibration'] = cal[cal.model == k].drop(columns='model').round(6).to_dict(orient='records')
        return out

    export_list = [k for k, _ in MODELS]
    bundle = dict(
        id='nlsy97_first_marriage', version=1,
        source=('National Longitudinal Survey of Youth 1997 (BLS), public release rounds 1-21 (1997-2023/24); respondents '
                'born 1980-84, first marriages begun 1995-2024 followed prospectively from the wedding month'),
        target=('Annual rate of separation or divorce of a FIRST marriage per marriage-year from the wedding month (monthly '
                'marital-status array: first month separated or divorced); widowhood and last interview censor (Poisson rate, not a probability)'),
        population=('U.S. residents born 1980-84 (aged 12-16 at the end of 1996) in their FIRST marriage, either sex, opposite-sex '
                    'spouses of any marital history; respondent report plus the household roster for the spouse'),
        weights=('Round-1 sampling weight (cumulative cases), normalised to mean 1 over first marriages, times exposure. The NLS '
                 'custom-weight program (multi-round panel weights) is web-only; round-1 weights do not adjust for later attrition'),
        training=dict(intervals=len(iv), respondents=len(m), events=int(m.event.sum()), person_years=round(float(iv.exposure.sum()), 1)),
        constant_rate=float((iv.weight * iv.event).sum() / (iv.weight * iv.exposure).sum()),
        support=support,
        inputs=dict(
            marriage_years='completed years since the wedding at the start of the year being scored (0 = first year)',
            sex='Male/Female: the person whose traits are entered as "own" (the NLSY97 respondent)',
            race_ethnicity='Black, Hispanic, Non-Black non-Hispanic (NLSY97 KEY!RACE_ETHNICITY; mixed race grouped with non-Black non-Hispanic)',
            age_at_marriage='own age in years on the wedding day',
            region='Census region at the last interview before the wedding: Northeast, North Central, South, West, Unknown',
            urban='Urban/Rural/Unknown at the last interview before the wedding',
            cohabited_first='Yes/No: lived with this spouse in the month before the wedding',
            cohab_months_before='months lived together before the wedding (0 if not); clipped at 120',
            prior_cohabitations_band='0, 1, 2+: earlier live-in partners other than this spouse',
            children_before_marriage='0, 1, 2+: own biological children born before the wedding month',
            pregnant_at_wedding='Yes/No: a biological child born in the wedding month or the 7 months after',
            parent_max_grade='highest grade completed by either biological parent (1997 report; resident parents if missing)',
            family_at_12=('Both biological parents / Biological parent and step or other parent / Single biological parent / '
                          'Other arrangement / Unknown: who the respondent lived with at age 12 (a proxy for parental separation, not a direct measure)'),
            poverty_ratio_1997='household income / poverty line in 1996 (parent household); clipped at 10',
            religion_raised='Catholic, Protestant, None, Other, Unknown (own religious preference in 1997, ages 12-16)',
            parent_attendance_1997='parent\'s worship attendance in 1997: Never, Less than monthly, About monthly, Weekly or more, Unknown',
            afqt_percentile='ASVAB math-verbal percentile (0-100; tested 1997-98, before almost every wedding)',
            delinquency_1997='delinquency index 0-10 (1997 self-report)', substance_1997='substance-use index 0-3 (1997 self-report)',
            first_sex='Under 15, 15-16, 17 or older or not by 2001, Unknown (2000-01 reports)',
            attendance_before=('own worship attendance at the last interview before the wedding: Never, Less than monthly, About monthly, '
                               'Weekly or more, or "Not measured before wedding" (asked from 2000; weddings before then)'),
            mhi5_before='5-item mental health inventory, 0-100 (higher = better), last interview before the wedding (2000-2010, 2015 rounds)',
            education_at_marriage='No high school credential, High school or GED, Associate, Bachelor, Graduate degree (credential dated before the wedding month)',
            enrolled_at_marriage='Yes/No: enrolled in college in the wedding month',
            hours_year_before='hours worked in the calendar year before the wedding year (0-4000)',
            earnings_year_before_k='own wage and salary income in the calendar year before the wedding year, $1000s nominal (0-150)',
            net_worth_before_k='household net worth at the age-20 or age-25 assets interview if it preceded the wedding, $1000s (-50 to 250); null if not measured',
            spouse_age_gap='spouse\'s age minus own age at the wedding, years (-15 to 25)',
            spouse_education='Less than 12 years, 12 years, 13-15 years, 16+ years (spouse\'s highest grade completed)',
            spouse_race_ethnicity='Black, Hispanic, Non-Black non-Hispanic',
            same_race_ethnicity='Same/Different: derived from race_ethnicity and spouse_race_ethnicity',
            spouse_married_before='Yes/No; Unknown when the partner was first listed before 2011 (not asked)',
            spouse_has_children='Yes/No: spouse had children with someone else; Unknown when first listed before 2011',
            pair_sex_age='derived: sex + " x " + age band of age_at_marriage (under 22, 22-25, 26-29, 30+); spline_pairs model only',
            pair_education=('derived: own education coarse + " x spouse " + spouse education coarse, each HS or less / Some college / BA+ '
                            '(Associate and 13-15 years are Some college); spline_pairs model only'),
            pair_cohab_age='derived: cohabited_first + " x " + age band; spline_pairs model only'),
        abstain=['same-sex couples (62 identified same-sex first marriages were excluded)',
                 'either partner previously married on the "own" side (first marriages of the respondent only)',
                 'own age at marriage outside the support (born 1980-84: weddings at roughly 16-43)',
                 'profiles above the ood abstain percentile'],
        timing=('Every input is measured at or before the wedding month, from the round before the wedding, from 1997-2001 '
                'youth reports, or from dated histories (degrees, births, cohabitation, monthly enrolment). Exceptions: spouse '
                'schooling and race-ethnicity come from the household roster at the first interview after the wedding (median about a year later) or, for '
                'spouses no longer co-resident then, from the partner section asked about the start of living together; '
                'earnings for the year before the wedding can be reported at an interview after it. TIPI personality '
                '(2008 only) and CES-D (2019+) were excluded because they postdate most weddings.'),
        best_model=best,
        models=[dict(key=k, label=lbl, heldout=heldout(k), **export_pipe(pipes[k])) for k, lbl in MODELS],
        comparison={k: dict(deviance_improvement_percent=round(float(held.loc[k, 'deviance_gain_percent']), 3),
                            ci95=held.loc[k, 'gain_ci95']) for k in keys},
        ablation=abl.round(4).replace({np.nan: None}).to_dict(orient='records'),
        weighted_survival=json.loads(lt.to_json(orient='records')),
        population_reference=pop,
        partner_distribution=partner,
        ood=ood_spec,
        sklearn=sklearn.__version__,
    )
    OUT.mkdir(exist_ok=True)
    (OUT / 'nlsy97_first_marriage.json').write_text(json.dumps(bundle, separators=(',', ':'), default=float))

    # Test vectors: random profiles spanning categories, numeric ranges (incl. outside support) and nulls.
    vrng = np.random.default_rng(SEED + 9)
    rows = []
    for i in range(80):
        r = {c: str(vrng.choice(levels[c])) for c in CATEGORICAL}
        r['marriage_years'] = float(vrng.uniform(0, 30))
        for c in FIXED_NUMERIC:
            lo, hi = np.nanquantile(m[c], [0.0, 1.0])
            span = hi - lo
            r[c] = None if (i + FIXED_NUMERIC.index(c)) % 11 == 0 else float(vrng.uniform(lo - 0.1 * span, hi + 0.1 * span))
        rows.append(r)
    df = add_pairs(pd.DataFrame(rows))
    for c in FIXED_NUMERIC:
        df[c] = df[c].astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: pipes[k].predict(df).tolist() for k in export_list},
                   ood_d2=ood.score(ood_fit, df, FIXED_NUMERIC, CATEGORICAL, levels).tolist())
    (OUT / 'nlsy97_first_marriage_testvectors.json').write_text(json.dumps(vectors))
    print('best', best, 'done', f'{time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
