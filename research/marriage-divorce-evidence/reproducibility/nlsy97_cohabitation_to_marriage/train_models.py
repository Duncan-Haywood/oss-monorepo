"""NLSY97: does a cohabiting couple marry, or split up? A before-the-wedding lens.

Every NLSY97 respondent's FIRST cohabiting union (never married before), from the month they moved
in together, followed month by month in the official MAR_STATUS / MAR_PARTNER_LINK arrays until
they married that partner, split up, or were last interviewed. Inputs are fixed at the start of
the cohabitation. Two yearly Poisson hazard models (marrying the partner; splitting first), held
out by person, exported to ../../app/models/nlsy97_cohab_{marriage,split}.json with test vectors.

Reuses the column extract and helpers of ../nlsy97_first_marriage (see its download.sh).
Run:  NLSY97_WORK=<work dir> python3 train_models.py      (numpy, pandas, scikit-learn 1.7.2)
"""
from pathlib import Path
import json, os, sys, warnings
import numpy as np, pandas as pd, sklearn

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / 'nlsy97_first_marriage'))
import build_marriages as B  # noqa: E402
from bundle_export import export  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.linear_model import PoissonRegressor  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler  # noqa: E402
from sklearn.tree import DecisionTreeRegressor, export_text  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
OUT = HERE.parent.parent / 'app' / 'models'
# Partner traits (age, schooling, earlier marriage, children) are NOT inputs: the partner section records
# them in a way that depends on how the union ended (schooling is known for 87% split couples against 47%
# where unknown; a missing age gap goes with 82% splits), so using them would leak the outcome.
# sample_audit.json keeps those rates (partner_item_leakage).
NUMERIC = ['cohab_years', 'age_at_start', 'afqt_percentile', 'parent_max_grade', 'start_year']
CATEGORICAL = ['sex', 'race_ethnicity', 'education_at_start', 'children_before', 'family_at_12', 'religion_raised']
STATUS = {0: 'never married, not cohabiting', 1: 'never married, cohabiting', 2: 'married', 3: 'separated', 4: 'divorced', 5: 'widowed'}


