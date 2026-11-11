#!/usr/bin/env python3
"""Milestone 5b (seventh GSS-only part): fertility versus immigration as the channel that held the Catholic share up (H4).

    python3 experiments/m5h_fertility/run.py            # needs data/raw (data/download.sh); about 2-4 minutes

H4: immigration (first-generation Catholics) accounts for more of the stability of the US Catholic share between 1990-99
and 2010-18 than fertility does. Refuted if the accounting gives fertility the larger share.

Method (counterfactual reweighting, in the spirit of Hout, Greeley & Wilde 2001). Catholic share S = R r + (1-R) c (m5a).
- Fertility channel. Among US-born adults born in year b, the share raised Catholic R is, if children are raised in their
  mother's religion, R = p rho / (p rho + 1 - p), where p is the Catholic share of the mothers' generation and rho the
  Catholic / non-Catholic ratio of completed fertility in that generation. With equal fertility the share would be p, so
  R' = R / (R + rho (1 - R)). rho comes from the GSS itself: mean children ever born (`childs`, top-coded 8) among women
  aged 45+, Catholic vs not (current religion), pooled 1972-2024, in a 10-year window of birth cohorts centred on b - g
  (g = mean age of mother at birth; main 28, swept 24 and 32). Each US-born adult raised Catholic is reweighted by R'/R and
  each one not raised Catholic by (1-R')/(1-R), with R estimated per period x 5-year birth cohort; retention and conversion
  rates are left as observed. S'_F is the Catholic share under those weights. Foreign-born adults are not reweighted.
- Immigration channel. S'_I = the Catholic share among US-born adults (first generation dropped); a second version also
  drops the second generation (third-plus only), an upper bound since second-generation Catholics are also immigrant births.
- Contribution of channel X to the level: S - S'_X. To the change between two periods: dS - dS'_X (positive = held the
  share up). H4 is decided on the 1990-99 -> 2010-18 change, first-generation version, main specification.
Sensitivities (point estimates): g 24/32; rho from women and men; parent religion = raised Catholic instead of current;
rho from US-born parents only; and (added after the first full run, when the model check t26 showed the model
under-explains R by 2-4 points for cohorts born 1925-69) an upper bound that credits the whole gap between R and the
Catholic share of women in the mothers' cohort to fertility. Intervals: 500-draw stratified PSU bootstrap over the whole file (seed 1), so the
uncertainty in rho is carried through.

Prediction, written before running: the Catholic fertility excess was large among mothers born about 1915-1940 and gone
after about 1945 (Westoff & Jones 1979; Mosher et al. 1992; m1 found it reversed among white Catholics born 1965-80). Adults
in 1990-99 and 2010-18 are both mostly children of excess-fertility mothers, but by 2010-18 more are children of
post-convergence mothers, so the fertility contribution to the level is about 1-3 points in both periods and falls between
them: the fertility channel's contribution to the 1990-2018 change is near zero or negative. Immigration's is positive
(m5b: +1.6 points of raised-Catholic). So H4 is supported. If the fertility contribution to the change is the larger one,
H4 is refuted.
"""
import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / 'm5a_decomp'))
from cathdem import recode, accounting  # noqa: E402
from run import boot_idx, PER, PAIRS  # noqa: E402

Y0, Y1 = 1850, 2010          # cohort index range
MIN_CATH_N = 80              # unweighted Catholic mothers needed in a window, else nearest covered window
MAIN = dict(g=28, sex='women', prel='current', pnat='all')


