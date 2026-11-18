#!/usr/bin/env python3
"""Milestone 5b (twelfth GSS-only part): does giving immigrant mothers their own Catholic share close m5h's model check?

    python3 experiments/m5m_mothers_nativity/run.py   # needs data/raw (data/download.sh or data/download_gssr.sh); ~10-20 min

Why. m5h's fertility channel models the share of US-born adults raised Catholic as R = p rho / (p rho + 1 - p), with p the
Catholic share of US women in the mothers' cohort (cohort - g, 10-year window) and rho the Catholic / non-Catholic ratio
of completed fertility. Its model check failed: R is 2.4 to 4.2 points above the model for cohorts born 1925-69. m5l split
that residual with the mother's-religion items and found 18% of it is transmission (R - M) and most of the rest, M -
M_model, is that the mothers were more Catholic than the model's p, concentrated in the second generation: the model gives
the children of immigrant mothers the Catholic share of all US women of that cohort, and those mothers were about twice as
Catholic (post hoc). This step tests that reading with a model fixed in advance.

Mother's nativity, from `parborn` (gssrdoc codebook: 0 both born in the US, 1 mother yes / father no, 2 mother no / father
yes, 3 mother yes / father don't know, 4 mother no / father don't know, 5 mother don't know / father yes, 6 mother don't
know / father no, 7 both don't know, 8 neither born in the US): foreign-born mother = 2, 4, 8; US-born mother = 0, 1, 3;
unknown otherwise (5, 6, 7, missing). Note recode.py's `gen` puts 1, 2, 8 in the second generation; 4 and 6 (also one
parent foreign-born) are left out of `gen` there, which this step does not change.

Generation-specific model. p_X and rho_X are computed as in m5h (women; p = share Catholic now, any age, 10-year cohort
window, at least 300 women, else nearest covered window; rho = mean children ever born, women 45+, Catholic vs not,
at least 80 Catholic mothers, else nearest covered window) separately for X = foreign-born women (`born` = 2) and US-born
women (`born` = 1). Each US-born respondent gets M_gen = raised_share(p_X, rho_X) at cohort - g with X their mother's
nativity; unknown nativity keeps m5h's pooled p and rho. Note `born` is asked from 1977, so p_X and rho_X use 1977-2024;
the pooled model uses all years as in m5h. The foreign-born women in the GSS are immigrants of every arrival date who
survived to be interviewed, not exactly the mothers of the second generation; that is the substantive assumption tested.

Quantities (cohort groups as in m5l; pools 1925-64 and 1965-99):
1. Module decomposition (m5l's sample: US-born adults with mother's religion, n 5,714): R, M, M_model (pooled, m5l),
   M_gen; M - M_gen ("mothers miss" left after the fix), R - M_gen (residual left), R - M (transmission, unchanged), and the
   transmission share of the remaining residual. All, foreign-born mother, US-born mother.
2. Full-file model check (all US-born adults with relig16, 1977-2024 surveys, every cohort): R - R_model pooled vs
   R - R_gen, by 5-year cohort and pooled 1925-64. This is m5h's t26 check, now by mother's nativity.
3. Fertility channel with generation-specific rho: m5h's counterfactual reweighting, with R inverted within band x mother's
   nativity cells and each cell's own rho_X; contribution to the 1990-99 -> 2010-18 change against m5h main on the same
   draw, and immigration (1st gen, m5h) minus |fertility|.
Intervals: 500-draw stratified PSU bootstrap over the whole file (seed 1), p and rho re-estimated in every draw.
Sensitivities (point estimates): g = 24, 32; p from women raised Catholic instead of Catholic now.

Predictions, written before the first run (the m5l numbers they refer to are on main):
P1. For cohorts 1925-64 in the module sample, M - M_gen is within +/-1.0 point and its interval includes zero (m5l: M -
    M_model +2.64 [+1.03, +4.20]). Refuted if |estimate| > 1.0 or the interval excludes zero.
P2. Among children of foreign-born mothers, cohorts 1925-64, M_gen is within 8 points of M (m5l, second generation, all
    cohorts: model 24.7% vs observed 49.8%). Refuted if |M - M_gen| > 8.
P3. Full-file model check: pooled 1925-64, R - R_gen <= +1.5 points (m5h t26: 2.4 to 4.2 by 5-year cohort). Refuted if
    above 1.5.
P4. Catholic fertility excess is at least as large among foreign-born as US-born women for mothers' cohorts 1900-39:
    mean rho_FB - rho_US over the 1900-39 window centres >= 0 (directional, point estimate).
P5. H4 stands: fertility's contribution to the 1990-99 -> 2010-18 change with generation-specific rho moves by less than
    0.3 points from m5h main (-0.37) and immigration minus |fertility| has an interval excluding zero. Refuted otherwise.
"""
import importlib.util
import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / 'm5a_decomp'))
from cathdem import accounting  # noqa: E402
from run import boot_idx  # noqa: E402  (m5a_decomp/run.py)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m5h = _load('m5h', HERE.parent / 'm5h_fertility' / 'run.py')
m5l = _load('m5l', HERE.parent / 'm5l_parents' / 'run.py')
Y0, Y1, L = m5h.Y0, m5h.Y1, m5h.Y1 - m5h.Y0 + 1
WIN = np.ones(10)
NATS = ('FB mother', 'US mother')


