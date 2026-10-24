"""Marital satisfaction by years married, from data the project already uses.

Three views, each labelled by design (see ../README.md):

1. GSS cumulative 1972-2024 (cross-sectional). Currently married respondents in their FIRST
   marriage (DIVORCE = no: never divorced or legally separated), in the years AGEWED (age at first
   marriage) was asked (1972-1994 and 2006; HAPMAR and DIVORCE were not both asked with it in 2006, so the sample is 1973-1994). Years married = AGE - AGEWED. Outcome: HAPMAR
   ("Taken all things together, how would you describe your marriage?"): share "very happy",
   share "not too happy", and the mean on a 1-3 scale (3 = very happy). Weight WTSSPS.
   Cross-sectional: each duration band is a different set of people, and marriages that became
   unhappy and ended are missing from the later bands (survivor bias).
2. HCMST 2009 wave 1 (cross-sectional). Married respondents; years married = age at interview
   - age at marriage (Q21D). Outcome: relationship quality (Q34, 1-5; 5 = excellent): share
   "excellent" and mean. Weight WEIGHT2.
3. HCMST 2009 -> 2013 (within-couple trajectory). The same married respondents re-rating the
   same relationship at wave 4 (about four years later): mean change and the share whose rating
   fell, by years married at wave 1; and the wave-1 rating of those who later broke up against
   those who stayed together (the survivor bias in views 1-2, measured).

Outputs (aggregates only; no person-level rows):
  ../satisfaction_by_duration.csv, ../hcmst_trajectory.csv, ../survivor_bias.csv,
  ../sample_audit.json and ../../../app/data/satisfaction_by_duration.json.

Run after the GSS and HCMST download scripts (../../gss_panel/download.sh, ../../hcmst/download.sh):
  GSS_RAW=... HCMST_RAW=... python3 scripts/build.py      (~2 min; reads ~600 MB of GSS)
Intervals: 95% percentile intervals from 500 respondent bootstrap resamples (weights carried).
"""
from pathlib import Path
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
APP = OUT.parent.parent / 'app' / 'data'
SEED = 20261020
B = 500

GSS_RAW = Path(os.environ.get('GSS_RAW', OUT.parent / 'gss_panel' / 'raw'))
HCMST_RAW = Path(os.environ.get('HCMST_RAW', OUT.parent / 'hcmst' / 'raw'))

DUR_BINS = [0, 3, 6, 11, 16, 21, 31, 41, 80]
DUR_LABELS = ['0-2', '3-5', '6-10', '11-15', '16-20', '21-30', '31-40', '41+']
DUR_MID = {'0-2': 1.5, '3-5': 4.5, '6-10': 8.5, '11-15': 13.5, '16-20': 18.5, '21-30': 26, '31-40': 36, '41+': 46}
HCMST_BINS = [0, 3, 6, 11, 21, 80]
HCMST_LABELS = ['0-2', '3-5', '6-10', '11-20', '21+']
HCMST_MID = {'0-2': 1.5, '3-5': 4.5, '6-10': 8.5, '11-20': 15.5, '21+': 32}
MIN_N = 50  # cells with fewer respondents are not published


def duration_band(years, bins, labels):
    return pd.cut(years, bins, right=False, labels=labels).astype(object)


def wmean(x, w):
    return float(np.average(x, weights=w))


def boot_cells(df, by, stats, rng, b=B):
    """Weighted statistics per cell of `by` with respondent-bootstrap intervals.

    stats: {name: column of 0/1 or numeric values}. Returns a list of dict rows."""
    levels = [lv for lv in df[by].dropna().unique()]
    point = {}
    boots = {lv: {s: [] for s in stats} for lv in levels}
    for lv in levels:
        x = df[df[by] == lv]
        point[lv] = {s: wmean(x[c], x.weight) for s, c in stats.items()}
    idx = np.arange(len(df))
    for _ in range(b):
        d = df.iloc[rng.choice(idx, len(idx))]
        for lv in levels:
            x = d[d[by] == lv]
            for s, c in stats.items():
                boots[lv][s].append(wmean(x[c], x.weight) if len(x) and x.weight.sum() > 0 else np.nan)
    rows = []
    for lv in levels:
        x = df[df[by] == lv]
        r = dict(level=lv, n=int(len(x)))
        for s in stats:
            r[s] = point[lv][s]
            r[s + '_lo'] = float(np.nanpercentile(boots[lv][s], 2.5))
            r[s + '_hi'] = float(np.nanpercentile(boots[lv][s], 97.5))
        rows.append(r)
    return rows


