#!/usr/bin/env python3
"""Milestone 5b (thirteenth GSS-only part): do children see bigger Catholic families than Catholic women report?

    python3 experiments/m5n_siblings/run.py   # needs data/raw (data/download.sh or data/download_gssr.sh); ~10-20 min

Why. m5m found that children of US-born parents (cohorts 1925-64) report their mothers 3.4 points more Catholic than the
fertility model says: M 26.2% against M_model 22.8%, with p and rho taken from US-born GSS women of the mothers' cohorts.
To close it with p_US the model would need a Catholic / other fertility ratio of 1.27, against the 1.05 measured from
GSS women aged 45+ (`childs`). Two readings: (a) "fertility understated": Catholic mothers had more children who survive
and report than GSS women's own completed fertility shows; (b) "p understated": the mothers were more Catholic than GSS
women of their cohort (the oldest women undercount Catholics, or mothers differ from all women).

Test, inside the GSS. Every respondent reports `sibs` (brothers and sisters ever born, living or dead, step and adopted
included), so k = sibs + 1 is the size of the family they come from, seen from the child's side, and is independent of
the mother's own survival or interview. A sample of children is size-biased: weighting each by 1/k recovers mothers with
at least one child (Preston 1976). In this release `sibs` is top-coded at 6 or more (22% of respondents) and `childs` at
8 or more, so two comparisons are made:

1. Cap-matched size-biased family size (no tail assumption). Children's side: SBc_X = mean of min(k, 7) among
   respondents whose mother had religion X (X = Catholic, other). Women's side: SBw_X = sum w k_c^2 / sum w k_c over GSS
   women 45+ of religion X in the mothers' cohort window, k_c = min(childs, 7), matched to each respondent at cohort - g.
   If women's reports understate Catholic fertility, SBc_C - SBw_C exceeds SBc_N - SBw_N (the diff-in-diff, DD).
2. Inversion to mothers (tail assumption): v = w / k_t with k_t = k for k <= 6 and k_t = t for the 7+ class (main t = 8,
   swept 7, 10, 12). M_mothers = Catholic share among mothers; rho_sib = Catholic / other mean children among mothers
   (both from children's reports; f(M_mothers, rho_sib) = M exactly). Women's side for the same mothers: P_m = Catholic
   share among GSS mothers 45+, rho_m = ratio of mean children among GSS mothers, v-weighted over the matched windows.
   The gap M - f(P_m, rho_m) is split (Shapley, two orders) into a share part (M_mothers vs P_m, reading b) and a ratio
   part (rho_sib vs rho_m, reading a).
Women's tables follow m5h/m5m: current religion, 10-year cohort window, at least 80 Catholic mothers (women 45+ with a
child) per window, else nearest covered window; US-born women (`born` 1, 1977+) for respondents with a US-born mother and
for both-parents-US-born respondents; all women, all years, for the pooled column. g = 28 (swept 24, 32 in m5h; not here).

Samples. Module: m5l's US-born adults with mother's religion (1988, 1991, 1998, 2008, 2012, 2018), with `sibs`; subsets
all, US-born mother (`parborn` 0, 1, 3), both parents US-born (`parborn` 0). Full file: US-born adults 18+ surveyed
1977-2024 with relig16 and sibs, raised Catholic (relig16) in place of mother Catholic, by 5-year cohort.
3. Channel. m5h's fertility channel rerun with a sibling-based rho: per respondent, rho = rho_sib_raised of their 5-year
   cohort band (full-file, main t; bands with fewer than 300 respondents keep m5h's rho) times the GSS motherhood ratio
   (share of Catholic women 45+ with a child / same for others, US-born women, at cohort - g), so it is comparable to
   m5h's rho, which includes childless women. Contribution to the 1990-99 -> 2010-18 change, against m5h main on the
   same draw, and immigration (1st gen, m5h) minus |fertility|.
Intervals: 500-draw stratified PSU bootstrap over the whole file (seed 1), women's tables re-estimated in every draw.

Predictions, written before the first run (the m5m numbers they refer to are on main):
P1. Reading (a) has support: both-parents-US-born respondents, cohorts 1925-64, DD > 0 with an interval excluding zero.
    Refuted if the interval includes zero or the estimate is negative.
P2. The ratio part is at least half of M - f(P_m, rho_m) for the same group (main t). Refuted if below half.
P3. Full file, US-born adults born 1925-64: rho_sib_raised >= 1.15 and rho_sib_raised - rho_m(US women) has an interval
    excluding zero. Refuted otherwise.
P4. H4 stands with the sibling-based rho: immigration minus |fertility| for 1990-99 -> 2010-18 has an interval
    excluding zero. Refuted otherwise.
P5. P1-P3's verdicts are the same at t = 7 and t = 12 (point estimates; P1 does not depend on t).
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
from cathdem import accounting, recode  # noqa: E402
from run import boot_idx  # noqa: E402  (m5a_decomp/run.py)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m5h = _load('m5h', HERE.parent / 'm5h_fertility' / 'run.py')
m5l = _load('m5l', HERE.parent / 'm5l_parents' / 'run.py')
m5m = _load('m5m', HERE.parent / 'm5m_mothers_nativity' / 'run.py')
Y0, Y1, L = m5h.Y0, m5h.Y1, m5h.Y1 - m5h.Y0 + 1
CAP = 7
TAILS = (7, 8, 10, 12)
MAIN_T = 8
G = 28
f = accounting.raised_share


def women_tables(d, m, mask):
    """Per mothers'-cohort index: P_m, rho_m, motherhood ratio, SBw_C, SBw_N (women 45+, current religion); filled."""
    c_all = d['cohort'].to_numpy()
    w_all = d['w'].to_numpy() * m
    ca = (d['rel'] == 'Catholic').to_numpy()
    q = mask & (d['sex'] == 2).to_numpy() & d['rel'].notna().to_numpy() & (c_all >= Y0) & (c_all <= Y1) \
        & (d['age'] >= 45).to_numpy() & d['childs_f'].notna().to_numpy()
    c, w, k, cc = c_all[q].astype(int) - Y0, w_all[q], d['childs_f'].to_numpy()[q], ca[q]
    kc = np.minimum(k, CAP)
    mom = k >= 1

    def sm(x, sel):
        return m5m._smooth(np.bincount(c[sel], weights=x[sel], minlength=L))
    s = {}
    for nm, sel in (('C', cc), ('N', ~cc)):
        s[nm + 'w'] = sm(w, sel)
        s[nm + 'mw'] = sm(w, sel & mom)          # mothers
        s[nm + 'k'] = sm(w * k, sel)
        s[nm + 'kc'] = sm(w * kc, sel)
        s[nm + 'kc2'] = sm(w * kc * kc, sel)
    nCm = m5m._smooth(np.bincount(c[cc & mom], minlength=L).astype(float))
    with np.errstate(invalid='ignore', divide='ignore'):
        P_m = s['Cmw'] / (s['Cmw'] + s['Nmw'])
        rho_m = (s['Ck'] / s['Cmw']) / (s['Nk'] / s['Nmw'])
        mr = (s['Cmw'] / s['Cw']) / (s['Nmw'] / s['Nw'])
        sbC, sbN = s['Ckc2'] / s['Ckc'], s['Nkc2'] / s['Nkc']
    ok = (nCm >= m5h.MIN_CATH_N) & np.isfinite(rho_m) & np.isfinite(P_m)
    return {nm: m5m._fill(x, ok) for nm, x in
            (('P_m', P_m), ('rho_m', rho_m), ('mr', mr), ('SBw_C', sbC), ('SBw_N', sbN))}, ok


