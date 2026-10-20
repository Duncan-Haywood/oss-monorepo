"""Canadian GSS Family lens (1995, 2006, 2011, 2017): first-marriage dissolution models.

Builds marriage-year intervals (follow-up capped at 30 years) from harmonise.py's pooled person
table, compares a constant rate, a duration-only spline, an additive spline Poisson GLM, a depth-4
Poisson tree and Poisson gradient boosting held out by person (5 seeded folds) with deviance,
Harrell's C, time-dependent AUC at 5/10/20 years, decile lift and calibration, person-bootstrap
95% intervals, an out-of-time test (weddings before 1990 -> 1990 and later) and labelled
sensitivity models (interview-time education/religion, partner age gap, 1995-only partner
history). Exports ../../app/models/canada_gss_first_marriage.json plus Python test vectors.
Aggregate tables only; nothing person-level is written to the repository.

Run from this folder after `sh download.sh`:  python3 train_models.py [--quick]
Needs numpy, pandas, scikit-learn 1.7.2 (requirements.txt). tables.py makes the descriptive,
design-bootstrap tables (survival, rate ratios, Canada vs U.S., common-law unions).
"""
from pathlib import Path
import json, sys, time, warnings
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
import harmonise as H  # noqa: E402
import metrics as M  # noqa: E402
from tables import load_first_marriages, band, AGE_EDGES, AGE_LABELS, WED_EDGES, WED_LABELS  # noqa: E402
from bundle_export import export  # noqa: E402
import ood  # noqa: E402

warnings.simplefilter('ignore')
assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2 (requirements.txt)'
SEED = 20261020
OUT = ROOT / 'app' / 'models'
QUICK = '--quick' in sys.argv
B_DEV = 200 if QUICK else 1000          # person-bootstrap draws for deviance gains
B_DISC = 20 if QUICK else 100           # person-bootstrap draws for C / AUC / lift
GRID_YEARS = 30                         # marriage years predicted per person (0..29)
N_JOBS = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--jobs=')), 3))
MAX_YEARS = 30.0                        # follow-up cap (administrative censoring)
NUM = H.SHIPPED_NUMERIC
CAT = H.SHIPPED_CATEGORICAL
APP_DEFAULTS = dict(survey_cycle='2017')
LABELS = dict(duration_only='Marriage length only (baseline curve)', additive_spline='Additive spline Poisson',
              tree_depth4='Poisson tree, depth 4', gradient_boosting='Poisson gradient boosting (300 trees, depth 3)')


# ---------------------------------------------------------------- data
def intervals(p):
    """One row per marriage-year (0 = first year), follow-up capped at MAX_YEARS."""
    t = np.minimum(p.t.to_numpy(), MAX_YEARS)
    ev = p.event.to_numpy() * (p.t.to_numpy() <= MAX_YEARS)
    n = np.ceil(t).astype(int)
    n[n == 0] = 1
    idx = np.repeat(np.arange(len(p)), n)
    k = np.concatenate([np.arange(c) for c in n]).astype(float)
    iv = p.iloc[idx].reset_index(drop=True)
    iv['marriage_years'] = k
    iv['exposure'] = np.minimum(t[idx], k + 1) - k
    iv['y'] = (ev[idx] * (k + 1 >= t[idx])).astype(float)
    iv['person'] = idx
    return iv


# ---------------------------------------------------------------- models
def onehot():
    return OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)


def spline_num(n_knots=4):
    return Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=n_knots, degree=2, knots='quantile', include_bias=False,
                                                  extrapolation='linear')),
                     ('scale', StandardScaler())])


def pipeline(kind, num, cat):
    if kind == 'duration_only':
        prep = ColumnTransformer([('num', spline_num(5), ['marriage_years'])])
        est = PoissonRegressor(alpha=1e-6, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    elif kind == 'additive_spline':
        prep = ColumnTransformer([('num', spline_num(), num), ('cat', onehot(), cat)])
        est = PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    else:
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), num),
                                  ('cat', onehot(), cat)])
        if kind == 'tree_depth4':
            est = DecisionTreeRegressor(criterion='poisson', max_depth=4, min_samples_leaf=5000, random_state=SEED)
        elif kind == 'gradient_boosting':
            est = HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=300, learning_rate=0.05,
                                                min_samples_leaf=2000, l2_regularization=1.0,
                                                early_stopping=False, random_state=SEED)
        else:
            raise KeyError(kind)
    return Pipeline([('prep', prep), ('fit', est)])