def rho_table(d, m, sex, prel, pnat):
    """rho[c] = Catholic/non-Catholic mean children among people born in [c-5, c+4], aged 45+, plus coverage mask."""
    q = (d['age'] >= 45) & d['childs_f'].notna() & d['cohort'].between(Y0, Y1)
    if sex == 'women':
        q &= d['sex'] == 2
    if pnat == 'usborn':
        q &= d['born'] == 1
    cath = (d['rel'] if prel == 'current' else d['rel16']) == 'Catholic'
    q &= (d['rel'] if prel == 'current' else d['rel16']).notna()
    q = q.to_numpy()
    c = d['cohort'].to_numpy()[q].astype(int) - Y0
    w = (d['w'].to_numpy() * m)[q]
    k = d['childs_f'].to_numpy()[q]
    ca = cath.to_numpy()[q]
    L = Y1 - Y0 + 1
    sums = {}
    for nm, sel in (('C', ca), ('N', ~ca)):
        sums[nm + 'k'] = np.bincount(c[sel], weights=(w * k)[sel], minlength=L)
        sums[nm + 'w'] = np.bincount(c[sel], weights=w[sel], minlength=L)
    nC = np.bincount(c[ca], minlength=L).astype(float)
    win = np.ones(10)
    sm = {kk: np.convolve(v, win, mode='full')[5:5 + L] for kk, v in sums.items()}  # window [c-5, c+4]
    nCw = np.convolve(nC, win, mode='full')[5:5 + L]
    with np.errstate(invalid='ignore', divide='ignore'):
        rho = (sm['Ck'] / sm['Cw']) / (sm['Nk'] / sm['Nw'])
    ok = (nCw >= MIN_CATH_N) & np.isfinite(rho)
    idx = np.where(ok)[0]
    # nearest covered window for uncovered parent cohorts (clamp to the covered range)
    filled = rho.copy()
    for i in range(L):
        if not ok[i]:
            filled[i] = rho[idx[np.argmin(np.abs(idx - i))]]
    return filled, ok


def mothers_share(d, m):
    """Share of women (any age) born in [c-5, c+4] who are Catholic now; used by the upper-bound spec."""
    q = ((d['sex'] == 2) & d['rel'].notna() & d['cohort'].between(Y0, Y1)).to_numpy()
    c = d['cohort'].to_numpy()[q].astype(int) - Y0
    w = (d['w'].to_numpy() * m)[q]
    k = (d['rel'] == 'Catholic').to_numpy()[q]
    L = Y1 - Y0 + 1
    win = np.ones(10)
    num = np.convolve(np.bincount(c, weights=w * k, minlength=L), win, mode='full')[5:5 + L]
    den = np.convolve(np.bincount(c, weights=w, minlength=L), win, mode='full')[5:5 + L]
    n = np.convolve(np.bincount(c, minlength=L).astype(float), win, mode='full')[5:5 + L]
    with np.errstate(invalid='ignore', divide='ignore'):
        p = num / den
    ok = n >= 300
    idx = np.where(ok)[0]
    for i in range(L):
        if not ok[i]:
            p[i] = p[idx[np.argmin(np.abs(idx - i))]]
    return p


def counterfactuals(d, m, spec):
    """Return dict period -> dict(S, S_F, S_I1, S_I12, R_us, Rp_us, uncovered)."""
    rho, ok = rho_table(d, m, spec['sex'], spec['prel'], spec['pnat'])
    a = d['adult'].to_numpy()
    w = d['w'].to_numpy() * m
    cath = d['is_cath'].to_numpy()
    raised = d['raised'].to_numpy()
    us = d['us'].to_numpy()
    third = d['third'].to_numpy()
    per = d['per'].to_numpy()
    band = d['band'].to_numpy()
    pc = np.clip(d['cohort'].fillna(1950).to_numpy().astype(int) - spec['g'] - Y0, 0, Y1 - Y0)
    rr = rho[pc]
    pobs = mothers_share(d, m)[pc] if spec.get('bound') else None
    unc = ~ok[pc]
    out = {}
    for P in PER:
        s = a & (per == P)
        S = (w[s] * cath[s]).sum() / w[s].sum()
        mult = np.ones(s.sum())
        ws, rs, ps, bs, cs = w[s], raised[s], rr[s], band[s], cath[s]
        uss = us[s]
        Rcell = np.zeros(s.sum())
        for b in np.unique(bs[uss]):
            j = uss & (bs == b)
            Rcell[j] = (ws[j] * rs[j]).sum() / ws[j].sum()
        j = uss & (Rcell > 0) & (Rcell < 1)
        if spec.get('bound'):
            # Upper bound for the fertility channel: the whole gap between R and the mothers' observed Catholic share
            # (cohort-cell mean of p over members) is credited to fertility.
            pm = pobs[s][j]
            Rp = np.zeros(j.sum())
            bj = bs[j]
            for b in np.unique(bj):
                Rp[bj == b] = np.average(pm[bj == b], weights=ws[j][bj == b])
            Rp = np.clip(Rp, 1e-6, 1 - 1e-6)
        else:
            Rp = accounting.equal_fertility_share(Rcell[j], ps[j])
        mult[j] = np.where(rs[j] == 1, Rp / Rcell[j], (1 - Rp) / (1 - Rcell[j]))
        wf = ws * mult
        S_F = (wf * cs).sum() / wf.sum()
        R_us = (ws[uss] * rs[uss]).sum() / ws[uss].sum()
        Rp_us = (wf[uss] * rs[uss]).sum() / wf[uss].sum()
        S_I1 = (ws[uss] * cs[uss]).sum() / ws[uss].sum()
        t = third[s]
        S_I12 = (ws[t] * cs[t]).sum() / ws[t].sum()
        out[P] = dict(S=S, S_F=S_F, S_I1=S_I1, S_I12=S_I12, R_us=R_us, Rp_us=Rp_us,
                      uncovered=(ws[uss] * unc[s][uss]).sum() / ws[uss].sum())
    return out, rho, ok


