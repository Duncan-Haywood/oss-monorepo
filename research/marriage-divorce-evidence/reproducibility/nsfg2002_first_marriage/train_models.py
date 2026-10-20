"""NSFG 2002 (Cycle 6) women's first marriages: per-year dissolution models from the wedding day.

Builds marriage-year intervals from the female respondent file, compares a constant rate, a
duration-only rate, an additive spline Poisson model and a depth-3 Poisson tree with 5-fold
person-held-out deviance, writes aggregate tables, and exports the fitted models to
../../app/models/nsfg2002_first_marriage.json with Python test vectors for the JS engine.

Run from this folder after `sh download.sh`:  python3 train_models.py
Needs numpy, pandas, scikit-learn 1.7.2 (requirements.txt).
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import nsfgdct  # noqa: E402
from bundle_export import export  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261019
OUT = HERE.parent.parent / 'app' / 'models'
VARS = ('caseid cmbirth cmintvw evrmarry fmarno mardat01 marend01 mar1diss hxagemar lvtoghx '
        'marbefhx kidshx hisphx racehx1 hisprace intact18 finalwgt sest secu_r').split()

NUMERIC = ['marriage_years', 'wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year']
CATEGORICAL = ['cohabited_first', 'husband_married_before', 'husband_prior_children',
               'wife_race_ethnicity', 'same_race_ethnicity', 'wife_intact_family']
YESNO = {1: 'Yes', 5: 'No'}


def husband_group(r):
    if r['hisphx'] == 1:
        return 'Hispanic'
    if r['hisphx'] == 5:
        return {4: 'Black', 5: 'White', 1: 'Other', 2: 'Other', 3: 'Other'}.get(r['racehx1'], 'Unknown')
    return 'Unknown'


def marriages():
    dat = HERE / 'raw' / '2002FemResp.dat'  # official NCHS copy; the mirror ships it gzipped
    if not dat.exists():
        dat = HERE / 'raw' / '2002FemResp.dat.gz'
    rows = nsfgdct.read(dat, HERE / 'raw' / '2002FemResp.dct', VARS)
    assert len(rows) == 7643, len(rows)
    out = []
    for r in rows:
        if r['evrmarry'] != 1:
            continue
        wife = {1: 'Hispanic', 2: 'White', 3: 'Black', 4: 'Other'}[r['hisprace']]
        husb = husband_group(r)
        hx = r['hxagemar']
        out.append(dict(
            id=r['caseid'], weight=r['finalwgt'], sest=r['sest'], secu=r['secu_r'],
            months=r['mar1diss'],
            event=int(r['marend01'] in (1, 2)),       # divorce/annulment or separation
            widowed=int(r['marend01'] == 3),          # censored at the husband's death
            divorced_only=int(r['marend01'] == 1),
            wife_age_at_marriage=(r['mardat01'] - r['cmbirth']) / 12,
            husband_age_at_marriage=hx if hx is not None and hx < 90 else np.nan,
            wedding_year=1900 + (r['mardat01'] - 1) // 12,
            cohabited_first=YESNO.get(r['lvtoghx'], 'Unknown'),
            husband_married_before=YESNO.get(r['marbefhx'], 'Unknown'),
            husband_prior_children=YESNO.get(r['kidshx'], 'Unknown'),
            wife_race_ethnicity=wife,
            husband_race_ethnicity=husb,
            same_race_ethnicity='Unknown' if husb == 'Unknown' else ('Same' if husb == wife else 'Different'),
            wife_intact_family=YESNO[r['intact18']],
        ))
    m = pd.DataFrame(out)
    m.attrs['weighted_total_millions'] = round(sum(r['finalwgt'] for r in rows) / 1e6, 2)
    m['weight'] = m.weight / m.weight.mean()
    return m


def intervals(m):
    """One row per marriage-year. Dates are whole months, so an end in month k is placed at k + 0.5."""
    rec = []
    for r in m.itertuples(index=False):
        t = (r.months + 0.5) / 12
        k = 0
        while k < t:
            exp = min(t, k + 1) - k
            last = t <= k + 1
            rec.append((r.id, k, exp, int(r.event and last), int(r.divorced_only and last)))
            k += 1
    iv = pd.DataFrame(rec, columns=['id', 'marriage_years', 'exposure', 'event', 'divorced_only'])
    keep = m.drop(columns=['event', 'divorced_only', 'months'])
    return iv.merge(keep, on='id', how='left')


def pipeline(kind):
    cat = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    if kind == 'duration_only':
        num = Pipeline([('impute', SimpleImputer(strategy='median')),
                        ('spline', SplineTransformer(n_knots=5, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                        ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, ['marriage_years'])])
        est = PoissonRegressor(alpha=1e-6, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    elif kind == 'additive_spline':
        num = Pipeline([('impute', SimpleImputer(strategy='median')),
                        ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                        ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, NUMERIC), ('cat', cat, CATEGORICAL)])
        est = PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    else:
        num = Pipeline([('impute', SimpleImputer(strategy='median'))])
        prep = ColumnTransformer([('num', num, NUMERIC), ('cat', cat, CATEGORICAL)])
        est = DecisionTreeRegressor(criterion='poisson', max_depth=3, min_samples_leaf=1500, random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('duration_only', 'Marriage length only (baseline curve)'),
          ('additive_spline', 'Additive spline Poisson'),
          ('tree_depth3', 'Poisson tree, depth 3')]


def fit(kind, d):
    p = pipeline(kind)
    p.fit(d, d.event / d.exposure, fit__sample_weight=d.weight * d.exposure)
    return p


def deviance(y, e, w, rate):
    mu = e * rate
    term = np.zeros(len(y))
    ok = y > 0
    term[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * np.dot(w, term - y + mu) / np.dot(w, e)


def km(m, years=(1, 2, 3, 5, 10, 15, 20)):
    """Survey-weighted Kaplan-Meier of first-marriage survival (no dissolution), widowhood censored."""
    t = (m.months.to_numpy() + 0.5) / 12
    ev, w = m.event.to_numpy(), m.weight.to_numpy()
    order = np.argsort(t)
    t, ev, w = t[order], ev[order], w[order]
    s, at_risk, out, j = 1.0, w.sum(), {}, 0
    times = np.unique(t)
    for u in times:
        sel = t == u
        d = (w * ev)[sel].sum()
        while j < len(years) and years[j] < u:
            out[years[j]] = s
            j += 1
        if at_risk > 0:
            s *= 1 - d / at_risk
        at_risk -= w[sel].sum()
    while j < len(years):
        out[years[j]] = s if years[j] <= t.max() else np.nan
        j += 1
    return out


def main():
    m = marriages()
    iv = intervals(m)
    assert abs(iv.exposure.sum() - ((m.months + 0.5) / 12).sum()) < 1e-6
    assert iv.event.sum() == m.event.sum()

    # Person-held-out folds (one first marriage per respondent).
    rng = np.random.default_rng(SEED)
    ids = m.id.to_numpy().copy()
    rng.shuffle(ids)
    fold_of = {i: k % 5 for k, i in enumerate(ids)}
    iv['fold'] = iv.id.map(fold_of)

    preds = {k: np.zeros(len(iv)) for k in ['constant'] + [k for k, _ in MODELS]}
    for f in range(5):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        ix = te.index.to_numpy()
        preds['constant'][ix] = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
        for k, _ in MODELS:
            preds[k][ix] = fit(k, tr).predict(te)

    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    base = deviance(y, e, w, preds['constant'])
    dur = deviance(y, e, w, preds['duration_only'])
    comp = []
    for k in preds:
        d = deviance(y, e, w, preds[k])
        comp.append(dict(model=k, heldout_mean_deviance=d,
                         deviance_improvement_percent=100 * (1 - d / base),
                         improvement_over_duration_only_percent=100 * (1 - d / dur),
                         observed_expected_ratio=float(np.dot(w, y) / np.dot(w, e * preds[k]))))
        # Fold-level spread of the improvement over the constant rate.
        fs = [100 * (1 - deviance(y[iv.fold == f], e[iv.fold == f], w[iv.fold == f], preds[k][iv.fold == f])
                     / deviance(y[iv.fold == f], e[iv.fold == f], w[iv.fold == f], preds['constant'][iv.fold == f]))
              for f in range(5)]
        comp[-1].update(fold_improvement_min=min(fs), fold_improvement_max=max(fs))
    comp = pd.DataFrame(comp)
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.6g')

    # Calibration: ten exposure-weighted bins of held-out predicted rate per model.
    cal = []
    for k in ['additive_spline', 'tree_depth3', 'duration_only']:
        p = preds[k]
        order = np.argsort(p, kind='stable')
        cw = np.cumsum((w * e)[order]) / (w * e).sum()
        bins = np.empty(len(p), int)
        bins[order] = np.minimum((cw * 10).astype(int), 9)
        for b in range(10):
            s = bins == b
            cal.append(dict(model=k, bin=b + 1, intervals=int(s.sum()), events=int(y[s].sum()),
                            observed_rate=float(np.dot(w[s], y[s]) / np.dot(w[s], e[s])),
                            predicted_rate=float(np.dot(w[s], e[s] * p[s]) / np.dot(w[s], e[s]))))
    pd.DataFrame(cal).to_csv(HERE / 'heldout_calibration.csv', index=False, float_format='%.6g')

    # Descriptive survey-weighted survival (aggregate; safe to publish).
    groups = [('All first marriages', m)]
    agebin = pd.cut(m.wife_age_at_marriage, [0, 20, 25, 30, 99], right=False,
                    labels=['Wife married under 20', 'Wife married 20-24', 'Wife married 25-29', 'Wife married 30+'])
    groups += [(str(g), m[agebin == g]) for g in agebin.cat.categories]
    groups += [(f'Cohabited first: {v}', m[m.cohabited_first == v]) for v in ['Yes', 'No']]
    groups += [(f'Husband married before: {v}', m[m.husband_married_before == v]) for v in ['Yes', 'No']]
    groups += [(f'Wedding {a}-{b}', m[(m.wedding_year >= a) & (m.wedding_year <= b)]) for a, b in [(1970, 1984), (1985, 1994), (1995, 2002)]]
    lt = []
    for name, g in groups:
        s = km(g)
        lt.append(dict(group=name, marriages=len(g), dissolutions=int(g.event.sum()),
                       **{f'still_married_{yr}y': s[yr] for yr in s}))
    lt = pd.DataFrame(lt)
    lt.to_csv(HERE / 'weighted_survival.csv', index=False, float_format='%.4f')

    # Final fits on everyone, exported for the browser.
    pipes = {k: fit(k, iv) for k, _ in MODELS}
    (HERE / 'tree_depth3.txt').write_text(export_text(
        pipes['tree_depth3'].named_steps['fit'],
        feature_names=pipes['tree_depth3'].named_steps['prep'].get_feature_names_out().tolist(), decimals=4))
    coefs = pipes['additive_spline']
    pd.DataFrame(dict(feature=coefs.named_steps['prep'].get_feature_names_out(),
                      coef=coefs.named_steps['fit'].coef_)).to_csv(HERE / 'coefficients_additive_spline.csv', index=False, float_format='%.6g')

    # Readable partial effects of the final additive model: rate ratio when one input changes
    # and every other input stays at a reference profile (first year, medians, reference categories).
    ref = {c: float(iv[c].median()) for c in NUMERIC}
    ref['marriage_years'] = 0.0
    ref.update({c: sorted(m[c].unique())[0] for c in CATEGORICAL})
    r0 = coefs.predict(pd.DataFrame([ref]))[0]
    eff = []
    grid = dict(marriage_years=[0, 1, 2, 3, 5, 7, 10, 15, 20, 25], wife_age_at_marriage=[17, 19, 21, 23, 25, 28, 32, 38],
                husband_age_at_marriage=[19, 21, 23, 25, 28, 32, 38, 45], wedding_year=[1975, 1980, 1985, 1990, 1995, 2000])
    for c, vals in grid.items():
        for v in vals:
            eff.append(dict(input=c, value=v, rate_ratio=coefs.predict(pd.DataFrame([{**ref, c: float(v)}]))[0] / r0))
    for c in CATEGORICAL:
        for v in sorted(m[c].unique()):
            eff.append(dict(input=c, value=v, rate_ratio=coefs.predict(pd.DataFrame([{**ref, c: v}]))[0] / r0))
    eff = pd.DataFrame(eff)
    eff.to_csv(HERE / 'additive_partial_effects.csv', index=False, float_format='%.4f')
    print(f'reference profile {ref} rate {r0:.4f}')
    print(eff.round(3).to_string(index=False))

    held = comp.set_index('model')
    # Support: central 99% of marriages for ages and wedding year (the extremes include a
    # handful of implausible ages, e.g. a recorded age at marriage under 12); marriage years
    # up to the last year with at least 50 marriages at risk.
    support = {c: [float(m[c].quantile(0.005)), float(m[c].quantile(0.995))]
               for c in ['wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year']}
    at_risk = iv.groupby('marriage_years').size()
    support = {'marriage_years': [0.0, float(at_risk[at_risk >= 50].index.max())], **support}
    audit = dict(
        respondents_in_file=7643, weighted_women_15_44_millions=m.attrs['weighted_total_millions'],
        ever_married=len(m), first_marriage_dissolutions=int(m.event.sum()),
        of_which_divorce_or_annulment=int(m.divorced_only.sum()), widowed_censored=int(m.widowed.sum()),
        intervals=len(iv), person_years=float(iv.exposure.sum()),
        husband_age_missing=int(m.husband_age_at_marriage.isna().sum()),
        wife_age_at_marriage_under_14=int((m.wife_age_at_marriage < 14).sum()),
        unknown_counts={c: int((m[c] == 'Unknown').sum()) for c in CATEGORICAL},
        wedding_years=[int(m.wedding_year.min()), int(m.wedding_year.max())],
        folds='5 folds by respondent, seeded shuffle', python_sklearn=sklearn.__version__)
    (HERE / 'sample_audit.json').write_text(json.dumps(audit, indent=1) + '\n')

    bundle = dict(
        id='nsfg2002_first_marriage', version=1,
        source='National Survey of Family Growth 2002 (Cycle 6), female respondent public-use file (NCHS); women aged 15-44 interviewed 2002-03, first marriages begun 1970-2003',
        target='Annual rate of first-marriage dissolution (divorce, annulment or separation) per marriage-year from the wedding day; widowhood censored (Poisson rate, not a probability)',
        population="U.S. household population of women 15-44 in their FIRST marriage, husbands of any marital history; the wife's own report",
        weights='NSFG final weights (normalised to mean 1) times exposure',
        training=dict(intervals=len(iv), respondents=len(m), events=int(m.event.sum()),
                      person_years=round(float(iv.exposure.sum()), 1)),
        constant_rate=float((iv.weight * iv.event).sum() / (iv.weight * iv.exposure).sum()),
        support=support,
        inputs=dict(
            marriage_years='completed years since the wedding at the start of the year being scored (0 = first year)',
            wife_age_at_marriage="wife's age in years on the wedding day",
            husband_age_at_marriage="husband's age in years on the wedding day (wife's report)",
            wedding_year='calendar year of the wedding; outside 1970-2003 is extrapolation, so the app should hold it at the latest year in support and say so',
            cohabited_first='Yes/No: lived together before marrying', husband_married_before='Yes/No',
            husband_prior_children='Yes/No: husband had children from a prior relationship',
            wife_race_ethnicity='Hispanic, White, Black, Other (non-Hispanic unless Hispanic)',
            same_race_ethnicity="Same/Different: husband's broad race-ethnicity group versus the wife's",
            wife_intact_family='Yes/No: wife lived with both parents from birth to 18'),
        abstain=['same-sex couples', 'wife previously married (only first marriages of women are in the data)',
                 'any partner outside the age-at-marriage support'],
        models=[dict(key=k, label=lbl,
                     heldout=dict(deviance_improvement_percent=round(float(held.loc[k, 'deviance_improvement_percent']), 3),
                                  improvement_over_duration_only_percent=round(float(held.loc[k, 'improvement_over_duration_only_percent']), 3),
                                  observed_expected_ratio=round(float(held.loc[k, 'observed_expected_ratio']), 4)),
                     **export(pipes[k])) for k, lbl in MODELS],
        weighted_survival=json.loads(lt.to_json(orient='records')),
        sklearn=sklearn.__version__,
    )
    OUT.mkdir(exist_ok=True)
    (OUT / 'nsfg2002_first_marriage.json').write_text(json.dumps(bundle, separators=(',', ':')))

    # Test vectors spanning the categories, numeric ranges and missing values.
    rng = np.random.default_rng(SEED)
    rows = []
    levels = {c: sorted(m[c].unique()) for c in CATEGORICAL}
    for i in range(60):
        r = {c: str(rng.choice(levels[c])) for c in CATEGORICAL}
        r['marriage_years'] = float(rng.uniform(0, 35))
        r['wife_age_at_marriage'] = float(rng.uniform(14, 46))
        r['husband_age_at_marriage'] = None if i % 9 == 0 else float(rng.uniform(15, 60))
        r['wedding_year'] = float(rng.integers(1965, 2030))
        rows.append(r)
    df = pd.DataFrame(rows)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: pipes[k].predict(df).tolist() for k in pipes})
    (OUT / 'nsfg2002_first_marriage_testvectors.json').write_text(json.dumps(vectors))

    print(json.dumps(audit['ever_married']), 'marriages,', audit['first_marriage_dissolutions'], 'dissolutions,',
          round(audit['person_years']), 'person-years')
    print(comp.round(4).to_string(index=False))
    print(lt.round(3).to_string(index=False))


if __name__ == '__main__':
    main()
