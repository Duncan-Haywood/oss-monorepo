#!/usr/bin/env python3
"""Milestone 4: design-based logistic models of retention among those raised Catholic, ages 30+.

    python3 experiments/m4_retention/run.py     # needs data/raw (data/download.sh)

Tables t8-t10 are written next to this file; the printed output is results.txt.
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, survey  # noqa: E402

COH = ['Born 1945-64', 'Born 1965-80', 'Born 1981-96']


def design(d, with_gen):
    cols, names = [np.ones(len(d))], ['const']
    for c in COH[1:]:
        cols.append((d['cohort_band'] == c).astype(float)); names.append(c)
    hisp = (d['eth'] == 'Hispanic').astype(float)
    cols.append(hisp); names.append('Hispanic')
    for c in COH[1:]:
        cols.append(hisp * (d['cohort_band'] == c)); names.append(f'Hispanic x {c}')
    if with_gen:
        for g in ['1st gen (foreign-born)', '2nd gen']:
            cols.append((d['gen'] == g).astype(float)); names.append(g)
        cols.append((d['sex'] == 2).astype(float)); names.append('Female')
        cols.append(d['ba'].fillna(np.nan)); names.append('BA+')
        cols.append((d['year'] >= 2021).astype(float)); names.append('Survey 2021-24')
    X = np.column_stack(cols).astype(float)
    # eth, gen unknown -> missing row
    miss = d['eth'].isna().to_numpy().copy()
    if with_gen:
        miss |= d['gen'].isna().to_numpy() | d['sex'].isna().to_numpy()
    X[miss] = np.nan
    return X, names


def fit(d, dom, with_gen, label):
    X, names = design(d, with_gen)
    y = d['still_catholic'].to_numpy(float)
    b, cov, n = survey.logit(X, y, d['w'].to_numpy(float), dom, d['strat'].to_numpy(float), d['psu'].to_numpy(float))
    se = np.sqrt(np.diag(cov))
    t = pd.DataFrame(dict(model=label, term=names, coef=b, se=se, lo=b - survey.Z95 * se,
                          hi=b + survey.Z95 * se, odds_ratio=np.exp(b), n=n))
    return t, b, cov, names, X


def main():
    d = recode.recode(recode.load())
    raised = d['rel16'] == 'Catholic'
    dom = (raised & (d['age'] >= 30) & (d['year'] >= 2000) & d['cohort_band'].isin(COH) & d['eth'].isin(['NH white', 'Hispanic'])).to_numpy()
    print(f'Sample: raised Catholic, non-Hispanic white or Hispanic, age 30+, 2000-2024, born 1945-96: n={int(dom.sum() - d.loc[dom, "still_catholic"].isna().sum())} with retention observed')
    tabs = []
    ta, ba_, ca, na_, _ = fit(d, dom, False, 'A: cohort x Hispanic')
    tb, bb, cb, nb, _ = fit(d, dom, True, 'B: + generation, sex, BA, period')
    tabs += [ta, tb]
    pd.concat(tabs).to_csv(HERE / 't8_logit_coefs.csv', index=False, float_format='%.4f')
    for t in (ta, tb):
        print('\n' + t['model'].iloc[0])
        print(t[['term', 'coef', 'lo', 'hi', 'odds_ratio']].to_string(index=False, float_format=lambda v: f'{v:7.3f}'))
    # Wald tests
    i_int = [k for k, v in enumerate(na_) if v.startswith('Hispanic x')]
    i_coh = [k for k, v in enumerate(na_) if v in COH[1:]]
    print('\nWald, model A: cohort terms (white) chi2=%.1f df=%d p=%.4f' % survey.wald(ba_, ca, i_coh))
    print('Wald, model A: cohort x Hispanic interaction chi2=%.1f df=%d p=%.4f' % survey.wald(ba_, ca, i_int))
    # Predicted retention by cohort x ethnicity (model A is saturated in these cells, so the fit equals the weighted shares exactly).
    rows = []
    for e in ['NH white', 'Hispanic']:
        for c in COH:
            cell = dom & (d['eth'] == e).to_numpy() & (d['cohort_band'] == c).to_numpy()
            m, se, n = survey.domain_mean(d['still_catholic'].to_numpy(float), d['w'].to_numpy(float), cell,
                                          d['strat'].to_numpy(float), d['psu'].to_numpy(float))
            lo, hi = survey.ci(m, se)
            rows.append(dict(eth=e, cohort=c, retention=m, lo=lo, hi=hi, n=n))
    t9 = pd.DataFrame(rows); t9.to_csv(HERE / 't9_retention_cells.csv', index=False, float_format='%.4f')
    print('\nRetention by cohort x ethnicity (ages 30+, 2000-24)'); print(t9.to_string(index=False, float_format=lambda v: f'{v:.3f}'))
    # Check: model A fitted probabilities equal the cell shares
    X, _ = design(d, False)
    cellmask = dom & (d['eth'] == 'NH white').to_numpy() & (d['cohort_band'] == COH[1]).to_numpy()
    xr = X[cellmask][0]
    p = 1 / (1 + np.exp(-xr @ ba_))
    print('Check: model A fitted P(white, 1965-80) = %.4f vs cell share %.4f' % (p, t9.query("eth=='NH white' and cohort=='Born 1965-80'")['retention'].iloc[0]))
    # Predicted retention by generation, model B, averaged over the sample (g-computation, weighted)
    rows = []
    Xb, nb2 = design(d, True)
    ok = dom & ~np.isnan(Xb).any(axis=1) & (d['w'].to_numpy() > 0)
    w = d['w'].to_numpy(float)
    for g, idx in [('1st gen (foreign-born)', nb2.index('1st gen (foreign-born)')), ('2nd gen', nb2.index('2nd gen')), ('3rd+ gen', None)]:
        Xg = Xb[ok].copy()
        Xg[:, nb2.index('1st gen (foreign-born)')] = 1.0 if g.startswith('1st') else 0.0
        Xg[:, nb2.index('2nd gen')] = 1.0 if g.startswith('2nd') else 0.0
        pr = 1 / (1 + np.exp(-Xg @ bb))
        rows.append(dict(generation=g, standardised_retention=float((w[ok] * pr).sum() / w[ok].sum())))
    t10 = pd.DataFrame(rows); t10.to_csv(HERE / 't10_standardised_by_generation.csv', index=False, float_format='%.4f')
    print('\nModel B standardised retention by generation (weighted g-computation, point estimates)')
    print(t10.to_string(index=False, float_format=lambda v: f'{v:.3f}'))


if __name__ == '__main__':
    main()
