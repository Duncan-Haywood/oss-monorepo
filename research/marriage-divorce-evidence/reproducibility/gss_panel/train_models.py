"""GSS panels 2006-2020: does how happy a married person says their marriage is predict
whether they are divorced or separated at the next interview two years later?

Prospective lens: respondents married at wave t of the four official NORC GSS panels
(2006-08-10, 2008-10-12, 2010-12-14, 2016/2018-2020). Outcome: divorced or separated at the
re-interview 2 years later (and 4 years later as a second target). Predictors are measured at
wave t. Models: constant, HAPMAR-only logistic, additive L1 logistic (splines for age,
children and attendance; penalty chosen by inner grouped CV), depth-3 tree, and gradient
boosting (held-out comparison only; the browser engine has no logistic boosting kind).
Held out by person (StratifiedGroupKFold, 5 folds x 10 repeats), panel weights throughout,
person-cluster bootstrap CIs.

Writes aggregate CSVs/JSON here, plus ../../app/models/gss_panel_marriages.json and
gss_panel_marriages_testvectors.json. Nothing person-level is written.

Run from this folder after `sh download.sh`:  python3 train_models.py   (~15-30 min on 4 shared cores; GSS_JOBS sets workers)
"""
from pathlib import Path
import json, os, sys, warnings
from joblib import Parallel, delayed
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import gss_data as g  # noqa: E402
from bundle_export import export as _export  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
REPEATS = 10
BOOT = 1000
C_GRID = [0.1, 0.3, 1.0]
OUT = HERE.parent.parent / 'app' / 'models'
CAT = list(g.CATEGORIES)
NUM = g.NUMERIC
JOBS = int(os.environ.get('GSS_JOBS', 4))
# Optional cache of out-of-fold predictions (person-level, so keep it OUTSIDE the repository).
CACHE = os.environ.get('GSS_CV_CACHE')
QUANTILES = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99]


def export(pipe):
    """bundle_export.export plus the imputer's missing-indicator columns (engine.js reads num.indicator)."""
    out = _export(pipe)
    if out['numeric'] is None:  # engine.prepare expects a numeric block, even an empty one
        out['numeric'] = dict(columns=[], impute=[])
    for name, tr, cols in pipe.named_steps['prep'].transformers_:
        if name == 'num':
            imp = dict(tr.steps)['impute']
            if imp.indicator_ is not None:
                out['numeric']['indicator'] = [int(i) for i in imp.indicator_.features_]
    return out


def onehot(cats):
    return OneHotEncoder(categories=[g.CATEGORIES[c] for c in cats], drop='first',
                         handle_unknown='ignore', sparse_output=False)


def pipeline(kind, C=0.3):
    if kind == 'hapmar_only':
        prep = ColumnTransformer([('cat', onehot(['hapmar']), ['hapmar'])])
        return Pipeline([('prep', prep), ('fit', LogisticRegression(C=100.0, max_iter=5000))])
    if kind == 'logistic_additive':
        num = Pipeline([('impute', SimpleImputer(strategy='median', add_indicator=True)),
                        ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False,
                                                     extrapolation='linear')),
                        ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, NUM), ('cat', onehot(CAT), CAT)])
        return Pipeline([('prep', prep), ('fit', LogisticRegression(C=C, penalty='l1', solver='liblinear', max_iter=5000))])
    if kind == 'logistic_linear':  # for odds ratios: linear numerics, near-unpenalised
        num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, NUM), ('cat', onehot(CAT), CAT)])
        return Pipeline([('prep', prep), ('fit', LogisticRegression(C=1e4, max_iter=20000))])
    num = Pipeline([('impute', SimpleImputer(strategy='median', add_indicator=True))])
    prep = ColumnTransformer([('num', num, NUM), ('cat', onehot(CAT), CAT)])
    if kind == 'tree_depth3':
        est = DecisionTreeRegressor(max_depth=3, min_samples_leaf=300, random_state=SEED)
    else:
        est = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.03, max_iter=150, min_samples_leaf=80,
                                             l2_regularization=1.0, random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


def proba(pipe, X):
    if isinstance(pipe.named_steps['fit'], DecisionTreeRegressor):
        return np.clip(pipe.predict(X), 1e-6, 1 - 1e-6)
    return pipe.predict_proba(X)[:, 1]


def fit(kind, d, C=0.3):
    return pipeline(kind, C).fit(d, d.event.to_numpy(), fit__sample_weight=d.weight.to_numpy())


