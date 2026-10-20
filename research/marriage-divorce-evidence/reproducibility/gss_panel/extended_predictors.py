"""GSS panels: do family of origin, religion (full detail), prayer, politics, detailed race,
occupation and wealth add held-out skill to the 2-year dissolution model?

Every candidate is measured at wave t, before the outcome (family-of-origin and religion-raised
items are retrospective but fixed). Same sample, outcome, weights and grouped folds as
train_models.py (2-year horizon). For comparability every variant uses the additive L1 logistic
at C = 0.3 (the inner CV's choice in 48 of 50 folds), 5 folds x REPEATS seeds, and the paired
respondent-cluster bootstrap of extended_eval.cluster_gain_table.

Writes (aggregates only):
  extended_heldout.csv        gain vs constant and vs the current model, per block, 95% CIs
  extended_odds_ratios.csv    adjusted odds ratios (base linear model + one block), 300 cluster refits
  extended_rates.csv          weighted 2-year dissolution by level of each new item, with CIs
  ../../app/models/gss_panel_marriages.json   adds `models_extended` (+ `extended` test vectors)
and, when HARMONIZED_DIR is set, the harmonized person-level transitions OUTSIDE the repository.

Run: GSS_RAW=<dir with the .dta files> python3 extended_predictors.py
"""
from pathlib import Path
import json, os, sys, warnings
from joblib import Parallel, delayed
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import gss_data as g  # noqa: E402
import train_models as tm  # noqa: E402
from extended_eval import cluster_gain_table, logloss_rows, write_harmonized  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
REPEATS = int(os.environ.get('GSS_EXT_REPEATS', 5))
BOOT = 1000
JOBS = int(os.environ.get('GSS_JOBS', 4))
OUT = HERE.parent.parent / 'app' / 'models'

ATTEND9 = {0: 'Never', 1: 'Less than once a year', 2: 'About once a year', 3: 'Several times a year',
           4: 'About once a month', 5: '2-3 times a month', 6: 'Nearly every week', 7: 'Every week',
           8: 'More than once a week'}
PRAY = {1: 'Several times a day', 2: 'Once a day', 3: 'Several times a week', 4: 'Once a week',
        5: 'Less than once a week', 6: 'Never'}
RELITEN = {1: 'Strong', 2: 'Not very strong', 3: 'Somewhat strong', 4: 'No religion'}
FUND = {1: 'Fundamentalist', 2: 'Moderate', 3: 'Liberal'}
POLVIEWS = {1: 'Extremely liberal', 2: 'Liberal', 3: 'Slightly liberal', 4: 'Moderate', 5: 'Slightly conservative',
            6: 'Conservative', 7: 'Extremely conservative'}
PARTY = {0: 'Strong Democrat', 1: 'Not strong Democrat', 2: 'Independent, near Democrat', 3: 'Independent',
         4: 'Independent, near Republican', 5: 'Not strong Republican', 6: 'Strong Republican', 7: 'Other party'}
RELIG5 = {1: 'Protestant', 2: 'Catholic', 3: 'Jewish', 4: 'None'}
INCOM16 = {1: 'Far below average', 2: 'Below average', 3: 'Average', 4: 'Above average', 5: 'Far above average'}
RES16 = {1: 'Open country', 2: 'Farm', 3: 'Town under 50,000', 4: 'City 50,000-250,000', 5: 'Suburb of a large city',
         6: 'Large city'}
DWELOWN = {1: 'Own', 2: 'Rent', 3: 'Other'}