def summarise(cf):
    rows = {}
    for P, v in cf.items():
        rows[('level', P, 'fertility')] = v['S'] - v['S_F']
        rows[('level', P, 'immigration (1st gen)')] = v['S'] - v['S_I1']
        rows[('level', P, 'immigration (1st+2nd gen)')] = v['S'] - v['S_I12']
        rows[('level', P, 'S')] = v['S']
        rows[('level', P, 'raised-Catholic gap R-Rprime, US-born')] = v['R_us'] - v['Rp_us']
    for a, b in PAIRS:
        dS = cf[b]['S'] - cf[a]['S']
        rows[('change', f'{a} -> {b}', 'dS')] = dS
        rows[('change', f'{a} -> {b}', 'fertility')] = dS - (cf[b]['S_F'] - cf[a]['S_F'])
        rows[('change', f'{a} -> {b}', 'immigration (1st gen)')] = dS - (cf[b]['S_I1'] - cf[a]['S_I1'])
        rows[('change', f'{a} -> {b}', 'immigration (1st+2nd gen)')] = dS - (cf[b]['S_I12'] - cf[a]['S_I12'])
        rows[('change', f'{a} -> {b}', 'immigration(1st) minus fertility')] = (
            rows[('change', f'{a} -> {b}', 'immigration (1st gen)')] - rows[('change', f'{a} -> {b}', 'fertility')])
    return rows