def mother_nativity(parborn):
    pb = np.asarray(parborn, float)
    out = np.full(len(pb), '', dtype=object)
    out[np.isin(pb, [2, 4, 8])] = 'FB mother'
    out[np.isin(pb, [0, 1, 3])] = 'US mother'
    return out


def _smooth(v):
    return np.convolve(v, WIN, mode='full')[5:5 + L]  # window [c-5, c+4], as m5h


def _fill(x, ok):
    idx = np.where(ok)[0]
    out = x.copy()
    if len(idx) == 0:
        return out
    for i in range(L):
        if not ok[i]:
            out[i] = x[idx[np.argmin(np.abs(idx - i))]]
    return out


def p_rho(d, m, mask, prel='current'):
    """p[c] (women any age, share Catholic) and rho[c] (women 45+, Catholic/other mean children) over mask; filled."""
    c_all = d['cohort'].to_numpy()
    w_all = d['w'].to_numpy() * m
    relcol = d['rel'] if prel == 'current' else d['rel16']
    cath_all = (relcol == 'Catholic').to_numpy()
    base = mask & (d['sex'] == 2).to_numpy() & relcol.notna().to_numpy() & (c_all >= Y0) & (c_all <= Y1)
    # p
    q = base
    c, w, k = c_all[q].astype(int) - Y0, w_all[q], cath_all[q]
    num, den = _smooth(np.bincount(c, weights=w * k, minlength=L)), _smooth(np.bincount(c, weights=w, minlength=L))
    n = _smooth(np.bincount(c, minlength=L).astype(float))
    with np.errstate(invalid='ignore', divide='ignore'):
        p = num / den
    okp = (n >= 300) & np.isfinite(p)
    # rho (current religion as in m5h main for the mothers' fertility, whatever prel is for p)
    rc = (d['rel'] == 'Catholic').to_numpy()
    q = mask & (d['sex'] == 2).to_numpy() & d['rel'].notna().to_numpy() & (c_all >= Y0) & (c_all <= Y1) \
        & (d['age'] >= 45).to_numpy() & d['childs_f'].notna().to_numpy()
    c, w, kk, ca = c_all[q].astype(int) - Y0, w_all[q], d['childs_f'].to_numpy()[q], rc[q]
    sm = {}
    for nm, sel in (('C', ca), ('N', ~ca)):
        sm[nm + 'k'] = _smooth(np.bincount(c[sel], weights=(w * kk)[sel], minlength=L))
        sm[nm + 'w'] = _smooth(np.bincount(c[sel], weights=w[sel], minlength=L))
    nC = _smooth(np.bincount(c[ca], minlength=L).astype(float))
    with np.errstate(invalid='ignore', divide='ignore'):
        rho = (sm['Ck'] / sm['Cw']) / (sm['Nk'] / sm['Nw'])
    okr = (nC >= m5h.MIN_CATH_N) & np.isfinite(rho)
    return _fill(p, okp), _fill(rho, okr), okp, okr