EXTRA_CATEGORIES = {
    'family_origin': ['Both parents', 'Parents divorced or separated', 'Parent died', 'Stepfamily', 'Other', 'Unknown'],
    'attend9': list(ATTEND9.values()) + ['Unknown'],
    'pray': ['Never', 'Less than once a week', 'Once a week', 'Several times a week', 'Once a day',
             'Several times a day', 'Unknown'],
    'religious_strength': ['Not very strong', 'Somewhat strong', 'Strong', 'No religion', 'Unknown'],
    'fundamentalism': ['Moderate', 'Fundamentalist', 'Liberal', 'Unknown'],
    'denomination': ['Catholic', 'Baptist', 'Methodist', 'Lutheran', 'Presbyterian', 'Episcopal', 'Other Protestant',
                     'Nondenominational Protestant', 'Jewish', 'None', 'Other Christian', 'Other religion', 'Unknown'],
    'religion_raised': ['Protestant', 'Catholic', 'Jewish', 'None', 'Other', 'Unknown'],
    'polviews': ['Moderate', 'Extremely liberal', 'Liberal', 'Slightly liberal', 'Slightly conservative', 'Conservative',
                 'Extremely conservative', 'Unknown'],
    'party': ['Independent', 'Strong Democrat', 'Not strong Democrat', 'Independent, near Democrat',
              'Independent, near Republican', 'Not strong Republican', 'Strong Republican', 'Other party', 'Unknown'],
    'race_detail': ['White', 'Black', 'Hispanic', 'Asian', 'American Indian or Alaska Native',
                    'Native Hawaiian or Pacific Islander', 'Multiracial', 'Other'],
    'income_at_16': ['Average', 'Far below average', 'Below average', 'Above average', 'Far above average', 'Unknown'],
    'born_us': ['Yes', 'No', 'Unknown'],
    'place_at_16': ['Town under 50,000', 'Open country', 'Farm', 'City 50,000-250,000', 'Suburb of a large city',
                    'Large city', 'Unknown'],
    'occupation_group': ['Management, business, science and arts', 'Service', 'Sales and office',
                         'Natural resources, construction and maintenance',
                         'Production, transportation and material moving', 'Military', 'No occupation reported'],
    'home': ['Own', 'Rent', 'Other', 'Unknown'],
    'wealth_band': ['$100k-$250k', 'Under $5k', '$5k-$40k', '$40k-$100k', '$250k-$500k', '$500k+', 'Unknown'],
}
EXTRA_NUMERIC = ['sibs', 'parent_education', 'prestige', 'spouse_prestige']
BLOCKS = {
    'family of origin': ['family_origin', 'sibs', 'parent_education', 'income_at_16', 'place_at_16', 'born_us'],
    'religion detail': ['attend9', 'pray', 'religious_strength', 'fundamentalism', 'denomination', 'religion_raised'],
    'politics': ['polviews', 'party'],
    'race detail': ['race_detail'],
    'occupation': ['occupation_group', 'prestige', 'spouse_prestige'],
    'wealth': ['home', 'wealth_band'],
}
INPUTS = {
    'family_origin': 'who the respondent lived with at 16 (FAMILY16) and, if not both own parents, why (FAMDIF16): '
                     'Both parents / Parents divorced or separated / Parent died / Stepfamily (a parent and a step-parent, '
                     'any reason) / Other (relatives, other reasons; the GSS does not separate never-married single parents)',
    'attend9': 'religious service attendance, all nine ATTEND answers (Never ... Every week / More than once a week)',
    'pray': 'how often the respondent prays (PRAY), six answers',
    'religious_strength': 'strength of religious affiliation (RELITEN): Strong / Somewhat strong / Not very strong / No religion',
    'fundamentalism': "the respondent's religion as fundamentalist / moderate / liberal (NORC's FUND coding of RELIG and DENOM)",
    'denomination': 'religion with Protestant denomination families (RELIG, DENOM)',
    'religion_raised': 'religion raised in (RELIG16)',
    'polviews': 'political views, 7 points from extremely liberal to extremely conservative (POLVIEWS)',
    'party': 'party identification, 7 points plus other party (PARTYID)',
    'race_detail': 'race and Hispanic origin from RACECEN1-2 and HISPANIC: White, Black, Hispanic (any race), Asian, '
                   'American Indian or Alaska Native, Native Hawaiian or Pacific Islander, Multiracial, Other',
    'sibs': 'number of brothers and sisters (SIBS), 0-15 (15 = 15 or more)',
    'parent_education': "higher of father's and mother's years of schooling (PAEDUC, MAEDUC), 0-20",
    'income_at_16': "family income at 16 compared with American families in general (INCOM16)",
    'place_at_16': 'type of place lived at 16 (RES16)',
    'born_us': 'born in the United States (BORN)',
    'occupation_group': "respondent's current or last occupation (OCC10), Census major group",
    'prestige': "respondent's occupational prestige score (PRESTG10), 16-80",
    'spouse_prestige': "spouse's occupational prestige score (SPPRES10), 16-80",
    'home': 'owns or rents the home (DWELOWN, split ballot)',
    'wealth_band': 'household wealth, all assets minus debts (WEALTH; asked in 2006 and 2016-2018 only)',
}


