"""NLSY79 first marriages from the wedding: per-year legal-divorce models, held out by person.

Reads WORK/first_marriages.csv (build_first_marriages.py; person-level, not in git). Builds
marriage-year intervals with delayed entry at the first interview after the wedding, compares a
constant rate, a duration-only curve, an additive spline Poisson GLM, a spline + pair-interaction
GLM, a depth-3 Poisson tree and Poisson gradient boosting under repeated person-grouped 5-fold
cross-validation, and writes:

- aggregate tables in this folder (heldout_model_comparison.csv, heldout_calibration.csv,
  horizon_calibration.csv, decile_lift.csv, ablation.csv, fold_metrics.csv, weighted_survival.csv,
  additive_partial_effects.csv, from_wedding_sensitivity.csv, tree_depth3.txt, training_audit.json);
- ../../app/models/nlsy79_first_marriage.json (fitted models, held-out skill, ood,
  population_reference, partner_distribution) and its Python test vectors.

Usage: python3 train_first_marriage.py WORKDIR   (scikit-learn 1.7.2)
"""
import json, os, sys, time, warnings
from pathlib import Path
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / 'app' / 'tools'))
import survmetrics as sm  # noqa: E402
import ood  # noqa: E402

assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2'
WORK = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'work'
OUT = ROOT / 'app' / 'models'
SEED, REPEATS, FOLDS, BOOT, H = 20261019, 3, 5, 500, 30
SMOKE = os.environ.get('NLSY_SMOKE') == '1'  # quick code check on 1,500 marriages; outputs are not results
if SMOKE:
    REPEATS, BOOT = 1, 20
HORIZONS = [5, 10, 20, 30]

NUMERIC = ['marriage_years', 'age_at_marriage', 'wedding_year', 'afqt', 'rotter', 'rosenberg', 'delinquency',
           'income_percentile', 'spouse_age_at_marriage']
CATEGORICAL = ['sex', 'race', 'own_education', 'enrolled', 'mother_education', 'father_education', 'family_at_14',
               'religion_raised', 'attendance', 'poverty', 'region', 'urban', 'premarital_birth', 'cohabiting_before',
               'lived_with_parents', 'spouse_in_household', 'spouse_education', 'spouse_worked',
               'afqt_missing', 'income_missing', 'rosenberg_missing', 'delinquency_missing']
PAIRS = ['education_pair', 'age_pair', 'sex_age_band']
FIXED_NUMERIC = NUMERIC[1:]
BLOCKS = {
    'age and timing (age at marriage, wedding year)': ['age_at_marriage', 'wedding_year'],
    'AFQT (1980)': ['afqt', 'afqt_missing'],
    'own schooling and enrolment': ['own_education', 'enrolled'],
    "parents' schooling and family at 14": ['mother_education', 'father_education', 'family_at_14'],
    'religion raised and attendance': ['religion_raised', 'attendance'],
    'Rotter and Rosenberg': ['rotter', 'rosenberg', 'rosenberg_missing'],
    'delinquency (1980)': ['delinquency', 'delinquency_missing'],
    'family income and poverty': ['income_percentile', 'income_missing', 'poverty'],
    'region and urban residence': ['region', 'urban'],
    'race-ethnicity': ['race'],
    'sex': ['sex'],
    'premarital birth': ['premarital_birth'],
    'pre-wedding household (cohabiting partner, parents)': ['cohabiting_before', 'lived_with_parents'],
    'spouse (age, schooling, worked, in household)': ['spouse_age_at_marriage', 'spouse_education', 'spouse_worked', 'spouse_in_household'],
}


def band_age(x):
    b = pd.cut(x, [0, 20, 25, 30, 35, 200], right=False, labels=['<20', '20-24', '25-29', '30-34', '35+'])
    return pd.Series(np.where(b.isna(), 'Unknown', b.astype(object)), index=x.index, dtype=object)


def band_grade(g):
    b = pd.cut(g, [-1, 11.5, 12.5, 15.5, 99], labels=['<12 years', '12 years', '13-15 years', '16+ years'])
    return pd.Series(np.where(b.isna(), 'Unknown', b.astype(object)), index=g.index, dtype=object)


def people():
    m = pd.read_csv(WORK / 'first_marriages.csv', keep_default_na=False, na_values=[''])
    odd = int((m.entry_ok & ~m.spouse_in_household.isin(['Yes', 'No'])).sum())
    m = m[m.entry_ok & m.spouse_in_household.isin(['Yes', 'No'])].copy().reset_index(drop=True)
    m['a'] = (m.entry_month - m.wedding_month) / 12
    m['t'] = (m.exit_month - m.wedding_month + 0.5) / 12
    m['d'] = m.event.astype(int)
    m['weight'] = m.weight / m.weight.mean()
    m['mother_education'] = band_grade(m.mother_grade)
    m['father_education'] = band_grade(m.father_grade)
    for c, flag in [('afqt', 'afqt_missing'), ('income_percentile', 'income_missing'), ('rosenberg', 'rosenberg_missing'),
                    ('delinquency', 'delinquency_missing')]:
        m[flag] = np.where(m[c].isna(), 'Missing', 'Observed')
    m['age_band'] = band_age(m.age_at_marriage)
    m['spouse_age_band'] = band_age(m.spouse_age_at_marriage)
    m['education_pair'] = m.own_education + ' | ' + m.spouse_education
    m['age_pair'] = m.age_band + ' | ' + m.spouse_age_band
    m['sex_age_band'] = m.sex + ' | ' + m.age_band
    m.attrs['excluded_spouse_roster'] = odd
    if SMOKE:
        m = m.sample(1500, random_state=1).reset_index(drop=True)
        m.attrs['excluded_spouse_roster'] = odd
    return m