def logloss(y, p, w):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return float(-np.sum(w * (y * np.log(p) + (1 - y) * np.log(1 - p))) / w.sum())


def brier(y, p, w):
    return float(np.sum(w * (p - y) ** 2) / w.sum())


def choose_C(d, seed):
    """Inner 4-fold grouped CV on the training data only."""
    y, w = d.event.to_numpy(), d.weight.to_numpy()
    cv = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=seed)
    scores = {C: 0.0 for C in C_GRID}
    for tr, te in cv.split(d, y, d.pid):
        for C in C_GRID:
            p = proba(fit('logistic_additive', d.iloc[tr], C), d.iloc[te])
            scores[C] += logloss(y[te], p, w[te]) * w[te].sum()
    return min(scores, key=scores.get)


def one_repeat(s, kinds, r):
    y = s.event.to_numpy()
    P = {k: np.zeros(len(s)) for k in ['constant'] + kinds}
    chosen = []
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED + r)
    for f, (tr, te) in enumerate(cv.split(s, y, s.pid)):
        dtr, dte = s.iloc[tr], s.iloc[te]
        P['constant'][te] = np.average(y[tr], weights=dtr.weight)
        for k in kinds:
            C = 0.3
            if k == 'logistic_additive':
                C = choose_C(dtr, SEED + 100 * r + f)
                chosen.append(C)
            P[k][te] = proba(fit(k, dtr, C), dte)
    return P, chosen


def crossval(s, kinds, tag):
    """Out-of-fold predictions for each repeat: dict kind -> array (REPEATS, n)."""
    path = f'{CACHE}_{tag}.npz' if CACHE else None
    if path and os.path.exists(path):
        z = np.load(path, allow_pickle=True)
        return {k: z[k] for k in ['constant'] + kinds}, list(z['_chosen'])
    res = Parallel(n_jobs=JOBS)(delayed(one_repeat)(s, kinds, r) for r in range(REPEATS))
    P = {k: np.stack([r[0][k] for r in res]) for k in ['constant'] + kinds}
    chosen = [c for r in res for c in r[1]]
    if path:
        np.savez(path, _chosen=np.array(chosen), **P)
    return P, chosen


def metrics(y, w, P, idx=None):
    """Per-repeat metrics averaged over repeats; idx resamples rows (bootstrap)."""
    if idx is not None:
        y, w = y[idx], w[idx]
    out = {}
    base = [logloss(y, (p if idx is None else p[idx]), w) for p in P['constant']]
    for k, M in P.items():
        rows = []
        for r, p in enumerate(M):
            p = p if idx is None else p[idx]
            ll = logloss(y, p, w)
            rows.append((100 * (1 - ll / base[r]), roc_auc_score(y, p, sample_weight=w) if k != 'constant' else 0.5,
                         brier(y, p, w), ll))
        out[k] = np.array(rows).mean(axis=0)
    return out


def person_groups(pid):
    return pd.Series(np.arange(len(pid))).groupby(pid.to_numpy()).apply(np.array).tolist()


def boot_indices(pid, B, seed):
    groups = person_groups(pid)
    rng = np.random.default_rng(seed)
    for _ in range(B):
        pick = rng.integers(0, len(groups), len(groups))
        yield np.concatenate([groups[i] for i in pick])


def comparison(s, P, label):
    y, w = s.event.to_numpy(), s.weight.to_numpy()
    point = metrics(y, w, P)
    boots = {k: [] for k in P}
    for m in Parallel(n_jobs=JOBS)(delayed(metrics)(y, w, P, idx) for idx in boot_indices(s.pid, BOOT, SEED + 1)):
        for k in P:
            boots[k].append(m[k])
    rows = []
    for k in P:
        b = np.array(boots[k])
        lo, hi = np.percentile(b, [2.5, 97.5], axis=0)
        fold_gain = [100 * (1 - logloss(y, P[k][r], w) / logloss(y, P['constant'][r], w)) for r in range(REPEATS)]
        rows.append(dict(horizon=label, model=k, logloss_improvement_percent=point[k][0],
                         gain_ci_low=lo[0], gain_ci_high=hi[0], repeat_min=min(fold_gain), repeat_max=max(fold_gain),
                         auc=point[k][1], auc_ci_low=lo[1], auc_ci_high=hi[1],
                         brier=point[k][2], brier_ci_low=lo[2], brier_ci_high=hi[2], logloss=point[k][3]))
    return pd.DataFrame(rows)