def occ_group(occ):
    out = pd.Series('No occupation reported', index=occ.index, dtype=object)
    for lo, hi, name in [(10, 3540, 'Management, business, science and arts'), (3600, 4650, 'Service'),
                         (4700, 5940, 'Sales and office'), (6005, 7630, 'Natural resources, construction and maintenance'),
                         (7700, 9750, 'Production, transportation and material moving'), (9800, 9830, 'Military')]:
        out[(occ >= lo) & (occ <= hi)] = name
    return out


def family_origin(fam, dif):
    out = pd.Series('Other', index=fam.index, dtype=object)
    out[fam == 1] = 'Both parents'
    single = fam.isin([4, 5])
    out[single & (dif == 2)] = 'Parents divorced or separated'
    out[single & (dif == 1)] = 'Parent died'
    out[fam.isin([2, 3])] = 'Stepfamily'
    out[fam.isna()] = 'Unknown'
    return out


def race_detail(rc1, rc2, hisp):
    asian = rc1.between(4, 10)
    nhpi = rc1.between(11, 14)
    out = pd.Series('Other', index=rc1.index, dtype=object)
    out[rc1 == 1] = 'White'
    out[rc1 == 2] = 'Black'
    out[rc1 == 3] = 'American Indian or Alaska Native'
    out[asian] = 'Asian'
    out[nhpi] = 'Native Hawaiian or Pacific Islander'
    out[rc2.notna() & (rc2 != 16) & (rc1 != 16) & (rc2 != rc1)] = 'Multiracial'
    out[(hisp > 1) | (rc1 == 16)] = 'Hispanic'
    return out


def denomination(rel, den):
    out = pd.Series('Other religion', index=rel.index, dtype=object)
    out[rel == 2] = 'Catholic'
    out[rel == 3] = 'Jewish'
    out[rel == 4] = 'None'
    out[rel.isin([10, 11, 13])] = 'Other Christian'
    prot = rel == 1
    out[prot] = 'Other Protestant'
    for lo, hi, name in [(10, 19, 'Baptist'), (20, 29, 'Methodist'), (30, 39, 'Lutheran'), (40, 49, 'Presbyterian'),
                         (50, 50, 'Episcopal'), (70, 70, 'Nondenominational Protestant')]:
        out[prot & den.between(lo, hi)] = name
    out[rel.isna()] = 'Unknown'
    return out


def wealth_band(w):
    b = pd.Series('Unknown', index=w.index, dtype=object)
    for lo, hi, name in [(1, 1, 'Under $5k'), (2, 3, '$5k-$40k'), (4, 5, '$40k-$100k'), (6, 7, '$100k-$250k'),
                         (8, 8, '$250k-$500k'), (9, 15, '$500k+')]:
        b[w.between(lo, hi)] = name
    return b


def extra_features(d, w):
    gv = lambda v: d[f'{v}_{w}'] if f'{v}_{w}' in d else pd.Series(np.nan, index=d.index)
    f = pd.DataFrame(index=d.index)
    f['family_origin'] = family_origin(gv('family16'), gv('famdif16'))
    f['attend9'] = g.lab(gv('attend'), ATTEND9)
    f['pray'] = g.lab(gv('pray'), PRAY)
    f['religious_strength'] = g.lab(gv('reliten'), RELITEN)
    f['fundamentalism'] = g.lab(gv('fund'), FUND)
    f['denomination'] = denomination(gv('relig'), gv('denom'))
    r16 = gv('relig16')
    f['religion_raised'] = np.where(r16.isna(), 'Unknown', r16.map(RELIG5).fillna('Other'))
    f['polviews'] = g.lab(gv('polviews'), POLVIEWS)
    f['party'] = g.lab(gv('partyid'), PARTY)
    f['race_detail'] = race_detail(gv('racecen1'), gv('racecen2'), gv('hispanic'))
    f['sibs'] = gv('sibs').clip(upper=15).astype(float)
    f['parent_education'] = pd.concat([gv('paeduc'), gv('maeduc')], axis=1).max(axis=1).astype(float)
    f['income_at_16'] = g.lab(gv('incom16'), INCOM16)
    f['place_at_16'] = g.lab(gv('res16'), RES16)
    f['born_us'] = g.lab(gv('born'), g.YESNO)
    f['occupation_group'] = occ_group(gv('occ10'))
    f['prestige'] = gv('prestg10').astype(float)
    f['spouse_prestige'] = gv('sppres10').astype(float)
    f['home'] = g.lab(gv('dwelown'), DWELOWN)
    f['wealth_band'] = wealth_band(gv('wealth'))
    # raw codes for the harmonized extract (x_ columns are dropped before modelling)
    f['x_polviews_code'] = gv('polviews').astype(float)
    f['x_partyid_code'] = gv('partyid').astype(float)
    return f