def models(d, m, g=28, prel='current'):
    """Per-respondent pooled and generation-specific model shares raised Catholic, plus the tables behind them."""
    n = len(d)
    allm = np.ones(n, bool)
    if prel == 'current':
        p0 = m5h.mothers_share(d, m)
        rho0, _ = m5h.rho_table(d, m, 'women', 'current', 'all')
    else:
        p0, rho0, _, _ = p_rho(d, m, allm, prel)
    born = d['born'].to_numpy()
    tabs = {'pooled': (p0, rho0, None, None),
            'FB mother': p_rho(d, m, born == 2, prel),
            'US mother': p_rho(d, m, born == 1, prel)}
    pc = np.clip(d['cohort'].fillna(1950).to_numpy().astype(int) - g - Y0, 0, Y1 - Y0)
    mpool = accounting.raised_share(p0[pc], rho0[pc])
    mgen = mpool.copy()
    rgen = rho0[pc].copy()
    nat = d['mnat'].to_numpy()
    for X in NATS:
        j = nat == X
        p, rho = tabs[X][0], tabs[X][1]
        mgen[j] = accounting.raised_share(p[pc[j]], rho[pc[j]])
        rgen[j] = rho[pc[j]]
    return mpool, mgen, rgen, tabs


def wmean(w, y, s):
    ws = w[s]
    return (ws * y[s]).sum() / ws.sum() if ws.sum() > 0 else np.nan


def fertility_gen(d, m, rgen):
    """m5h's counterfactual reweighting, R inverted within band x mother's-nativity cells with each respondent's rho."""
    a, w = d['adult'].to_numpy(), d['w'].to_numpy() * m
    cath, raised, us = d['is_cath'].to_numpy(), d['raised'].to_numpy(), d['us'].to_numpy()
    per, band, nat = d['per'].to_numpy(), d['band'].to_numpy(), d['mnat'].to_numpy()
    S, SF = {}, {}
    for P in m5h.PER:
        s = a & (per == P)
        ws, cs, rs, bs, uss, ns, rr = w[s], cath[s], raised[s], band[s], us[s], nat[s], rgen[s]
        mult = np.ones(s.sum())
        for b in np.unique(bs[uss]):
            for X in ('FB mother', 'US mother', ''):
                j = uss & (bs == b) & (ns == X)
                if ws[j].sum() <= 0:
                    continue
                Rc = (ws[j] * rs[j]).sum() / ws[j].sum()
                if not 0 < Rc < 1:
                    continue
                Rp = accounting.equal_fertility_share(Rc, rr[j])
                mult[j] = np.where(rs[j] == 1, Rp / Rc, (1 - Rp) / (1 - Rc))
        S[P] = (ws * cs).sum() / ws.sum()
        wf = ws * mult
        SF[P] = (wf * cs).sum() / wf.sum()
    return S, SF