# ---- 1. GSS cumulative -----------------------------------------------------------------------
def gss():
    cols = ['year', 'marital', 'divorce', 'agewed', 'age', 'hapmar', 'sex', 'degree', 'wtssps']
    d = pd.read_stata(GSS_RAW / 'GSS_stata' / 'gss7224_r3a.dta', columns=cols, convert_categoricals=False)
    audit = dict(records_in_file=int(len(d)))
    d = d[(d.marital == 1)]
    audit['married'] = int(len(d))
    d = d[d.agewed.notna() & d.age.between(18, 89)]
    audit['married_agewed_asked_and_known'] = int(len(d))
    d = d[d.divorce == 2]  # never divorced or legally separated: first marriage, still intact
    audit['first_marriage_never_divorced'] = int(len(d))
    d = d[d.hapmar.isin([1, 2, 3]) & d.wtssps.notna() & (d.wtssps > 0)].copy()
    d['years_married'] = d.age - d.agewed
    d = d[(d.years_married >= 0) & (d.years_married < 80)].copy()
    audit['analysed'] = int(len(d))
    audit['survey_years'] = sorted(int(y) for y in d.year.unique())
    d['weight'] = d.wtssps / d.wtssps.mean()
    d['very_happy'] = (d.hapmar == 1).astype(float)
    d['not_too_happy'] = (d.hapmar == 3).astype(float)
    d['score'] = 4 - d.hapmar  # 3 very happy, 2 pretty happy, 1 not too happy
    d['band'] = duration_band(d.years_married, DUR_BINS, DUR_LABELS)
    d['sex_l'] = d.sex.map({1: 'Men', 2: 'Women'})
    d['era'] = np.where(d.year <= 1994, '1973-1994', '2006')
    d['degree_l'] = np.where(d.degree >= 3, 'Bachelor or more', np.where(d.degree.isin([0, 1, 2]), 'Less than bachelor', None))
    return d, audit


def adjusted(d, rng, b=200):
    """Share very happy by duration band, standardised to the whole sample's survey year, sex and
    age at marriage (weighted logistic regression, then the average prediction with every
    respondent set to each band). Removes those compositional differences; not survivor bias."""
    from sklearn.linear_model import LogisticRegression

    def design(x, band):
        X = pd.DataFrame({f'b_{lv}': (band == lv).astype(float) for lv in DUR_LABELS[1:]}, index=x.index)
        X['year'] = (x.year - 1985) / 10
        X['woman'] = (x.sex == 2).astype(float)
        aw = x.agewed.clip(14, 45)
        X['agewed'] = (aw - 23) / 5
        X['agewed2'] = X.agewed ** 2
        return X.to_numpy()

    def fit_predict(x):
        m = LogisticRegression(C=1e6, max_iter=2000).fit(design(x, x.band), x.very_happy, sample_weight=x.weight)
        return {lv: float(np.average(m.predict_proba(design(x, pd.Series(lv, index=x.index)))[:, 1], weights=x.weight)) for lv in DUR_LABELS}

    x = d[d.band.notna()]
    point = fit_predict(x)
    boots = {lv: [] for lv in DUR_LABELS}
    idx = np.arange(len(x))
    for _ in range(b):
        p = fit_predict(x.iloc[rng.choice(idx, len(idx))])
        for lv in DUR_LABELS:
            boots[lv].append(p[lv])
    return [dict(level=lv, n=int((x.band == lv).sum()), very_happy=point[lv], very_happy_lo=float(np.percentile(boots[lv], 2.5)), very_happy_hi=float(np.percentile(boots[lv], 97.5)),
                 not_too_happy=np.nan, not_too_happy_lo=np.nan, not_too_happy_hi=np.nan, mean_score=np.nan, mean_score_lo=np.nan, mean_score_hi=np.nan) for lv in DUR_LABELS]