class Model:
    def __init__(self, kind, num=NUM, cat=CAT):
        self.kind, self.num, self.cat = kind, num, cat

    def fit(self, iv):
        w = (iv.weight * iv.exposure).to_numpy()
        y = (iv.y / iv.exposure).to_numpy()
        if self.kind == 'constant':
            self.rate = float((iv.weight * iv.y).sum() / (iv.weight * iv.exposure).sum())
        else:
            self.m = pipeline(self.kind, self.num, self.cat).fit(iv[self.num + self.cat], y, fit__sample_weight=w)
        return self

    def predict(self, d):
        if self.kind == 'constant':
            return np.full(len(d), self.rate)
        return self.m.predict(d[self.num + self.cat])


def grid_predict(model, people, years=GRID_YEARS):
    g = people.loc[people.index.repeat(years)].copy()
    g['marriage_years'] = np.tile(np.arange(years, dtype=float), len(people))
    return model.predict(g).reshape(len(people), years)


def deviance(y, e, w, rate):
    mu = e * rate
    term = np.zeros(len(y))
    ok = y > 0
    term[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * np.dot(w, term - y + mu) / np.dot(w, e)


def unit_deviance(y, e, w, rate):
    mu = e * rate
    t = np.zeros(len(y))
    ok = y > 0
    t[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * w * (t - y + mu)


# ---------------------------------------------------------------- evaluation
def person_scores(grid):
    ch = np.cumsum(grid, axis=1)
    return dict(score5=ch[:, 4], score10=ch[:, 9], score20=ch[:, 19], p5=1 - np.exp(-ch[:, 4]),
                p10=1 - np.exp(-ch[:, 9]), p20=1 - np.exp(-ch[:, 19]))


def disc_metrics(p, s, w, iv_pred=None, iv=None):
    t, d = np.minimum(p.t.to_numpy(), MAX_YEARS), p.event_eval.to_numpy()
    out = dict(harrell_c=M.harrell_c(t, d, s['score10'], w), auc5=M.auc_at(t, d, s['score5'], w, 5.0),
               auc10=M.auc_at(t, d, s['score10'], w, 10.0), auc20=M.auc_at(t, d, s['score20'], w, 20.0))
    if iv is not None:
        dec = M.deciles(s['score10'], w)
        dec_iv = dec[iv.person.to_numpy()]
        ww = iv.weight.to_numpy() * (iv.w_boot.to_numpy() if 'w_boot' in iv else 1.0)
        e, y = iv.exposure.to_numpy(), iv.y.to_numpy()
        obs = np.array([np.dot(ww[dec_iv == k], y[dec_iv == k]) / np.dot(ww[dec_iv == k], e[dec_iv == k]) for k in range(10)])
        pred = np.array([np.dot(ww[dec_iv == k], e[dec_iv == k] * iv_pred[dec_iv == k]) / np.dot(ww[dec_iv == k], e[dec_iv == k])
                         for k in range(10)])
        out.update(decile_lift=obs[9] / obs[0] if obs[0] > 0 else np.nan, decile_observed=obs, decile_predicted=pred)
    return out


def assign_folds(people, folds=5):
    rng = np.random.default_rng(SEED)
    perm = rng.permutation(len(people))
    fold = np.empty(len(people), int)
    fold[perm] = np.arange(len(people)) % folds
    return fold


def _fold_job(name, f, tr, te, te_p, factories):
    out = {}
    for k, fac in factories.items():
        t0 = time.time()
        mdl = fac().fit(tr)
        out[k] = (mdl.predict(te), grid_predict(mdl, te_p))
        print(f'  {name} fold {f} {k}: {time.time() - t0:.1f}s', flush=True)
    return f, out


def cv_analysis(name, people, factories, folds=5, keep=None):
    """Person-held-out predictions; folds run in parallel worker processes (N_JOBS). Results are
    cached in work/ (gitignored) so an interrupted run resumes; delete work/cv_*.pkl to refit."""
    import pickle
    from joblib import Parallel, delayed
    cache = HERE / 'work' / f'cv_{name}_{len(people)}.pkl'
    if cache.exists() and '--smoke' not in sys.argv:
        return pickle.loads(cache.read_bytes())
    people = people.reset_index(drop=True)
    people['fold'] = assign_folds(people, folds)
    iv = intervals(people)
    iv['fold'] = people.fold.to_numpy()[iv.person.to_numpy()]
    cols = sorted(set(NUM + CAT + (keep or []) + ['weight', 'exposure', 'y', 'person', 'fold']))
    ivs = iv[cols]
    jobs = [delayed(_fold_job)(name, f, ivs[ivs.fold != f], ivs[ivs.fold == f], people[people.fold == f], factories)
            for f in range(folds)]
    res = Parallel(n_jobs=N_JOBS, backend='loky')(jobs)
    preds = {k: np.zeros(len(iv)) for k in factories}
    grids = {k: np.zeros((len(people), GRID_YEARS)) for k in factories}
    for f, out in res:
        te_ix = iv.index[iv.fold == f].to_numpy()
        tp_ix = people.index[people.fold == f].to_numpy()
        for k, (pr, gr) in out.items():
            preds[k][te_ix] = pr
            grids[k][tp_ix] = gr
    if '--smoke' not in sys.argv:
        cache.write_bytes(pickle.dumps((people, iv, preds, grids)))
    return people, iv, preds, grids


def summarise(name, people, iv, preds, grids, ref='constant', dur='duration_only', boot=True, disc=True):
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    people = people.assign(event_eval=(people.event.to_numpy() * (people.t.to_numpy() <= MAX_YEARS)))
    pw = people.weight.to_numpy()
    base = deviance(y, e, w, preds[ref])
    dref = deviance(y, e, w, preds[dur]) if dur in preds else np.nan
    codes = iv.person.to_numpy()
    per = {k: np.bincount(codes, weights=unit_deviance(y, e, w, v), minlength=len(people)) for k, v in preds.items()}
    rng = np.random.default_rng(SEED)
    counts = rng.multinomial(len(people), np.full(len(people), 1 / len(people)), size=B_DEV).astype(float)
    rows, cal = [], []
    for k in preds:
        dk = deviance(y, e, w, preds[k])
        imp = 100 * (1 - counts @ per[k] / (counts @ per[ref]))
        imp_d = 100 * (1 - counts @ per[k] / (counts @ per[dur])) if dur in per else np.full(B_DEV, np.nan)
        r = dict(analysis=name, model=k, people=len(people), events=int(people.event_eval.sum()),
                 heldout_mean_deviance=dk, deviance_improvement_percent=100 * (1 - dk / base),
                 dev_ci95_low=np.quantile(imp, 0.025), dev_ci95_high=np.quantile(imp, 0.975),
                 improvement_over_duration_only_percent=100 * (1 - dk / dref),
                 dur_ci95_low=np.quantile(imp_d, 0.025), dur_ci95_high=np.quantile(imp_d, 0.975),
                 observed_expected_ratio=float(np.dot(w, y) / np.dot(w, e * preds[k])))
        if k != ref and disc:
            s = person_scores(grids[k])
            dm = disc_metrics(people, s, pw, preds[k], iv)
            r.update({m: dm[m] for m in ['harrell_c', 'auc5', 'auc10', 'auc20', 'decile_lift']})
            for b in range(10):
                cal.append(dict(analysis=name, model=k, decile=b + 1, observed_rate=dm['decile_observed'][b],
                                predicted_rate=dm['decile_predicted'][b]))
            if boot:
                bs = {m: [] for m in ['harrell_c', 'auc5', 'auc10', 'auc20', 'decile_lift']}
                for bi in range(B_DISC):
                    cnt = counts[bi]
                    dmb = disc_metrics(people, s, pw * cnt, preds[k], iv.assign(w_boot=cnt[codes]))
                    for m in bs:
                        bs[m].append(dmb[m])
                for m in bs:
                    r[m + '_ci95'] = [float(np.nanquantile(bs[m], 0.025)), float(np.nanquantile(bs[m], 0.975))]
        rows.append(r)
    return pd.DataFrame(rows), pd.DataFrame(cal)


def quantile_cells(df, prob_cols, by, w, min_n=100):
    qs = [0.01, 0.05] + [round(x, 2) for x in np.arange(0.10, 0.91, 0.05)] + [0.95, 0.99]
    out = []
    for label, col in [('All', None)] + [(c, c) for c in by]:
        levels = [('All', np.ones(len(df), bool))] if col is None else \
            [(str(v), (df[col].astype(str) == str(v)).to_numpy()) for v in sorted(df[col].astype(str).unique())]
        for lv, sel in levels:
            n = int(sel.sum())
            if n < min_n or lv in ('nan', 'Unknown', 'Not asked'):
                continue
            cell = dict(variable=label, value=lv, n=n)
            for pc in prob_cols:
                cell[pc] = [round(float(v), 5) for v in M.weighted_quantile(df[pc].to_numpy()[sel], w[sel], qs)]
            out.append(cell)
    return dict(quantiles=qs, cells=out)


def clean(o):
    """JSON-safe: NaN/inf -> null (e.g. the decile lift of the duration-only curve, whose scores tie)."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else float(o)
    return o


def heldout(row, extra=True):
    h = dict(deviance_improvement_percent=round(float(row['deviance_improvement_percent']), 3),
             ci95=[round(float(row['dev_ci95_low']), 3), round(float(row['dev_ci95_high']), 3)],
             improvement_over_duration_only_percent=round(float(row['improvement_over_duration_only_percent']), 3),
             observed_expected_ratio=round(float(row['observed_expected_ratio']), 4))
    if extra and not pd.isna(row.get('harrell_c', np.nan)):
        for m in ['harrell_c', 'auc5', 'auc10', 'auc20', 'decile_lift']:
            h[m] = None if pd.isna(row[m]) else round(float(row[m]), 4)
            ci = row.get(m + '_ci95')
            if isinstance(ci, list):
                h[m + '_ci95'] = [round(v, 4) for v in ci]
    return h


# ---------------------------------------------------------------- main
def main():
    global OUT
    t_start = time.time()
    p, _, audit = load_first_marriages()
    p = p.reset_index(drop=True)
    if '--smoke' in sys.argv:                     # development only: a 15% subsample, nothing exported
        p = p.sample(frac=0.15, random_state=1).reset_index(drop=True)
    print('people', len(p), 'events', int(p.event.sum()), flush=True)
    kinds = ['duration_only', 'additive_spline', 'tree_depth4', 'gradient_boosting']
    fac = {'constant': lambda: Model('constant')}
    fac.update({k: (lambda k=k: Model(k)) for k in kinds})

    # ------------- main held-out comparison
    people, iv, preds, grids = cv_analysis('main', p, fac)
    comp, cal = summarise('main', people, iv, preds, grids)
    print(comp.drop(columns=[c for c in comp.columns if c.endswith('_ci95')]).round(4).to_string(index=False), flush=True)

    # ------------- out-of-time: weddings before 1990 -> weddings 1990 and later
    train_p = p[p.wedding_year < 1990].reset_index(drop=True)
    test_p = p[p.wedding_year >= 1990].reset_index(drop=True)
    tr_iv, te_iv = intervals(train_p), intervals(test_p)
    oot_pred, oot_grid = {}, {}
    for k, f in fac.items():
        mdl = f().fit(tr_iv)
        oot_pred[k] = mdl.predict(te_iv)
        oot_grid[k] = grid_predict(mdl, test_p)
        print(f'  out-of-time {k} done', flush=True)
    comp_oot, cal_oot = summarise('out_of_time_weddings_1990_on', test_p, te_iv, oot_pred, oot_grid)
    print(comp_oot[['model', 'deviance_improvement_percent', 'observed_expected_ratio', 'harrell_c', 'auc10']]
          .round(4).to_string(index=False), flush=True)

    # ------------- sensitivity models (held out the same way; not exported)
    sens = []
    interview = ['education_at_interview', 'religion_at_interview', 'attendance_at_interview']
    sfac = {'constant': fac['constant'], 'duration_only': fac['duration_only'], 'additive_spline': fac['additive_spline'],
            'additive_plus_interview_time': lambda: Model('additive_spline', NUM, CAT + interview)}
    sp, siv, spred, sgrid = cv_analysis('sens_interview', p, sfac, keep=interview)
    sens.append(summarise('sensitivity_interview_time_inputs', sp, siv, spred, sgrid, boot=False)[0])
    gap_p = p[p.cycle.isin(['1995', '2011', '2017'])]
    gfac = {'constant': fac['constant'], 'duration_only': fac['duration_only'], 'additive_spline': fac['additive_spline'],
            'additive_plus_partner_age_gap': lambda: Model('additive_spline', NUM + ['partner_age_gap'], CAT)}
    gp, giv, gpred, ggrid = cv_analysis('sens_gap', gap_p, gfac, keep=['partner_age_gap'])
    sens.append(summarise('sensitivity_partner_age_gap_1995_2011_2017', gp, giv, gpred, ggrid, boot=False)[0])
    p95 = p[(p.cycle == '1995')]
    cat95 = [c for c in CAT if c != 'survey_cycle']
    ffac = {'constant': fac['constant'], 'duration_only': fac['duration_only'],
            'additive_spline': lambda: Model('additive_spline', NUM, cat95),
            'additive_plus_partner_history': lambda: Model('additive_spline', NUM, cat95 + ['partner_prev_married',
                                                                                         'parents_ever_separated'])}
    fp, fiv, fpred, fgrid = cv_analysis('sens_1995', p95, ffac, keep=['partner_prev_married', 'parents_ever_separated'])
    sens.append(summarise('sensitivity_1995_partner_prev_married_parents_separated', fp, fiv, fpred, fgrid, boot=False)[0])
    sens = pd.concat(sens, ignore_index=True)
    print(sens[['analysis', 'model', 'people', 'events', 'deviance_improvement_percent', 'dev_ci95_low', 'dev_ci95_high',
                'harrell_c', 'auc10']].round(4).to_string(index=False), flush=True)

    allcomp = pd.concat([comp, comp_oot, sens], ignore_index=True)
    allcomp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.6g')
    pd.concat([cal, cal_oot], ignore_index=True).to_csv(HERE / 'heldout_calibration.csv', index=False, float_format='%.6g')

    # ------------- final fits on everyone
    fall = intervals(p)
    finals = {k: Model(k).fit(fall) for k in kinds}
    tree = finals['tree_depth4'].m
    (HERE / 'tree_depth4.txt').write_text(export_text(tree.named_steps['fit'],
                                                      feature_names=tree.named_steps['prep'].get_feature_names_out().tolist(),
                                                      decimals=4))
    add = finals['additive_spline'].m
    pd.DataFrame(dict(feature=add.named_steps['prep'].get_feature_names_out(), coef=add.named_steps['fit'].coef_)) \
        .to_csv(HERE / 'coefficients_additive_spline.csv', index=False, float_format='%.6g')

    # Partial effects of the final additive model at a reference profile.
    ref = dict(marriage_years=0.0, age_at_marriage=25.0, wedding_year=1990.0, respondent_sex='Female', cohabited_first='No',
               prior_union='No', premarital_birth='No', intact_family_15='Yes', born_outside_canada='No',
               first_language='English', region='Ontario', survey_cycle='2017')
    r0 = add.predict(pd.DataFrame([ref]))[0]
    eff = []
    grid = dict(marriage_years=[0, 1, 2, 3, 5, 7, 10, 15, 20, 25], age_at_marriage=[18, 20, 22, 25, 28, 32, 38, 45],
                wedding_year=[1955, 1965, 1975, 1985, 1990, 1995, 2000, 2005, 2010, 2015])
    for c, vals in grid.items():
        for v in vals:
            eff.append(dict(input=c, value=v, rate_ratio=add.predict(pd.DataFrame([{**ref, c: float(v)}]))[0] / r0))
    for c in CAT:
        for v in sorted(p[c].unique()):
            eff.append(dict(input=c, value=v, rate_ratio=add.predict(pd.DataFrame([{**ref, c: v}]))[0] / r0))
    eff = pd.DataFrame(eff)
    eff.to_csv(HERE / 'additive_partial_effects.csv', index=False, float_format='%.4f')

    # ------------- shipped model and population reference from held-out predictions
    cw = comp.set_index('model')
    shipped = max(['additive_spline', 'gradient_boosting'], key=lambda k: cw.loc[k, 'deviance_improvement_percent'])
    s = person_scores(grids[shipped])
    ref_df = people.assign(p5=s['p5'], p10=s['p10'], p20=s['p20'],
                           age_band=band(people.age_at_marriage, AGE_EDGES, AGE_LABELS),
                           wedding_period=band(people.wedding_year, WED_EDGES, WED_LABELS))
    pop = quantile_cells(ref_df, ['p5', 'p10', 'p20'],
                         ['respondent_sex', 'age_band', 'wedding_period', 'cohabited_first', 'prior_union', 'premarital_birth',
                          'intact_family_15', 'born_outside_canada', 'first_language', 'region', 'survey_cycle'],
                         people.weight.to_numpy())
    pd.DataFrame([dict(variable=c['variable'], value=c['value'], n=c['n'], **{f'{pc}_q{q}': v for pc in ['p5', 'p10', 'p20']
                                                                               for q, v in zip(pop['quantiles'], c[pc])})
                  for c in pop['cells']]).to_csv(HERE / 'population_reference_quantiles.csv', index=False, float_format='%.5f')

    # ------------- out-of-distribution score on the fixed inputs (survey cycle excluded: the app fixes it)
    ood_num = ['age_at_marriage', 'wedding_year']
    ood_cat = [c for c in CAT if c != 'survey_cycle']
    levels = {c: sorted(p[c].astype(str).unique()) for c in ood_cat}
    ood_spec, ood_held, ood_fit = ood.build(people, people.fold.to_numpy(), ood_num, ood_cat, levels)
    pd.DataFrame(dict(percentile=ood_spec['heldout_quantiles']['p'], heldout_d2=ood_spec['heldout_quantiles']['d2'])) \
        .to_csv(HERE / 'ood_heldout_quantiles.csv', index=False, float_format='%.6g')

    # ------------- support, audit
    support = {c: [float(p[c].quantile(0.005)), float(p[c].quantile(0.995))] for c in ['age_at_marriage', 'wedding_year']}
    at_risk = fall.groupby('marriage_years').size()
    support = {'marriage_years': [0.0, float(at_risk[at_risk >= 50].index.max())], **support}
    sample = dict(
        cycles=H.CYCLES, files=audit, marriages=len(p), dissolutions=int(p.event.sum()),
        divorce_recorded=int(p.divorced_only.sum()), widowed_censored=int(p.widowed.sum()),
        dissolutions_within_30y=int((p.event * (p.t <= MAX_YEARS)).sum()),
        intervals=len(fall), person_years=round(float(fall.exposure.sum()), 1),
        by_cycle={c: dict(marriages=int((p.cycle == c).sum()), dissolutions=int(p.event[p.cycle == c].sum())) for c in H.CYCLES},
        by_sex={s_: dict(marriages=int((p.respondent_sex == s_).sum()), dissolutions=int(p.event[p.respondent_sex == s_].sum()))
                for s_ in ['Female', 'Male']},
        unknown_counts={c: int((p[c] == 'Unknown').sum()) for c in CAT},
        wedding_years=[float(p.wedding_year.min()), float(p.wedding_year.max())],
        out_of_time=dict(train_marriages=len(train_p), train_dissolutions=int(train_p.event.sum()),
                         test_marriages=len(test_p), test_dissolutions=int(test_p.event.sum())),
        folds='5 folds by person (respondent), seeded permutation', python_sklearn=sklearn.__version__, shipped_model=shipped)
    (HERE / 'sample_audit.json').write_text(json.dumps(sample, indent=1, default=str) + '\n')

    # ------------- bundle
    co = comp_oot.set_index('model')
    surv_path = HERE / 'weighted_survival.csv'
    surv = pd.read_csv(surv_path) if surv_path.exists() else pd.DataFrame()
    cmp_path = HERE / 'canada_vs_us_survival.csv'
    us_cmp = pd.read_csv(cmp_path) if cmp_path.exists() else pd.DataFrame()
    bundle = dict(
        id='canada_gss_first_marriage', version=1,
        source=('Statistics Canada, General Social Survey on Families, public-use microdata files: Cycle 10 (1995), '
                'Cycle 20 (2006), Cycle 25 (2011) and Cycle 31 (2017); retrospective marriage histories of people 15-79 '
                'in the ten provinces. Contains information licensed under the Statistics Canada Open Licence.'),
        target=('Annual rate of first-marriage dissolution (separation, or divorce/annulment without a recorded '
                'separation) per marriage-year from the wedding; widowhood and the interview censor (Poisson rate, not a probability)'),
        population=('Canadian household population aged 15-79 at interview (1995, 2006, 2011 or 2017) who had married; '
                    "their FIRST marriage, weddings 1950-2017, the respondent's own report (men and women)"),
        weights='GSS person weights, rescaled to mean 1 within each cycle, times exposure',
        training=dict(intervals=len(fall), respondents=len(p), events=int((p.event * (p.t <= MAX_YEARS)).sum()),
                      person_years=round(float(fall.exposure.sum()), 1), follow_up_cap_years=MAX_YEARS),
        constant_rate=float((fall.weight * fall.y).sum() / (fall.weight * fall.exposure).sum()),
        support=support,
        inputs=dict(
            marriage_years='completed years since the wedding at the start of the year being scored (0 = first year)',
            age_at_marriage="the respondent's age in years on the wedding day (one partner: the model is respondent-level)",
            wedding_year='calendar year of the wedding; outside the support is extrapolation, so hold it at the support edge and say so',
            respondent_sex='Female/Male: the partner whose characteristics are entered',
            cohabited_first='Yes/No: lived common-law with this spouse before marrying',
            prior_union='Yes/No: had lived common-law with someone else before this first marriage',
            premarital_birth='Yes/No: had a birth child before the wedding',
            intact_family_15='Yes/No: lived with both parents until age 15',
            born_outside_canada='Yes/No',
            first_language='English, French, Other, Multiple: first language learned in childhood (2017: mother tongue)',
            region='Atlantic, Quebec, Ontario, Prairies, British Columbia: region of residence AT INTERVIEW (may postdate the marriage)',
            survey_cycle="GSS cycle; set to '2017' (app_defaults) when scoring a new couple"),
        app_defaults=APP_DEFAULTS,
        not_used_in_models=dict(
            partner_age_gap=("spouse's age is missing far more often for dissolved than intact marriages (see "
                             'missingness_by_outcome.csv) and not asked for ended marriages in 2006; sensitivity only'),
            partner_previously_married='asked for ended first marriages only in 1995; 1995-only sensitivity',
            education='highest education is measured at interview and can postdate the marriage (as in the NSFG lens); descriptive and sensitivity only',
            religion_and_attendance='measured at interview; can change with a divorce; descriptive and sensitivity only',
            birth_cohort='equals wedding_year minus age_at_marriage exactly, so it adds nothing beyond those two inputs'),
        abstain=['previously married (only first marriages are modelled)', 'same-sex couples (too few first marriages in these files)',
                 'age at marriage outside the support', 'outside Canada: population is the ten provinces'],
        note=('Pooled from four cross-sections with a survey-cycle term. Each respondent reports one marriage, so a couple '
              'is scored through one partner at a time. Separations are counted as dissolution, as in the NSFG lens.'),
        models=[dict(key=k, label=LABELS[k], heldout=heldout(cw.loc[k]), out_of_time=heldout(co.loc[k]),
                     calibration=cal[cal.model == k].drop(columns=['analysis', 'model']).round(6).to_dict(orient='records'),
                     **export(finals[k].m)) for k in kinds],
        shipped_model=shipped,
        constant_heldout=heldout(cw.loc['constant'], extra=False),
        population_reference=dict(
            method=(f'Held-out (5-fold, by person) predicted probability that the first marriage dissolves within 5, 10 '
                    f'and 20 years of the wedding from the {shipped} model; survey-weighted quantiles; cells with fewer '
                    'than 100 unweighted marriages are not published; Unknown levels are omitted. n = unweighted marriages.'),
            **pop),
        ood=ood_spec,
        weighted_survival=json.loads(surv.to_json(orient='records')) if len(surv) else [],
        canada_vs_us=json.loads(us_cmp.to_json(orient='records')) if len(us_cmp) else [],
        sklearn=sklearn.__version__)
    if '--smoke' in sys.argv:
        OUT = HERE / 'work'
    OUT.mkdir(exist_ok=True)
    (OUT / 'canada_gss_first_marriage.json').write_text(json.dumps(clean(bundle), separators=(',', ':'), allow_nan=False))

    # ------------- test vectors
    vr = np.random.default_rng(SEED)
    lv = {c: sorted(p[c].astype(str).unique()) for c in CAT}
    rows = []
    for i in range(60):
        r = {c: str(vr.choice(lv[c])) for c in CAT}
        r['marriage_years'] = float(vr.uniform(0, 40))
        r['age_at_marriage'] = None if i % 13 == 0 else float(vr.uniform(14, 60))
        r['wedding_year'] = float(vr.integers(1945, 2030))
        rows.append(r)
    df = pd.DataFrame(rows)
    df['age_at_marriage'] = df.age_at_marriage.astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: finals[k].predict(df).tolist() for k in finals},
                   ood_d2=ood.score(ood_fit, df, ood_num, ood_cat, levels).tolist())
    (OUT / 'canada_gss_first_marriage_testvectors.json').write_text(json.dumps(vectors))
    print('shipped', shipped, f'total {time.time() - t_start:.0f}s')


if __name__ == '__main__':
    main()
