#!/usr/bin/env python3
"""Milestone 5b, sixteenth GSS-only step: is m5o's switching difference P_m(25-44) - P_m(45+) also cohort mix?

    python3 experiments/m5q_cohort_std_switching/run.py   # needs data/raw (data/download_gssr.sh) and pyreadr; ~3-8 min

Why. m5o compared US-born GSS mothers' current Catholic share (P_m) at 25-44 and at 45+ within 10-year mothers'-cohort
windows, weighting the windows by the mothers of children who report their mother's religion (respondents born 1965-99,
both parents US-born, child weight 1/k, matched at cohort - 28). It found P_m(25-44) - P_m(45+) = +3.7 [2.1, 5.4] and
raised-Catholic R16(25-44) - R16(45+) = +2.4 [0.7, 4.2]. m5p then showed the R16 difference is mostly cohort mix: inside
a 10-year window the 25-44 band (surveys 1977+) holds the window's later cohorts and the 45+ band its earlier ones, and
with each single-year cohort compared with itself the R16 difference falls to +0.3 to +0.7. m5p left P_m untested. If
the P_m difference is also mostly cohort mix, m5o's "women leave between child-rearing and their late forties" reading
loses its support, and so does its account of most of m5m's mothers' share gap.

Estimands. Women as m5o (US-born, `born` 1, surveyed 1977+, at least one child, current religion and `relig16` known).
For each single-year mothers' cohort c with weight in both bands: D_P(c) = P_m(25-44, c) - P_m(45+, c), D_R(c) = the same
for R16, and D_S(c) = D_P(c) - D_R(c), the fall in current Catholic share not matched by a fall in reported upbringing
(net switching out, net of reporting drift and of composition that moves both). Averages over c with two weightings:
  child  m5o's weighting: each single-year cohort gets the 1/k mother weight of its matched respondents (both parents
         US-born, cohorts 1965-99, i.e. mothers 1937-71), so the comparison is m5o's with the within-window mix removed;
  own    each cohort 1937-71 weighted by its total survey weight in the two bands, as m5p.
Also the weighted mean age difference (25-44 minus 45+) under each, and, as a consistency check, m5o's own 10-year
window numbers recomputed by m5o's code on the same file. Survey years 1977-2024 all modes (m5o's) and 1977-2018 (in
person only). Gap accounting as m5o, under child weights: M_mothers from m5o; P_m(45+) single-year (all matched
cohorts are covered at 45+); P_m*(25-44) = P_m(45+) + mean D_P; gap left fraction = (M - P_m*) / (M - P_m(45+)).
Intervals: 500-draw stratified PSU bootstrap over the file (seed 1), everything re-estimated in every draw.

Predictions, written before the first run (m5o and m5p numbers are on main):
P1. Switching survives standardisation: under child weights, 1977-2024, mean D_P > 0 with an interval excluding zero.
    Refuted otherwise. (Reasoning: m5o's window tables show P_m(45+) nearly flat across cohorts 1930-1960, 22-24%,
    while R16 rises with cohort, so the within-window mix should bias P_m much less than R16.)
P2. It keeps most of its size: the child-weighted mean D_P, 1977-2024, is at least half of m5o's +3.71 (>= 1.85,
    point estimate). Refuted below.
P3. It is net switching, not reporting: under own weights, 1977-2018, mean D_S > 0 with an interval excluding zero.
    Refuted otherwise.
P4. m5o's gap accounting stands: under child weights, 1977-2024, the gap left fraction is at most 0.5 (point estimate),
    i.e. P_m at child-rearing ages closes at least half of M_mothers - P_m(45+). Refuted above 0.5.
Limits stated in advance. Age and survey year move together within a cohort, so D_P is age plus period change for the
same cohort; m5p's panel drift (-0.08 points a year on R16) is the only check on reporting and covers R16 alone, which is
why D_S nets out R16. Single-year cells at 45+ for cohorts after about 1965 come only from 2010+ surveys and are small;
the averages carry that noise and the intervals show it. Mortality selection by religion between 45 and older ages is
not modelled (the 45+ band has no upper age cap, as m5o).
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
from run import boot_idx  # noqa: E402  (m5a_decomp/run.py)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m5o = _load('m5o', HERE.parent / 'm5o_lifecourse' / 'run.py')
m5l, m5n = m5o.m5l, m5o.m5n
CAP, MAIN_T, G = m5o.CAP, m5o.MAIN_T, m5o.G
RESP = (1965, 1999)
MOTH = (RESP[0] - G, RESP[1] - G)   # 1937-71
YEARS = {'1977-2024 all modes': (1977, 2024), '1977-2018': (1977, 2018)}
M5O_DP = 0.03707   # m5o t43, both US-born 1965-1999, P_m(25-44) - P_m(45+), as a fraction


def cell_tables(d, m, y0, y1):
    """Per single-year cohort (index cohort - MOTH[0]): weighted P_m, R16, age and weight in each band."""
    L = MOTH[1] - MOTH[0] + 1
    coh = d['cohort'].to_numpy()
    yr = d['year'].to_numpy()
    age = d['age'].to_numpy(float)
    w = d['w'].to_numpy() * m
    q = (d['born'] == 1).to_numpy() & (yr >= y0) & (yr <= y1) & (d['sex'] == 2).to_numpy() \
        & d['rel'].notna().to_numpy() & d['rel16'].notna().to_numpy() & (d['childs_f'].to_numpy() >= 1) \
        & (coh >= MOTH[0]) & (coh <= MOTH[1]) & np.isfinite(age)
    cc = (d['rel'] == 'Catholic').to_numpy().astype(float)
    rc = (d['rel16'] == 'Catholic').to_numpy().astype(float)
    out = {}
    for b, (lo, hi) in (('young', (25, 44)), ('old', (45, 200))):
        s = q & (age >= lo) & (age <= hi)
        c = coh[s].astype(int) - MOTH[0]
        W = np.bincount(c, weights=w[s], minlength=L)
        with np.errstate(invalid='ignore', divide='ignore'):
            out[b] = dict(W=W, P=np.bincount(c, weights=(w * cc)[s], minlength=L) / W,
                          R=np.bincount(c, weights=(w * rc)[s], minlength=L) / W,
                          A=np.bincount(c, weights=(w * age)[s], minlength=L) / W,
                          n=np.bincount(c, minlength=L))
    return out


def child_weights(d, m):
    """m5o's mother weight per single-year mothers' cohort (both parents US-born, respondents 1965-99, 1/k), and M."""
    L = MOTH[1] - MOTH[0] + 1
    w = d['w'].to_numpy() * m
    coh = d['cohort'].fillna(0).to_numpy()
    k = d['sibs'].to_numpy() + 1
    hask = np.isfinite(k)
    k = np.where(hask, k, 1.0)
    v = w / np.where(k >= CAP, MAIN_T, k)
    s = d['module'].to_numpy() & hask & (d['parborn'].to_numpy() == 0) & (coh >= RESP[0]) & (coh <= RESP[1])
    M = d['mcath'].to_numpy()
    mc = coh[s].astype(int) - G - MOTH[0]
    cw = np.bincount(mc, weights=v[s], minlength=L)
    Mm = v[s & (M == 1)].sum() / v[s].sum()
    return cw, Mm


def wavg(x, wt):
    ok = np.isfinite(x) & (wt > 0)
    return (x[ok] * wt[ok]).sum() / wt[ok].sum() if ok.any() else np.nan


def stats(d, m):
    out = {}
    cw, Mm = child_weights(d, m)
    out[('child', 'all', 'M_mothers')] = Mm
    for ylab, (y0, y1) in YEARS.items():
        t = cell_tables(d, m, y0, y1)
        yo, ol = t['young'], t['old']
        both = (yo['W'] > 0) & (ol['W'] > 0)
        dP, dR, dA = yo['P'] - ol['P'], yo['R'] - ol['R'], yo['A'] - ol['A']
        dS = dP - dR
        for wname, wt in (('child', cw), ('own', yo['W'] + ol['W'])):
            wt = np.where(both, wt, 0.0)
            tot = cw.sum() if wname == 'child' else (yo['W'] + ol['W']).sum()
            out[(wname, ylab, 'weight share on cohorts with both bands')] = wt.sum() / tot
            out[(wname, ylab, 'D_P = P_m(25-44) - P_m(45+)')] = wavg(dP, wt)
            out[(wname, ylab, 'D_R = R16(25-44) - R16(45+)')] = wavg(dR, wt)
            out[(wname, ylab, 'D_S = D_P - D_R')] = wavg(dS, wt)
            out[(wname, ylab, 'age difference (years)')] = wavg(dA, wt)
            for lab, (a, b) in (('1937-49', (1937, 1949)), ('1950-59', (1950, 1959)), ('1960-71', (1960, 1971))):
                sel = np.zeros_like(wt)
                sel[a - MOTH[0]:b - MOTH[0] + 1] = 1
                out[(wname, ylab, f'D_P cohorts {lab}')] = wavg(dP, wt * sel)
                out[(wname, ylab, f'D_S cohorts {lab}')] = wavg(dS, wt * sel)
                if wname == 'child':
                    out[(wname, ylab, f'weight share cohorts {lab}')] = (wt * sel).sum() / wt.sum()
        P45 = wavg(ol['P'], np.where(ol['W'] > 0, cw, 0.0))
        out[('child', ylab, 'P_m(45+) single-year')] = P45
        Pst = P45 + out[('child', ylab, 'D_P = P_m(25-44) - P_m(45+)')]
        out[('child', ylab, 'P_m*(25-44) = P_m(45+) + D_P')] = Pst
        out[('child', ylab, 'M_mothers - P_m(45+)')] = Mm - P45
        out[('child', ylab, 'M_mothers - P_m*(25-44)')] = Mm - Pst
        out[('child', ylab, 'gap left fraction')] = (Mm - Pst) / (Mm - P45) if abs(Mm - P45) > 1e-9 else np.nan
        if ylab == '1977-2018':
            continue
        # consistency check: m5o's 10-year window numbers, recomputed by m5o's code
        mo = m5o.stats(d, m)
        key = f'both US-born {m5l.lab(RESP)}'
        out[('m5o windows', ylab, 'D_P = P_m(25-44) - P_m(45+)')] = mo[(key, 'P_m(25-44) - P_m(45+)')]
        out[('m5o windows', ylab, 'D_R = R16(25-44) - R16(45+)')] = mo[(key, 'R16(25-44) - R16(45+)')]
        out[('m5o windows', ylab, 'D_S = D_P - D_R')] = mo[(key, 'P_m(25-44) - P_m(45+)')] \
            - mo[(key, 'R16(25-44) - R16(45+)')]
        out[('m5o windows', ylab, 'gap left fraction')] = mo[(key, 'gap left fraction 25-44')]
        out[('cohort mix', ylab, 'D_P: m5o windows - single-year child')] = \
            mo[(key, 'P_m(25-44) - P_m(45+)')] - out[('child', ylab, 'D_P = P_m(25-44) - P_m(45+)')]
        out[('cohort mix', ylab, 'D_R: m5o windows - single-year child')] = \
            mo[(key, 'R16(25-44) - R16(45+)')] - out[('child', ylab, 'D_R = R16(25-44) - R16(45+)')]
    return out


def cells(d):
    """Point-estimate per-cohort table (1977-2024): n, P_m, R16 in each band, and the child weight share."""
    m = np.ones(len(d))
    t = cell_tables(d, m, *YEARS['1977-2024 all modes'])
    cw, _ = child_weights(d, m)
    yo, ol = t['young'], t['old']
    return pd.DataFrame(dict(cohort=np.arange(MOTH[0], MOTH[1] + 1), n_25_44=yo['n'], n_45p=ol['n'],
                             P_25_44=100 * yo['P'], P_45p=100 * ol['P'], R_25_44=100 * yo['R'], R_45p=100 * ol['R'],
                             D_P=100 * (yo['P'] - ol['P']), D_S=100 * ((yo['P'] - ol['P']) - (yo['R'] - ol['R'])),
                             child_weight_share=cw / cw.sum()))


def unitless(q):
    return q.startswith(('weight share', 'gap left', 'age difference'))


def main():
    d = m5o.prepare()
    pt = stats(d, np.ones(len(d)))
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5Q_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    for key, v in pt.items():
        bs = np.array([b.get(key, np.nan) for b in boots], float)
        lo, hi = np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if unitless(key[2]) else 100
        rows.append(dict(weights=key[0], years=key[1], quantity=key[2], est=sc * v, lo=sc * lo, hi=sc * hi))
    t = pd.DataFrame(rows)
    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 2000)
    t.to_csv(HERE / 't47_cohort_std_switching.csv', index=False, float_format='%.4f')
    print(f't47 single-year cohort standardisation of m5o (points; weight shares, gap left as fractions; age in years); '
          f'{B}-draw PSU bootstrap, seed 1')
    print(t.round(3).to_string(index=False))
    c = cells(d)
    c.to_csv(HERE / 't48_cohort_cells.csv', index=False, float_format='%.4f')
    print('\nt48 per-cohort cells, 1977-2024 all modes (percent; counts unweighted; point estimates)')
    print(c.round(2).to_string(index=False))


if __name__ == '__main__':
    main()