def wmean(w, y, s):
    ws = w[s]
    return (ws * y[s]).sum() / ws.sum() if ws.sum() > 0 else np.nan


def children_side(w, k, X, s, tab, pc):
    """Children's-side quantities for selection s, X = 1 if mother (or upbringing) Catholic, matched women's side."""
    out = {}
    C, N = s & (X == 1), s & (X == 0)
    kc = np.minimum(k, CAP)
    out['SBc_C'], out['SBc_N'] = wmean(w, kc, C), wmean(w, kc, N)
    out['SBw_C'], out['SBw_N'] = wmean(w, tab['SBw_C'][pc], C), wmean(w, tab['SBw_N'][pc], N)
    out['SBc_C - SBw_C'] = out['SBc_C'] - out['SBw_C']
    out['SBc_N - SBw_N'] = out['SBc_N'] - out['SBw_N']
    out['DD'] = out['SBc_C - SBw_C'] - out['SBc_N - SBw_N']
    for t in TAILS:
        v = w / np.where(k >= CAP, t, k)
        Mm = v[C].sum() / v[s].sum()
        rs = (w[C].sum() / v[C].sum()) / (w[N].sum() / v[N].sum())
        Pm = (v[s] * tab['P_m'][pc][s]).sum() / v[s].sum()
        rm = (v[s] * tab['rho_m'][pc][s]).sum() / v[s].sum()
        tag = '' if t == MAIN_T else f' t={t}'
        gap = f(Mm, rs) - f(Pm, rm)
        share = 0.5 * ((f(Mm, rm) - f(Pm, rm)) + (f(Mm, rs) - f(Pm, rs)))
        out['M_mothers' + tag] = Mm
        out['P_m (GSS mothers)' + tag] = Pm
        out['M_mothers - P_m' + tag] = Mm - Pm
        out['rho_sib' + tag] = rs
        out['rho_m (GSS mothers)' + tag] = rm
        out['rho_sib - rho_m' + tag] = rs - rm
        out['gap M - f(P_m, rho_m)' + tag] = gap
        out['share part' + tag] = share
        out['ratio part' + tag] = gap - share
        out['ratio part fraction' + tag] = (gap - share) / gap if abs(gap) > 1e-9 else np.nan
    return out


