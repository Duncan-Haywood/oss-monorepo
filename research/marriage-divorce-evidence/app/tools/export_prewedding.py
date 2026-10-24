"""Export the "before the wedding" lens: the harmonized pre-wedding additive model fitted on
NSFG 1995-2023 first marriages (reproducibility/prewedding), which transported best to the
other U.S. surveys, to app/models/prewedding_harmonized.json with test vectors.

Inputs are facts knowable on the wedding day, from either partner's point of view
(respondent/spouse, as reproducibility/prewedding/crossval.py models them). Unknown answers
take the training mode and missing numbers the training median (missingness can carry the
outcome in these surveys). The bundle carries the model's held-out skill within NSFG and on
NLSY79, NLSY97, SIPP and Canada, a population reference of cross-fitted predictions, and an
out-of-distribution score.

Needs scikit-learn 1.7.2 and reproducibility/prewedding/work/nsfg_pooled.csv.gz (built by
reproducibility/prewedding/build_nsfg_pooled.py from the NSFG public files).
Run: python3 app/tools/export_prewedding.py   (from research/marriage-divorce-evidence)
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PRE = ROOT / 'reproducibility' / 'prewedding'
OUT = HERE.parent / 'models'
sys.path.insert(0, str(PRE))
sys.path.insert(0, str(HERE))
import crossval as cv  # noqa: E402
import ood  # noqa: E402
sys.path.insert(0, str(ROOT / 'reproducibility'))
from bundle_export import export  # noqa: E402

assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2'
HORIZONS = [5, 10, 20]
BOOT = 50


def pipeline(num, cat):
    nump = Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='constant')),
                     ('scale', StandardScaler())])
    prep = ColumnTransformer([('num', nump, ['marriage_years'] + num),
                              ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), cat)])
    return Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-4, max_iter=3000, solver='newton-cholesky'))])


def impute_modes(iv, cat):
    # Same as SimpleImputer(missing_values='Unknown', strategy='most_frequent') on the interval table.
    modes = {}
    for c in cat:
        known = iv.loc[iv[c] != 'Unknown', c]
        modes[c] = sorted(known.value_counts().pipe(lambda s: s[s == s.max()]).index)[0]
    return modes


def apply_modes(d, modes):
    d = d.copy()
    for c, m in modes.items():
        d[c] = d[c].replace('Unknown', m)
    return d


def fit(people, num, cat):
    iv = cv.intervals(people)
    modes = impute_modes(iv, cat)
    iv = apply_modes(iv, modes)
    pipe = pipeline(num, cat)
    pipe.fit(iv, iv.y / iv.exposure, fit__sample_weight=iv.weight * iv.exposure)
    return pipe, modes


def cumhaz(pipe, modes, people, horizon):
    f0 = apply_modes(people, modes)
    h = np.zeros(len(people))
    for k in range(horizon):
        f = f0.copy()
        f['marriage_years'] = float(k)
        h += pipe.predict(f)
    return h


def main():
    d = cv.load(PRE / 'work' / 'nsfg_pooled.csv.gz')
    num, cat = cv.usable(cv.coverage(d))
    # Person folds exactly as crossval.within assigns them.
    rng = np.random.default_rng(cv.SEED)
    ids = d.id.unique()
    rng.shuffle(ids)
    fold_of = dict(zip(ids, np.arange(len(ids)) % 5))
    fold = d.id.map(fold_of).to_numpy()

    # Cross-fitted predictions for the population reference.
    pred = {h: np.zeros(len(d)) for h in HORIZONS}
    for f in range(5):
        pipe_f, modes_f = fit(d[fold != f], num, cat)
        for h in HORIZONS:
            pred[h][fold == f] = 1 - np.exp(-cumhaz(pipe_f, modes_f, d[fold == f], h))
        print('fold', f, flush=True)
    w = d.weight.to_numpy()
    qs = np.arange(1, 100) / 100
    quant = {h: cv.sm.weighted_quantile(pred[h], w, qs) for h in HORIZONS}
    reference = dict(
        about=('Survey-weighted quantiles of held-out predicted first-marriage dissolution (divorce, annulment or '
               f'separation) by each horizon from the wedding, for the {len(d):,} first marriages of NSFG 1995-2023 '
               'respondents (women all cycles, men from 2002), each scored by the model fitted on the other four person '
               'folds. Built by app/tools/export_prewedding.py.'),
        quantity='cumulative_dissolution_probability', horizons=HORIZONS, weights='NSFG final weights, mean 1',
        overall=dict(n=int(len(d)), quantiles={f'p{k}': [round(float(quant[h][k - 1]), 6) for h in HORIZONS] for k in range(1, 100)}),
        subgroups=[])

    pipe, modes = fit(d, num, cat)
    model = dict(key='additive_spline', label='Additive spline Poisson (harmonized pre-wedding inputs)', **export(pipe))
    model['categorical']['impute'] = [modes[c] for c in model['categorical']['columns']]

    # Uncertainty in one couple's prediction: refit the Poisson coefficients on person
    # bootstrap resamples, holding the fitted spline knots and scaling fixed (so the
    # replicates share the engine's prepared features). This is sampling uncertainty in the
    # model, not the chance element in any one marriage, and not transport error between
    # surveys (see `external`).
    iv = apply_modes(cv.intervals(d), modes)
    X = pipe.named_steps['prep'].transform(iv)
    yy = (iv.y / iv.exposure).to_numpy()
    sw0 = (iv.weight * iv.exposure).to_numpy()
    person = iv.person.to_numpy()
    brng = np.random.default_rng(cv.SEED + 11)
    sig = lambda x: float(f'{x:.8g}')
    b_int, b_coef = [], []
    for b in range(BOOT):
        counts = np.bincount(brng.integers(0, len(d), len(d)), minlength=len(d))
        m = PoissonRegressor(alpha=1e-4, max_iter=3000, solver='newton-cholesky').fit(X, yy, sample_weight=sw0 * counts[person])
        b_int.append(sig(m.intercept_))
        b_coef.append([sig(c) for c in m.coef_])
    model['bootstrap'] = dict(
        method=(f'{BOOT} person-bootstrap refits of the coefficients with the spline knots and scaling held at the full fit; '
                'percentile intervals of the cumulative dissolution probability (numpy linear quantiles)'),
        replicates=BOOT, intercept=b_int, coef=b_coef)

    within = pd.read_csv(PRE / 'within_dataset.csv')
    w0 = within[(within.dataset == 'nsfg_pooled') & (within.model == 'additive_spline')].iloc[0]
    ext = pd.read_csv(PRE / 'external_validation.csv')
    ext = ext[(ext.train == 'nsfg_pooled') & (ext.model == 'additive_spline') & (ext.variant == 'all_shared')]
    metric = lambda r: dict(deviance_gain_percent=round(float(r.deviance_gain_percent), 3), c_index=round(float(r.c_index), 4),
                            auc_5y=round(float(r.auc_5y), 4), auc_10y=round(float(r.auc_10y), 4),
                            observed_over_expected_10y=round(float(r.observed_over_expected_10y), 4))
    model['heldout'] = dict(metric(w0), protocol='5-fold person-held-out within NSFG 1995-2023 (reproducibility/prewedding/within_dataset.csv)')
    model['external'] = {r.test: dict(metric(r), deviance_gain_recalibrated_percent=round(float(r.deviance_gain_recalibrated_percent), 3))
                         for r in ext.itertuples()}

    # OOD on the couple's fixed inputs, after the same Unknown -> mode mapping.
    people = apply_modes(d, modes)
    ood_num = [c for c in ['respondent_age', 'spouse_age', 'wedding_year'] if c in num]
    levels = {c: sorted(people[c].unique()) for c in cat}
    ood_spec, _, ood_fit = ood.build(people, fold, ood_num, cat, levels)
    ood_spec['impute'] = modes  # Unknown answers take the training mode here too

    support = {c: [float(d[c].quantile(0.005)), float(d[c].quantile(0.995))] for c in num if c != 'age_gap'}
    support['marriage_years'] = [0.0, float(cv.MAX_YEARS - 1)]
    bundle = dict(
        id='prewedding_harmonized', version=1,
        source='NSFG 1995-2023 (NCHS), first marriages of respondents aged 15-49 (women, all eight cycles; men, 2002 on)',
        target=('Annual rate of first-marriage dissolution (divorce, annulment or separation, whichever came first) per '
                'marriage-year from the wedding day; widowhood censored (Poisson rate, not a probability)'),
        population='U.S. household population 15-49 in their first marriage; one spouse interviewed',
        question='How likely is this marriage to end, judged only from facts knowable on the wedding day?',
        weights='NSFG final weights normalised to mean 1, times exposure',
        training=dict(marriages=int(len(d)), dissolutions=int(d.d.sum()), person_years=round(float(d.t.sum()), 1)),
        constant_rate=float((d.weight * d.d).sum() / (d.weight * d.t).sum()),
        support=support,
        inputs=dict(
            marriage_years='completed years since the wedding at the start of the year being scored (0 = first year)',
            respondent_age='the scored partner\'s age in years on the wedding day',
            spouse_age='the other partner\'s age on the wedding day (blank if unknown: the training median is used)',
            age_gap='husband\'s age minus wife\'s age on the wedding day',
            wedding_year='calendar year of the wedding; held at the edge of the support (the spline is constant beyond it)',
            spouse_prior_marriage='Yes/No: the other partner was married before',
            respondent_prior_children='Yes/No: the scored partner had a child before the wedding',
            spouse_prior_children='Yes/No: the other partner had a child before the wedding',
            cohabited_first='Yes/No: the couple lived together before marrying',
            respondent_race='Hispanic, White, Black, Other (non-Hispanic unless Hispanic)',
            spouse_race='Hispanic, White, Black, Other', same_race='Same/Different (derived from the two)',
            intact_family='Yes/No: the scored partner lived with both parents through adolescence',
            religion_raised='None, Catholic, Protestant, Other: religion the scored partner was raised in',
            respondent_sex='Woman/Man: the scored partner (the survey interviewed one spouse); score both partners and average'),
        unknown_policy='Unknown answers take the training mode (categorical.impute); a missing number takes the training median. No input has an Unknown level, because whether a spouse trait is known can depend on how the marriage went.',
        abstain=['same-sex couples (not in the training data)', 'a second or later marriage for the scored partner',
                 'ages or wedding years outside the support', 'an out-of-distribution percentile above ood.abstain_above_percentile'],
        not_captured=('Demographic and family-history facts only: nothing about how the couple get on (conflict, commitment, '
                      'communication, money) or what happens after the wedding. Associations in one survey population, not causes.'),
        models=[model], population_reference=reference, ood=ood_spec, sklearn=sklearn.__version__)
    OUT.mkdir(exist_ok=True)
    # How wide are the intervals? 10-year 95% interval on 2,000 sampled NSFG marriages.
    bi, bc = np.array(b_int), np.array(b_coef)

    def risk_draws(frame, horizon):
        f0 = apply_modes(frame, modes)
        H = np.zeros((len(frame), BOOT))
        for k in range(horizon):
            f = f0.copy()
            f['marriage_years'] = float(k)
            H += np.exp(bi[None, :] + pipe.named_steps['prep'].transform(f) @ bc.T)
        return 1 - np.exp(-H)
    samp = d.sample(2000, random_state=1)
    dr = risk_draws(samp, 10)
    lo, hi = np.quantile(dr, 0.025, axis=1), np.quantile(dr, 0.975, axis=1)
    model['bootstrap']['interval_width_10y'] = dict(
        about='Width (high minus low) of the 95% interval for the 10-year dissolution probability, over 2,000 sampled NSFG first marriages',
        median=round(float(np.median(hi - lo)), 4), p90=round(float(np.quantile(hi - lo, 0.9)), 4))
    (OUT / 'prewedding_harmonized.json').write_text(json.dumps(bundle, separators=(',', ':')))

    # Test vectors: rows across categories (including Unknown), ages, missing spouse age and
    # wedding years outside the support; Python predictions after the same mode mapping.
    vr = np.random.default_rng(cv.SEED + 7)
    rows = []
    for i in range(60):
        r = {c: str(vr.choice(levels[c] + ['Unknown'])) for c in cat}
        r['respondent_age'] = float(vr.uniform(15, 50))
        r['spouse_age'] = None if i % 7 == 0 else float(vr.uniform(15, 60))
        r['age_gap'] = None if r['spouse_age'] is None else (r['spouse_age'] - r['respondent_age']) * (1 if r['respondent_sex'] == 'Woman' else -1)
        r['wedding_year'] = float(vr.integers(1955, 2035))
        r['marriage_years'] = float(vr.integers(0, 35))
        rows.append(r)
    df = pd.DataFrame(rows)
    for c in ['respondent_age', 'spouse_age', 'age_gap', 'wedding_year', 'marriage_years']:
        df[c] = df[c].astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions=pipe.predict(apply_modes(df, modes)).tolist(),
                   ood_d2=ood.score(ood_fit, apply_modes(df, modes), ood_num, cat, levels).tolist())
    # Cumulative-risk intervals: the first 20 rows, from marriage year 0, at each horizon.
    head = df.head(20).copy()
    risk = {}
    for h in HORIZONS:
        draws = risk_draws(head, h)
        point = 1 - np.exp(-cumhaz(pipe, modes, head, h))
        risk[str(h)] = dict(point=point.tolist(), lo=np.quantile(draws, 0.025, axis=1).tolist(),
                            hi=np.quantile(draws, 0.975, axis=1).tolist())
    vectors['risk'] = risk
    (OUT / 'prewedding_harmonized_testvectors.json').write_text(json.dumps(vectors))
    size = (OUT / 'prewedding_harmonized.json').stat().st_size
    print('features', num, cat)
    print('reference p10/p50/p90 at 10y:', quant[10][9], quant[10][49], quant[10][89])
    print('bundle bytes', size, 'interval width 10y', model['bootstrap']['interval_width_10y'])


if __name__ == '__main__':
    main()