# ---- 2 & 3. HCMST 2009 -----------------------------------------------------------------------
def hcmst():
    import pyreadstat
    a, _ = pyreadstat.read_dta(str(HCMST_RAW / 'HCMST_ver_3.04.dta'))
    b, _ = pyreadstat.read_dta(str(HCMST_RAW / 'wave_4_supplement_v1_2.dta'))
    c, _ = pyreadstat.read_dta(str(HCMST_RAW / 'HCMST_wave_5_supplement_ver_1.dta'))
    df = a.merge(b, on='caseid_new', how='left').merge(c[['caseid_new', 'w5_broke_up']], on='caseid_new', how='left')
    audit = dict(respondents=int(len(df)))
    df = df[(df.qflag == 1) & (df.married == 1)].copy()
    audit['married_at_wave1'] = int(len(df))
    df = df[df.q21d.notna() & (df.q21d > 0) & df.relationship_quality.between(1, 5) & (df.weight2 > 0)].copy()
    df['years_married'] = df.ppage - df.q21d
    df = df[(df.years_married >= 0) & (df.years_married < 80)].copy()
    audit['analysed_wave1'] = int(len(df))
    df['weight'] = df.weight2 / df.weight2.mean()
    df['excellent'] = (df.relationship_quality == 5).astype(float)
    df['fair_or_worse'] = (df.relationship_quality <= 3).astype(float)
    df['score'] = df.relationship_quality.astype(float)
    df['band'] = duration_band(df.years_married, HCMST_BINS, HCMST_LABELS)
    df['sex_l'] = df.ppgender.map({1: 'Men', 2: 'Women'})
    # Wave 4 (2013): still together (w4_broke_up == 0) and re-rated quality 1-5.
    q4 = df.relationship_quality_w4 if 'relationship_quality_w4' in df else df.w4_quality
    df['q4'] = pd.to_numeric(q4, errors='coerce')
    df.loc[~df.q4.between(1, 5), 'q4'] = np.nan
    df['together_w4'] = df.w4_broke_up == 0
    # Broke up by wave 5 (2015; 1 = broke up), the survivor-bias contrast.
    ended = (df.w2_broke_up == 1) | (df.w3_broke_up == 1) | (df.w4_broke_up == 1) | (df.w5_broke_up == 1)
    known = ended | (df.w5_broke_up == 0) | (df.w4_broke_up == 0)
    df['outcome'] = np.where(ended, 'Broke up by 2015', np.where(known, 'Still together at last follow-up', None))
    audit['rerated_wave4'] = int((df.together_w4 & df.q4.notna()).sum())
    audit['broke_up_by_2015'] = int(ended.sum())
    return df, audit


