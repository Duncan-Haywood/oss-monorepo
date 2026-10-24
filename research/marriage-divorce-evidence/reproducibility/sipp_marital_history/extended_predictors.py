"""SIPP prospective couples: do each spouse's occupation, the husband's race-ethnicity and the
household's wealth components (home equity, bank accounts, stocks and funds, retirement accounts,
business equity) add held-out skill to next-year separation or divorce?

Same couple-years, outcome, weights, household folds (seed and shuffle of train_prospective.py)
and logistic pipeline with the penalty chosen inside each training fold; paired household
bootstrap of the held-out deviance difference (extended_eval). All new inputs come from the
baseline file (December of the baseline year), before the outcome year:
  wife_occupation, husband_occupation   job-1 occupation (TJB1_OCC, 2018 Census codes), major group,
                                        'No job' when none
  husband_race_ethnicity                Hispanic / White / Black / Asian / Other (SIPP's ERACE has
                                        no finer public categories: AIAN, NHPI and multiracial are
                                        one residual group)
  home_equity, bank_accounts, stocks_funds, retirement_accounts, business_equity   household, dollars
Writes extended_heldout.csv, extended_rate_ratios.csv (odds ratios per band, household bootstrap),
models_extended in ../../app/models/sipp_prospective_couples.json (+ test vectors) and the harmonized
extract (outside the repository).
Run: python3 -I extended_predictors.py WORK_DIR   (WORK_DIR/pu: sipp_pu{Y} and sipp_ext{Y} parquet files)
"""
from pathlib import Path
import json, os, sys, warnings
from joblib import Parallel, delayed
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent)]
import train_prospective as tp  # noqa: E402
import survival_utils as su  # noqa: E402
from bundle_export import export as export_pipe  # noqa: E402
from extended_eval import cluster_gain_table, logloss_rows, write_harmonized  # noqa: E402

warnings.simplefilter('ignore')
SEED = tp.SEED
BOOT = 1000
RR_BOOT = int(os.environ.get('SIPP_RR_BOOT', 150))
JOBS = int(os.environ.get('SIPP_JOBS', 3))
WEALTH = ['home_equity', 'bank_accounts', 'stocks_funds', 'retirement_accounts', 'business_equity']
OCC = [(10, 3550, 'Management, business, science and arts'), (3601, 4655, 'Service'), (4700, 5940, 'Sales and office'),
       (6005, 7640, 'Natural resources, construction and maintenance'),
       (7700, 9760, 'Production, transportation and material moving'), (9800, 9830, 'Military')]
BLOCKS = {
    "each spouse's occupation group": (['wife_occupation', 'husband_occupation'], []),
    "husband's race-ethnicity": (['husband_race_ethnicity'], []),
    'wealth components (home equity, bank, stocks and funds, retirement, business)': (WEALTH, []),
}
INPUTS = {
    'wife_occupation': "wife's job-1 occupation in the baseline December (TJB1_OCC), Census major group, or 'No job'",
    'husband_occupation': "husband's job-1 occupation, same coding",
    'husband_race_ethnicity': 'Hispanic, White, Black, Asian, Other (AIAN, NHPI and multiracial are one residual group in SIPP)',
    'home_equity': 'household home equity in December of the baseline year, dollars (clipped to the weighted 1st-99th percentile)',
    'bank_accounts': 'household checking, savings and money-market balances, dollars',
    'stocks_funds': 'household stocks and mutual funds, dollars',
    'retirement_accounts': 'household retirement accounts (401k, IRA, ...), dollars',
    'business_equity': 'household business equity, dollars',
}


def occ_group(c):
    if c != c or c <= 0:
        return 'No job'
    for lo, hi, g in OCC:
        if lo <= c <= hi:
            return g
    return 'No job'