def intervals(m, entry='a'):
    a, t = m[entry].to_numpy(), m.t.to_numpy()
    k0 = np.floor(a).astype(int)
    n = np.maximum(np.ceil(t).astype(int) - k0, 1)
    idx = np.repeat(np.arange(len(m)), n)
    k = np.repeat(k0, n) + (np.arange(n.sum()) - np.repeat(np.cumsum(n) - n, n))
    lo = np.maximum(k, a[idx])
    hi = np.minimum(k + 1, t[idx])
    last = np.r_[np.diff(idx) != 0, True]
    iv = m.iloc[idx].reset_index(drop=True).copy()
    iv['person'] = idx
    iv['marriage_years'] = k.astype(float)
    iv['exposure'] = hi - lo
    iv['y'] = (m.d.to_numpy()[idx] * last).astype(int)
    assert (iv.exposure > 0).all()
    return iv


def grid(m, years=H):
    g = m.loc[m.index.repeat(years)].reset_index(drop=True)
    g['marriage_years'] = np.tile(np.arange(years, dtype=float), len(m))
    return g


def num_pipe(kind):
    steps = [('impute', SimpleImputer(strategy='median'))]
    if kind != 'tree':
        steps.append(('spline', SplineTransformer(n_knots=5 if kind == 'duration' else 4, degree=2, knots='quantile',
                                                  include_bias=False, extrapolation='linear')))
        steps.append(('scale', StandardScaler()))
    return Pipeline(steps)


def make(key, drop=()):
    nums = [c for c in NUMERIC if c not in drop]
    cats = [c for c in CATEGORICAL if c not in drop]
    oh = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    if key == 'duration_only':
        prep = ColumnTransformer([('num', num_pipe('duration'), ['marriage_years']),
                                  ('cat', oh, [])])
        est = PoissonRegressor(alpha=1e-6, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    elif key in ('additive_spline', 'spline_pairs'):
        prep = ColumnTransformer([('num', num_pipe('spline'), nums),
                                  ('cat', oh, cats + (PAIRS if key == 'spline_pairs' else []))])
        est = PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    else:
        prep = ColumnTransformer([('num', num_pipe('tree'), nums), ('cat', oh, cats)])
        if key == 'tree_depth3':
            est = DecisionTreeRegressor(criterion='poisson', max_depth=3, min_samples_leaf=3000, random_state=SEED)
        else:
            est = HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=150, learning_rate=0.05,
                                                min_samples_leaf=1000, l2_regularization=1.0, early_stopping=False,
                                                random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('duration_only', 'Marriage length only (baseline curve)'),
          ('additive_spline', 'Additive spline Poisson'),
          ('spline_pairs', 'Spline + pair-interaction Poisson'),
          ('tree_depth3', 'Poisson tree, depth 3'),
          ('gradient_boosting', 'Poisson gradient boosting (150 trees, depth 3)')]
KEYS = ['constant'] + [k for k, _ in MODELS]
# Models without couple inputs give every marriage the same score within a fold; their C and AUC
# are 0.5 by definition (pooling folds would only rank the fold-specific training means).
NO_RANK = ('constant', 'duration_only')


def fit(key, d, drop=()):
    p = make(key, drop)
    p.fit(d, d.y / d.exposure, fit__sample_weight=d.weight * d.exposure)
    return p


def cum_prob(rates):
    """rates: (people, H) annual rates for marriage years 0..H-1 -> P(divorce by h) for h in HORIZONS."""
    c = np.cumsum(rates, axis=1)
    return {h: 1 - np.exp(-c[:, h - 1]) for h in HORIZONS}


def folds_for(m, r):
    rng = np.random.default_rng(SEED + r)
    perm = rng.permutation(len(m))
    f = np.empty(len(m), int)
    f[perm] = np.arange(len(m)) % FOLDS
    return f


def cross_validate(m, iv, keys, repeats, drop=(), tag='main', only=None):
    """Held-out interval rates and per-person 30-year rate paths, per repeat. Each repeat is
    cached in WORK/cv_cache (person-level predictions, outside git) so an interrupted run resumes."""
    out = []
    cache = WORK / ('cv_cache_smoke' if SMOKE else 'cv_cache')
    cache.mkdir(exist_ok=True)
    for r in (range(repeats) if only is None else [only]):
        key = cache / f"{tag}_{'-'.join(keys)}_{'-'.join(drop) or 'all'}_r{r}.pkl"
        if key.exists():
            out.append(pd.read_pickle(key))
            continue
        fold = folds_for(m, r)
        ivf = fold[iv.person.to_numpy()]
        rates = {k: np.zeros(len(iv)) for k in keys}
        paths = {k: np.zeros((len(m), H)) for k in keys}
        for f in range(FOLDS):
            tr, te = iv[ivf != f], iv[ivf == f]
            people_te = np.flatnonzero(fold == f)
            g = grid(m.iloc[people_te])
            for k in keys:
                if k == 'constant':
                    c = (tr.weight * tr.y).sum() / (tr.weight * tr.exposure).sum()
                    rates[k][te.index] = c
                    paths[k][people_te] = c
                else:
                    p = fit(k, tr, drop)
                    rates[k][te.index] = p.predict(te)
                    paths[k][people_te] = p.predict(g).reshape(len(people_te), H)
        out.append(dict(fold=fold, rates=rates, paths=paths))
        pd.to_pickle(out[-1], key)
        print(f'  {tag} repeat {r} done', flush=True)
    return out