def calibration(s, P, label):
    y, w = s.event.to_numpy(), s.weight.to_numpy()
    overall = np.average(y, weights=w)
    rows = []
    for k, M in P.items():
        if k == 'constant':
            continue
        p = M.mean(axis=0)  # repeat-averaged out-of-fold prediction
        order = np.argsort(p, kind='stable')
        cw = np.cumsum(w[order]) / w.sum()
        dec = np.empty(len(p), int)
        dec[order] = np.minimum((cw * 10 - 1e-12).astype(int), 9)
        for b in range(10):
            m = dec == b
            obs = float(np.average(y[m], weights=w[m]))
            rows.append(dict(horizon=label, model=k, decile=b + 1, records=int(m.sum()), events=int(y[m].sum()),
                             mean_predicted=float(np.average(p[m], weights=w[m])), observed=obs,
                             lift_vs_overall=obs / overall))
    return pd.DataFrame(rows)


def wrate(d, outcome='event'):
    return float(np.average(d[outcome], weights=d.weight)) if len(d) else np.nan


def rate_table(s, label, by='hapmar', outcome='event', weight_col='weight', variant='main'):
    rows = []
    d0 = s.assign(weight=s[weight_col])
    levels = [l for l in g.CATEGORIES.get(by, sorted(s[by].unique())) if (s[by] == l).any()]
    ref = levels[0]
    point = {l: wrate(d0[d0[by] == l], outcome) for l in levels}
    boots = {l: [] for l in levels}
    for idx in boot_indices(s.pid, BOOT, SEED + 2):
        b = d0.iloc[idx]
        for l in levels:
            boots[l].append(wrate(b[b[by] == l], outcome))
    for l in levels:
        sub = s[s[by] == l]
        bl = np.array(boots[l])
        rr = bl / np.array(boots[ref])
        rows.append(dict(horizon=label, variant=variant, group=by, level=l, records=len(sub), respondents=sub.pid.nunique(),
                         events=int(sub[outcome].sum()), unweighted_rate=float(sub[outcome].mean()),
                         weighted_rate=point[l], ci_low=float(np.nanpercentile(bl, 2.5)), ci_high=float(np.nanpercentile(bl, 97.5)),
                         ratio_vs_reference=point[l] / point[ref],
                         ratio_ci_low=float(np.nanpercentile(rr, 2.5)), ratio_ci_high=float(np.nanpercentile(rr, 97.5))))
    return rows


def attrition(t):
    """Among people married at wave t and selected for re-interview: what happened, by HAPMAR."""
    rows = []
    sel = t[t.selected]
    for h in (2, 4):
        d = sel[sel.horizon == h]
        for l in g.CATEGORIES['hapmar'] + ['All']:
            x = d if l == 'All' else d[d.hapmar == l]
            if not len(x):
                continue
            st = x.status_to.value_counts()
            rows.append(dict(horizon=h, hapmar=l, married_at_t=len(x),
                             reinterviewed_share=float(x.reinterviewed.mean()),
                             died_share=float(x.died.mean()),
                             **{f'n_{k.split(" (")[0].replace(" ", "_")}': int(st.get(k, 0)) for k in
                                ['not re-interviewed', 'divorced or separated', 'married', 'widowed',
                                 'never married (inconsistent)', 'marital status missing']}))
    return pd.DataFrame(rows)


def attrition_model(t, h):
    """Unweighted logistic model of re-interview among the selected and living, on wave-t traits."""
    d = t[(t.horizon == h) & t.selected & ~t.died].copy()
    y = d.reinterviewed.astype(int).to_numpy()
    cats = CAT + ['panel']
    num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())])
    oh = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False,
                       categories=[g.CATEGORIES[c] for c in CAT] + [sorted(d.panel.unique())])
    pipe = Pipeline([('prep', ColumnTransformer([('num', num, NUM), ('cat', oh, cats)])),
                     ('fit', LogisticRegression(C=1.0, max_iter=5000))]).fit(d, y)
    d['p_reinterview'] = pipe.predict_proba(d)[:, 1]
    names = pipe.named_steps['prep'].get_feature_names_out()
    coef = dict(zip(names, pipe.named_steps['fit'].coef_[0]))
    ors = {k: float(np.exp(v)) for k, v in coef.items() if k.startswith('cat__hapmar')}
    auc = roc_auc_score(y, d.p_reinterview)
    return d, ors, float(auc)