def rho_sib_bands(d, w, k, base, t=MAIN_T):
    """Full-file rho_sib_raised by 5-year respondent band; NaN where fewer than 300 respondents."""
    band = d['band'].to_numpy()
    X = d['raised'].to_numpy()
    v = w / np.where(k >= CAP, t, k)
    out = {}
    for b in np.unique(band[base]):
        s = base & (band == b)
        C, N = s & (X == 1), s & (X == 0)
        if s.sum() < 300 or C.sum() == 0 or N.sum() == 0:
            continue
        out[b] = (w[C].sum() / v[C].sum()) / (w[N].sum() / v[N].sum())
    return out


def stats(d, m, channel=True):
    out = {}
    w = d['w'].to_numpy() * m
    coh = d['cohort'].fillna(0).to_numpy()
    k = d['sibs'].to_numpy() + 1
    hask = np.isfinite(k)
    k = np.where(hask, k, 1.0)
    pc = np.clip(d['cohort'].fillna(1950).to_numpy().astype(int) - G - Y0, 0, Y1 - Y0)
    born = d['born'].to_numpy()
    tabs = {'pooled': women_tables(d, m, np.ones(len(d), bool)), 'US': women_tables(d, m, born == 1)}
    pb = d['parborn'].to_numpy()
    nat = d['mnat'].to_numpy()
    mod = d['module'].to_numpy() & hask
    M = d['mcath'].to_numpy()
    for sub, sel, tk in (('all', np.ones(len(d), bool), 'pooled'), ('US mother', nat == 'US mother', 'US'),
                         ('both US-born', pb == 0, 'US')):
        for gr in m5l.GROUPS + m5l.POOLS:
            s = mod & sel & (coh >= gr[0]) & (coh <= gr[1])
            key = f'{sub} {m5l.lab(gr)}'
            out[('module', key, 'n')] = float(s.sum())
            out[('module', key, 'M mother Catholic')] = wmean(w, M, s)
            out[('module', key, 'share sibs 6+')] = wmean(w, (k >= CAP).astype(float), s)
            for q, v in children_side(w, k, M, s, tabs[tk][0], pc).items():
                out[('module', key, q)] = v
    # full file: US-born adults, 1977+, raised Catholic in place of mother Catholic
    ff = (d['age'] >= 18).to_numpy() & d['us'].to_numpy() & d['rel16'].notna().to_numpy() & \
        (d['year'] >= 1977).to_numpy() & hask
    X = d['raised'].to_numpy()
    for b0, b1 in [(b, b + 4) for b in range(1920, 2000, 5)] + [(1925, 1964), (1965, 1999)]:
        s = ff & (coh >= b0) & (coh <= b1)
        key = f'{b0}-{b1}'
        out[('full', key, 'n')] = float(s.sum())
        out[('full', key, 'R raised Catholic')] = wmean(w, X, s)
        cs = children_side(w, k, X, s, tabs['US'][0], pc)
        for q in ('SBc_C', 'SBc_N', 'SBw_C', 'SBw_N', 'DD', 'rho_sib', 'rho_m (GSS mothers)', 'rho_sib - rho_m',
                  'rho_sib t=7', 'rho_sib t=12'):
            out[('full', key, q.replace('rho_sib', 'rho_sib_raised', 1) if q.startswith('rho_sib') else q)] = cs[q]
    # women's tables at window centres
    for c in range(1890, 1961, 10):
        i = c - Y0
        for tk in ('pooled', 'US'):
            tab, ok = tabs[tk]
            for q in ('P_m', 'rho_m', 'mr', 'SBw_C', 'SBw_N'):
                out[('tables', str(c), f'{q} {tk}')] = tab[q][i]
            out[('tables', str(c), f'covered {tk}')] = float(ok[i])
    if channel:
        rb = rho_sib_bands(d, w, k, ff)
        cf, rho0, _ = m5h.counterfactuals(d, m, m5h.MAIN)
        band = d['band'].to_numpy()
        rs = np.array([rb.get(b, np.nan) for b in band])
        rg = np.where(np.isfinite(rs), rs * tabs['US'][0]['mr'][pc], rho0[pc])
        S, SF = m5m.fertility_gen(d, m, rg)
        rows = m5h.summarise(cf)
        for P in m5h.PER:
            out[('channel', P, 'fertility sibling rho (level)')] = S[P] - SF[P]
            out[('channel', P, 'fertility m5h main (level)')] = rows[('level', P, 'fertility')]
        for A, B in m5h.PAIRS:
            key = f'{A} -> {B}'
            fs = (S[B] - S[A]) - (SF[B] - SF[A])
            fm = rows[('change', key, 'fertility')]
            im = rows[('change', key, 'immigration (1st gen)')]
            out[('channel', key, 'fertility sibling rho (change)')] = fs
            out[('channel', key, 'fertility m5h main (change)')] = fm
            out[('channel', key, 'sibling minus m5h main')] = fs - fm
            out[('channel', key, 'immigration 1st gen (m5h)')] = im
            out[('channel', key, 'immigration minus |fertility sibling rho|')] = im - abs(fs)
    return out


