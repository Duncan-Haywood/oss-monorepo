"""SIPP prospective couple model: does a married couple separate or divorce in the NEXT year?

Links people across consecutive SIPP annual files (2018->2019, ..., 2024->2025) by SSUID and
PNUM. Baseline: an opposite-sex couple living together and married in December of reference
year t-1 (file t), described by both spouses' traits and the household's income and wealth as
measured in that file (before the outcome window). Outcome: the wife reports being separated or
divorced in any month of reference year t (file t+1). Weight: the wife's two-year longitudinal
weight (FINYR2, Census's adjustment for attrition between the two interviews). Widowhood in
year t without separation is excluded. Couples recur across years; folds and bootstrap are
by household.

Unlike the retrospective lens, baseline spouse traits are valid predictors here: they are
measured before the outcome window for every couple, intact or not.

Usage: python3 -I train_prospective.py WORK_DIR   (WORK_DIR/pu/sipp_pu{2021..2025}.parquet)
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
from bundle_export import export as export_pipe  # noqa: E402
import survival_utils as su  # noqa: E402
from train_retro import boosted_export  # noqa: E402

warnings.simplefilter('ignore')
assert sklearn.__version__ == '1.7.2'
SEED = 20261021
OUT = ROOT / 'app' / 'models'
PAIRS = [(2018, 2019), (2019, 2020), (2020, 2021), (2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025)]
C_GRID = [0.003, 0.01, 0.03, 0.1, 0.3, 1.0]
EDU = {**{k: 'Less than high school' for k in range(31, 39)}, 39: 'High school', 40: 'Some college', 41: 'Some college',
       42: 'Associate', 43: 'Bachelor', 44: 'Graduate or professional', 45: 'Graduate or professional', 46: 'Graduate or professional'}

DEMO_NUM = ['wife_age', 'husband_age', 'marriage_years']
DEMO_CAT = ['wife_times_married', 'husband_times_married', 'wife_education', 'husband_education',
            'wife_race_ethnicity', 'same_race_ethnicity', 'wife_nativity', 'husband_nativity']
ECON_NUM = ['wife_earnings', 'husband_earnings', 'household_income', 'household_net_worth', 'household_debt',
            'household_unsecured_debt', 'children_under18_in_household', 'wife_months_employed', 'husband_months_employed']
ECON_CAT = ['home_owner']
MONEY = ['wife_earnings', 'husband_earnings', 'household_income', 'household_net_worth', 'household_debt', 'household_unsecured_debt']


def race_eth(r):
    if r.EORIGIN == 1:
        return 'Hispanic'
    return {1: 'White', 2: 'Black', 3: 'Asian'}.get(r.ERACE, 'Other')


def current_marriage_year(p):
    if 'TMAR1_YR' in p:
        return np.select([p.EXMAR == 1, p.EXMAR == 2, p.EXMAR >= 3], [p.TMAR1_YR, p.TMAR2_YR, p.TMAR3_YR], np.nan)
    # 2018-2020 files record only the first marriage year: duration known for the once-married.
    return np.where(p.EXMAR == 1, p.TYRFIRSTMARR, np.nan)


def couples(work, t, t1):
    a = pd.read_parquet(Path(work) / 'pu' / f'sipp_pu{t}.parquet')
    b = pd.read_parquet(Path(work) / 'pu' / f'sipp_pu{t1}.parquet')
    a = a[(a.spouse_present_m12 == 1) & (a.TAGE >= 15)].copy()
    a['race_ethnicity'] = [race_eth(r) for r in a.itertuples()]
    a['education'] = a.EEDUC.map(EDU).fillna('Unknown')
    a['nativity'] = a.EBORNUS.map({1: 'US-born', 2: 'Foreign-born'}).fillna('Unknown')
    a['times_married'] = a.EXMAR.map({1: 'Once', 2: 'Twice'}).fillna('Three or more').where(a.EXMAR >= 1, 'Unknown')
    a['marriage_year_cur'] = current_marriage_year(a)
    keep = ['SSUID', 'PNUM', 'SPANEL', 'ESEX', 'TAGE', 'spouse_m12', 'race_ethnicity', 'education', 'nativity',
            'times_married', 'marriage_year_cur', 'own_earnings', 'employed_months', 'hh_income', 'THNETWORTH',
            'THDEBT_AST', 'THDEBT_USEC', 'ETENURE', 'kids_u18_m12']
    a = a[keep]
    w, h = a[a.ESEX == 2], a[a.ESEX == 1]
    c = w.merge(h, left_on=['SSUID', 'spouse_m12'], right_on=['SSUID', 'PNUM'], suffixes=('_w', '_h'))
    c = c[c.spouse_m12_h == c.PNUM_w]  # reciprocal spouse pointers
    out = pd.DataFrame(dict(
        SSUID=c.SSUID, PNUM=c.PNUM_w, panel=c.SPANEL_w, baseline_file=t,
        wife_age=c.TAGE_w.astype(float), husband_age=c.TAGE_h.astype(float),
        marriage_years=((t - 1) - c.marriage_year_cur_w).astype(float).clip(lower=0),
        wife_times_married=c.times_married_w, husband_times_married=c.times_married_h,
        wife_education=c.education_w, husband_education=c.education_h,
        wife_race_ethnicity=c.race_ethnicity_w,
        same_race_ethnicity=np.where(c.race_ethnicity_w == c.race_ethnicity_h, 'Same', 'Different'),
        wife_nativity=c.nativity_w, husband_nativity=c.nativity_h,
        wife_earnings=c.own_earnings_w.astype(float), husband_earnings=c.own_earnings_h.astype(float),
        household_income=c.hh_income_w.astype(float), household_net_worth=c.THNETWORTH_w.astype(float),
        household_debt=c.THDEBT_AST_w.astype(float), household_unsecured_debt=c.THDEBT_USEC_w.astype(float),
        children_under18_in_household=c.kids_u18_m12_w.astype(float),
        wife_months_employed=c.employed_months_w.astype(float), husband_months_employed=c.employed_months_h.astype(float),
        home_owner=np.where(c.ETENURE_w == 1, 'Yes', 'No')))
    n_couples = len(out)
    nxt = b[['SSUID', 'PNUM', 'any_sepdiv', 'any_widowed', 'months_present', 'FINYR2']]
    out = out.merge(nxt, on=['SSUID', 'PNUM'], how='left')
    linked = out.FINYR2 > 0
    audit = dict(baseline_file=t, outcome_file=t1, couples=n_couples, wife_in_next_file=int(out.any_sepdiv.notna().sum()),
                 wife_with_longitudinal_weight=int(linked.sum()))
    out = out[linked]
    widowed_only = (out.any_widowed == 1) & (out.any_sepdiv != 1)
    audit['widowed_excluded'] = int(widowed_only.sum())
    out = out[~widowed_only].copy()
    out['event'] = (out.any_sepdiv == 1).astype(int)
    out['weight'] = out.FINYR2
    audit.update(rows=len(out), events=int(out.event.sum()))
    return out, audit


def num_pipe():
    # Uniform knots: money, counts and months employed pile up at 0 or 12, so quantile knots
    # would repeat (a degenerate basis the browser engine does not reproduce exactly).
    return Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=4, degree=2, knots='uniform', include_bias=False, extrapolation='linear')),
                     ('scale', StandardScaler())])


def cat():
    return OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)


def make(kind, C=1.0):
    if kind == 'demographics':
        prep = ColumnTransformer([('num', num_pipe(), DEMO_NUM), ('cat', cat(), DEMO_CAT)])
        est = LogisticRegression(C=C, max_iter=5000, tol=1e-10)
    elif kind == 'demographics_wealth':
        prep = ColumnTransformer([('num', num_pipe(), DEMO_NUM + ECON_NUM), ('cat', cat(), DEMO_CAT + ECON_CAT)])
        est = LogisticRegression(C=C, max_iter=5000, tol=1e-10)
    else:
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), DEMO_NUM + ECON_NUM),
                                  ('cat', cat(), DEMO_CAT + ECON_CAT)])
        est = HistGradientBoostingRegressor(loss='poisson', max_depth=2, max_iter=80, learning_rate=0.05,
                                            min_samples_leaf=400, l2_regularization=1.0, early_stopping=False,
                                            random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


def choose_c(kind, d, seed):
    """Penalty chosen by 3-fold household-grouped CV inside the training data (weighted deviance)."""
    hh = d.SSUID.unique()
    r = np.random.default_rng(seed)
    r.shuffle(hh)
    f = d.SSUID.map(pd.Series(np.arange(len(hh)) % 3, index=hh)).to_numpy()
    dev = []
    for C in C_GRID:
        tot = 0.0
        for k in range(3):
            tr, te = d[f != k], d[f == k]
            p = make(kind, C).fit(tr, tr.event, fit__sample_weight=tr.weight / tr.weight.mean())
            tot += su.bernoulli_unit_dev(te.event.to_numpy(), te.weight.to_numpy() / d.weight.mean(), p.predict_proba(te)[:, 1]).sum()
        dev.append(tot)
    return C_GRID[int(np.argmin(dev))]


CHOSEN = {}


def fit(kind, d, tag='final'):
    C = 1.0
    if kind != 'gradient_boosting':
        C = choose_c(kind, d, SEED + len(d))
        CHOSEN.setdefault(kind, {})[tag] = C
    p = make(kind, C)
    p.fit(d, d.event, fit__sample_weight=d.weight / d.weight.mean())
    return p


def prob(p, d):
    return p.predict_proba(d)[:, 1] if hasattr(p.named_steps['fit'], 'predict_proba') else np.clip(p.predict(d), 1e-9, 1 - 1e-9)


MODELS = [('demographics', 'Logistic, both spouses’ demographics and education (spline additive)'),
          ('demographics_wealth', 'Logistic, demographics + earnings, household income, net worth, debt, home ownership, employment, children'),
          ('gradient_boosting', 'Poisson gradient boosting on all inputs (80 trees, depth 2)')]


def main(work):
    parts, audits = [], []
    for t, t1 in PAIRS:
        d, a = couples(work, t, t1)
        parts.append(d)
        audits.append(a)
        print(a, flush=True)
    d = pd.concat(parts, ignore_index=True)
    clip = {}
    for c in MONEY:
        lo, hi = su.wquantiles(d[c].fillna(d[c].median()).to_numpy(), d.weight.to_numpy(), [0.01, 0.99])
        clip[c] = [float(lo), float(hi)]
        d[c] = d[c].clip(lo, hi)
    hh = d.SSUID.unique()
    rng = np.random.default_rng(SEED)
    rng.shuffle(hh)
    fold = d.SSUID.map(pd.Series(np.arange(len(hh)) % 5, index=hh)).to_numpy()
    keys = ['constant'] + [k for k, _ in MODELS]
    preds = {k: np.zeros(len(d)) for k in keys}
    for f in range(5):
        tr, te = d[fold != f], d[fold == f]
        preds['constant'][te.index] = np.average(tr.event, weights=tr.weight)
        for k, _ in MODELS:
            preds[k][te.index] = prob(fit(k, tr, f'fold{f}'), te)
    y, w = d.event.to_numpy(), d.weight.to_numpy() / d.weight.mean()
    codes, uni = pd.factorize(d.SSUID)
    counts = su.cluster_counts(codes, len(uni), 500, SEED)
    per = lambda p: np.bincount(codes, weights=su.bernoulli_unit_dev(y, w, p), minlength=len(uni))
    base = per(preds['constant'])
    res = {}
    overall = np.average(y, weights=w)
    for k in keys:
        mk = per(preds[k])
        gain = 100 * (1 - mk.sum() / base.sum())
        boot = 100 * (1 - counts @ mk / (counts @ base))
        auc = su.weighted_auc(preds[k], y, w) if k != 'constant' else 0.5
        aucb = su.auc_by_cluster_weights(preds[k], y, w, codes, counts) if k != 'constant' else np.full(2, 0.5)
        p = preds[k]
        dec = np.minimum((su.wquantiles(p, w, np.linspace(0, 1, 11))[None, :-1] <= p[:, None]).sum(1) - 1, 9) if k != 'constant' else np.zeros(len(p), int)
        cal = [dict(decile=b + 1, couple_years=int((dec == b).sum()), events=int(y[dec == b].sum()),
                    predicted=float(np.average(p[dec == b], weights=w[dec == b])),
                    observed=float(np.average(y[dec == b], weights=w[dec == b]))) for b in range(10) if (dec == b).any()]
        res[k] = dict(deviance_improvement_percent=gain, ci95=list(np.quantile(boot, [0.025, 0.975])),
                      auc=auc, auc_ci95=list(np.quantile(aucb, [0.025, 0.975])),
                      top_decile_lift=(cal[-1]['observed'] / overall) if k != 'constant' else 1.0,
                      observed_expected_ratio=float(np.dot(w, y) / np.dot(w, p)), calibration=cal)
    a, b = per(preds['demographics']), per(preds['demographics_wealth'])
    wealth_gain = dict(percent=100 * (1 - b.sum() / a.sum()),
                       ci95=list(np.quantile(100 * (1 - counts @ b / (counts @ a)), [0.025, 0.975])))
    a2 = su.auc_by_cluster_weights(preds['demographics'], y, w, codes, counts)
    b2 = su.auc_by_cluster_weights(preds['demographics_wealth'], y, w, codes, counts)
    wealth_gain.update(auc_difference=res['demographics_wealth']['auc'] - res['demographics']['auc'],
                       auc_difference_ci95=list(np.quantile(b2 - a2, [0.025, 0.975])))
    comp = pd.DataFrame([dict(model=k, **{kk: vv for kk, vv in v.items() if not isinstance(vv, list)},
                              ci95_low=v['ci95'][0], ci95_high=v['ci95'][1], auc_low=v['auc_ci95'][0], auc_high=v['auc_ci95'][1])
                         for k, v in res.items()])
    comp.to_csv(HERE / 'prospective_heldout_comparison.csv', index=False, float_format='%.6g')
    pd.DataFrame([dict(model=k, **c) for k, v in res.items() if k != 'constant' for c in v['calibration']]).to_csv(
        HERE / 'prospective_heldout_calibration.csv', index=False, float_format='%.6g')

    # Descriptive weighted one-year separation/divorce rates by baseline characteristics.
    desc = []
    d['net_worth_band'] = pd.cut(d.household_net_worth, [-np.inf, 0, 50e3, 250e3, 1e6, np.inf], right=False,
                                 labels=['Negative', '$0-49k', '$50k-249k', '$250k-999k', '$1M+']).astype(str)
    d['duration_band'] = pd.cut(d.marriage_years, [0, 3, 6, 11, 21, 200], right=False,
                                labels=['0-2 years', '3-5 years', '6-10 years', '11-20 years', '21+ years']).astype(str)
    for c in ['net_worth_band', 'duration_band', 'home_owner', 'wife_education', 'husband_education',
              'wife_times_married', 'wife_race_ethnicity']:
        for v, g in d.groupby(c):
            gw = g.weight / d.weight.mean()
            desc.append(dict(variable=c, value=v, couple_years=len(g), events=int(g.event.sum()),
                             weighted_rate_per_1000=1000 * float(np.average(g.event, weights=gw))))
    desc = pd.DataFrame(desc)
    desc.to_csv(HERE / 'prospective_rates_by_baseline.csv', index=False, float_format='%.4g')

    finals = {k: fit(k, d) for k, _ in MODELS}
    support = {c: [float(d[c].quantile(0.005)), float(d[c].quantile(0.995))] for c in DEMO_NUM + ECON_NUM}
    support.update({c: clip[c] for c in MONEY})
    audit = dict(pairs=audits, rows=len(d), events=int(d.event.sum()), households=int(len(uni)),
                 couples=int(d.groupby(['SSUID', 'PNUM']).ngroups), wealth_gain_over_demographics=wealth_gain,
                 money_winsorised_at_weighted_p1_p99=clip, chosen_C=CHOSEN, python_sklearn=sklearn.__version__)
    (HERE / 'prospective_sample_audit.json').write_text(json.dumps(audit, indent=1, default=float) + '\n')

    def held(k):
        v = res[k]
        return dict(deviance_improvement_percent=round(v['deviance_improvement_percent'], 3), ci95=[round(x, 3) for x in v['ci95']],
                    auc=round(v['auc'], 4), auc_ci95=[round(x, 4) for x in v['auc_ci95']],
                    top_decile_lift=round(v['top_decile_lift'], 3), observed_expected_ratio=round(v['observed_expected_ratio'], 4),
                    calibration=[{kk: (round(vv, 6) if isinstance(vv, float) else vv) for kk, vv in c.items()} for c in v['calibration']])

    def exp(k):
        return boosted_export(finals[k]) if k == 'gradient_boosting' else export_pipe(finals[k])

    bundle = dict(
        id='sipp_prospective_couples', version=1,
        source=('U.S. Census Bureau, Survey of Income and Program Participation, 2018-2025 annual public-use files and '
                'two-year longitudinal weights; the same people re-interviewed one year apart (2018-2025 panels)'),
        target=('Probability that a married, co-resident opposite-sex couple separates or divorces within the next calendar '
                'year (the wife reports separated or divorced in any month of the following reference year); prospective'),
        population=('U.S. married couples living together in December, wife aged 15+, in SIPP households re-interviewed the next '
                    'year; the wife’s report and longitudinal weight; reference years 2017-2024'),
        weights='Wife’s two-year longitudinal weight FINYR2 (Census attrition adjustment), normalised to mean 1',
        timing='All inputs are measured in the baseline year (December or that calendar year), before the outcome year.',
        training=dict(couple_years=len(d), couples=audit['couples'], households=int(len(uni)), events=int(d.event.sum())),
        constant_rate=float(np.average(d.event, weights=d.weight)),
        support=support,
        inputs=dict(
            wife_age='wife’s age at the baseline interview', husband_age='husband’s age at the baseline interview',
            marriage_years=('years married by December of the baseline year (current marriage); the 2018-2020 files date only '
                            'first marriages, so it is missing (median-imputed) for remarried people in those years'),
            wife_times_married='Once, Twice, Three or more', husband_times_married='Once, Twice, Three or more',
            wife_education='highest level by December of the baseline year', husband_education='same, for the husband',
            wife_race_ethnicity='Hispanic, White, Black, Asian, Other', same_race_ethnicity='Same/Different broad group',
            wife_nativity='US-born/Foreign-born', husband_nativity='US-born/Foreign-born',
            wife_earnings='wife’s earnings over the baseline calendar year, dollars (clipped to support)',
            husband_earnings='husband’s earnings over the baseline calendar year, dollars',
            household_income='household income over the baseline calendar year, dollars',
            household_net_worth='household net worth in December of the baseline year, dollars (can be negative)',
            household_debt='household total debt in December, dollars', household_unsecured_debt='household unsecured debt in December, dollars',
            children_under18_in_household='number of people under 18 in the household in December (not only the couple’s children)',
            wife_months_employed='months with a job in the baseline year (0-12)', husband_months_employed='same, husband',
            home_owner='Yes/No: home owned or being bought by someone in the household'),
        abstain=['same-sex couples (too few in the linked sample)', 'unmarried couples', 'inputs outside the support (clamp money to it)'],
        comparison={k: dict(deviance_improvement_percent=round(v['deviance_improvement_percent'], 3), ci95=[round(x, 3) for x in v['ci95']],
                            auc=round(v['auc'], 4)) for k, v in res.items()},
        wealth_gain_over_demographics=dict(deviance_percent=round(wealth_gain['percent'], 3), ci95=[round(x, 3) for x in wealth_gain['ci95']],
                                           auc_difference=round(wealth_gain['auc_difference'], 4),
                                           auc_difference_ci95=[round(x, 4) for x in wealth_gain['auc_difference_ci95']]),
        rates_by_baseline=json.loads(desc.to_json(orient='records')),
        models=[dict(key=k, label=lbl, heldout=held(k), **exp(k)) for k, lbl in MODELS],
        sklearn=sklearn.__version__)
    (OUT / 'sipp_prospective_couples.json').write_text(json.dumps(bundle, separators=(',', ':')))

    vrng = np.random.default_rng(SEED + 1)
    levels = {c: sorted(d[c].unique()) for c in DEMO_CAT + ECON_CAT}
    rows = []
    for i in range(60):
        r = {c: str(vrng.choice(levels[c])) for c in DEMO_CAT + ECON_CAT}
        for c in DEMO_NUM + ECON_NUM:
            lo, hi = support[c]
            r[c] = None if (i + len(c)) % 13 == 0 else float(vrng.uniform(lo - 0.1 * (hi - lo), hi + 0.1 * (hi - lo)))
        rows.append(r)
    df = pd.DataFrame(rows)
    for c in DEMO_NUM + ECON_NUM:
        df[c] = df[c].astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: prob(finals[k], df).tolist() for k in finals})
    (OUT / 'sipp_prospective_couples_testvectors.json').write_text(json.dumps(vectors))
    print(comp.round(4).to_string(index=False))
    print('wealth gain', wealth_gain)
    print(desc.round(2).to_string(index=False))


if __name__ == '__main__':
    main(sys.argv[1])
