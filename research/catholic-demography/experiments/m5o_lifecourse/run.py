#!/usr/bin/env python3
"""Milestone 5b (fourteenth GSS-only part): were the mothers more Catholic while raising their children than at 45+?

    python3 experiments/m5o_lifecourse/run.py   # needs data/raw (data/download.sh or data/download_gssr.sh); ~5-15 min

Why. m5n ruled out "Catholic mothers had more children than GSS women report": children's sibling counts agree with
women's own fertility. What is left of m5m's gap is the mothers' Catholic share. Among mothers (children weighted 1/k),
children of two US-born parents report 24.4% Catholic mothers (cohorts 1925-64; 1965-99 similar), against 20.8% of
US-born GSS mothers aged 45+ of the same cohorts: +3.5 [+2.1, +5.3] points. The women's side uses *current* religion at
interview, 45+, while the child reports the mother's religion *when the child was growing up*, roughly when she was
25-44. If women leave the Church between child-rearing and their late forties, the 45+ table understates the mothers'
Catholic share at the time that matters.

Test, inside the GSS (repeated cross-sections, so each cohort is seen at several ages in different survey years). Women's
tables as in m5n (US-born women, `born` 1, surveyed 1977+, with at least one child, current religion, 10-year cohort
window, at least 80 Catholic mothers per window, else the nearest covered window), computed for three age bands at
interview: 45+ (m5n), 25-44 (main child-rearing band) and 35-49 (sensitivity). For each band, P_m^A = Catholic share
among mothers, and R16^A = share raised Catholic (`relig16`) among the same mothers, so a fall in P_m with age at
constant R16 is net switching out, not a different population (mortality, recall of upbringing, sampling).
Children's side as m5n: module respondents (US-born, mother's religion asked), mothers recovered by weighting each child
by 1/k, k = sibs + 1, top class 7+ at t = 8. Each respondent is matched to the mothers' cohort window at cohort - 28.
For the younger bands, a respondent group is assessed only on matched windows the band actually covers; the share of
mother weight on filled (uncovered) windows is reported, and a group with more than 20% filled weight is not tested.
Respondent cohorts 1965-99 (mothers born about 1937-71, seen at 25-44 in 1977-2015) are the main test; cohorts 1925-64
(mothers born about 1897-1936) are mostly before the 25-44 band's coverage and are reported, not tested.
Also: a within-cohort table (window centres 1930-1975): P_m and R16 at 25-44 and 45+ in the same cohort window.
Intervals: 500-draw stratified PSU bootstrap over the whole file (seed 1), women's tables re-estimated in every draw.

Predictions, written before the first run (the m5n numbers they refer to are on main):
P1. Net switching out after child-rearing: for the mothers of both-parents-US-born respondents born 1965-99 (1/k
    weights, matched windows), P_m(25-44) - P_m(45+) > 0 with an interval excluding zero. Refuted otherwise.
P2. It closes most of the share gap: for the same group, M_mothers - P_m(25-44) is at most half of M_mothers - P_m(45+)
    (point estimates), and the reduction has an interval excluding zero. Refuted if more than half remains.
P3. It is switching, not a different population: for the same mothers, |R16(25-44) - R16(45+)| < 1 point (point
    estimate). Refuted if 1 point or more.
P4. P1 and P2's verdicts are the same with the 35-49 band in place of 25-44 (point estimates).
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


m5h = _load('m5h', HERE.parent / 'm5h_fertility' / 'run.py')
m5l = _load('m5l', HERE.parent / 'm5l_parents' / 'run.py')
m5m = _load('m5m', HERE.parent / 'm5m_mothers_nativity' / 'run.py')
m5n = _load('m5n', HERE.parent / 'm5n_siblings' / 'run.py')
Y0, Y1, L = m5h.Y0, m5h.Y1, m5h.Y1 - m5h.Y0 + 1
CAP, MAIN_T, G = m5n.CAP, m5n.MAIN_T, m5n.G
BANDS = {'45+': (45, 200), '25-44': (25, 44), '35-49': (35, 49)}
MAX_FILLED = 0.20
CENTRES = range(1930, 1976, 5)


def band_tables(d, m, lo, hi):
    """Per mothers'-cohort index: P_m (current Catholic) and R16 (raised Catholic) among US-born mothers aged lo-hi."""
    c_all = d['cohort'].to_numpy()
    w_all = d['w'].to_numpy() * m
    age = d['age'].to_numpy()
    q = (d['born'] == 1).to_numpy() & (d['year'] >= 1977).to_numpy() & (d['sex'] == 2).to_numpy() \
        & d['rel'].notna().to_numpy() & d['rel16'].notna().to_numpy() & (c_all >= Y0) & (c_all <= Y1) \
        & (age >= lo) & (age <= hi) & (d['childs_f'].to_numpy() >= 1)
    c, w = c_all[q].astype(int) - Y0, w_all[q]
    cc = (d['rel'] == 'Catholic').to_numpy()[q]
    rc = (d['rel16'] == 'Catholic').to_numpy()[q]

    def sm(x):
        return m5m._smooth(np.bincount(c, weights=x, minlength=L))
    W = sm(w)
    nC = m5m._smooth(np.bincount(c[cc], minlength=L).astype(float))
    with np.errstate(invalid='ignore', divide='ignore'):
        P, R = sm(w * cc) / W, sm(w * rc) / W
    ok = (nC >= m5h.MIN_CATH_N) & np.isfinite(P)
    return {'P_m': m5m._fill(P, ok), 'R16': m5m._fill(R, ok), 'P_raw': P, 'R_raw': R}, ok