def prepare():
    if 'sibs' not in recode.COLS:
        recode.COLS.append('sibs')   # m5l.prepare reads recode.COLS at call time
    d = m5m.prepare()
    return d


UNITLESS = ('rho', 'SB', 'DD', 'fraction', 'mr', 'covered')


def main():
    d = prepare()
    one = np.ones(len(d))
    pt = stats(d, one)
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5N_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    for key, v in pt.items():
        cnt = key[2] == 'n' or key[2].startswith('covered')
        bs = np.array([b.get(key, np.nan) for b in boots], float)
        lo, hi = (np.nan, np.nan) if cnt else np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if cnt or any(u in key[2] for u in UNITLESS) else 100
        rows.append(dict(table=key[0], group=key[1], quantity=key[2], est=sc * v, lo=sc * lo, hi=sc * hi))
    t = pd.DataFrame(rows)
    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 2000)
    for name, fn in (('tables', 't39_women_tables.csv'), ('module', 't40_module_siblings.csv'),
                     ('full', 't41_full_file_siblings.csv'), ('channel', 't42_fertility_sibling_rho.csv')):
        tt = t[t['table'] == name].drop(columns='table')
        tt.to_csv(HERE / fn, index=False, float_format='%.4f')
        print(f'\n{fn} (percent or points; rho, family sizes (SB, DD) and fractions as ratios or children; counts '
              'unweighted)')
        print(tt.round(3).to_string(index=False))


if __name__ == '__main__':
    main()