def build(work):
    d = B.load(work)
    n = len(d)
    pub = d['PUBID@1997'].to_numpy()
    sex = B._clean(d['KEY!SEX@1997']).map({1: 'Male', 2: 'Female'}).fillna('Unknown').to_numpy()
    birth = B.cm(B._clean(d['KEY!BDATE_Y@1997']), B._clean(d['KEY!BDATE_M@1997'])).to_numpy()
    race = B._clean(d['KEY!RACE_ETHNICITY@1997']).to_numpy()
    S = B.monthly(d, 'MAR_STATUS')
    L = B.monthly(d, 'MAR_PARTNER_LINK')
    w97 = B._clean(d['SAMPLING_WEIGHT_CC@1997']).to_numpy() / 100
    deg = {k: B._clean(d[f'CVC_{v}@XRND']).to_numpy() for k, v in
           [('GED', 'GED'), ('HS', 'HS_DIPLOMA'), ('AA', 'AA_DEGREE'), ('BA', 'BA_DEGREE'), ('MA', 'MA_DEGREE'),
            ('PHD', 'PHD_DEGREE'), ('PROF', 'PROF_DEGREE')]}
    kids = []
    for k in range(1, 20):
        best = np.full(n, np.nan)
        for y in B.ROUND_YEARS:
            for sep in ('~', '_'):
                cm_, cy_ = f'CV_CHILD_BIRTH_DATE.{k:02d}{sep}M@{y}', f'CV_CHILD_BIRTH_DATE.{k:02d}{sep}Y@{y}'
                if cm_ in d.columns:
                    v = B.cm(B._clean(d[cy_]), B._clean(d[cm_])).to_numpy()
                    best = np.where(np.isnan(v), best, v)
        kids.append(best)
    kids = np.column_stack(kids)

    def pitem(name, y, k, i):
        c = f'{name}.{k:02d}@{y}'
        if c not in d.columns:
            return np.nan
        v = pd.to_numeric(d.at[i, c], errors='coerce')
        return float(v) if v is not None and v >= 0 else np.nan

    rows, skipped = [], dict(no_cohabitation=0, married_before_cohabiting=0)
    for i in range(n):
        s = S[i]
        on = np.where(s == 1)[0]
        if len(on) == 0:
            skipped['no_cohabitation'] += 1
            continue
        c0 = int(on[0])
        if (s[:c0] >= 2).any():
            skipped['married_before_cohabiting'] += 1
            continue
        link = L[i, c0]
        # Follow the spell: same partner while cohabiting; married (2) with that partner = marriage;
        # any other observed state, or a cohabitation with a different partner, ends it as a split.
        event, end, last_valid = 'censored', None, c0
        for t in range(c0 + 1, s.shape[0]):
            st = s[t]
            if np.isnan(st):
                continue
            lt = L[i, t]
            same = np.isnan(link) or np.isnan(lt) or lt == link
            if st == 1 and same:
                last_valid = t
                continue
            if st == 2 and same:
                event, end = 'married', t
            elif st == 2:
                event, end = 'split', t          # married someone else
            else:
                event, end = 'split', t
            break
        years = ((end - c0) if end is not None else (last_valid - c0 + 1)) / 12
        rec = dict(id=int(pub[i]), weight97=w97[i], sex=sex[i], race_ethnicity=B.race_key(race[i]),
                   start_cm=c0, start_year=1980 + (c0 - 1) // 12, age_at_start=(c0 - birth[i]) / 12,
                   event=event, years=max(years, 0.5 / 12), partner_link=link)
        have = lambda k: not np.isnan(deg[k][i]) and deg[k][i] <= c0
        rec['education_at_start'] = ('Bachelor or higher' if any(have(k) for k in ('BA', 'MA', 'PHD', 'PROF')) else
                                     'Associate' if have('AA') else 'High school or GED' if have('HS') or have('GED')
                                     else 'No high school credential')
        b = kids[i][~np.isnan(kids[i])]
        nb = int((b < c0).sum())
        rec['children_before'] = '2+' if nb >= 2 else str(nb)
        rec.update(partner_age=np.nan, partner_hgc=np.nan, partner_prior_marriage=np.nan, partner_prior_children=np.nan)
        if not np.isnan(link):
            R, k = int(link) // 100, int(link) % 100
            if 1 <= R <= len(B.ROUND_YEARS) and 1 <= k <= 20:
                y = B.ROUND_YEARS[R - 1]
                rec['partner_age'] = pitem('YMAR-3200', y, k, i)  # partner's age when they began living together
                for suf in ('', 'A'):
                    for key, item in (('partner_hgc', 'YMAR-3500'), ('partner_prior_marriage', 'YMAR-4310'),
                                      ('partner_prior_children', 'YMAR-4315')):
                        if np.isnan(rec[key]):
                            rec[key] = pitem(f'{item}{suf}', y, k, i)
        rows.append(rec)
    m = pd.DataFrame(rows)
    i_of = {int(p): k for k, p in enumerate(pub)}
    ix = m.id.map(i_of).to_numpy()
    first = lambda name, y='1997': B.col(d, name, y).to_numpy()[ix]
    m['afqt_percentile'] = B.col(d, 'ASVAB_MATH_VERBAL_SCORE_PCT', 'XRND').to_numpy()[ix] / 1000  # 3 implied decimals
    hg = np.column_stack([first(c) for c in ('CV_HGC_BIO_MOM', 'CV_HGC_BIO_DAD')])
    hg[hg == 95] = np.nan
    hr = np.column_stack([first(c) for c in ('CV_HGC_RES_MOM', 'CV_HGC_RES_DAD')])
    hr[hr == 95] = np.nan
    with np.errstate(all='ignore'):
        pmax = np.nanmax(hg, axis=1)
        m['parent_max_grade'] = np.where(np.isnan(pmax), np.nanmax(hr, axis=1), pmax)
    m['family_at_12'] = [B.family12(x) for x in first('CV_YTH_REL_HH_AGE_12')]
    m['religion_raised'] = [B.religion_raised(x) for x in first('YINF-3600')]
    m['partner_education'] = [B.hgc_band(x) for x in m.partner_hgc]
    m['partner_age_gap'] = np.where((m.partner_age >= 14) & (m.partner_age <= 80), m.partner_age + 0.5 - m.age_at_start, np.nan)
    yn = lambda v: np.where(v == 1, 'Yes', np.where(v == 0, 'No', 'Unknown'))
    m['partner_married_before'] = yn(m.partner_prior_marriage.to_numpy())
    m['partner_has_children'] = yn(m.partner_prior_children.to_numpy())
    m['weight'] = m.weight97 / m.weight97[m.weight97 > 0].mean()
    m = m[m.weight > 0].reset_index(drop=True)
    return m, skipped, n