def stats(d, m, g=28, prel='current', channel=True):
    out = {}
    w = d['w'].to_numpy() * m
    coh = d['cohort'].fillna(0).to_numpy()
    mpool, mgen, rgen, tabs = models(d, m, g, prel)
    R, M, nat = d['raised'].to_numpy(), d['mcath'].to_numpy(), d['mnat'].to_numpy()
    mod = d['module'].to_numpy()
    for sub, sel in (('all', np.ones(len(d), bool)), ('FB mother', nat == 'FB mother'), ('US mother', nat == 'US mother')):
        for gr in m5l.GROUPS + m5l.POOLS:
            s = mod & sel & (coh >= gr[0]) & (coh <= gr[1])
            k = f'{sub} {m5l.lab(gr)}'
            r, mm, mp, mg = wmean(w, R, s), wmean(w, M, s), wmean(w, mpool, s), wmean(w, mgen, s)
            out[('module', k, 'n')] = float(s.sum())
            out[('module', k, 'R raised Catholic')] = r
            out[('module', k, 'M mother Catholic')] = mm
            out[('module', k, 'M_model pooled (m5h/m5l)')] = mp
            out[('module', k, 'M_gen (by mother nativity)')] = mg
            out[('module', k, 'M - M_model pooled')] = mm - mp
            out[('module', k, 'M - M_gen (mothers miss left)')] = mm - mg
            out[('module', k, 'R - M_gen (residual left)')] = r - mg
            out[('module', k, 'R - M (transmission)')] = r - mm
            out[('module', k, 'transmission share of residual left')] = (r - mm) / (r - mg) if abs(r - mg) > 1e-9 else np.nan
    # full-file model check, US-born adults surveyed 1977+ with relig16
    fs = (d['age'] >= 18).to_numpy() & d['us'].to_numpy() & d['rel16'].notna().to_numpy() & (d['year'] >= 1977).to_numpy()
    for b0, b1 in [(b, b + 4) for b in range(1920, 2000, 5)] + [(1925, 1964), (1965, 1999)]:
        s = fs & (coh >= b0) & (coh <= b1)
        k = f'{b0}-{b1}'
        r = wmean(w, R, s)
        out[('check', k, 'n')] = float(s.sum())
        out[('check', k, 'R')] = r
        out[('check', k, 'R - R_model pooled')] = r - wmean(w, mpool, s)
        out[('check', k, 'R - R_gen')] = r - wmean(w, mgen, s)
        out[('check', k, 'share with FB mother')] = wmean(w, (nat == 'FB mother').astype(float), s)
        out[('check', k, 'share mother nativity unknown')] = wmean(w, (nat == '').astype(float), s)
    # p and rho tables by nativity, at window centres
    for c in range(1880, 1981, 10):
        i = c - Y0
        for X in ('pooled',) + NATS:
            p, rho, okp, okr = tabs[X]
            out[('tables', str(c), f'p {X}')] = p[i]
            out[('tables', str(c), f'rho {X}')] = rho[i]
            if okp is not None:
                out[('tables', str(c), f'covered {X}')] = float(okp[i] and okr[i])
    dr = [tabs['FB mother'][1][c - Y0] - tabs['US mother'][1][c - Y0] for c in range(1900, 1940)]
    out[('tables', '1900-39', 'mean rho FB - rho US')] = float(np.mean(dr))
    if channel:
        S, SF = fertility_gen(d, m, rgen)
        cf, _, _ = m5h.counterfactuals(d, m, m5h.MAIN)
        rows = m5h.summarise(cf)
        for P in m5h.PER:
            out[('channel', P, 'fertility gen-specific (level)')] = S[P] - SF[P]
            out[('channel', P, 'fertility m5h main (level)')] = rows[('level', P, 'fertility')]
        for A, B in m5h.PAIRS:
            k = f'{A} -> {B}'
            fg = (S[B] - S[A]) - (SF[B] - SF[A])
            fm = rows[('change', k, 'fertility')]
            im = rows[('change', k, 'immigration (1st gen)')]
            out[('channel', k, 'fertility gen-specific (change)')] = fg
            out[('channel', k, 'fertility m5h main (change)')] = fm
            out[('channel', k, 'gen-specific minus m5h main')] = fg - fm
            out[('channel', k, 'immigration 1st gen (m5h)')] = im
            out[('channel', k, 'immigration minus |fertility gen-specific|')] = im - abs(fg)
    return out


def prepare():
    d = m5l.prepare()
    d['mnat'] = mother_nativity(d['parborn'])
    return d


def is_count(q):
    return q == 'n' or q.startswith('covered')


def main():
    d = prepare()
    one = np.ones(len(d))
    pt = stats(d, one)
    sens = {'g=24': stats(d, one, g=24, channel=False), 'g=32': stats(d, one, g=32, channel=False),
            'p = raised Catholic': stats(d, one, prel='raised', channel=False)}
    mod = d['module'].to_numpy()
    print('module sample by mother nativity (unweighted):',
          pd.Series(d['mnat'].to_numpy()[mod]).replace('', 'unknown').value_counts().to_dict())
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5M_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    for key, v in pt.items():
        cnt = is_count(key[2])
        bs = np.array([b.get(key, np.nan) for b in boots], float)
        lo, hi = (np.nan, np.nan) if cnt else np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if cnt or 'share of residual' in key[2] or 'rho' in key[2] else 100
        row = dict(table=key[0], group=key[1], quantity=key[2], est=sc * v, lo=sc * lo, hi=sc * hi)
        for nm, sv in sens.items():
            row[nm] = sc * sv.get(key, np.nan)
        rows.append(row)
    t = pd.DataFrame(rows)
    pd.set_option('display.width', 250)
    pd.set_option('display.max_columns', 20)
    pd.set_option('display.max_rows', 1000)
    for name, fn in (('tables', 't35_p_rho_by_nativity.csv'), ('module', 't36_module_by_nativity.csv'),
                     ('check', 't37_model_check_by_nativity.csv'), ('channel', 't38_fertility_gen.csv')):
        tt = t[t['table'] == name].drop(columns='table')
        tt.to_csv(HERE / fn, index=False, float_format='%.4f')
        print(f'\n{fn} (percent or points; rho as ratios; counts unweighted; shares of residual as fractions; '
              'sensitivities are point estimates)')
        print(tt.round(3).to_string(index=False))


if __name__ == '__main__':
    main()