_base_features = g.features


def features_ext(d, w):
    return pd.concat([_base_features(d, w), extra_features(d, w)], axis=1)


CATS = dict(g.CATEGORIES, **EXTRA_CATEGORIES)


def onehot(cats):
    return OneHotEncoder(categories=[CATS[c] for c in cats], drop='first', handle_unknown='ignore', sparse_output=False)


def additive(cat, num, C=0.3):
    sp = Pipeline([('impute', SimpleImputer(strategy='median', add_indicator=True)),
                   ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False,
                                                extrapolation='linear')),
                   ('scale', StandardScaler())])
    prep = ColumnTransformer([('num', sp, num), ('cat', onehot(cat), cat)])
    return Pipeline([('prep', prep), ('fit', LogisticRegression(C=C, penalty='l1', solver='liblinear', max_iter=5000))])


def linear(cat, num):
    nm = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())])
    prep = ColumnTransformer([('num', nm, num), ('cat', onehot(cat), cat)])
    return Pipeline([('prep', prep), ('fit', LogisticRegression(C=1e4, max_iter=20000))])


def split(cols):
    return [c for c in cols if c not in g.NUMERIC + EXTRA_NUMERIC], [c for c in cols if c in g.NUMERIC + EXTRA_NUMERIC]


BASE = list(g.CATEGORIES) + g.NUMERIC


def variants():
    v = {'current model': BASE,
         'current, family at 16 as yes/no': [c if c != 'family_at_16' else 'intact16' for c in BASE],
         'current, family at 16 -> 5-level family of origin': [c if c != 'family_at_16' else 'family_origin' for c in BASE]}
    for name, cols in BLOCKS.items():
        v[f'current + {name}'] = BASE + cols
    v['current + religion detail + politics'] = BASE + BLOCKS['religion detail'] + BLOCKS['politics']
    v['current + all new blocks'] = BASE + [c for cols in BLOCKS.values() for c in cols]
    return v


def one_repeat(s, V, r):
    y, w = s.event.to_numpy(), s.weight.to_numpy()
    P = {k: np.zeros(len(s)) for k in ['constant'] + list(V)}
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED + r)
    for tr, te in cv.split(s, y, s.pid):
        dtr, dte = s.iloc[tr], s.iloc[te]
        P['constant'][te] = np.average(y[tr], weights=w[tr])
        for k, cols in V.items():
            cat, num = split(cols)
            P[k][te] = additive(cat, num).fit(dtr, y[tr], fit__sample_weight=w[tr]).predict_proba(dte)[:, 1]
    return P


def per_unit(p, n_num):
    c = p.named_steps['fit'].coef_[0].copy()
    sc = p.named_steps['prep'].named_transformers_['num'].named_steps['scale'].scale_
    c[:n_num] = c[:n_num] / sc
    return c


# A new input that refines a current one replaces it in the odds-ratio model (otherwise the two are
# collinear and the new levels would be read within the old ones).
REPLACES = {'family_origin': 'family_at_16', 'race_detail': 'race', 'attend9': 'attend', 'denomination': 'religion'}