def main():
    t0 = time.time()
    m = people()
    iv = intervals(m)
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    a, t, d, pw = m.a.to_numpy(), m.t.to_numpy(), m.d.to_numpy(), m.weight.to_numpy()
    print(f'{len(m)} marriages, {int(d.sum())} divorces, {len(iv)} marriage-year intervals, {e.sum():.0f} person-years')

    cv = cross_validate(m, iv, KEYS, REPEATS)
    comp_rows, fold_rows = [], []
    comp_pairs = sm.concordance_matrices(a, t, d)
    gfun = sm.km_censoring(a, t, d, pw)
    for r, res in enumerate(cv):
        base = sm.deviance(y, e, w, res['rates']['constant'])
        dur = sm.deviance(y, e, w, res['rates']['duration_only'])
        for k in KEYS:
            dev = sm.deviance(y, e, w, res['rates'][k])
            F = cum_prob(res['paths'][k])
            row = dict(repeat=r, model=k, deviance=dev, gain_percent=100 * (1 - dev / base),
                       gain_over_duration_percent=100 * (1 - dev / dur),
                       observed_expected=float(np.dot(w, y) / np.dot(w, e * res['rates'][k])),
                       harrell_c=0.5 if k in NO_RANK else sm.harrell_c(comp_pairs, F[10], pw)[0])
            for h in [5, 10, 20]:
                row[f'auc_{h}y'] = 0.5 if k in NO_RANK else sm.auc_at(a, t, d, F[h], pw, h, gfun)
            comp_rows.append(row)
            ivf = res['fold'][iv.person.to_numpy()]
            for f in range(FOLDS):
                s = ivf == f
                fold_rows.append(dict(repeat=r, fold=f, model=k, gain_percent=100 * (1 - sm.deviance(y[s], e[s], w[s], res['rates'][k][s])
                                                                                        / sm.deviance(y[s], e[s], w[s], res['rates']['constant'][s]))))
    per_rep = pd.DataFrame(comp_rows)
    pd.DataFrame(fold_rows).to_csv(HERE / 'fold_metrics.csv', index=False, float_format='%.6g')

    # Repeat-averaged held-out predictions: interval rates and person paths (each person is
    # held out once per repeat).
    avg_rate = {k: np.mean([res['rates'][k] for res in cv], axis=0) for k in KEYS}
    avg_path = {k: np.mean([res['paths'][k] for res in cv], axis=0) for k in KEYS}
    avg_F = {k: cum_prob(avg_path[k]) for k in KEYS}

    # Person bootstrap (resample marriages, refits held fixed) of the repeat-averaged metrics.
    rng = np.random.default_rng(SEED)
    counts = np.stack([np.bincount(rng.integers(0, len(m), len(m)), minlength=len(m)) for _ in range(BOOT)], axis=1)
    person = iv.person.to_numpy()
    per_dev = {k: np.bincount(person, weights=sm.unit_deviance(y, e, w, avg_rate[k]), minlength=len(m)) for k in KEYS}
    cdev = counts.T @ per_dev['constant']
    ddev = counts.T @ per_dev['duration_only']
    Wb = counts * pw[:, None]
    comp, boot_store = [], {}
    for k in KEYS:
        if k in NO_RANK:
            point_c, cb = 0.5, np.full(BOOT, 0.5)
        else:
            point_c, K, C = sm.harrell_c(comp_pairs, avg_F[k][10], pw)
            cb = sm.harrell_c_boot(K, C, Wb)
            del K, C
        gb = 100 * (1 - counts.T @ per_dev[k] / cdev)
        gdb = 100 * (1 - counts.T @ per_dev[k] / ddev)
        row = dict(model=k,
                   gain_percent=float(per_rep[per_rep.model == k].gain_percent.mean()),
                   gain_repeat_min=float(per_rep[per_rep.model == k].gain_percent.min()),
                   gain_repeat_max=float(per_rep[per_rep.model == k].gain_percent.max()),
                   gain_averaged_predictions=float(100 * (1 - per_dev[k].sum() / per_dev['constant'].sum())),
                   gain_ci95_low=float(np.quantile(gb, .025)), gain_ci95_high=float(np.quantile(gb, .975)),
                   gain_over_duration_percent=float(per_rep[per_rep.model == k].gain_over_duration_percent.mean()),
                   gain_over_duration_ci95_low=float(np.quantile(gdb, .025)), gain_over_duration_ci95_high=float(np.quantile(gdb, .975)),
                   observed_expected=float(per_rep[per_rep.model == k].observed_expected.mean()),
                   harrell_c=float(point_c), harrell_c_ci95_low=float(np.quantile(cb, .025)), harrell_c_ci95_high=float(np.quantile(cb, .975)))
        for h in [5, 10, 20]:
            if k in NO_RANK:
                pt, bs = 0.5, np.full(BOOT, 0.5)
            else:
                pt = sm.auc_at(a, t, d, avg_F[k][h], pw, h, gfun)
                bs = np.array([sm.auc_at(a, t, d, avg_F[k][h], Wb[:, b], h, gfun) for b in range(BOOT)])
            row.update({f'auc_{h}y': float(pt), f'auc_{h}y_ci95_low': float(np.nanquantile(bs, .025)),
                        f'auc_{h}y_ci95_high': float(np.nanquantile(bs, .975))})
        comp.append(row)
        boot_store[k] = gb
        print('  bootstrap', k, f'gain {row["gain_percent"]:.2f}% C {row["harrell_c"]:.3f}', flush=True)
    comp = pd.DataFrame(comp)
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.6g')
    per_rep.to_csv(HERE / 'heldout_by_repeat.csv', index=False, float_format='%.6g')

    # Calibration and lift. Interval level: ten exposure-weighted bins of predicted rate.
    cal, lift, hcal = [], [], []
    overall = np.dot(w, y) / np.dot(w, e)
    for k in KEYS[1:]:
        p = avg_rate[k]
        order = np.argsort(p, kind='stable')
        cw = np.cumsum((w * e)[order]) / (w * e).sum()
        bins = np.empty(len(p), int)
        bins[order] = np.minimum((cw * 10).astype(int), 9)
        for b in range(10):
            s = bins == b
            obs = np.dot(w[s], y[s]) / np.dot(w[s], e[s])
            cal.append(dict(model=k, bin=b + 1, intervals=int(s.sum()), events=int(y[s].sum()), observed_rate=obs,
                            predicted_rate=float(np.dot(w[s], e[s] * p[s]) / np.dot(w[s], e[s]))))
        # Person level: deciles of predicted 10-year probability at the wedding vs Kaplan-Meier.
        F10 = avg_F[k][10]
        q = sm.weighted_quantile(F10, pw, np.arange(1, 10) / 10)
        dec = np.searchsorted(q, F10, side='right')
        km_all = sm.km_dissolution(a, t, d, pw, 10)
        for b in range(10):
            s = dec == b
            if s.sum() == 0:
                continue
            km = sm.km_dissolution(a[s], t[s], d[s], pw[s], 10)
            hcal.append(dict(model=k, decile=b + 1, marriages=int(s.sum()), divorces=int(d[s].sum()),
                             predicted_10y=float(np.average(F10[s], weights=pw[s])), observed_10y_km=float(km)))
            lift.append(dict(model=k, decile=b + 1, marriages=int(s.sum()), observed_10y_km=float(km),
                             lift_vs_all=float(km / km_all)))
    cal = pd.DataFrame(cal)
    cal.to_csv(HERE / 'heldout_calibration.csv', index=False, float_format='%.6g')
    hcal = pd.DataFrame(hcal)
    hcal.to_csv(HERE / 'horizon_calibration.csv', index=False, float_format='%.6g')
    lift = pd.DataFrame(lift)
    lift.to_csv(HERE / 'decile_lift.csv', index=False, float_format='%.6g')

    # Feature-block ablation: the additive spline model without each block, first repeat only,
    # with a paired person-bootstrap interval for the loss in held-out gain.
    full = cv[0]['rates']['additive_spline']
    base0 = cv[0]['rates']['constant']
    dev_full = np.bincount(person, weights=sm.unit_deviance(y, e, w, full), minlength=len(m))
    dev_base = np.bincount(person, weights=sm.unit_deviance(y, e, w, base0), minlength=len(m))
    abl = []
    for name, cols in (list(BLOCKS.items())[-2:] if SMOKE else BLOCKS.items()):
        res = cross_validate(m, iv, ['additive_spline'], 1, drop=cols, tag='ablation')[0]
        dv = np.bincount(person, weights=sm.unit_deviance(y, e, w, res['rates']['additive_spline']), minlength=len(m))
        g_full = 100 * (1 - dev_full.sum() / dev_base.sum())
        g_drop = 100 * (1 - dv.sum() / dev_base.sum())
        diff_b = 100 * (counts.T @ dv - counts.T @ dev_full) / (counts.T @ dev_base)
        abl.append(dict(block=name, columns=' '.join(cols), gain_full=g_full, gain_without_block=g_drop,
                        loss_in_gain=g_full - g_drop, loss_ci95_low=float(np.quantile(diff_b, .025)),
                        loss_ci95_high=float(np.quantile(diff_b, .975))))
        print('  ablation', name, f'{g_full - g_drop:.3f}', flush=True)
    abl = pd.DataFrame(abl).sort_values('loss_in_gain', ascending=False)
    abl.to_csv(HERE / 'ablation.csv', index=False, float_format='%.6g')

    # Sensitivity: entry at the wedding day (no delayed entry), respondent-only inputs, all
    # first marriages from 1981 including the ones that ended before the first post-wedding interview.
    allm = pd.read_csv(WORK / 'first_marriages.csv', keep_default_na=False, na_values=[''])
    allm = allm.assign(a=0.0, t=(allm.exit_month - allm.wedding_month + 0.5) / 12, d=allm.event.astype(int))
    allm['weight'] = allm.weight / allm.weight.mean()
    allm['mother_education'] = band_grade(allm.mother_grade)
    allm['father_education'] = band_grade(allm.father_grade)
    for c, flag in [('afqt', 'afqt_missing'), ('income_percentile', 'income_missing'), ('rosenberg', 'rosenberg_missing'), ('delinquency', 'delinquency_missing')]:
        allm[flag] = np.where(allm[c].isna(), 'Missing', 'Observed')
    sp = BLOCKS['spouse (age, schooling, worked, in household)']
    ivw = intervals(allm)
    res = cross_validate(allm, ivw, ['constant', 'duration_only', 'additive_spline'], 1, drop=sp, tag='from_wedding')[0]
    yw, ew, ww = ivw.y.to_numpy(), ivw.exposure.to_numpy(), ivw.weight.to_numpy()
    bw = sm.deviance(yw, ew, ww, res['rates']['constant'])
    sens = pd.DataFrame([dict(model=k, marriages=len(allm), divorces=int(allm.d.sum()),
                              gain_percent=100 * (1 - sm.deviance(yw, ew, ww, res['rates'][k]) / bw),
                              year0_observed_rate=float((ww * yw)[ivw.marriage_years == 0].sum() / (ww * ew)[ivw.marriage_years == 0].sum()))
                         for k in ['constant', 'duration_only', 'additive_spline']])
    main_y0 = float((w * y)[iv.marriage_years == 0].sum() / (w * e)[iv.marriage_years == 0].sum())
    sens['main_sample_year0_observed_rate'] = main_y0
    sens.to_csv(HERE / 'from_wedding_sensitivity.csv', index=False, float_format='%.6g')

    # Final fits on everyone.
    finals = {k: fit(k, iv) for k, _ in MODELS}
    tree = finals['tree_depth3']
    (HERE / 'tree_depth3.txt').write_text(export_text(tree.named_steps['fit'], feature_names=tree.named_steps['prep'].get_feature_names_out().tolist(), decimals=4))
    add = finals['additive_spline']
    pd.DataFrame(dict(feature=add.named_steps['prep'].get_feature_names_out(), coef=add.named_steps['fit'].coef_)).to_csv(
        HERE / 'coefficients_additive_spline.csv', index=False, float_format='%.6g')
    ref = {c: float(m[c].median()) for c in FIXED_NUMERIC}
    ref['marriage_years'] = 0.0
    ref.update({c: m[c].mode().iloc[0] for c in CATEGORICAL})
    r0 = add.predict(pd.DataFrame([ref]))[0]
    eff = []
    numgrid = dict(marriage_years=[0, 1, 2, 3, 5, 7, 10, 15, 20, 25, 30], age_at_marriage=[18, 20, 22, 25, 28, 32, 38, 45],
                   wedding_year=[1982, 1986, 1990, 1995, 2000, 2010], afqt=[5, 20, 40, 60, 80, 95], rotter=[5, 7, 9, 11, 13],
                   rosenberg=[15, 20, 23, 26, 30], delinquency=[0, 1, 3, 5, 8, 12], income_percentile=[5, 20, 40, 60, 80, 95],
                   spouse_age_at_marriage=[18, 20, 22, 25, 28, 32, 38, 45])
    for c, vals in numgrid.items():
        for v in vals:
            eff.append(dict(input=c, value=v, rate_ratio=add.predict(pd.DataFrame([{**ref, c: float(v)}]))[0] / r0))
    for c in CATEGORICAL:
        for v in sorted(m[c].unique()):
            eff.append(dict(input=c, value=v, rate_ratio=add.predict(pd.DataFrame([{**ref, c: v}]))[0] / r0))
    pd.DataFrame(eff).to_csv(HERE / 'additive_partial_effects.csv', index=False, float_format='%.4f')

    # Descriptive weighted Kaplan-Meier (delayed entry) by group.
    groups = [('All first marriages', np.ones(len(m), bool))]
    groups += [(f'{lab}: {v}', (m[c] == v).to_numpy()) for lab, c in [('Sex', 'sex'), ('Age at marriage', 'age_band'),
                                                                      ('Education', 'own_education'), ('Race-ethnicity', 'race'),
                                                                      ('Family at 14', 'family_at_14'), ('Cohabiting before', 'cohabiting_before'),
                                                                      ('Premarital birth', 'premarital_birth')]
               for v in sorted(m[c].unique()) if v != 'Unknown']
    groups += [(f'Wedding {lo}-{hi}', ((m.wedding_year >= lo) & (m.wedding_year <= hi)).to_numpy()) for lo, hi in [(1981, 1985), (1986, 1990), (1991, 2000), (2001, 2022)]]
    surv = []
    for name, s in groups:
        if s.sum() < 100:
            continue
        surv.append(dict(group=name, marriages=int(s.sum()), divorces=int(d[s].sum()),
                         **{f'still_married_{h}y': round(1 - sm.km_dissolution(a[s], t[s], d[s], pw[s], h), 4) if t[s].max() > h else None
                            for h in [1, 2, 3, 5, 10, 15, 20, 30]}))
    surv = pd.DataFrame(surv)
    surv.to_csv(HERE / 'weighted_survival.csv', index=False)

    # Shipped reference model: best repeat-averaged held-out deviance among the exported models.
    held = comp.set_index('model')
    shipped = held.loc[[k for k, _ in MODELS if k != 'duration_only'], 'gain_percent'].idxmax()

    # Population reference: weighted quantiles of held-out predicted dissolution at the wedding.
    qs = [0.01, 0.05] + [round(x, 2) for x in np.arange(0.10, 0.91, 0.05)] + [0.95, 0.99]
    Fs = avg_F[shipped]
    afqt_t = pd.Series(np.where(m.afqt.isna(), 'Unknown', np.where(m.afqt <= sm.weighted_quantile(m.afqt.dropna(), m.weight[m.afqt.notna()], [1 / 3])[0], 'Bottom third',
                                np.where(m.afqt <= sm.weighted_quantile(m.afqt.dropna(), m.weight[m.afqt.notna()], [2 / 3])[0], 'Middle third', 'Top third'))))
    ref_df = m.assign(afqt_tercile=afqt_t)
    by = [('sex', 'sex'), ('age_at_marriage_band', 'age_band'), ('education', 'own_education'), ('race_ethnicity', 'race'),
          ('afqt_tercile', 'afqt_tercile'), ('family_at_14', 'family_at_14'), ('religion_raised', 'religion_raised'),
          ('attendance', 'attendance')]
    cells = []
    for label, c in [('All', None)] + by:
        levels = [('All', np.ones(len(m), bool))] if c is None else [(v, (ref_df[c] == v).to_numpy()) for v in sorted(ref_df[c].unique())]
        for lv, s in levels:
            if s.sum() < 100 or lv in ('Unknown',):
                continue
            cell = dict(variable=label, value=lv, n=int(s.sum()))
            for h in HORIZONS:
                cell[f'p{h}'] = [round(float(v), 5) for v in sm.weighted_quantile(Fs[h][s], pw[s], qs)]
            cells.append(cell)
    population_reference = dict(
        method=(f'Held-out predicted probability that the first marriage ends in divorce within 5, 10, 20 and 30 years of the wedding '
                f'(1 - exp(-sum of predicted annual rates)), from the {shipped} model, averaged over {REPEATS} repeats of person-grouped '
                f'5-fold cross-validation (every marriage is scored only by models that never saw it); NLSY79 weights from the '
                'pre-wedding round; quantiles of the weighted distribution; cells with fewer than 100 unweighted marriages are not '
                'published; Unknown levels are omitted. Divorce only: deaths are not modelled, and 30 years is a projection for '
                'weddings after 1992.'),
        model=shipped, quantiles=qs, horizons_years=HORIZONS, cells=cells)
    pd.DataFrame([dict(variable=c['variable'], value=c['value'], n=c['n'], **{f'p{h}_median': c[f'p{h}'][qs.index(0.5)] for h in HORIZONS})
                  for c in cells]).to_csv(HERE / 'population_reference_medians.csv', index=False)

    # Partner distribution: spouses in the household roster, coarse bands, cells >= 30 marriages.
    f = m[m.spouse_in_household == 'Yes'].copy()
    tables = []
    for cond in [('sex', 'age_band'), ('sex', 'own_education')]:
        for cv_, g in f.groupby(list(cond)):
            if 'Unknown' in cv_:
                continue
            tot = g.weight.sum()
            cells_, sup = [], 0.0
            for key, h in g.groupby(['spouse_age_band', 'spouse_education']):
                share = h.weight.sum() / tot
                if len(h) >= 30 and 'Unknown' not in key:
                    cells_.append(dict(spouse_age_band=key[0], spouse_education=key[1], n=len(h), share=round(float(share), 5)))
                else:
                    sup += share
            tables.append(dict(given=dict(zip(cond, cv_)), n=len(g), cells=cells_, suppressed_share=round(float(sup), 5)))
    partner_distribution = dict(
        source='Spouse listed in the NLSY79 household roster at the first interview after the wedding (respondent report); age at the wedding, highest grade completed in coarse bands',
        min_cell_n=30, spouse_traits_given_respondent=tables)

    # Out-of-distribution score on the fixed inputs.
    levels = {c: sorted(m[c].unique()) for c in CATEGORICAL}
    ood_spec, ood_held, ood_fit = ood.build(m, folds_for(m, 0), FIXED_NUMERIC, CATEGORICAL, levels)
    pd.DataFrame(dict(percentile=ood_spec['heldout_quantiles']['p'], heldout_d2=ood_spec['heldout_quantiles']['d2'])).to_csv(
        HERE / 'ood_heldout_quantiles.csv', index=False, float_format='%.6g')

    at_risk = iv.groupby('marriage_years').person.nunique()
    support = {'marriage_years': [0.0, float(at_risk[at_risk >= 50].index.max())]}
    support.update({c: [float(m[c].quantile(0.005)), float(m[c].quantile(0.995))] for c in FIXED_NUMERIC})
    audit = dict(marriages=len(m), divorces=int(d.sum()), widowed_censored=int(m.widowed.sum()), intervals=len(iv),
                 person_years=float(e.sum()), wedding_years=[int(m.wedding_year.min()), int(m.wedding_year.max())],
                 entry_years_median=float(np.median(a)), followup_years_max=float(t.max()),
                 excluded_spouse_roster_unconfirmed_or_ambiguous=m.attrs['excluded_spouse_roster'],
                 missing_share={c: round(float(m[c].isna().mean()), 4) for c in FIXED_NUMERIC},
                 unknown_share={c: round(float((m[c] == 'Unknown').mean()), 4) for c in CATEGORICAL if (m[c] == 'Unknown').any()},
                 repeats=REPEATS, folds=FOLDS, bootstrap=BOOT, shipped_reference_model=shipped, python_sklearn=sklearn.__version__)
    (HERE / 'training_audit.json').write_text(json.dumps(audit, indent=1) + '\n')

    def heldout(k):
        r = held.loc[k]
        out = dict(deviance_improvement_percent=round(float(r.gain_percent), 3),
                   ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
                   improvement_over_duration_only_percent=round(float(r.gain_over_duration_percent), 3),
                   observed_expected_ratio=round(float(r.observed_expected), 4),
                   harrell_c=round(float(r.harrell_c), 4), harrell_c_ci95=[round(float(r.harrell_c_ci95_low), 4), round(float(r.harrell_c_ci95_high), 4)])
        for h in [5, 10, 20]:
            out[f'auc_{h}y'] = round(float(r[f'auc_{h}y']), 4)
            out[f'auc_{h}y_ci95'] = [round(float(r[f'auc_{h}y_ci95_low']), 4), round(float(r[f'auc_{h}y_ci95_high']), 4)]
        out['calibration'] = cal[cal.model == k].drop(columns='model').round(6).to_dict(orient='records')
        return out

    bundle = dict(
        id='nlsy79_first_marriage', version=1,
        source=('NLSY79 public release 1979-2022 (U.S. Bureau of Labor Statistics), all rounds; respondents born 1957-1964; '
                'first marriages begun January 1981 to 2022, followed to the last interview (2022 at the latest)'),
        target=('Annual rate of legal divorce ending a FIRST marriage, per marriage-year counted from the wedding month; '
                'widowhood censored (Poisson rate, not a probability). Separation alone is not an event.'),
        population=("U.S. men and women born 1957-64 in their first marriage, wedded between 1981 and 2022 at ages 16-63 (central 99%: 18-55); "
                    'the respondent reports on themself and the spouse listed in the household roster'),
        weights="NLSY79 sampling weight from the last interview before the wedding (normalised to mean 1) times exposure",
        entry=('Delayed entry: a marriage joins the risk set at the first interview after the wedding (median 8 months), '
               'when the spouse is observed; marriage years still count from the wedding month'),
        training=dict(intervals=len(iv), respondents=len(m), events=int(d.sum()), person_years=round(float(e.sum()), 1)),
        constant_rate=float((w * y).sum() / (w * e).sum()),
        support=support,
        inputs=dict(
            marriage_years='completed years since the wedding at the start of the year being scored (0 = first year)',
            age_at_marriage="respondent's age in years at the wedding",
            wedding_year='calendar year of the wedding; 1981-2022 in the data, few after 2000, so the app should hold it at the upper support bound and say so',
            afqt='AFQT percentile (2006 revision), ASVAB taken in 1980',
            rotter='Rotter locus-of-control score 4-16 (1979; higher = more external)',
            rosenberg='Rosenberg self-esteem score 6-30 (1980)',
            delinquency='number of 18 delinquent acts reported for the past year in 1980 (0-18)',
            income_percentile='weighted percentile of total net family income in the calendar year before the pre-wedding interview, among everyone interviewed that round',
            spouse_age_at_marriage="spouse's age at the wedding (roster age at the first post-wedding interview minus the time since the wedding)",
            sex='Man/Woman (the respondent)', race='Hispanic, Black, Non-Black non-Hispanic (NLSY79 screener cohort)',
            own_education='highest grade completed at the pre-wedding interview: <12, 12, 13-15, 16+ years',
            enrolled='enrolled in school or college at the pre-wedding interview',
            mother_education="mother's highest grade (1979 report), same bands", father_education="father's highest grade (1979 report), same bands",
            family_at_14='who the respondent lived with at 14 (1979 report)',
            religion_raised='religion raised in (1979 report)',
            attendance='religious attendance in the past year, 1982 report if that interview preceded the wedding, else 1979',
            poverty='family poverty status at the pre-wedding interview', region='Census region at the pre-wedding interview',
            urban='urban/rural residence at the pre-wedding interview',
            premarital_birth='respondent had a child born before the wedding month',
            cohabiting_before='a partner (relationship code 33) was in the household at the pre-wedding interview',
            lived_with_parents='a parent or step-parent was in the household at the pre-wedding interview',
            spouse_in_household='a spouse was listed in the household at the first post-wedding interview (Yes for any couple scored now)',
            spouse_education="spouse's highest grade at the first post-wedding interview, same bands",
            spouse_worked='spouse worked in the calendar year before the first post-wedding interview',
            afqt_missing='Observed/Missing flag (Missing: not tested); the app sets it from whether afqt is given',
            income_missing='Observed/Missing flag for income_percentile', rosenberg_missing='Observed/Missing flag for rosenberg',
            delinquency_missing='Observed/Missing flag for delinquency (fewer than 15 of 18 items answered)',
            education_pair='own_education + " | " + spouse_education (spline_pairs model only)',
            age_pair='age band + " | " + spouse age band, bands <20, 20-24, 25-29, 30-34, 35+ (spline_pairs model only)',
            sex_age_band='sex + " | " + age band (spline_pairs model only)'),
        timing=dict(
            pre_wedding_round='last interview strictly before the wedding month (median 7 months before): own schooling, enrolment, family income, poverty, region, urban, household roster',
            fixed_early=('1979: family at 14, parents\' schooling, religion raised, attendance, Rotter; 1980: Rosenberg, delinquency, ASVAB (AFQT); '
                         '1982: attendance. Every wedding in the sample is in January 1981 or later, so all of these precede it; the 1982 answer is used only if that interview preceded the wedding.'),
            spouse='household roster at the first interview after the wedding (median 8 months after), which is also when the marriage enters the risk set',
            cross_round='wedding and divorce months from the cross-round marital history (MOBG1M/YRBG1M, MOEN1M/YREN1M); birth months of children (C#DOB) for premarital births'),
        abstain=['same-sex couples', 'a previously married respondent (first marriages only)', 'weddings before 1981 or at ages outside the support',
                 'any profile above the ood abstain_above_percentile'],
        models=[dict(key=k, label=lbl, heldout=heldout(k), **export(finals[k])) for k, lbl in MODELS],
        comparison={k: dict(deviance_improvement_percent=round(float(held.loc[k, 'gain_percent']), 3),
                            ci95=[round(float(held.loc[k, 'gain_ci95_low']), 3), round(float(held.loc[k, 'gain_ci95_high']), 3)],
                            harrell_c=round(float(held.loc[k, 'harrell_c']), 4)) for k in KEYS},
        ablation=json.loads(abl.round(4).to_json(orient='records')),
        weighted_survival=json.loads(surv.to_json(orient='records')),
        population_reference=population_reference,
        partner_distribution=partner_distribution,
        ood=ood_spec,
        sklearn=sklearn.__version__)
    OUT.mkdir(exist_ok=True)
    (OUT / 'nlsy79_first_marriage.json').write_text(json.dumps(bundle, separators=(',', ':')))

    # Test vectors: random rows over every category, numeric ranges and missing values, plus
    # spline knots and tree thresholds (the riskiest inputs).
    vr = np.random.default_rng(SEED + 7)
    rows = []
    pair_levels = {c: sorted(m[c].unique()) for c in PAIRS}
    for i in range(60):
        r = {c: str(vr.choice(levels[c])) for c in CATEGORICAL}
        r.update({c: str(vr.choice(pair_levels[c])) for c in PAIRS})
        r['marriage_years'] = float(vr.uniform(0, 45))
        r['age_at_marriage'] = float(vr.uniform(14, 65))
        r['wedding_year'] = float(vr.integers(1975, 2030))
        r['afqt'] = None if i % 8 == 0 else float(vr.uniform(0, 100))
        r['rotter'] = None if i % 13 == 0 else float(vr.integers(4, 17))
        r['rosenberg'] = None if i % 11 == 0 else float(vr.integers(6, 31))
        r['delinquency'] = None if i % 9 == 0 else float(vr.integers(0, 19))
        r['income_percentile'] = None if i % 5 == 0 else float(vr.uniform(0, 100))
        r['spouse_age_at_marriage'] = None if i % 7 == 0 else float(vr.uniform(14, 70))
        rows.append(r)
    for k in ['additive_spline']:
        sp = finals[k].named_steps['prep'].named_transformers_['num'].named_steps['spline']
        for j, c in enumerate(FIXED_NUMERIC):
            for kn in sp.bsplines_[j + 1].t[2:4]:
                rows.append({**rows[1], c: float(kn)})
    df = pd.DataFrame(rows)
    for c in NUMERIC:
        df[c] = df[c].astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: finals[k].predict(df).tolist() for k in finals},
                   ood_d2=ood.score(ood_fit, df, FIXED_NUMERIC, CATEGORICAL, levels).tolist())
    (OUT / 'nlsy79_first_marriage_testvectors.json').write_text(json.dumps(vectors))
    print(comp.round(4).to_string(index=False))
    print(abl.round(3).to_string(index=False))
    print(sens.round(4).to_string(index=False))
    print(f'shipped reference {shipped}; total {time.time() - t0:.0f}s')