def main():
    raw = pd.read_stata(recode.RAW / recode.DTA, columns=recode.COLS, convert_categoricals=False)
    d = recode.recode(raw)
    d = d[d['w'] > 0].reset_index(drop=True)
    per = pd.Series(pd.NA, index=d.index, dtype='object')
    for k, (lo, hi) in PER.items():
        per[d['year'].between(lo, hi)] = k
    d['per'] = per.fillna('')
    d['raised'] = (d['rel16'] == 'Catholic').astype(float)
    d['is_cath'] = (d['rel'] == 'Catholic').astype(float)
    d['adult'] = (d['age'] >= 18) & d['rel'].notna() & d['rel16'].notna() & d['gen'].notna() & (d['per'] != '') \
        & d['cohort'].notna()
    d['us'] = d['gen'].isin(['2nd gen', '3rd+ gen'])
    d['third'] = d['gen'] == '3rd+ gen'
    d['band'] = (d['cohort'].fillna(0) // 5 * 5).astype(int)
    one = np.ones(len(d))

    print('rho: Catholic / non-Catholic mean children ever born, women 45+, 10-year windows centred on the cohort')
    rho, ok = rho_table(d, one, 'women', 'current', 'all')
    rows = []
    for c in range(1880, 1981, 5):
        i = c - Y0
        rows.append(dict(window_centre=c, rho=rho[i], covered=bool(ok[i])))
    rt = pd.DataFrame(rows)
    print(rt.round(3).to_string(index=False))
    rt.to_csv(HERE / 't24_rho_by_cohort.csv', index=False, float_format='%.4f')

    # Plausibility check of the mother-to-child model (point estimates): the Catholic share of mothers it implies for
    # US-born adults of each 5-year cohort (R' pooled over 1990-2024), against the share of women in the mothers' cohort
    # window (b-28, 10 years) who are Catholic now or were raised Catholic, from the same file.
    a = d['adult'] & d['us'] & d['cohort'].between(1920, 1999)
    rows = []
    for b in range(1920, 2000, 5):
        s = a & (d['band'] == b)
        R = (d.loc[s, 'w'] * d.loc[s, 'raised']).sum() / d.loc[s, 'w'].sum()
        c = b + 2 - MAIN['g']
        p_imp = float(accounting.equal_fertility_share(R, rho[c - Y0]))
        mw = (d['sex'] == 2) & d['cohort'].between(c - 5, c + 4) & d['rel'].notna() & d['rel16'].notna()
        ww = d.loc[mw, 'w']
        rows.append(dict(cohort=f'{b}-{b+4}', n=int(s.sum()), R=R, rho=rho[c - Y0], p_implied=p_imp,
                         mothers_cohort=f'{c-5}-{c+4}', women_catholic_now=(ww * d.loc[mw, 'is_cath']).sum() / ww.sum(),
                         women_raised_catholic=(ww * d.loc[mw, 'raised']).sum() / ww.sum(), n_women=int(mw.sum())))
    pc_t = pd.DataFrame(rows)
    pc_t.to_csv(HERE / 't26_model_check.csv', index=False, float_format='%.4f')
    print('\nModel check: implied Catholic share of mothers vs women in the mothers\' cohort (all pooled years)')
    print(pc_t.round(3).to_string(index=False))

    specs = {'main (g=28, women, current religion)': MAIN,
             'g=24': {**MAIN, 'g': 24}, 'g=32': {**MAIN, 'g': 32},
             'women and men': {**MAIN, 'sex': 'all'},
             'parent religion = raised Catholic': {**MAIN, 'prel': 'raised'},
             'US-born mothers only': {**MAIN, 'pnat': 'usborn'},
             'upper bound: residual credited to fertility': {**MAIN, 'bound': True}}
    pts = {}
    for name, sp in specs.items():
        cf, _, _ = counterfactuals(d, one, sp)
        pts[name] = summarise(cf)
        if name.startswith('main'):
            print('\nMain specification, levels by period (percent)')
            for P, v in cf.items():
                print(f"{P}: S {100*v['S']:.2f}  S_F {100*v['S_F']:.2f}  S_I1 {100*v['S_I1']:.2f}  S_I12 {100*v['S_I12']:.2f}  "
                      f"R_us {100*v['R_us']:.2f}  R'_us {100*v['Rp_us']:.2f}  US-born weight with uncovered mother cohort "
                      f"{100*v['uncovered']:.1f}%")

    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5H_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = []
    for i in range(B):
        cf, _, _ = counterfactuals(d, boot_idx(st, ps, rng), MAIN)
        boots.append(summarise(cf))
    keys = list(pts[next(iter(specs))].keys())
    out = []
    for k in keys:
        bs = np.array([b[k] for b in boots])
        lo, hi = np.percentile(bs, [2.5, 97.5])
        row = dict(kind=k[0], period=k[1], quantity=k[2], est=100 * pts[next(iter(specs))][k], lo=100 * lo, hi=100 * hi)
        for name in list(specs)[1:]:
            row[name] = 100 * pts[name][k]
        out.append(row)
    t = pd.DataFrame(out)
    t.to_csv(HERE / 't25_fertility_vs_immigration.csv', index=False, float_format='%.3f')
    pd.set_option('display.width', 250)
    pd.set_option('display.max_columns', 20)
    print('\nContributions, percentage points of the adult Catholic share (main spec with 95% bootstrap interval; '
          'sensitivity columns are point estimates)')
    print(t.round(2).to_string(index=False))


if __name__ == '__main__':
    main()