def intervals(m):
    rec = []
    for r in m.itertuples(index=False):
        k = 0
        while k < r.years:
            exp = min(r.years, k + 1) - k
            last = r.years <= k + 1
            rec.append((r.id, k, exp, int(last and r.event == 'married'), int(last and r.event == 'split')))
            k += 1
    iv = pd.DataFrame(rec, columns=['id', 'cohab_years', 'exposure', 'married', 'split'])
    return iv.merge(m.drop(columns=['years']), on='id')


def pipeline(kind):
    cat = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    if kind == 'duration_only':
        num = Pipeline([('impute', SimpleImputer(strategy='median')),
                        ('spline', SplineTransformer(n_knots=5, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                        ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, ['cohab_years'])])
        est = PoissonRegressor(alpha=1e-6, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    elif kind == 'additive_spline':
        num = Pipeline([('impute', SimpleImputer(strategy='median')),
                        ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                        ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, NUMERIC), ('cat', cat, CATEGORICAL)])
        est = PoissonRegressor(alpha=1e-4, max_iter=3000, tol=1e-9, solver='newton-cholesky')
    else:
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), NUMERIC), ('cat', cat, CATEGORICAL)])
        est = DecisionTreeRegressor(criterion='poisson', max_depth=3, min_samples_leaf=800, random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('duration_only', 'Years living together only (baseline curve)'),
          ('additive_spline', 'Additive spline Poisson, inputs at move-in'),
          ('tree_depth3', 'Poisson tree, depth 3')]