def export(pipe):
    prep, est = pipe.named_steps['prep'], pipe.named_steps['fit']
    num, cat = None, dict(columns=[], categories=[], drop_first=[])
    for name, tr, cols in prep.transformers_:
        if name == 'num':
            steps = dict(tr.steps)
            num = dict(columns=list(cols), impute=steps['impute'].statistics_.tolist())
            if 'spline' in steps:
                sp = steps['spline']
                num['spline'] = dict(degree=int(sp.degree), extrapolation=sp.extrapolation,
                                     knots=[b.t.tolist() for b in sp.bsplines_], include_bias=bool(sp.include_bias))
            if 'scale' in steps:
                num['scale'] = dict(mean=steps['scale'].mean_.tolist(), scale=steps['scale'].scale_.tolist())
        elif name == 'cat' and len(cols):
            cat = dict(columns=list(cols), categories=[list(map(str, c)) for c in tr.categories_],
                       drop_first=[int(i) == 0 for i in tr.drop_idx_])
    out = dict(numeric=num, categorical=cat, feature_names=prep.get_feature_names_out().tolist())
    if hasattr(est, 'coef_'):
        out.update(kind='poisson_glm', intercept=float(est.intercept_), coef=est.coef_.tolist())
    elif hasattr(est, 'tree_'):
        t = est.tree_
        out.update(kind='tree', tree=dict(left=t.children_left.tolist(), right=t.children_right.tolist(), feature=t.feature.tolist(),
                                          threshold=t.threshold.tolist(), value=t.value[:, 0, 0].tolist(),
                                          n_node_samples=t.n_node_samples.tolist()))
    else:
        trees = []
        for (pred,) in est._predictors:
            n = pred.nodes
            assert not n['is_categorical'].any()
            trees.append(dict(left=[int(v) if not lf else -1 for v, lf in zip(n['left'], n['is_leaf'])],
                              right=[int(v) if not lf else -1 for v, lf in zip(n['right'], n['is_leaf'])],
                              feature=n['feature_idx'].astype(int).tolist(), threshold=n['num_threshold'].tolist(),
                              missing_left=n['missing_go_to_left'].astype(bool).tolist(),
                              value=n['value'].tolist(), n_node_samples=n['count'].astype(int).tolist()))
        out.update(kind='boosted', baseline=float(np.ravel(est._baseline_prediction)[0]), trees=trees)
    return out


def warm(part):
    """Fill one slice of the cache (lets several processes share the work): 'r0'..'r2' for the
    main repeats, 'ablation:<block number>', or 'from_wedding'."""
    m = people()
    iv = intervals(m)
    if part.startswith('r'):
        cross_validate(m, iv, KEYS, REPEATS, only=int(part[1:]))
    elif part.startswith('ablation:'):
        cols = list(BLOCKS.values())[int(part.split(':')[1])]
        cross_validate(m, iv, ['additive_spline'], 1, drop=cols, tag='ablation')


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[2] == '--warm':
        for part in sys.argv[3:]:
            warm(part)
    else:
        main()