def couples_ext(work):
    parts = []
    for t, t1 in tp.PAIRS:
        d, _ = tp.couples(work, t, t1)
        x = pd.read_parquet(Path(work) / 'pu' / f'sipp_ext{t}.parquet')
        a = pd.read_parquet(Path(work) / 'pu' / f'sipp_pu{t}.parquet')[['SSUID', 'PNUM', 'spouse_m12']]
        x = x.merge(a, on=['SSUID', 'PNUM'], how='left')
        w = x.rename(columns=lambda c: c + '_w' if c not in ('SSUID',) else c)
        d = d.merge(w[['SSUID', 'PNUM_w', 'TJB1_OCC_w', 'THEQ_HOME_w', 'THVAL_BANK_w', 'THVAL_RET_w', 'THVAL_STMF_w',
                       'THEQ_BUS_w', 'spouse_m12_w']], left_on=['SSUID', 'PNUM'], right_on=['SSUID', 'PNUM_w'], how='left')
        h = x[['SSUID', 'PNUM', 'TJB1_OCC', 'ERACE', 'EORIGIN']].rename(columns={'PNUM': 'PNUM_h'})
        d = d.merge(h, left_on=['SSUID', 'spouse_m12_w'], right_on=['SSUID', 'PNUM_h'], how='left')
        parts.append(d)
    d = pd.concat(parts, ignore_index=True)
    d['wife_occupation'] = d.TJB1_OCC_w.map(occ_group)
    d['husband_occupation'] = d.TJB1_OCC.map(occ_group)
    d['husband_race_ethnicity'] = np.where(d.EORIGIN == 1, 'Hispanic',
                                           d.ERACE.map({1: 'White', 2: 'Black', 3: 'Asian'}).fillna('Other'))
    d['home_equity'] = d.THEQ_HOME_w.astype(float)
    d['bank_accounts'] = d.THVAL_BANK_w.astype(float)
    d['stocks_funds'] = d.THVAL_STMF_w.astype(float)
    d['retirement_accounts'] = d.THVAL_RET_w.astype(float)
    d['business_equity'] = d.THEQ_BUS_w.astype(float)
    return d.reset_index(drop=True)


def make(cat, num, C):
    prep = ColumnTransformer([('num', tp.num_pipe(), num), ('cat', tp.cat(), cat)])
    return Pipeline([('prep', prep), ('fit', LogisticRegression(C=C, max_iter=5000, tol=1e-10))])


def choose_c(cat, num, d, seed):
    hh = d.SSUID.unique()
    r = np.random.default_rng(seed)
    r.shuffle(hh)
    f = d.SSUID.map(pd.Series(np.arange(len(hh)) % 3, index=hh)).to_numpy()
    dev = []
    for C in tp.C_GRID:
        tot = 0.0
        for k in range(3):
            tr, te = d[f != k], d[f == k]
            p = make(cat, num, C).fit(tr, tr.event, fit__sample_weight=tr.weight / tr.weight.mean())
            tot += su.bernoulli_unit_dev(te.event.to_numpy(), te.weight.to_numpy() / d.weight.mean(), p.predict_proba(te)[:, 1]).sum()
        dev.append(tot)
    return tp.C_GRID[int(np.argmin(dev))]


def fit(cat, num, d):
    C = choose_c(cat, num, d, SEED + len(d))
    return make(cat, num, C).fit(d, d.event, fit__sample_weight=d.weight / d.weight.mean()), C


BASE_CAT = tp.DEMO_CAT + tp.ECON_CAT
BASE_NUM = tp.DEMO_NUM + tp.ECON_NUM


def split(add):
    return BASE_CAT + [c for c in add if c not in WEALTH], BASE_NUM + [c for c in add if c in WEALTH]


def odds_ratios(d, add, block):
    """Odds ratios: categorical levels vs reference, and wealth per $100k, from a near-unpenalised
    logistic model with linear numerics adjusted for every current input; household bootstrap."""
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import OneHotEncoder
    cat, num = split(add)
    lv = {c: sorted(d[c].astype(str).unique(), key=lambda v: (v not in ('Management, business, science and arts', 'White'), v)) for c in cat}

    from sklearn.preprocessing import StandardScaler

    def coefs(x):
        # numerics are standardised for the solver (money is in dollars); coefficients are mapped
        # back to the original units below
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median')),
                                                    ('scale', StandardScaler())]), num),
                                  ('cat', OneHotEncoder(categories=[lv[c] for c in cat], drop='first', handle_unknown='ignore',
                                                        sparse_output=False), cat)])
        p = Pipeline([('prep', prep), ('fit', LogisticRegression(C=1e4, max_iter=20000))])
        p.fit(x, x.event, fit__sample_weight=x.weight / x.weight.mean())
        c = p.named_steps['fit'].coef_[0].copy()
        c[:len(num)] /= p.named_steps['prep'].named_transformers_['num'].named_steps['scale'].scale_
        return c, p.named_steps['prep'].get_feature_names_out()
    point, names = coefs(d)
    groups = d.groupby('SSUID').indices
    keys = list(groups)

    def boot(b):
        pick = np.random.default_rng(SEED + 5000 + b).integers(0, len(keys), len(keys))
        return coefs(d.iloc[np.concatenate([groups[keys[k]] for k in pick])])[0]
    B = np.array(Parallel(n_jobs=JOBS)(delayed(boot)(b) for b in range(RR_BOOT)))
    lo, hi = np.percentile(B, [2.5, 97.5], axis=0)
    rows = []
    for i, n in enumerate(names):
        kind, var = n.split('__', 1)
        base = next((c for c in add if var == c or var.startswith(c + '_')), None)
        if base is None:
            continue
        level = var[len(base) + 1:] if kind == 'cat' else ''
        unit = 1e5 if kind == 'num' else 1.0
        sub = d[d[base].astype(str) == level] if level else d
        rows.append(dict(block=block, variable=base, level=level, reference=lv[base][0] if kind == 'cat' else '',
                         per='vs reference' if kind == 'cat' else 'per $100,000', odds_ratio=float(np.exp(point[i] * unit)),
                         ci95_low=float(np.exp(lo[i] * unit)), ci95_high=float(np.exp(hi[i] * unit)),
                         couple_years=len(sub), events=int(sub.event.sum()),
                         adjusted_for='every input of the demographics + wealth model (linear); household bootstrap'))
    return rows