def stats(d, m):
    out = {}
    w = d['w'].to_numpy() * m
    coh = d['cohort'].fillna(0).to_numpy()
    k = d['sibs'].to_numpy() + 1
    hask = np.isfinite(k)
    k = np.where(hask, k, 1.0)
    v_all = w / np.where(k >= CAP, MAIN_T, k)
    pc = np.clip(d['cohort'].fillna(1950).to_numpy().astype(int) - G - Y0, 0, Y1 - Y0)
    tabs = {b: band_tables(d, m, *r) for b, r in BANDS.items()}
    pb = d['parborn'].to_numpy()
    nat = d['mnat'].to_numpy()
    mod = d['module'].to_numpy() & hask
    M = d['mcath'].to_numpy()
    for sub, sel in (('both US-born', pb == 0), ('US mother', nat == 'US mother')):
        for gr in m5l.POOLS:
            s = mod & sel & (coh >= gr[0]) & (coh <= gr[1])
            key = f'{sub} {m5l.lab(gr)}'
            v = v_all
            Mm = v[s & (M == 1)].sum() / v[s].sum()
            out[(key, 'n')] = float(s.sum())
            out[(key, 'M_mothers')] = Mm
            for b, (tab, ok) in tabs.items():
                vs = v[s]
                out[(key, f'filled weight {b}')] = (vs * (~ok[pc][s])).sum() / vs.sum()
                for q in ('P_m', 'R16'):
                    out[(key, f'{q}({b})')] = (vs * tab[q][pc][s]).sum() / vs.sum()
                out[(key, f'M_mothers - P_m({b})')] = Mm - out[(key, f'P_m({b})')]
            for b in ('25-44', '35-49'):
                out[(key, f'P_m({b}) - P_m(45+)')] = out[(key, f'P_m({b})')] - out[(key, 'P_m(45+)')]
                out[(key, f'R16({b}) - R16(45+)')] = out[(key, f'R16({b})')] - out[(key, 'R16(45+)')]
                g45 = out[(key, 'M_mothers - P_m(45+)')]
                out[(key, f'gap left fraction {b}')] = out[(key, f'M_mothers - P_m({b})')] / g45 \
                    if abs(g45) > 1e-9 else np.nan
    for c in CENTRES:
        i = c - Y0
        for b, (tab, ok) in tabs.items():
            out[(f'window {c}', f'covered {b}')] = float(ok[i])
            out[(f'window {c}', f'P_m({b})')] = tab['P_raw'][i]
            out[(f'window {c}', f'R16({b})')] = tab['R_raw'][i]
        out[(f'window {c}', 'P_m(25-44) - P_m(45+)')] = tabs['25-44'][0]['P_raw'][i] - tabs['45+'][0]['P_raw'][i]
        out[(f'window {c}', 'R16(25-44) - R16(45+)')] = tabs['25-44'][0]['R_raw'][i] - tabs['45+'][0]['R_raw'][i]
    return out


def prepare():
    return m5n.prepare()


def unitless(q):
    return q == 'n' or q.startswith(('covered', 'filled', 'gap left'))


def main():
    d = prepare()
    pt = stats(d, np.ones(len(d)))
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5O_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    for key, v in pt.items():
        cnt = key[1] == 'n' or key[1].startswith('covered')
        bs = np.array([b.get(key, np.nan) for b in boots], float)
        lo, hi = (np.nan, np.nan) if cnt else np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if unitless(key[1]) else 100
        rows.append(dict(group=key[0], quantity=key[1], est=sc * v, lo=sc * lo, hi=sc * hi))
    t = pd.DataFrame(rows)
    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 2000)
    for name, fn, sel in (('module', 't43_mothers_by_age_band.csv', ~t['group'].str.startswith('window')),
                          ('within cohort', 't44_within_cohort_age.csv', t['group'].str.startswith('window'))):
        tt = t[sel]
        tt.to_csv(HERE / fn, index=False, float_format='%.4f')
        print(f'\n{fn} (percent or points; counts unweighted, coverage 0/1, filled weight and gap left as fractions)')
        print(tt.round(3).to_string(index=False))


if __name__ == '__main__':
    main()