def block_odds_ratios(s, block, cols):
    drop = {REPLACES[c] for c in cols if c in REPLACES}
    cat, num = split([c for c in BASE if c not in drop] + cols)
    y, w = s.event.to_numpy(), s.weight.to_numpy()
    full = linear(cat, num).fit(s, y, fit__sample_weight=w)
    names = full.named_steps['prep'].get_feature_names_out()
    point = per_unit(full, len(num))

    def refit(idx):
        b = s.iloc[idx].reset_index(drop=True)
        return per_unit(linear(cat, num).fit(b, b.event.to_numpy(), fit__sample_weight=b.weight.to_numpy()), len(num))
    B = np.array(Parallel(n_jobs=JOBS)(delayed(refit)(i) for i in tm.boot_indices(s.pid, 300, SEED + 7)))
    lo, hi = np.percentile(B, [2.5, 97.5], axis=0)
    rows = []
    for i, n in enumerate(names):
        var = n.split('__', 1)[1]
        base_var = next((c for c in cols if var == c or var.startswith(c + '_')), None)
        if base_var is None:
            continue
        per = 'one step' if n.startswith('num__') else 'vs reference'
        level = var[len(base_var) + 1:] if n.startswith('cat__') else ''
        ref = CATS[base_var][0] if n.startswith('cat__') else ''
        rows.append(dict(block=block, variable=base_var, level=level, reference=ref, per=per,
                         odds_ratio=float(np.exp(point[i])), ci95_low=float(np.exp(lo[i])), ci95_high=float(np.exp(hi[i])),
                         adjusted_for='every current-model input (linear age, children, attendance) + this block'
                         + (f'; replaces {", ".join(sorted(drop))}' if drop else ''),
                         records=len(s), level_records=int((s[base_var] == level).sum()) if level else len(s),
                         level_events=int(s.event[s[base_var] == level].sum()) if level else int(s.event.sum())))
    return [r for r in rows if r['level_records'] > 0]


def level_rates(s, var):
    out = []
    levels = [l for l in CATS[var] if (s[var] == l).sum() >= 30]
    for row in tm.rate_table(s.assign(**{var: s[var].where(s[var].isin(levels), 'Small cell')}), 2, by=var):
        if row['level'] in levels:
            out.append(row)
    return out


def harmonize(t2):
    h = pd.DataFrame(index=t2.index)
    h['person_id'] = t2.pid
    h['cluster_id'] = t2.pid
    h['weight'] = t2.weight
    h['unit'] = 'transition'
    h['outcome'] = 'divorced or separated at the re-interview 2 years later (widowhood excluded)'
    h['exposure'] = 2.0
    h['event'] = t2.event
    h['calendar_year'] = t2.from_year
    h['marriage_order'] = 'any'
    h['sex'] = t2.sex.map({'Female': 'Woman', 'Male': 'Man'})
    h['age'] = t2.age
    h['race_eth'] = t2.race_detail
    h['race_eth_coarse'] = t2.race
    h['education'] = t2.degree.map({'Less than high school': 'Less than high school', 'High school': 'High school',
                                    'Junior college': 'Some college', 'Bachelor': 'Bachelor', 'Graduate': 'Graduate'})
    h['married_before'] = t2.divorced_before.map({'Yes': 1, 'No': 0})
    h['family_origin'] = t2.family_origin.replace({'Unknown': np.nan})
    h['intact_family'] = np.where(t2.family_origin == 'Unknown', np.nan, (t2.family_origin == 'Both parents').astype(float))
    a6 = {'Never': 'Never', 'Less than once a year': 'Less than monthly', 'About once a year': 'Less than monthly',
          'Several times a year': 'Less than monthly', 'About once a month': 'About monthly',
          '2-3 times a month': '2-3 times a month', 'Nearly every week': 'Weekly', 'Every week': 'Weekly',
          'More than once a week': 'More than weekly'}
    h['attend'] = t2.attend9.map(a6)
    h['attend_weekly'] = h.attend.map(lambda v: np.nan if pd.isna(v) else float(v in ('Weekly', 'More than weekly')))
    rmap = {'Catholic': 'Catholic', 'Jewish': 'Jewish', 'None': 'None', 'Other Christian': 'Other', 'Other religion': 'Other'}
    h['religion'] = t2.denomination.map(lambda v: np.nan if v == 'Unknown' else rmap.get(v, 'Protestant'))
    h['religion_raised'] = t2.religion_raised.replace({'Unknown': np.nan})
    h['pray'] = t2.pray.replace({'Less than once a week': 'Less than weekly', 'Unknown': np.nan})
    h['religion_importance'] = t2.religious_strength.map({'Strong': 'Very important', 'Somewhat strong': 'Somewhat important',
                                                          'Not very strong': 'Not important', 'No religion': 'Not important'})
    h['polviews'] = t2.x_polviews_code
    h['party'] = t2.x_partyid_code.map(lambda v: np.nan if pd.isna(v) else 'Democrat' if v <= 1 else 'Republican'
                                       if 5 <= v <= 6 else 'Other' if v == 7 else 'Independent')
    h['home_owner'] = t2.home.map({'Own': 1.0, 'Rent': 0.0, 'Other': 0.0})
    h['occupation_group'] = t2.occupation_group.replace({'No occupation reported': np.nan})
    h['hapmar'] = t2.hapmar.replace({'Unknown': np.nan})
    h['region'] = t2.region
    h['country'] = 'US'
    h['x_wealth_band'] = t2.wealth_band
    h['x_family_income_band_2000usd'] = t2.family_income
    h['x_panel'] = t2.panel
    measured = ['person_id', 'cluster_id', 'weight', 'unit', 'outcome', 'exposure', 'event', 'calendar_year', 'marriage_order',
                'sex', 'age', 'race_eth', 'race_eth_coarse', 'education', 'married_before', 'family_origin',
                'intact_family', 'attend', 'attend_weekly', 'religion', 'religion_raised', 'pray', 'religion_importance',
                'polviews', 'party', 'home_owner', 'occupation_group', 'hapmar', 'region', 'country']
    write_harmonized(h, 'gss_panel_marriages', measured,
                     notes=['marriage duration and wedding year are not measured in the panels (t_start NaN)',
                            'religion_importance is mapped from strength of affiliation (RELITEN)',
                            'a respondent can contribute two transitions; cluster on person_id'])