def harmonize(d):
    h = pd.DataFrame(index=d.index)
    h['person_id'] = d.SSUID + '-' + d.PNUM.astype(str)
    h['couple_id'] = h.person_id
    h['cluster_id'] = d.SSUID
    h['weight'] = d.weight / d.weight.mean()
    h['unit'] = 'transition'
    h['outcome'] = 'married co-resident couple: the wife reports separated or divorced in any month of the next calendar year (widowhood excluded)'
    h['t_start'] = d.marriage_years
    h['t_end'] = d.marriage_years + 1
    h['exposure'] = 1.0
    h['event'] = d.event
    h['calendar_year'] = d.baseline_file
    h['marriage_order'] = 'any'
    h['sex'] = 'Woman'
    h['age'] = d.wife_age
    h['race_eth'] = d.wife_race_ethnicity.replace({'Other': np.nan})
    h['race_eth_coarse'] = d.wife_race_ethnicity
    h['education'] = d.wife_education.map({'Less than high school': 'Less than high school', 'High school': 'High school',
                                           'Some college': 'Some college', 'Associate': 'Some college', 'Bachelor': 'Bachelor',
                                           'Graduate or professional': 'Graduate'})
    h['married_before'] = d.wife_times_married.map({'Once': 0.0, 'Twice': 1.0, 'Three or more': 1.0})
    h['family_income_2024usd'] = d.household_income
    h['net_worth_2024usd'] = d.household_net_worth
    h['home_owner'] = d.home_owner.map({'Yes': 1.0, 'No': 0.0})
    h['occupation_group'] = d.wife_occupation.replace({'No job': 'Not working'})
    h['earnings_2024usd'] = d.wife_earnings
    h['country'] = 'US'
    for c in ['husband_age', 'husband_education', 'husband_times_married', 'husband_occupation', 'husband_race_ethnicity',
              'husband_earnings', 'household_debt', 'children_under18_in_household'] + WEALTH:
        h['x_' + c] = d[c]
    measured = ['person_id', 'couple_id', 'cluster_id', 'weight', 'unit', 'outcome', 't_start', 't_end', 'exposure', 'event',
                'calendar_year', 'marriage_order', 'sex', 'age', 'race_eth', 'race_eth_coarse', 'education', 'married_before',
                'family_income_2024usd', 'net_worth_2024usd', 'home_owner', 'occupation_group', 'earnings_2024usd', 'country']
    write_harmonized(h, 'sipp_prospective_couples', measured,
                     notes=['money is in survey-year dollars (2017-2024), not CPI-adjusted, despite the column name',
                            "race_eth Other (AIAN, NHPI, multiracial) is SIPP's residual group: set NaN in race_eth",
                            'couple-years recur: cluster on cluster_id (household)'])


