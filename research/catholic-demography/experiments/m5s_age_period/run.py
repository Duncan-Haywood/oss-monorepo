#!/usr/bin/env python3
"""Milestone 5b, eighteenth GSS-only step: is the fall in reported Catholic upbringing at young ages a mid-life drift or a
1977-94 period effect?

    python3 experiments/m5s_age_period/run.py   # needs data/raw/gssr (data/download_gssr.sh) and pyreadr; ~1-3 min

Why. m5r found that for mothers born 1937-49 the within-cohort fall in "raised Catholic" (`relig16`) sits at ages 25-44
(slope -0.36 points per year of age), interviews that all fall in 1977-94, while from 45 on their share is flat in both
the cross-sections and the 2006-10 panels. Within one cohort, age and survey year move together, so the same slope is
either (A) an age effect, a re-reporting drift in mid-life, or (P) a period effect, everybody's reported upbringing
shifting across the 1977-94 surveys (question context, sampling frame, a changing public meaning of "raised Catholic").

Design. The two readings disagree about other people interviewed in the same years. Under (P) the shift touches every
age in 1977-94, so older adults interviewed at 57-79 in those same surveys (cohorts born about 1898-1937) would show a
within-cohort fall of similar size. Under (A) they would not, since m5r found no drift at 57-77 in its cohorts. And under
(A) cohorts observed at 25-44 in a later era (1995-2018) would show the young-age fall again.

Estimand. The within-cohort slope of raised-Catholic (0/1, `relig16` = Catholic) on age, with single-year birth-cohort
fixed effects (m5p's `within_slope`), weighted (`wtssps` as prepared by m5o), points per year of age. Inside a cohort
this is also the slope on survey year. Cells: US-born (`born` = 1), `relig16` known, by age segment (25-44, 45-56,
57-79) and era (1977-94, 1995-2018; in person only, so the 2021-24 web surveys are left out), for all US-born adults
(main), women, and mothers (women with at least one child). 500-draw stratified PSU bootstrap over the whole file
(seed 1), everything re-estimated in each draw; intervals are bootstrap percentiles.

Predictions, written before the first run (all adults, unless named):
P1. No 1977-94 period effect at old ages: slope at 57-79 in 1977-94 has an interval that includes zero and a point
    estimate above -0.15. Refuted if the interval lies below zero or the point is at or below -0.15.
P2. Main test, age-specific drift: within 1977-94, slope at 25-44 minus slope at 57-79 is negative with an interval
    below zero. Refuted if the interval includes zero or the difference is positive.
P3. Old-age slopes do not depend on era: slope at 57-79, 1977-94 minus 1995-2018, interval includes zero. Refuted if it
    excludes zero.
P4. The young-age fall recurs in the later era: slope at 25-44 in 1995-2018 is negative (point), and its difference
    from the 1977-94 slope at 25-44 has an interval including zero. Refuted if the point is >= 0 or the interval
    excludes zero.
Women and mothers, the 45-56 segment and the mothers-1937-49 cell (m5r's) are reported without predictions.
Limits stated in advance. The design assumes a period effect, if any, is the same at all ages; an age-specific period
effect (only young adults' answers changing in 1977-94) cannot be told from (A). Cohorts differ across cells, so a
slope that varies by cohort would look like an era or age difference. Linear slopes inside segments.
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
m5p = _load('m5p', HERE.parent / 'm5p_recall_drift' / 'run.py')

ERAS = {'1977-94': (1977, 1994), '1995-2018': (1995, 2018)}
SEGS = {'25-44': (25, 44), '45-56': (45, 56), '57-79': (57, 79)}
CONTRASTS = [  # (name, cell a, cell b): a - b
    ('P2 1977-94: 25-44 - 57-79', ('25-44', '1977-94'), ('57-79', '1977-94')),
    ('P3 57-79: 1977-94 - 1995-2018', ('57-79', '1977-94'), ('57-79', '1995-2018')),
    ('P4 25-44: 1995-2018 - 1977-94', ('25-44', '1995-2018'), ('25-44', '1977-94')),
    ('1995-2018: 25-44 - 57-79', ('25-44', '1995-2018'), ('57-79', '1995-2018')),
    ('45-56: 1977-94 - 1995-2018', ('45-56', '1977-94'), ('45-56', '1995-2018')),
]


def arrays(d):
    age = d['age'].to_numpy(float)
    coh = d['cohort'].to_numpy(float)
    ok = (d['born'] == 1).to_numpy() & d['rel16'].notna().to_numpy() & np.isfinite(age) & np.isfinite(coh)
    fem = (d['sex'] == 2).to_numpy()
    groups = {'all adults': ok, 'women': ok & fem, 'mothers': ok & fem & (d['childs_f'].to_numpy() >= 1)}
    cc = np.where(np.isfinite(coh), coh, 0).astype(int) - 1880
    return dict(age=age, coh=coh, cc=cc, yr=d['year'].to_numpy(), w=d['w'].to_numpy(float),
                rc=(d['rel16'] == 'Catholic').to_numpy().astype(float), groups=groups)


def stats(A, m):
    out = {}
    w = A['w'] * m
    age, yr, cc, rc = A['age'], A['yr'], A['cc'], A['rc']
    for g, ok in A['groups'].items():
        for elab, (y0, y1) in ERAS.items():
            for slab, (a0, a1) in SEGS.items():
                s = ok & (yr >= y0) & (yr <= y1) & (age >= a0) & (age <= a1)
                out[(g, slab, elab, 'slope')] = m5p.within_slope(rc[s], age[s], cc[s], w[s])
                if m is A['one']:
                    out[(g, slab, elab, 'n')] = int(s.sum())
                    ws = w[s]
                    out[(g, slab, elab, 'raised Catholic %')] = (ws * rc[s]).sum() / ws.sum()
                    out[(g, slab, elab, 'cohorts')] = f'{int(A["coh"][s].min())}-{int(A["coh"][s].max())}'
        for name, a, b in CONTRASTS:
            out[(g, name, '', 'difference')] = out[(g, *a, 'slope')] - out[(g, *b, 'slope')]
    ok = A['groups']['mothers'] & (A['coh'] >= 1937) & (A['coh'] <= 1949) & (yr >= 1977) & (yr <= 2018)
    s = ok & (age >= 25) & (age <= 44)
    out[('mothers 1937-49 (m5r)', '25-44', '1977-2018', 'slope')] = m5p.within_slope(rc[s], age[s], cc[s], w[s])
    return out


def main():
    d = m5o.prepare()
    A = arrays(d)
    A['one'] = np.ones(len(d))
    pt = stats(A, A['one'])
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5S_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [stats(A, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    for key, v in pt.items():
        q = key[3]
        if q in ('slope', 'difference'):
            bs = np.array([b.get(key, np.nan) for b in boots], float)
            lo, hi = np.nanpercentile(bs, [2.5, 97.5])
            rows.append(dict(group=key[0], cell=key[1], era=key[2], quantity=f'{q} (points/yr)', est=100 * v,
                             lo=100 * lo, hi=100 * hi, se=100 * np.nanstd(bs, ddof=1), info=''))
        elif q == 'raised Catholic %':
            rows.append(dict(group=key[0], cell=key[1], era=key[2], quantity=q, est=100 * v, lo=np.nan, hi=np.nan,
                             se=np.nan, info=''))
        else:
            rows.append(dict(group=key[0], cell=key[1], era=key[2], quantity=q, est=np.nan, lo=np.nan, hi=np.nan,
                             se=np.nan, info=str(v)))
    t = pd.DataFrame(rows)
    t.to_csv(HERE / 't51_age_period_slopes.csv', index=False, float_format='%.4f')
    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 500)
    text = (f't51 within-cohort slope of raised-Catholic on age (single-year cohort fixed effects), US-born, by age '
            f'segment and era, in person (1977-2018); points per year of age; {B}-draw PSU bootstrap, seed 1\n'
            + t.round(3).fillna('').to_string(index=False))
    print(text)
    (HERE / 'results.txt').write_text(text + '\n')


if __name__ == '__main__':
    main()
