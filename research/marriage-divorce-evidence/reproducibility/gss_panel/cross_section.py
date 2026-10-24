"""CROSS-SECTIONAL supporting evidence from the cumulative GSS 1972-2024 file (gss7224_r3a.dta).

Among ever-married respondents: who has ever been divorced or separated? This is a
retrospective, cross-sectional target (status at the interview), not a prospective rate, and
some traits (education, attendance) are measured after any divorce. Age at first marriage
(AGEWED) was asked only in 1972-1994 and 2006, so it gets its own subsample.

Writes xs_ever_divorced_by_group.csv, xs_logistic_odds_ratios.csv and xs_sample_audit.json.
Run after download.sh:  python3 cross_section.py   (~2 min; reads ~600 MB)
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import OneHotEncoder

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gss_data as g  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
COLS = ['year', 'id', 'marital', 'divorce', 'agewed', 'family16', 'famdif16', 'relig16', 'attend', 'degree',
        'sex', 'race', 'age', 'cohort', 'wtssps']


def load():
    d = pd.read_stata(g.RAW / 'GSS_stata' / 'gss7224_r3a.dta', columns=COLS, convert_categoricals=False)
    n_all = len(d)
    d = d[d.marital.isin([1, 2, 3, 4]) & d.age.between(18, 89)].copy()
    d['ever_div'] = np.where(d.marital.isin([3, 4]), 1, np.where(d.divorce == 1, 1, np.where(d.divorce == 2, 0, np.nan)))
    n_em = len(d)
    d = d[d.ever_div.notna() & d.wtssps.notna() & (d.wtssps > 0)].copy()
    d['ever_div'] = d.ever_div.astype(int)
    d['weight'] = d.wtssps / d.wtssps.mean()
    d['age_band'] = pd.cut(d.age, [18, 25, 35, 45, 55, 65, 90], right=False,
                           labels=['18-24', '25-34', '35-44', '45-54', '55-64', '65+']).astype(str)
    d['survey_decade'] = (d.year // 10 * 10).astype(int).astype(str) + 's'
    d['sex'] = d.sex.map({1: 'Male', 2: 'Female'}).fillna('Unknown')
    d['race'] = d.race.map({1: 'White', 2: 'Black', 3: 'Other'}).fillna('Unknown')
    d['degree'] = g.lab(d.degree, g.DEGREE)
    d['religion_raised'] = g.lab(d.relig16, g.RELIG)
    d['attend_band'] = pd.cut(d.attend, [-1, 1, 4, 6, 9], labels=['Never or under once a year', 'Yearly to monthly',
                                                                  '2-3 times a month to nearly weekly', 'Weekly or more']).astype(object).fillna('Unknown')
    d['family_at_16'] = g.family_at_16(d.family16, d.famdif16)
    d['age_first_married'] = pd.cut(d.agewed, [0, 20, 23, 26, 30, 99], right=False,
                                    labels=['under 20', '20-22', '23-25', '26-29', '30+']).astype(object).fillna('Unknown')
    audit = dict(records_in_file=n_all, ever_married_18_89=n_em, analysed=len(d), ever_divorced_or_separated=int(d.ever_div.sum()),
                 years=[int(d.year.min()), int(d.year.max())],
                 agewed_years=sorted(int(y) for y in d.loc[d.agewed.notna(), 'year'].unique()),
                 agewed_known=int(d.agewed.notna().sum()))
    return d, audit


def wshare(x):
    return float(np.average(x.ever_div, weights=x.weight))


def by_group(d, groups, label, B=500):
    rng = np.random.default_rng(SEED)
    rows = []
    for gname in groups:
        levels = sorted(d[gname].unique())
        boots = {lv: [] for lv in levels}
        for _ in range(B):
            b = d.iloc[rng.integers(0, len(d), len(d))]
            for lv in levels:
                x = b[b[gname] == lv]
                boots[lv].append(wshare(x) if len(x) else np.nan)
        for lv in levels:
            x = d[d[gname] == lv]
            rows.append(dict(sample=label, group=gname, level=lv, respondents=len(x), ever_divorced=int(x.ever_div.sum()),
                             weighted_share=wshare(x), ci_low=float(np.nanpercentile(boots[lv], 2.5)),
                             ci_high=float(np.nanpercentile(boots[lv], 97.5))))
    return rows


REFS = {'age_band': '35-44', 'survey_decade': '1990s', 'sex': 'Male', 'race': 'White', 'degree': 'High school',
        'religion_raised': 'Protestant', 'attend_band': 'Yearly to monthly', 'family_at_16': 'Both parents',
        'age_first_married': '23-25'}


def odds_ratios(d, cats, label, B=200):
    levels = [[REFS[c]] + sorted(set(d[c]) - {REFS[c]}) for c in cats]

    def fitc(x):
        ct = ColumnTransformer([('cat', OneHotEncoder(categories=levels, drop='first', handle_unknown='ignore',
                                                      sparse_output=False), cats)])
        X = ct.fit_transform(x)
        m = LogisticRegression(C=1e4, max_iter=5000).fit(X, x.ever_div, sample_weight=x.weight)
        return ct.get_feature_names_out(), m.coef_[0]
    names, point = fitc(d)
    rng = np.random.default_rng(SEED)
    b = np.array([fitc(d.iloc[rng.integers(0, len(d), len(d))])[1] for _ in range(B)])
    lo, hi = np.percentile(b, [2.5, 97.5], axis=0)
    return [dict(sample=label, feature=n, odds_ratio=float(np.exp(p)), ci_low=float(np.exp(l)), ci_high=float(np.exp(h)))
            for n, p, l, h in zip(names, point, lo, hi)]


def main():
    d, audit = load()
    mid = d[d.age.between(35, 64)]
    aw = d[d.agewed.notna() & d.age.between(35, 64)]
    rows = by_group(mid, ['survey_decade', 'sex', 'race', 'degree', 'religion_raised', 'attend_band', 'family_at_16'],
                    'ever-married, aged 35-64, 1972-2024')
    rows += by_group(aw, ['age_first_married'], 'ever-married, aged 35-64, years asking AGEWED (1972-1994, 2006)')
    pd.DataFrame(rows).to_csv(HERE / 'xs_ever_divorced_by_group.csv', index=False, float_format='%.4f')
    base = ['age_band', 'survey_decade', 'sex', 'race', 'degree', 'religion_raised', 'attend_band', 'family_at_16']
    ors = odds_ratios(d[d.age >= 25], base, 'ever-married 25+, 1972-2024')
    ors += odds_ratios(d[(d.age >= 25) & d.agewed.notna()], base + ['age_first_married'],
                       'ever-married 25+, AGEWED years (1972-1994, 2006)')
    pd.DataFrame(ors).to_csv(HERE / 'xs_logistic_odds_ratios.csv', index=False, float_format='%.4f')
    audit.update(aged_35_64=len(mid), aged_35_64_agewed=len(aw),
                 weighted_share_35_64=wshare(mid), weight='WTSSPS (NORC post-stratified weight, 1972-2024), normalised to mean 1',
                 caveat='cross-sectional: status at interview, not a prospective rate; respondent bootstrap ignores the PSU design')
    (HERE / 'xs_sample_audit.json').write_text(json.dumps(audit, indent=1) + '\n')
    print(json.dumps(audit, indent=1))
    print(pd.DataFrame(rows).round(3).to_string(index=False))
    print(pd.DataFrame(ors).round(3).to_string(index=False))


if __name__ == '__main__':
    main()