def odds_ratios(s):
    names = None
    fits = []
    full = fit('logistic_linear', s)
    names = full.named_steps['prep'].get_feature_names_out()
    scale = full.named_steps['prep'].named_transformers_['num'].named_steps['scale'].scale_

    def per_unit(p):
        c = p.named_steps['fit'].coef_[0].copy()
        sc = p.named_steps['prep'].named_transformers_['num'].named_steps['scale'].scale_
        c[:len(sc)] = c[:len(sc)] / sc
        return c
    point = per_unit(full)
    fits = Parallel(n_jobs=JOBS)(delayed(lambda i: per_unit(fit('logistic_linear', s.iloc[i].reset_index(drop=True))))(idx)
                                for idx in boot_indices(s.pid, 300, SEED + 3))
    b = np.array(fits)
    lo, hi = np.percentile(b, [2.5, 97.5], axis=0)
    unit = {'num__age': 10, 'num__childs': 1, 'num__attend': 1}
    rows = []
    for i, n in enumerate(names):
        u = unit.get(n, 1)
        rows.append(dict(feature=n, per=('10 years' if n == 'num__age' else 'one step' if n.startswith('num__') else 'vs reference'),
                         odds_ratio=float(np.exp(point[i] * u)), ci_low=float(np.exp(lo[i] * u)), ci_high=float(np.exp(hi[i] * u))))
    return pd.DataFrame(rows), scale


def wquantiles(p, w, qs):
    o = np.argsort(p)
    p, w = p[o], w[o]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(np.array(qs) / 100, c, p)


def subgroup_bands(s):
    return {
        'sex': s.sex,
        'age_band': pd.cut(s.age, [0, 30, 40, 50, 60, 70, 200], right=False,
                           labels=['18-29', '30-39', '40-49', '50-59', '60-69', '70+']).astype(object).fillna('Unknown'),
        'degree': s.degree, 'spouse_degree': s.spouse_degree, 'race': s.race, 'hapmar': s.hapmar,
        'attendance_band': pd.cut(s.attend, [-1, 1, 4, 6, 9], labels=['Never or under once a year', 'Yearly to monthly',
                                                                      '2-3 times a month to nearly weekly', 'Weekly or more']).astype(object).fillna('Unknown'),
        'children': pd.cut(s.childs, [-1, 0, 1, 2, 99], labels=['0', '1', '2', '3+']).astype(object).fillna('Unknown'),
        'divorced_before': s.divorced_before, 'panel': s.panel,
    }


def population_reference(s, p, label):
    """Survey-weighted quantiles of held-out predicted probability; cells with >= 100 respondents only."""
    w = s.weight.to_numpy()
    out = dict(horizon_years=label, model='logistic_additive', quantiles=QUANTILES,
               overall=dict(respondents=int(s.pid.nunique()), records=len(s),
                            values=[round(float(v), 6) for v in wquantiles(p, w, QUANTILES)]),
               subgroups={}, suppressed=[])
    for name, col in subgroup_bands(s).items():
        cells = {}
        for lv in sorted(col.astype(str).unique()):
            m = (col.astype(str) == lv).to_numpy()
            n = int(s.pid[m].nunique())
            if n < 100:
                out['suppressed'].append(f'{name}={lv} ({n} respondents)')
                continue
            cells[lv] = dict(respondents=n, records=int(m.sum()),
                             values=[round(float(v), 6) for v in wquantiles(p[m], w[m], QUANTILES)])
        out['subgroups'][name] = cells
    return out