def main(work):
    d = couples_ext(work)
    for c in tp.MONEY + WEALTH:
        lo, hi = su.wquantiles(d[c].fillna(d[c].median()).to_numpy(), d.weight.to_numpy(), [0.01, 0.99])
        d[c] = d[c].clip(lo, hi)
    print(len(d), 'couple-years', int(d.event.sum()), 'events', flush=True)
    for c in ['wife_occupation', 'husband_occupation', 'husband_race_ethnicity']:
        print(d.groupby(c).agg(n=('event', 'size'), ev=('event', 'sum')).to_string(), flush=True)
    harmonize(d)
    hh = d.SSUID.unique()
    rng = np.random.default_rng(SEED)
    rng.shuffle(hh)
    fold = d.SSUID.map(pd.Series(np.arange(len(hh)) % 5, index=hh)).to_numpy()
    V = {'current model (demographics + wealth)': []}
    for name, (add, _) in BLOCKS.items():
        V[f'current + {name}'] = add
    V['current + all new blocks'] = [c for a, _ in BLOCKS.values() for c in a]

    def one_fold(f):
        tr, te = d[fold != f], d[fold == f]
        out = {'constant': np.full(len(te), np.average(tr.event, weights=tr.weight))}
        for k, add in V.items():
            cat, num = split(add)
            out[k] = fit(cat, num, tr)[0].predict_proba(te)[:, 1]
        return te.index.to_numpy(), out
    if os.environ.get('SIPP_REUSE_HELDOUT') and (HERE / 'extended_heldout.csv').exists():
        tab = pd.read_csv(HERE / 'extended_heldout.csv')   # same seeds and folds: reuse the held-out table
    else:
        P = {k: np.zeros(len(d)) for k in ['constant'] + list(V)}
        for ix, out in Parallel(n_jobs=JOBS)(delayed(one_fold)(f) for f in range(5)):
            for k, v in out.items():
                P[k][ix] = v
        y, w = d.event.to_numpy(), d.weight.to_numpy() / d.weight.mean()
        losses = {k: logloss_rows(y, P[k], w) for k in P}
        tab = cluster_gain_table(d.SSUID, losses, reference='current model (demographics + wealth)', reps=BOOT, seed=SEED)
        tab['couple_years'], tab['events'], tab['households'] = len(d), int(d.event.sum()), len(hh)
        tab.to_csv(HERE / 'extended_heldout.csv', index=False, float_format='%.4f')
    print(tab.round(3).to_string(index=False), flush=True)

    rr = []
    for name, (add, _) in BLOCKS.items():
        rr += odds_ratios(d, add, name)
    pd.DataFrame(rr).to_csv(HERE / 'extended_rate_ratios.csv', index=False, float_format='%.4f')
    print(pd.DataFrame(rr)[['variable', 'level', 'odds_ratio', 'ci95_low', 'ci95_high', 'couple_years']].round(2).to_string(), flush=True)

    t = tab.set_index('model')
    helpful = [b for b in BLOCKS if t.loc[f'current + {b}', 'diff_ci95_low'] > 0]
    cat, num = split(V['current + all new blocks'])
    pipe, C = fit(cat, num, d)
    r = t.loc['current + all new blocks']
    bpath = tp.OUT / 'sipp_prospective_couples.json'
    bundle = json.loads(bpath.read_text())
    bundle['models_extended'] = [dict(
        key='logistic_all_blocks', label='Logistic, demographics + wealth + occupations, husband race-ethnicity, wealth components',
        heldout=dict(deviance_improvement_percent=round(float(r.gain_percent), 3),
                     ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
                     gain_over_current_points=round(float(r.diff_vs_reference_points), 3),
                     gain_over_current_ci95=[round(float(r.diff_ci95_low), 3), round(float(r.diff_ci95_high), 3)],
                     evaluation=f'train_prospective.py household folds (5), penalty chosen inside each training fold (final C={C}); '
                                f'paired household bootstrap ({BOOT})'),
        new_inputs=V['current + all new blocks'], **export_pipe(pipe))]
    bundle['models_extended_note'] = (
        'Held-out comparison of occupation, husband race-ethnicity and wealth components (2026-10-20, extended_predictors.py). '
        'Not scored by the app until the form asks for them. Blocks whose held-out difference had a 95% CI above zero: '
        f'{", ".join(helpful) if helpful else "none"}.')
    bundle['inputs_extended'] = INPUTS
    bundle['support_extended'] = {c: [float(d[c].min()), float(d[c].max())] for c in WEALTH}
    bpath.write_text(json.dumps(bundle, separators=(',', ':')))
    vpath = tp.OUT / 'sipp_prospective_couples_testvectors.json'
    vec = json.loads(vpath.read_text())
    vr = np.random.default_rng(SEED + 61)
    rows = []
    for i in range(40):
        rw = {c: str(vr.choice(sorted(d[c].astype(str).unique()))) for c in cat}
        for c in num:
            lo, hi = float(d[c].min()), float(d[c].max())
            rw[c] = None if (i + len(c)) % 13 == 0 else float(vr.uniform(lo - 0.1 * (hi - lo), hi + 0.1 * (hi - lo)))
        rows.append(rw)
    df = pd.DataFrame(rows)
    for c in num:
        df[c] = df[c].astype(float)
    vec['extended'] = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                           predictions={'logistic_all_blocks': pipe.predict_proba(df)[:, 1].tolist()})
    vpath.write_text(json.dumps(vec))
    print('helpful', helpful)


if __name__ == '__main__':
    main(sys.argv[1])