def main():
    rng = np.random.default_rng(SEED)
    rows = []
    g, ga = gss()
    stats = dict(very_happy='very_happy', not_too_happy='not_too_happy', mean_score='score')
    for r in boot_cells(g, 'band', stats, rng):
        rows.append(dict(source='GSS 1973-1994', design='cross-sectional', group='All', **r))
    for col, name in [('sex_l', 'Sex'), ('degree_l', 'Education')]:
        for lv in sorted(g[col].dropna().unique()):
            sub = g[g[col] == lv]
            for r in boot_cells(sub, 'band', stats, rng, b=200):
                rows.append(dict(source='GSS 1973-1994', design='cross-sectional', group=f'{name}: {lv}', **r))
    adj = adjusted(g, rng)
    for r in adj:
        rows.append(dict(source='GSS 1973-1994', design='cross-sectional, adjusted', group='Adjusted for survey year, sex and age at marriage', **r))
    h, ha = hcmst()
    hstats = dict(very_happy='excellent', not_too_happy='fair_or_worse', mean_score='score')
    for r in boot_cells(h, 'band', hstats, rng):
        rows.append(dict(source='HCMST 2009', design='cross-sectional', group='All', **r))
    for lv in ['Men', 'Women']:
        for r in boot_cells(h[h.sex_l == lv], 'band', hstats, rng, b=200):
            rows.append(dict(source='HCMST 2009', design='cross-sectional', group=f'Sex: {lv}', **r))
    sat = pd.DataFrame(rows)
    sat['mid_years'] = sat.apply(lambda r: (DUR_MID if r.source.startswith('GSS') else HCMST_MID)[r.level], axis=1)
    sat = sat[sat.n >= MIN_N].sort_values(['source', 'group', 'mid_years']).reset_index(drop=True)
    sat.to_csv(OUT / 'satisfaction_by_duration.csv', index=False, float_format='%.4f')

    # 3. Within-couple trajectory (HCMST 2009 -> 2013), same people, same relationship.
    t = h[h.together_w4 & h.q4.notna()].copy()
    t['change'] = t.q4 - t.score
    t['fell'] = (t.change < 0).astype(float)
    t['rose'] = (t.change > 0).astype(float)
    t['w1'] = t.score
    t['w4'] = t.q4
    traj = pd.DataFrame(boot_cells(t, 'band', dict(mean_w1='w1', mean_w4='w4', mean_change='change', share_fell='fell', share_rose='rose'), rng))
    traj['mid_years'] = traj.level.map(HCMST_MID)
    traj = traj[traj.n >= MIN_N].sort_values('mid_years')
    t['all'] = 'All'
    traj_all = pd.DataFrame(boot_cells(t, 'all', dict(mean_w1='w1', mean_w4='w4', mean_change='change', share_fell='fell', share_rose='rose'), rng))
    traj = pd.concat([traj_all.assign(mid_years=np.nan), traj])
    traj.to_csv(OUT / 'hcmst_trajectory.csv', index=False, float_format='%.4f')

    # Survivor bias: wave-1 quality of those who later broke up vs stayed together.
    s = h[h.outcome.notna()].copy()
    surv = pd.DataFrame(boot_cells(s, 'outcome', dict(excellent='excellent', fair_or_worse='fair_or_worse', mean_score='score'), rng))
    surv.to_csv(OUT / 'survivor_bias.csv', index=False, float_format='%.4f')

    audit = dict(gss=ga, hcmst=ha, bootstrap=B, seed=SEED, min_cell=MIN_N)
    (OUT / 'sample_audit.json').write_text(json.dumps(audit, indent=1) + '\n')

    def recs(df, keys):
        return [{k: (None if (isinstance(r[k], float) and np.isnan(r[k])) else (round(float(r[k]), 4) if isinstance(r[k], (float, np.floating)) else (int(r[k]) if isinstance(r[k], (np.integer,)) else r[k]))) for k in keys} for _, r in df.iterrows()]

    series = []
    for (src, grp), x in sat.groupby(['source', 'group'], sort=False):
        series.append(dict(source=src, design=x.design.iloc[0], group=grp,
                           points=recs(x, ['level', 'mid_years', 'n', 'very_happy', 'very_happy_lo', 'very_happy_hi', 'not_too_happy', 'not_too_happy_lo', 'not_too_happy_hi', 'mean_score', 'mean_score_lo', 'mean_score_hi'])))
    out = dict(
        about='Marital satisfaction by years married. Built by reproducibility/satisfaction_by_duration/scripts/build.py from the GSS cumulative file and HCMST 2009 (aggregates only). Cross-sectional views compare different people at each duration; marriages that ended are missing from later durations (survivor bias). The HCMST trajectory follows the same people about four years.',
        measures={
            'GSS 1973-1994': dict(question='Taken all things together, how would you describe your marriage? (HAPMAR)', top='Very happy', bottom='Not too happy', scale='1-3 (3 = very happy)',
                                  sample='Currently married, first marriage (never divorced or separated), survey years 1973-1994 (when age at first marriage was asked with HAPMAR); years married = age - age at first marriage.'),
            'HCMST 2009': dict(question='In general, how would you describe the quality of your relationship? (Q34)', top='Excellent', bottom='Fair, poor or very poor', scale='1-5 (5 = excellent)',
                               sample='Married respondents in 2009; years married = age - age at this marriage (any marriage order).'),
        },
        series=series,
        trajectory=dict(source='HCMST 2009 -> 2013', design='within-couple (same respondents, same relationship, about 4 years apart)', scale='1-5 (5 = excellent)',
                        rows=recs(traj, ['level', 'mid_years', 'n', 'mean_w1', 'mean_w1_lo', 'mean_w1_hi', 'mean_w4', 'mean_w4_lo', 'mean_w4_hi', 'mean_change', 'mean_change_lo', 'mean_change_hi', 'share_fell', 'share_fell_lo', 'share_fell_hi', 'share_rose', 'share_rose_lo', 'share_rose_hi'])),
        survivor_bias=dict(source='HCMST 2009 married couples, outcome by 2015', rows=recs(surv, ['level', 'n', 'excellent', 'excellent_lo', 'excellent_hi', 'fair_or_worse', 'fair_or_worse_lo', 'fair_or_worse_hi', 'mean_score', 'mean_score_lo', 'mean_score_hi'])),
        audit=audit,
    )
    APP.mkdir(parents=True, exist_ok=True)
    (APP / 'satisfaction_by_duration.json').write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
    print(sat[sat.group == 'All'][['source', 'level', 'n', 'very_happy', 'very_happy_lo', 'very_happy_hi', 'mean_score']].to_string())
    print(traj.to_string())
    print(surv.to_string())
    print(json.dumps(audit))


if __name__ == '__main__':
    sys.exit(main())