INPUTS = dict(
    hapmar="'Taken all together, how would you describe your marriage?' Very happy / Pretty happy / Not too happy (HAPMAR)",
    happy='general happiness: Very happy / Pretty happy / Not too happy (HAPPY)',
    age='age in years (89 = 89 or older)', sex='Male / Female (respondent)', race='White / Black / Other (RACE)',
    degree='own highest degree (DEGREE)', spouse_degree="spouse's highest degree (SPDEG)",
    work='own labour-force status (WRKSTAT, grouped)', spouse_work="spouse's labour-force status (SPWRKSTA, grouped)",
    family_income='family income in constant 2000 dollars (NORC CONINC), banded; multiply 2024 dollars by about 0.55 (CPI-U 172.2/313.7)',
    religion='own religion (RELIG, grouped)', spouse_religion="spouse's religion (SPREL, grouped)",
    same_religion='Same / Different: RELIG equals SPREL at the detailed code',
    attend='religious service attendance 0 never ... 8 more than once a week (ATTEND)',
    childs='number of children ever had, 0-8 (8 = eight or more) (CHILDS)',
    divorced_before='ever been divorced or legally separated before (DIVORCE item, asked of the currently married)',
    family_at_16='lived with both own parents at 16; if not, whether because of divorce/separation or a death (FAMILY16, FAMDIF16)',
    health='self-rated health (HEALTH; split ballot, about two-thirds asked)',
    fefam="'Better for everyone if the man achieves outside the home and the woman takes care of the home and family' (FEFAM; split ballot)",
    sexfreq='frequency of sex in the last 12 months (SEXFREQ; self-administered, wave 1 of the 2006-2010 panels only)',
    evstray='ever had sex with someone other than the spouse while married (EVSTRAY; self-administered, wave 1 of the 2006-2010 panels only)',
    satfin='satisfaction with present financial situation (SATFIN)',
    xmarsex='attitude to a married person having sex with someone other than the spouse (XMARSEX; split ballot)',
    region='census region (REGION, grouped)', place='size of place (SRCBELT, grouped)')


