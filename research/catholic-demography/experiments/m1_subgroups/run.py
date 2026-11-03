#!/usr/bin/env python3
"""Milestone 1: design-based comparison of US Catholic subpopulations, GSS 1972-2024.

    python3 experiments/m1_subgroups/run.py            # needs data/raw (data/download.sh)

Writes the CSV tables next to this file and prints the hypothesis checks logged in LOG.md.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, survey  # noqa: E402


def arrays(d):
    return d['w'].to_numpy(float), d['strat'].to_numpy(float), d['psu'].to_numpy(float)


def mean_row(d, y, dom, **keys):
    w, s, p = arrays(d)
    m, se, n = survey.domain_mean(d[y].to_numpy(float), w, dom.to_numpy(bool), s, p)
    lo, hi = survey.ci(m, se)
    return dict(**keys, outcome=y, estimate=m, se=se, lo=lo, hi=hi, n=n)


def contrast_row(d, y, a, b, **keys):
    w, s, p = arrays(d)
    est, se, na, nb = survey.contrast(d[y].to_numpy(float), w, a.to_numpy(bool), b.to_numpy(bool), s, p)
    lo, hi = survey.ci(est, se)
    return dict(**keys, outcome=y, estimate=est, se=se, lo=lo, hi=hi, n_a=na, n_b=nb)


def write(rows, name):
    t = pd.DataFrame(rows)
    t.to_csv(HERE / name, index=False, float_format='%.4f')
    return t


def main():
    d = recode.recode(recode.load())
    out = {}
    cath = d['rel'] == 'Catholic'
    prot = d['rel'] == 'Protestant'
    y2000 = d['year'] >= 2000
    old = d['age'].between(45, 89)

    # T1: Catholic share of adults and composition of Catholics, by period.
    rows = []
    d['is_cath'] = np.where(d['rel'].notna(), (d['rel'] == 'Catholic').astype(float), np.nan)
    for _, _, per in recode.PERIODS:
        P = d['period'] == per
        rows.append(mean_row(d, 'is_cath', P, period=per, group='All adults'))
    for yr in (2021, 2022, 2024):
        rows.append(mean_row(d, 'is_cath', d['year'] == yr, period=str(yr), group='All adults'))
    for e in ['Hispanic', 'NH white', 'NH Black', 'NH other']:
        d['_e'] = np.where(d['eth'].notna(), (d['eth'] == e).astype(float), np.nan)
        for _, _, per in recode.PERIODS[3:]:
            P = (d['period'] == per) & cath
            r = mean_row(d, '_e', P, period=per, group=f'Share of Catholics: {e}')
            rows.append(r)
    for g in ['1st gen (foreign-born)', '2nd gen', '3rd+ gen']:
        d['_g'] = np.where(d['gen'].notna(), (d['gen'] == g).astype(float), np.nan)
        for _, _, per in recode.PERIODS[1:]:
            rows.append(mean_row(d, '_g', (d['period'] == per) & cath, period=per,
                                 group=f'Share of Catholics: {g}'))
    out['t1'] = write(rows, 't1_share_composition.csv')

    # T2: completed fertility (children ever born, ages 45-89), Catholic vs Protestant.
    rows = []
    for label, sub in [('All', pd.Series(True, index=d.index)), ('NH white', d['eth'] == 'NH white'),
                       ('Hispanic', d['eth'] == 'Hispanic')]:
        base = y2000 & old & sub
        rows.append(contrast_row(d, 'childs_f', base & cath, base & prot, group=label,
                                 cohort='All cohorts', contrast='Catholic - Protestant'))
        for lo_, hi_, cb in recode.COHORTS[1:4]:
            b2 = base & (d['cohort_band'] == cb)
            rows.append(contrast_row(d, 'childs_f', b2 & cath, b2 & prot, group=label, cohort=cb,
                                     contrast='Catholic - Protestant'))
    # whole-period (1972-2024) by cohort, all respondents, to see the historical gap close
    for lo_, hi_, cb in recode.COHORTS[:4]:  # later cohorts are not yet 45
        b2 = old & (d['cohort_band'] == cb)
        rows.append(contrast_row(d, 'childs_f', b2 & cath, b2 & prot, group='All (1972-2024)',
                                 cohort=cb, contrast='Catholic - Protestant'))
    # attendance within Catholics
    for label, sub in [('NH white', d['eth'] == 'NH white'), ('Hispanic', d['eth'] == 'Hispanic')]:
        base = y2000 & old & sub & cath
        rows.append(contrast_row(d, 'childs_f', base & (d['weekly'] == 1), base & (d['weekly'] == 0),
                                 group=label, cohort='All cohorts',
                                 contrast='Catholic weekly - Catholic less than weekly'))
    out['t2'] = write(rows, 't2_fertility_contrasts.csv')
    rows = []
    for label, sub in [('NH white', d['eth'] == 'NH white'), ('Hispanic', d['eth'] == 'Hispanic')]:
        for rl, rm in [('Catholic', cath), ('Protestant', prot), ('None', d['rel'] == 'None')]:
            for lo_, hi_, cb in recode.COHORTS[1:4]:
                rows.append(mean_row(d, 'childs_f', y2000 & old & sub & rm & (d['cohort_band'] == cb),
                                     group=label, religion=rl, cohort=cb))
    out['t2m'] = write(rows, 't2_fertility_means.csv')

    # T3: retention among those raised Catholic, by ethnicity and cohort (2000-2024 surveys).
    rows = []
    raised = d['rel16'] == 'Catholic'
    for label, sub in [('All', pd.Series(True, index=d.index)), ('NH white', d['eth'] == 'NH white'),
                       ('Hispanic', d['eth'] == 'Hispanic')]:
        for lo_, hi_, cb in recode.COHORTS[1:5]:
            rows.append(mean_row(d, 'still_catholic', y2000 & raised & sub & (d['cohort_band'] == cb),
                                 group=label, cohort=cb))
    for _, _, per in recode.PERIODS:
        rows.append(mean_row(d, 'still_catholic', raised & (d['period'] == per), group='All, by survey period', cohort=per))
    # converts: share of current Catholics raised in another religion or none
    for _, _, per in recode.PERIODS:
        rows.append(mean_row(d, 'convert', cath & (d['period'] == per), group='Converts among current Catholics', cohort=per))
    out['t3'] = write(rows, 't3_retention.csv')

    # T4: practice, belief and politics of Catholic subgroups, 2010-2024 (two periods).
    rows = []
    outs = ['weekly', 'monthly', 'never', 'pray_daily', 'strong', 'bible_literal', 'ba', 'ever_married',
            'conservative', 'republican', 'abany_yes']
    groups = [('Hispanic', d['eth'] == 'Hispanic'), ('NH white', d['eth'] == 'NH white'),
              ('NH Black', d['eth'] == 'NH Black'), ('NH other', d['eth'] == 'NH other'),
              ('1st gen (foreign-born)', d['gen'] == '1st gen (foreign-born)'), ('2nd gen', d['gen'] == '2nd gen'),
              ('3rd+ gen', d['gen'] == '3rd+ gen'),
              ('Convert', d['convert'] == 1), ('Cradle', d['convert'] == 0),
              ('Age 18-39', d['age'].between(18, 39)), ('Age 40-64', d['age'].between(40, 64)),
              ('Age 65+', d['age'] >= 65), ('All Catholics', pd.Series(True, index=d.index))]
    for per in ['2010-18', '2021-24']:
        P = (d['period'] == per) & cath
        for gl, gm in groups:
            for y in outs:
                rows.append(mean_row(d, y, P & gm, period=per, group=gl))
    out['t4'] = write(rows, 't4_profiles.csv')
    rows = []
    for per in ['2000-09', '2010-18', '2021-24']:
        P = (d['period'] == per) & cath
        for y in outs:
            rows.append(contrast_row(d, y, P & (d['eth'] == 'Hispanic'), P & (d['eth'] == 'NH white'),
                                     period=per, contrast='Hispanic - NH white Catholics'))
    out['t4c'] = write(rows, 't4_hispanic_vs_white.csv')

    # Hypothesis checks
    t2 = out['t2']
    g = lambda grp, coh, con='Catholic - Protestant': t2[(t2.group == grp) & (t2.cohort == coh) & (t2.contrast == con)].iloc[0]
    print('Check: Catholic share 2024 =', round(out['t1'].query("period=='2024' and group=='All adults'").estimate.iloc[0], 4))
    a, w = g('All', 'All cohorts'), g('NH white', 'All cohorts')
    print(f"H1a all gap {a.estimate:.3f} [{a.lo:.3f},{a.hi:.3f}] vs NH white gap {w.estimate:.3f} [{w.lo:.3f},{w.hi:.3f}] ->",
          'supported' if w.estimate < a.estimate else 'refuted')
    for cb in ['Born 1945-64', 'Born 1965-80']:
        r = g('NH white', cb)
        verdict = 'refuted' if (r.lo > 0.2 or r.hi < -0.2) else ('supported (CI within +-0.2)' if (r.lo >= -0.2 and r.hi <= 0.2) else 'not refuted (CI crosses +-0.2)')
        print(f"H1b NH white {cb}: {r.estimate:.3f} [{r.lo:.3f},{r.hi:.3f}] -> {verdict}")
    for grp in ['NH white', 'Hispanic']:
        r = g(grp, 'All cohorts', 'Catholic weekly - Catholic less than weekly')
        print(f"H1c {grp}: {r.estimate:.3f} [{r.lo:.3f},{r.hi:.3f}] ->", 'supported' if r.lo > 0 else 'refuted')
    t3 = out['t3']
    for grp in ['NH white', 'Hispanic']:
        s = t3[(t3.group == grp) & t3.cohort.isin(['Born 1945-64', 'Born 1965-80', 'Born 1981-96'])]
        v = s.estimate.to_list()
        print(f"H2 {grp}: retention {[round(x, 3) for x in v]} ->", 'supported' if v[0] > v[1] > v[2] else 'refuted')
    t4c = out['t4c']
    for per in ['2010-18', '2021-24']:
        r = t4c[(t4c.period == per) & (t4c.outcome == 'weekly')].iloc[0]
        print(f"Q3 weekly Hispanic - NH white {per}: {r.estimate:.3f} [{r.lo:.3f},{r.hi:.3f}]")


if __name__ == '__main__':
    main()