def deviance(y, e, w, rate):
    mu = e * rate
    t = np.zeros(len(y))
    ok = y > 0
    t[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * np.dot(w, t - y + mu) / np.dot(w, e)


def cumulative(m, by=None, years=(1, 2, 3, 5, 10)):
    """Weighted cumulative incidence (Aalen-Johansen, monthly) of marrying the partner and of splitting first."""
    groups = [('All first cohabitations', m)] if by is None else [(f'{by}: {v}', g) for v, g in m.groupby(by)]
    out = []
    for name, g in groups:
        t, ev, w = (g.years * 12).round().astype(int).to_numpy(), g.event.to_numpy(), g.weight.to_numpy()
        s, cm_, cs = 1.0, 0.0, 0.0
        rec, j = dict(group=name, couples=len(g), married=int((ev == 'married').sum()), split=int((ev == 'split').sum())), 0
        for month in range(1, int(t.max()) + 1):
            at = w[t >= month].sum()
            if at <= 0:
                break
            hm = w[(t == month) & (ev == 'married')].sum() / at
            hs = w[(t == month) & (ev == 'split')].sum() / at
            cm_ += s * hm
            cs += s * hs
            s *= 1 - hm - hs
            while j < len(years) and month == years[j] * 12:
                rec[f'married_by_{years[j]}y'] = round(cm_, 4)
                rec[f'split_by_{years[j]}y'] = round(cs, 4)
                j += 1
        out.append(rec)
    return out


def main():
    work = os.environ.get('NLSY97_WORK') or sys.exit('set NLSY97_WORK (see ../nlsy97_first_marriage/download.sh)')
    m, skipped, n = build(work)
    iv = intervals(m)
    rng = np.random.default_rng(SEED)
    ids = m.id.to_numpy().copy()
    rng.shuffle(ids)
    fold = iv.id.map({c: k % 5 for k, c in enumerate(ids)}).to_numpy()
    e, w = iv.exposure.to_numpy(), iv.weight.to_numpy()
    comp, fitted = [], {}
    for target in ('married', 'split'):
        y = iv[target].to_numpy()
        preds = {'constant': np.zeros(len(iv))} | {k: np.zeros(len(iv)) for k, _ in MODELS}
        for f in range(5):
            tr, te = fold != f, fold == f
            preds['constant'][te] = np.dot(w[tr], y[tr]) / np.dot(w[tr], e[tr])
            for k, _ in MODELS:
                p = pipeline(k).fit(iv[tr], y[tr] / e[tr], fit__sample_weight=w[tr] * e[tr])
                preds[k][te] = p.predict(iv[te])
        base = deviance(y, e, w, preds['constant'])
        for k, p in preds.items():
            fs = [100 * (1 - deviance(y[fold == f], e[fold == f], w[fold == f], p[fold == f])
                         / deviance(y[fold == f], e[fold == f], w[fold == f], preds['constant'][fold == f])) for f in range(5)]
            comp.append(dict(target=target, model=k, deviance_improvement_percent=100 * (1 - deviance(y, e, w, p) / base),
                             fold_min=min(fs), fold_max=max(fs), observed_expected=float(np.dot(w, y) / np.dot(w, e * p))))
        fitted[target] = {k: pipeline(k).fit(iv, y / e, fit__sample_weight=w * e) for k, _ in MODELS}
    comp = pd.DataFrame(comp)
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.5g')

    ci = cumulative(m)
    for by in ('sex', 'education_at_start', 'children_before', 'race_ethnicity'):
        ci += cumulative(m, by)
    m['age_band'] = pd.cut(m.age_at_start, [0, 20, 23, 26, 30, 99], right=False, labels=['under 20', '20-22', '23-25', '26-29', '30+']).astype(str)
    ci += cumulative(m, 'age_band')
    pd.DataFrame(ci).to_csv(HERE / 'cumulative_incidence.csv', index=False)

    # Readable effects of the additive model: rate ratio when one input changes, others at reference.
    ref = {c: float(iv[c].median()) for c in NUMERIC} | {'cohab_years': 0.0} | {c: sorted(iv[c].astype(str).unique())[0] for c in CATEGORICAL}
    eff = []
    for target in ('married', 'split'):
        p = fitted[target]['additive_spline']
        r0 = p.predict(pd.DataFrame([ref]))[0]
        for c, vals in dict(cohab_years=[0, 1, 2, 3, 5, 8], age_at_start=[18, 20, 22, 25, 28, 32],
                            afqt_percentile=[10, 30, 50, 70, 90], start_year=[1998, 2004, 2010, 2016]).items():
            eff += [dict(target=target, input=c, value=v, rate_ratio=p.predict(pd.DataFrame([ref | {c: float(v)}]))[0] / r0) for v in vals]
        for c in CATEGORICAL:
            eff += [dict(target=target, input=c, value=v, rate_ratio=p.predict(pd.DataFrame([ref | {c: v}]))[0] / r0)
                    for v in sorted(iv[c].astype(str).unique())]
    pd.DataFrame(eff).to_csv(HERE / 'additive_partial_effects.csv', index=False, float_format='%.4f')

    held = comp.set_index(['target', 'model'])
    support = {c: [float(m[c].quantile(0.005)), float(m[c].quantile(0.995))] for c in NUMERIC if c != 'cohab_years'}
    at_risk = iv.groupby('cohab_years').size()
    support['cohab_years'] = [0.0, float(at_risk[at_risk >= 50].index.max())]
    lab = dict(married='marries the partner', split='splits up before any wedding with this partner')
    for target in ('married', 'split'):
        key = 'nlsy97_cohab_' + ('marriage' if target == 'married' else 'split')
        pipes = fitted[target]
        (HERE / f'{target}_tree_depth3.txt').write_text(export_text(
            pipes['tree_depth3'].named_steps['fit'], feature_names=pipes['tree_depth3'].named_steps['prep'].get_feature_names_out().tolist(), decimals=4))
        y = iv[target].to_numpy()
        bundle = dict(
            id=key, version=1, stage='before', outcome='rate',
            source='NLSY97 rounds 1-21 (1997-2023/24), BLS National Longitudinal Surveys public release; monthly marital and cohabitation arrays',
            population='U.S. adults born 1980-84 in their first cohabiting union, never married before it (one partner, the respondent, reports)',
            target=f'Annual rate at which a cohabiting couple {lab[target]}, by years living together (Poisson rate per year; competing with the other outcome)',
            training=dict(couples=len(m), intervals=len(iv), events=int(y.sum()), person_years=round(float(iv.exposure.sum()), 1)),
            constant_rate=float(np.dot(w, y) / np.dot(w, e)), support=support,
            inputs=dict(cohab_years='completed years living together at the start of the year scored (0 = first year)',
                        age_at_start="the respondent's age when they moved in together",
                        afqt_percentile="respondent's ASVAB math-verbal percentile (0-100), tested 1997-98", parent_max_grade="respondent's parents' highest grade",
                        start_year='calendar year they moved in together (support ends in the 2020s; hold at the latest year)',
                        sex='respondent sex', race_ethnicity='respondent race/ethnicity', education_at_start='highest credential at move-in',
                        children_before="respondent's children born before move-in", family_at_12='household at age 12',
                        religion_raised='religion raised in'),
            how_to_combine=('Monthly-free yearly competing risks: with m_k and s_k the two rates in year k, still together '
                            'S_k = S_{k-1} exp(-(m_k + s_k)); P(married in year k) = S_{k-1} m_k/(m_k+s_k) (1 - exp(-(m_k+s_k))). '
                            'After the wedding, hand over to a first-marriage lens (nlsy97_first_marriage).'),
            abstain=['already married', 'previously married before this cohabitation', 'same-sex couples (not identified here)',
                     'inputs outside support'],
            models=[dict(key=k, label=lb, heldout=dict(deviance_improvement_percent=round(float(held.loc[(target, k), 'deviance_improvement_percent']), 3),
                                                     observed_expected_ratio=round(float(held.loc[(target, k), 'observed_expected']), 4)),
                         **export(pipes[k])) for k, lb in MODELS],
            cumulative_incidence=ci[:1], sklearn=sklearn.__version__)
        (OUT / f'{key}.json').write_text(json.dumps(bundle, separators=(',', ':')))
        rng = np.random.default_rng(SEED)
        lev = {c: sorted(iv[c].astype(str).unique()) for c in CATEGORICAL}
        rows = []
        for i in range(50):
            r = {c: str(rng.choice(lev[c])) for c in CATEGORICAL}
            for c in NUMERIC:
                lo, hi = support[c]
                r[c] = None if (i % 7 == 0 and c == 'afqt_percentile') else float(rng.uniform(lo, hi))
            rows.append(r)
        t = pd.DataFrame(rows)
        (OUT / f'{key}_testvectors.json').write_text(json.dumps(dict(
            rows=json.loads(t.replace({np.nan: None}).to_json(orient='records')),
            predictions={k: pipes[k].predict(t).tolist() for k in pipes})))

    audit = dict(respondents=n, first_cohabitations=len(m), skipped=skipped, events=m.event.value_counts().to_dict(),
                 intervals=len(iv), person_years=round(float(iv.exposure.sum()), 1),
                 partner_link_missing=int(m.partner_link.isna().sum()),
                 partner_item_leakage={c: {('unknown' if u else 'known'): round(float((g.event == 'split').mean()), 3)
                                           for u, g in m.groupby(m[c] == 'Unknown')}
                                       for c in ('partner_education', 'partner_married_before', 'partner_has_children')}
                 | {'partner_age_gap': {('missing' if u else 'present'): round(float((g.event == 'split').mean()), 3)
                                        for u, g in m.groupby(m.partner_age_gap.isna())}},
                 start_years=[int(m.start_year.min()), int(m.start_year.max())], python_sklearn=sklearn.__version__)
    (HERE / 'sample_audit.json').write_text(json.dumps(audit, indent=1, default=int) + '\n')
    print(json.dumps(audit, indent=1, default=int))
    print(comp.round(3).to_string(index=False))
    print(pd.DataFrame(ci).to_string(index=False))


if __name__ == '__main__':
    main()