def main():
    t, audit = g.transitions()
    s2, s4 = g.analysis_sample(t, 2), g.analysis_sample(t, 4)

    # ---- sample flow and item availability ----
    flow = pd.crosstab(t.transition, t.status_to)
    flow['married_at_t'] = flow.sum(axis=1)
    flow.to_csv(HERE / 'sample_flow.csv')
    avail = []
    for tr, d in pd.concat([s2, s4]).groupby('transition'):
        avail.append(dict(transition=tr, records=len(d), **{c: round(float((d[c] != 'Unknown').mean()), 3) for c in CAT},
                          **{c: round(float(d[c].notna().mean()), 3) for c in NUM}))
    pd.DataFrame(avail).to_csv(HERE / 'item_availability.csv', index=False)

    # ---- HAPMAR dissolution rates (the headline descriptive) ----
    rows = []
    for s, h in [(s2, 2), (s4, 4)]:
        rows += rate_table(s, h)
        rows += rate_table(s, h, outcome='divorced_only', variant='divorce only (separation not counted)')
        rows += rate_table(s.assign(ev2=((s.event + s.flip_divorce_item) > 0).astype(int)), h, outcome='ev2',
                           variant='also counting a no-to-yes flip in the ever-divorced item')
        rows += rate_table(s.assign(w1=1.0), h, weight_col='w1', variant='unweighted')
        for era, panels in [('2006-2014 panels', ['2006', '2008', '2010']), ('2016-2020 panel', ['2020'])]:
            sub = s[s.panel.isin(panels)].reset_index(drop=True)
            rows += rate_table(sub, h, variant=era)
    # Attrition-weighted sensitivity: NORC weight / modelled re-interview probability.
    att_or = {}
    for s, h in [(s2, 2), (s4, 4)]:
        d, ors, auc = attrition_model(t, h)
        att_or[h] = dict(hapmar_odds_ratios=ors, auc=auc)
        keyed = d.set_index(['transition', 'pid']).p_reinterview
        p = keyed.reindex(pd.MultiIndex.from_frame(s[['transition', 'pid']])).to_numpy()
        ipw = s.weight / p
        rows += rate_table(s.assign(ipw=ipw / ipw.mean()), h, weight_col='ipw',
                           variant='NORC weight / modelled re-interview probability')
    rates = pd.DataFrame(rows)
    rates.to_csv(HERE / 'hapmar_dissolution_rates.csv', index=False, float_format='%.5g')
    att = attrition(t)
    att.to_csv(HERE / 'attrition_by_hapmar.csv', index=False, float_format='%.4f')

    # ---- held-out models ----
    kinds2 = ['hapmar_only', 'logistic_additive', 'tree_depth3', 'boosted_trees']
    P2, chosen2 = crossval(s2, kinds2, '2y')
    P4, chosen4 = crossval(s4, ['hapmar_only', 'logistic_additive'], '4y')
    comp = pd.concat([comparison(s2, P2, 2), comparison(s4, P4, 4)])
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.5g')
    cal = pd.concat([calibration(s2, P2, 2), calibration(s4, P4, 4)])
    cal.to_csv(HERE / 'heldout_calibration.csv', index=False, float_format='%.5g')

    # ---- final fits and explanations ----
    C2 = choose_C(s2, SEED)
    pipes = {'hapmar_only': fit('hapmar_only', s2), 'logistic_additive': fit('logistic_additive', s2, C2),
             'tree_depth3': fit('tree_depth3', s2)}
    tree = pipes['tree_depth3']
    (HERE / 'tree_depth3.txt').write_text(export_text(
        tree.named_steps['fit'], feature_names=tree.named_steps['prep'].get_feature_names_out().tolist(), decimals=4))
    assert tree.named_steps['fit'].tree_.value.min() > 0, 'a tree leaf with no events'
    la = pipes['logistic_additive']
    pd.DataFrame(dict(feature=la.named_steps['prep'].get_feature_names_out(), coef=la.named_steps['fit'].coef_[0])).to_csv(
        HERE / 'coefficients_logistic_additive.csv', index=False, float_format='%.6g')
    ors, _ = odds_ratios(s2)
    ors.to_csv(HERE / 'logistic_odds_ratios.csv', index=False, float_format='%.4f')

    # ---- population reference (held-out predictions, aggregated) ----
    popref = dict(
        note='Survey-weighted quantiles of HELD-OUT predicted dissolution probability (logistic_additive, '
             f'out-of-fold, averaged over {REPEATS} repeats) among married respondents. Cells with fewer than 100 '
             'respondents are suppressed. Aggregates only; no person-level values.',
        horizon_2=population_reference(s2, P2['logistic_additive'].mean(axis=0), 2),
        horizon_4=population_reference(s4, P4['logistic_additive'].mean(axis=0), 4))
    (HERE / 'population_reference.json').write_text(json.dumps(popref, indent=1) + '\n')

    held = comp[comp.horizon == 2].set_index('model')
    main_rates = rates[(rates.variant == 'main')]
    p0 = float(np.average(s2.event, weights=s2.weight))
    audit.update(
        transitions_married_at_t={k: int(v) for k, v in t.groupby('transition').size().items()},
        two_year=dict(records=len(s2), respondents=int(s2.pid.nunique()), events=int(s2.event.sum()),
                      divorce_only_events=int(s2.divorced_only.sum()), flip_divorce_item=int(s2.flip_divorce_item.sum()),
                      weighted_rate=p0),
        four_year=dict(records=len(s4), respondents=int(s4.pid.nunique()), events=int(s4.event.sum()),
                       weighted_rate=float(np.average(s4.event, weights=s4.weight))),
        excluded_widowed=int((t.status_to == 'widowed').sum()),
        excluded_never_married_inconsistent=int((t.status_to == 'never married (inconsistent)').sum()),
        excluded_marital_missing=int((t.status_to == 'marital status missing').sum()),
        not_reinterviewed=int((t.selected & ~t.reinterviewed).sum()),
        not_selected_2016_subsample=int((~t.selected).sum()),
        inner_cv_C_chosen={'2y': pd.Series(chosen2).value_counts().to_dict(), '4y': pd.Series(chosen4).value_counts().to_dict(),
                           'final_2y': C2},
        attrition_model=att_or, sklearn=sklearn.__version__)
    (HERE / 'sample_audit.json').write_text(json.dumps(audit, indent=1, default=str) + '\n')

    labels = {'hapmar_only': 'Logistic, marriage happiness (HAPMAR) only',
              'logistic_additive': 'Additive L1 logistic, all inputs (splines for age, children, attendance)',
              'tree_depth3': 'Decision tree, depth 3'}

    def heldout(k):
        r = held.loc[k]
        return dict(logloss_improvement_percent=round(float(r.logloss_improvement_percent), 3),
                    deviance_improvement_percent=round(float(r.logloss_improvement_percent), 3),
                    logloss_improvement_ci95=[round(float(r.gain_ci_low), 3), round(float(r.gain_ci_high), 3)],
                    auc=round(float(r.auc), 4), auc_ci95=[round(float(r.auc_ci_low), 4), round(float(r.auc_ci_high), 4)],
                    brier=round(float(r.brier), 5), brier_ci95=[round(float(r.brier_ci_low), 5), round(float(r.brier_ci_high), 5)])
    hr = main_rates[main_rates.horizon == 2]
    bundle = dict(
        id='gss_panel_marriages', version=1,
        source='General Social Survey panels (NORC at the University of Chicago): 2006-08-10, 2008-10-12, 2010-12-14 '
               'and 2016/2018-2020, official Stata files from gss.norc.org',
        target='Probability that a currently married respondent is divorced or separated at the re-interview two years '
               'later (prospective; widowhood excluded; a probability over 2 years, not an annual rate)',
        population='U.S. adults (18+) in households, married at a GSS panel interview in 2006-2018 and re-interviewed two '
                   'years later; the respondent\'s own report',
        outcome='probability', horizon_years=2,
        weights='NORC panel weights with non-response adjustment (WTPANNR12, WTPANNR123, WTSSNR_2), normalised to mean 1',
        training=dict(records=len(s2), respondents=int(s2.pid.nunique()), events=int(s2.event.sum()),
                      weighted_rate=round(p0, 5)),
        constant_probability=p0,
        constant_rate=-np.log1p(-p0) / 2,
        constant_rate_note='annual-equivalent rate -ln(1 - p)/2 implied by the 2-year probability, for comparison with the rate lenses only',
        support={c: [float(s2[c].min()), float(s2[c].max())] for c in NUM},
        inputs={c: INPUTS[c] for c in NUM + CAT},
        evaluation=f'StratifiedGroupKFold by respondent, 5 folds x {REPEATS} repeats; L1 penalty chosen by inner grouped '
                   f'4-fold CV within each training fold; weighted log loss, AUC and Brier; 95% CIs from {BOOT} '
                   'respondent-cluster bootstrap resamples of the out-of-fold predictions',
        abstain=['anyone not currently married (this lens starts from a married respondent)',
                 'any numeric input outside the support',
                 'a lifetime or per-year estimate: the target is the 2-year chance only',
                 'same-sex couples (too few in the panels to say anything)'],
        models=[dict(key=k, label=labels[k], heldout=heldout(k), **export(pipes[k])) for k in labels],
        not_exported=dict(boosted_trees=dict(
            reason='held-out comparison only; app/engine.js has no logistic gradient-boosting kind',
            heldout=heldout('boosted_trees'))),
        hapmar_rates=[dict(hapmar=r.level, records=int(r.records), events=int(r.events),
                           weighted_rate=round(float(r.weighted_rate), 5),
                           ci95=[round(float(r.ci_low), 5), round(float(r.ci_high), 5)]) for r in hr.itertuples()],
        hapmar_rates_4y=[dict(hapmar=r.level, records=int(r.records), events=int(r.events),
                              weighted_rate=round(float(r.weighted_rate), 5),
                              ci95=[round(float(r.ci_low), 5), round(float(r.ci_high), 5)])
                         for r in main_rates[main_rates.horizon == 4].itertuples()],
        population_reference=popref,
        sklearn=sklearn.__version__)
    OUT.mkdir(exist_ok=True)
    (OUT / 'gss_panel_marriages.json').write_text(json.dumps(bundle, separators=(',', ':')))

    rng = np.random.default_rng(SEED)
    rows = []
    for i in range(60):
        r = {c: str(rng.choice(g.CATEGORIES[c])) for c in CAT}
        if i % 7 == 0:
            r['spouse_degree'] = None
        if i % 13 == 0:
            r['hapmar'] = 'A level never seen'
        for c in NUM:
            lo, hi = bundle['support'][c]
            r[c] = None if (i % 9 == 0 and c == 'age') or (i % 11 == 0 and c == 'attend') else float(rng.uniform(lo - 2, hi + 2))
        rows.append(r)
    tv = pd.DataFrame(rows)
    tvp = tv.copy()
    for c in CAT:  # the engine maps null to 'Unknown'; scikit-learn needs the same string
        tvp[c] = tvp[c].fillna('Unknown')
    (OUT / 'gss_panel_marriages_testvectors.json').write_text(json.dumps(dict(
        rows=json.loads(tv.replace({np.nan: None}).to_json(orient='records')),
        predictions={k: [float(v) for v in proba(pipes[k], tvp)] for k in pipes})))

    print(json.dumps({k: audit[k] for k in ('two_year', 'four_year', 'inner_cv_C_chosen')}, indent=1, default=str))
    print(comp.round(4).to_string(index=False))
    print(main_rates.round(4).to_string(index=False))
    print(att.round(3).to_string(index=False))
    print(ors.round(3).to_string(index=False))


if __name__ == '__main__':
    main()