def main():
    g.features = features_ext
    t, _ = g.transitions()
    t['intact16'] = np.where(t.family_at_16 == 'Unknown', 'Unknown', np.where(t.family_at_16 == 'Both parents', 'Yes', 'No'))
    CATS['intact16'] = ['Yes', 'No', 'Unknown']
    s = g.analysis_sample(t, 2)
    harmonize(s)
    V = variants()
    res = Parallel(n_jobs=JOBS)(delayed(one_repeat)(s, V, r) for r in range(REPEATS))
    y, w = s.event.to_numpy(), s.weight.to_numpy()
    losses = {k: np.mean([logloss_rows(y, r[k], w) for r in res], axis=0) for k in ['constant'] + list(V)}
    tab = cluster_gain_table(s.pid, losses, reference='current model', reps=BOOT, seed=SEED)
    tab['inputs_added'] = tab.model.map(lambda k: ', '.join(c for c in V.get(k, []) if c not in BASE) if k in V else '')
    tab.insert(0, 'horizon_years', 2)
    tab['records'] = len(s)
    tab['respondents'] = s.pid.nunique()
    tab['events'] = int(s.event.sum())
    tab['repeats'] = REPEATS
    tab.to_csv(HERE / 'extended_heldout.csv', index=False, float_format='%.4f')
    print(tab.round(3).to_string(index=False), flush=True)

    if not os.environ.get('GSS_EXT_SKIP_OR'):
        ors = []
        for b, cols in BLOCKS.items():
            ors += block_odds_ratios(s, b, cols)
        ors += block_odds_ratios(s, 'family of origin (5-level only)', ['family_origin'])
        ors += block_odds_ratios(s, 'race detail (replacing race)', ['race_detail'])
        ors += block_odds_ratios(s, 'attendance, 9 levels (replacing the numeric score)', ['attend9'])
        pd.DataFrame(ors).to_csv(HERE / 'extended_odds_ratios.csv', index=False, float_format='%.4f')

    rates = []
    g.CATEGORIES.update(EXTRA_CATEGORIES)
    for var in ['family_origin', 'attend9', 'pray', 'religious_strength', 'fundamentalism', 'denomination',
                'religion_raised', 'polviews', 'party', 'race_detail', 'occupation_group', 'home', 'wealth_band']:
        rates += level_rates(s, var)
    pd.DataFrame(rates).to_csv(HERE / 'extended_rates.csv', index=False, float_format='%.5f')

    # Export: the current model plus every block whose held-out difference has a CI above zero,
    # always including the 5-level family of origin and religion detail for transparency.
    helpful = [b for b in BLOCKS if tab.set_index('model').loc[f'current + {b}', 'diff_ci95_low'] > 0]
    export_sets = {
        'logistic_additive_religion_politics': ('Additive L1 logistic, current inputs + religion detail (9-level attendance, '
                                                'prayer, strength, fundamentalism, denomination, religion raised) + '
                                                'political views and party', 'current + religion detail + politics'),
        'logistic_additive_all_blocks': ('Additive L1 logistic, current inputs + all new blocks (family of origin, '
                                         'religion detail, politics, race detail, occupation, wealth)',
                                         'current + all new blocks')}
    bundle_path = OUT / 'gss_panel_marriages.json'
    bundle = json.loads(bundle_path.read_text())
    pipes = {}
    ext = []
    for key, (label, vname) in export_sets.items():
        cols = V[vname]
        cat, num = split(cols)
        pipes[key] = additive(cat, num).fit(s, y, fit__sample_weight=w)
        r = tab.set_index('model').loc[vname]
        ext.append(dict(key=key, label=label, heldout=dict(
            logloss_improvement_percent=round(float(r.gain_percent), 3),
            deviance_improvement_percent=round(float(r.gain_percent), 3),
            logloss_improvement_ci95=[round(float(r.gain_ci95_low), 3), round(float(r.gain_ci95_high), 3)],
            gain_over_current_points=round(float(r.diff_vs_reference_points), 3),
            gain_over_current_ci95=[round(float(r.diff_ci95_low), 3), round(float(r.diff_ci95_high), 3)],
            evaluation=f'C = 0.3 fixed, 5 folds x {REPEATS} seeds grouped by respondent; paired respondent-cluster bootstrap ({BOOT})'),
            new_inputs=[c for c in cols if c not in BASE], **tm.export(pipes[key])))
    bundle['models_extended'] = ext
    bundle['models_extended_note'] = (
        'Held-out comparison of richer inputs (2026-10-20, extended_predictors.py). Not scored by the app until the '
        'form asks for the new inputs; a new input left out is scored at its own "Unknown" level (categorical) or '
        'the training median (numeric). Blocks whose held-out difference over the current model had a 95% CI above '
        f'zero: {", ".join(helpful) if helpful else "none"}.')
    bundle['inputs_extended'] = {c: INPUTS[c] for c in INPUTS}
    bundle['support_extended'] = {c: [float(s[c].min()), float(s[c].max())] for c in EXTRA_NUMERIC}
    bundle_path.write_text(json.dumps(bundle, separators=(',', ':')))

    vec_path = OUT / 'gss_panel_marriages_testvectors.json'
    vec = json.loads(vec_path.read_text())
    rng = np.random.default_rng(SEED + 11)
    rows = []
    cat_all = [c for c in CATS if any(c in split(V[v])[0] for v in V)]
    for i in range(40):
        r = {c: str(rng.choice(CATS[c])) for c in cat_all}
        for c in g.NUMERIC + EXTRA_NUMERIC:
            lo, hi = float(s[c].min()), float(s[c].max())
            r[c] = None if i % 6 == 0 else float(rng.uniform(lo - 2, hi + 2))
        if i % 5 == 0:
            r['pray'] = None
        rows.append(r)
    tv = pd.DataFrame(rows)
    tvp = tv.copy()
    for c in cat_all:
        tvp[c] = tvp[c].fillna('Unknown')
    vec['extended'] = dict(rows=json.loads(tv.replace({np.nan: None}).to_json(orient='records')),
                           predictions={k: [float(v) for v in p.predict_proba(tvp)[:, 1]] for k, p in pipes.items()})
    vec_path.write_text(json.dumps(vec))
    print('helpful blocks:', helpful)


if __name__ == '__main__':
    main()
