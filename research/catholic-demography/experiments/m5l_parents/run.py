#!/usr/bin/env python3
"""Milestone 5b (eleventh GSS-only part): is the m5h model-check residual mixed-marriage transmission or missed fertility?

    python3 experiments/m5l_parents/run.py      # needs data/raw (data/download.sh or data/download_gssr.sh); about 5-10 minutes

Why. m5h's fertility channel assumes children are raised in their mother's religion, R = p rho / (p rho + 1 - p), with p
the Catholic share of the mothers' cohort (women of that cohort who are Catholic now) and rho the Catholic / non-Catholic
fertility ratio. Its model check (t26) failed for US-born adults born 1925-69: the raised-Catholic share R is 2.4 to 4.2
points above what p and rho imply. Two readings: (a) fertility the ratio misses (survivor bias, mothers who left the
Church between childbearing and interview), or (b) transmission: mixed marriages raised more children Catholic than the
mother's-religion rule gives. Until 1970 the Church required guarantees that all children of a mixed marriage be baptised
and brought up Catholic (1917 Code of Canon Law, canon 1061; relaxed by Paul VI's motu proprio *Matrimonia Mixta*, 1970),
which predicts (b) for cohorts born before about 1970. m5h then bounded the fertility channel by crediting the whole
residual to fertility; which reading is right matters for H4.

Data. The GSS asked US respondents their mother's and father's religion when they were children in 1988, 2008 and 2012
(`marelig`, `parelig`) and in the ISSP religion modules of 1991, 1998, 2008 and 2018 (`marelkid`, `parelkid`, with the
respondent's own `religkid`); codes 1 Protestant, 2 Catholic, ... (GSS codebook, read from the gssrdoc package). Mother's
religion = `marelkid`, else `marelig`. Sample: US-born adults (second and third-plus generation) with `relig16` and the
mother's religion, cohorts 1900-1999, all interviewed in person.

Decomposition. M = share of respondents whose mother was Catholic when they were children. Because each respondent is
one child, M already carries fertility (a mother with more children is reported more often) and survival. So, by cohort
group, R - M_model = (R - M) + (M - M_model), where M_model = m5h's per-respondent raised_share(p, rho) at cohort - 28:
- R - M is net transmission: children raised Catholic beyond those whose mother was Catholic (gains from Catholic fathers
  minus losses of children of Catholic mothers);
- M - M_model is what the fertility model misses about mothers (rho, p measured at interview not at childbearing).
Transmission table: P(raised Catholic | mother C & father C, mother C only, father C only, neither).
Transmission channel (an addition to m5h's accounting): each period's US-born adults are reweighted so that the raised-
Catholic share in each 5-year cohort is R - (R - M) of its cohort group (children raised in the mother's religion);
contribution = S - S'_T, for levels and the m5h period pairs. This takes R - M by cohort from the module years and assumes
it does not depend on survey year (m5i: upbringing reports are stable within person).
Intervals: 500-draw stratified PSU bootstrap over the whole file (seed 1); rho and p are re-estimated in every draw, and the
m5h main-spec channels are computed on the same draws so contrasts are paired.
Sensitivities (point estimates): R from `religkid` (ISSP years, same instrument as `marelkid`); third-plus generation only;
g = 24 and 32 for M_model. Added after the first full run (exploratory, not a prediction test): second generation only,
because the third-plus column showed most of M - M_model vanishing there.

Predictions, written before the first run:
P1. Net transmission is positive for cohorts born 1925-64: R - M between +1 and +4 points, interval excluding zero.
    Refuted if the interval includes zero or the estimate is negative.
P2. Mothers dominate in mixed couples: among cohorts 1925-64, P(raised C | mother C only) - P(raised C | father C only)
    > 0 with its interval excluding zero. Refuted otherwise.
P3. Net transmission is smaller for cohorts born 1965-99 than 1925-64 (after the 1970 rule change). Refuted if the
    1965-99 point estimate is at least as large (directional; this test has little power).
P4. Transmission is at least half of the m5h residual for 1925-64: (R - M) / (R - M_model) >= 0.5. Refuted if below 0.5.
P5. H4 stands: the transmission channel's contribution to the 1990-99 -> 2010-18 change in the Catholic share is smaller in
    absolute size than immigration's (+1.07 in m5h). Refuted if |transmission| >= immigration on the same draw's point
    estimate.
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
from cathdem import recode, accounting  # noqa: E402
from run import boot_idx  # noqa: E402  (m5a_decomp/run.py)

_spec = importlib.util.spec_from_file_location('m5h', HERE.parent / 'm5h_fertility' / 'run.py')
m5h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m5h)

GROUPS = [(1900, 1924), (1925, 1944), (1945, 1964), (1965, 1980), (1981, 1999)]
POOLS = [(1925, 1964), (1965, 1999)]
TGROUPS = [(1900, 1944), (1945, 1964), (1965, 1999), (1925, 1964)]
CELLS = ['both Catholic', 'mother only', 'father only', 'neither']


def lab(g):
    return f'{g[0]}-{g[1]}'


def prepare():
    raw = recode.load(cols=recode.COLS + ['marelkid', 'parelkid', 'religkid', 'marelig', 'parelig'])
    d = recode.recode(raw)
    d = d[d['w'] > 0].reset_index(drop=True)
    per = pd.Series('', index=d.index, dtype='object')
    for k, (lo, hi) in m5h.PER.items():
        per[d['year'].between(lo, hi)] = k
    d['per'] = per
    d['raised'] = (d['rel16'] == 'Catholic').astype(float)
    d['is_cath'] = (d['rel'] == 'Catholic').astype(float)
    d['adult'] = (d['age'] >= 18) & d['rel'].notna() & d['rel16'].notna() & d['gen'].notna() & (d['per'] != '') \
        & d['cohort'].notna()
    d['us'] = d['gen'].isin(['2nd gen', '3rd+ gen'])
    d['third'] = d['gen'] == '3rd+ gen'
    d['band'] = (d['cohort'].fillna(0) // 5 * 5).astype(int)
    ma = d['marelkid'].fillna(d['marelig'])
    pa = d['parelkid'].fillna(d['parelig'])
    d['mcath'] = (ma == 2).astype(float)
    d['fcath'] = (pa == 2).astype(float)
    d['has_pa'] = pa.notna()
    d['raised_kid'] = np.where(d['religkid'].notna(), (d['religkid'] == 2).astype(float), np.nan)
    d['module'] = (d['age'] >= 18) & d['us'] & d['rel16'].notna() & ma.notna() & d['cohort'].between(1900, 1999)
    cell = np.full(len(d), '', dtype=object)
    mc, fc = d['mcath'].to_numpy() == 1, d['fcath'].to_numpy() == 1
    cell[mc & fc] = CELLS[0]
    cell[mc & ~fc] = CELLS[1]
    cell[~mc & fc] = CELLS[2]
    cell[~mc & ~fc] = CELLS[3]
    cell[~d['has_pa'].to_numpy()] = ''
    d['cell'] = cell
    return d


def wmean(w, y, s):
    ws = w[s]
    return (ws * y[s]).sum() / ws.sum() if ws.sum() > 0 else np.nan


def stats(d, m, g=28, rcol='raised', extra=None):
    """Decomposition by cohort group, transmission table and the transmission channel. Returns dict key -> value."""
    w = d['w'].to_numpy() * m
    coh = d['cohort'].fillna(0).to_numpy()
    mod = d['module'].to_numpy()
    if extra is not None:
        mod = mod & extra
    R = d[rcol].to_numpy()
    mod = mod & ~np.isnan(R)
    M = d['mcath'].to_numpy()
    F = d['fcath'].to_numpy()
    rho, _ = m5h.rho_table(d, m, 'women', 'current', 'all')
    p = m5h.mothers_share(d, m)
    pc = np.clip(coh.astype(int) - g - m5h.Y0, 0, m5h.Y1 - m5h.Y0)
    Mmod = accounting.raised_share(p[pc], rho[pc])
    out = {}
    for gr in GROUPS + POOLS:
        s = mod & (coh >= gr[0]) & (coh <= gr[1])
        k = lab(gr)
        out[('decomp', k, 'n')] = float(s.sum())
        r, mm, mo, f = wmean(w, R, s), wmean(w, M, s), wmean(w, Mmod, s), wmean(w, F, s)
        out[('decomp', k, 'R raised Catholic')] = r
        out[('decomp', k, 'M mother Catholic')] = mm
        out[('decomp', k, 'father Catholic')] = f
        out[('decomp', k, 'M_model (m5h p, rho)')] = mo
        out[('decomp', k, 'R - M (net transmission)')] = r - mm
        out[('decomp', k, 'M - M_model (fertility model miss)')] = mm - mo
        out[('decomp', k, 'R - M_model (m5h residual)')] = r - mo
        out[('decomp', k, 'transmission share of residual')] = (r - mm) / (r - mo) if abs(r - mo) > 1e-9 else np.nan
        # gains and losses behind R - M
        out[('decomp', k, 'gain: raised C, mother not C')] = wmean(w, R * (1 - M), s)
        out[('decomp', k, 'loss: mother C, not raised C')] = wmean(w, (1 - R) * M, s)
    cell = d['cell'].to_numpy()
    for gr in TGROUPS:
        k = lab(gr)
        s0 = mod & (coh >= gr[0]) & (coh <= gr[1]) & (cell != '')
        for c in CELLS:
            s = s0 & (cell == c)
            out[('transmission', k, f'P(raised C | {c})')] = wmean(w, R, s)
            out[('transmission', k, f'n {c}')] = float(s.sum())
            out[('transmission', k, f'share of children: {c}')] = w[s].sum() / w[s0].sum()
        out[('transmission', k, 'mother only - father only')] = (out[('transmission', k, 'P(raised C | mother only)')]
                                                                - out[('transmission', k, 'P(raised C | father only)')])
    # transmission channel over the m5h periods
    delta = {}
    for gr in GROUPS:
        delta[gr] = out[('decomp', lab(gr), 'R - M (net transmission)')]
    a = d['adult'].to_numpy()
    us = d['us'].to_numpy()
    cath = d['is_cath'].to_numpy()
    raised = d['raised'].to_numpy()
    band = d['band'].to_numpy()
    per = d['per'].to_numpy()
    dl = np.zeros(len(d))
    for gr, v in delta.items():
        dl[(coh >= gr[0]) & (coh <= gr[1])] = v
    S, ST = {}, {}
    for P in m5h.PER:
        s = a & (per == P)
        ws, cs, rs, bs, uss, ds = w[s], cath[s], raised[s], band[s], us[s], dl[s]
        mult = np.ones(s.sum())
        for b in np.unique(bs[uss]):
            j = uss & (bs == b)
            Rc = (ws[j] * rs[j]).sum() / ws[j].sum()
            if not 0 < Rc < 1:
                continue
            Rp = np.clip(Rc - np.average(ds[j], weights=ws[j]), 1e-6, 1 - 1e-6)
            mult[j] = np.where(rs[j] == 1, Rp / Rc, (1 - Rp) / (1 - Rc))
        S[P] = (ws * cs).sum() / ws.sum()
        wt = ws * mult
        ST[P] = (wt * cs).sum() / wt.sum()
        out[('channel', P, 'transmission (level)')] = S[P] - ST[P]
    cf, _, _ = m5h.counterfactuals(d, m, m5h.MAIN)
    rows = m5h.summarise(cf)
    for A, B in m5h.PAIRS:
        k = f'{A} -> {B}'
        tr = (S[B] - S[A]) - (ST[B] - ST[A])
        out[('channel', k, 'transmission (change)')] = tr
        out[('channel', k, 'fertility (m5h main)')] = rows[('change', k, 'fertility')]
        out[('channel', k, 'immigration 1st gen (m5h main)')] = rows[('change', k, 'immigration (1st gen)')]
        out[('channel', k, 'immigration minus |transmission|')] = rows[('change', k, 'immigration (1st gen)')] - abs(tr)
    return out


def main():
    d = prepare()
    one = np.ones(len(d))
    pt = stats(d, one)
    sens = {'R from religkid (ISSP years)': stats(d, one, rcol='raised_kid'),
            'third-plus generation only': stats(d, one, extra=d['third'].to_numpy()),
            'second generation only (post hoc)': stats(d, one, extra=(d['gen'] == '2nd gen').to_numpy()),
            'g=24': stats(d, one, g=24), 'g=32': stats(d, one, g=32)}
    print(f"US-born adults with mother's religion: n={int(d['module'].sum())}; with father's too: "
          f"{int((d['module'] & d['has_pa']).sum())}")
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5L_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    for key, v in pt.items():
        count = key[2].startswith('n') and (key[2] == 'n' or key[2].startswith('n '))
        bs = np.array([b[key] for b in boots], float)
        lo, hi = (np.nan, np.nan) if count else np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if count or 'share of residual' in key[2] else 100
        row = dict(table=key[0], group=key[1], quantity=key[2], est=sc * v, lo=sc * lo, hi=sc * hi)
        for nm, sv in sens.items():
            row[nm] = sc * sv.get(key, np.nan)
        rows.append(row)
    t = pd.DataFrame(rows)
    pd.set_option('display.width', 250)
    pd.set_option('display.max_columns', 20)
    pd.set_option('display.max_rows', 500)
    for name, fn in (('decomp', 't32_decomposition.csv'), ('transmission', 't33_transmission.csv'),
                     ('channel', 't34_transmission_channel.csv')):
        tt = t[t['table'] == name].drop(columns='table')
        tt.to_csv(HERE / fn, index=False, float_format='%.4f')
        print(f'\n{fn} (percent or points; counts unweighted; shares as fractions; sensitivities are point estimates)')
        print(tt.round(3).to_string(index=False))


if __name__ == '__main__':
    main()
