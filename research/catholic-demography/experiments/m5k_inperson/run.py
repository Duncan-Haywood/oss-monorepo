#!/usr/bin/env python3
"""Milestone 5b (tenth GSS-only part): does the fertility vs immigration accounting of m5h hold for 2021-24 without the web slice?

    python3 experiments/m5k_inperson/run.py      # needs data/raw (data/download.sh or data/download_gssr.sh); about 10 minutes

Why. m5h decided H4 on 1990-99 -> 2010-18, which has no web interviews, and found immigration (first generation) held the
Catholic share up by +1.07 points and fertility pulled it down by -0.37. Its last period, 2021-24, says something new: the
first-generation contribution to the level fell from 3.37 points (2010-18) to 1.98, so the 2010-18 -> 2021-24 change gives
immigration -1.38 [-2.05, -0.77]. But 2021 was a web-only wave and 2022-24 is mostly web; m5f, m5g, m5i and m5j showed
that the people who answer by web are a different slice (more no-religion, more raised Catholic among third-plus NH whites)
and that demographic reweighting does not correct it (m5j). m5j fixed in advance that post-2020 estimates use the in-person
samples as the primary series. This script reruns the m5h accounting (main specification, the same functions) with the
2021-24 period replaced by each of these samples:

  V0  2021-24, all modes (m5h as published)
  V1  2022+2024, all modes (drops the all-web 2021 wave)
  V2  2022+2024, in person (`mode` 1)
  V3  2022+2024, face-to-face-first arm (`modesequence` 1, any completed mode): randomised, intention to treat
  V4  2022+2024, web-first arm (`modesequence` 2)
  V5  2022+2024, web (`mode` 4)

Earlier periods are unchanged, and rho (the Catholic / non-Catholic fertility ratio of mothers' cohorts) is estimated from
the whole file in every variant, so only the 2021-24 composition moves. Intervals: 500-draw stratified PSU bootstrap (seed 1)
over the whole file, every variant computed on the same draw, so V2 - V1 and V3 - V4 are paired contrasts.

Predictions, written before the first run:
P1. Web respondents are less often foreign-born (an English or Spanish web questionnaire reached by mail push is a higher
    hurdle for recent immigrants, and m3 found web respondents more educated). So the first-generation (immigration)
    contribution to the 2021-24 level is larger in person (V2) than in all modes (V1): V2 - V1 > 0, and the drop from
    2010-18 shrinks. Refuted if V2 - V1 <= 0.
P2. The randomised arm contrast (V3 - V4) for the immigration contribution is smaller than the completed-mode contrast
    (V2 - V5) and its interval includes zero: the gap is who completes by web, not an effect of the arm. Refuted if V3 - V4
    excludes zero in the same direction as V2 - V5.
P3. The fertility contribution (which depends on the cohort mix of US-born adults and on rho, not on nativity) moves by
    less than 0.3 points across V1-V5. Refuted if any variant moves it by more than 0.3 from V1.
P4. Whatever P1 shows, the qualitative 2010-18 -> 2021-24 reading of m5h (immigration's contribution to the level fell,
    and by more than fertility's) holds in the in-person sample V2. Refuted if, in V2, the immigration change interval
    includes zero or the fertility change is the larger fall.
"""
import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE.parent / 'm5a_decomp'))
from cathdem import recode  # noqa: E402
from run import boot_idx  # noqa: E402  (m5a_decomp/run.py; m5h's run.py is loaded below by path)
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location('m5h', HERE.parent / 'm5h_fertility' / 'run.py')
m5h = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m5h)

LAST = '2021-24'
VARIANTS = {
    'V0 2021-24 all modes': lambda d: d['year'].between(2021, 2024),
    'V1 2022+24 all modes': lambda d: d['year'].isin([2022, 2024]),
    'V2 2022+24 in person': lambda d: d['year'].isin([2022, 2024]) & (d['mode'] == 1),
    'V3 2022+24 F2F-first arm': lambda d: d['year'].isin([2022, 2024]) & (d['modesequence'] == 1),
    'V4 2022+24 web-first arm': lambda d: d['year'].isin([2022, 2024]) & (d['modesequence'] == 2),
    'V5 2022+24 web': lambda d: d['year'].isin([2022, 2024]) & (d['mode'] == 4),
}
CONTRASTS = [('V2 - V1 (in person vs all modes)', 'V2 2022+24 in person', 'V1 2022+24 all modes'),
             ('V2 - V5 (completed mode: in person vs web)', 'V2 2022+24 in person', 'V5 2022+24 web'),
             ('V3 - V4 (randomised arm: F2F-first vs web-first)', 'V3 2022+24 F2F-first arm', 'V4 2022+24 web-first arm'),
             ('V1 - V0 (dropping the 2021 web wave)', 'V1 2022+24 all modes', 'V0 2021-24 all modes')]


def prepare():
    raw = recode.load(cols=recode.COLS + ['mode', 'modesequence'])
    d = recode.recode(raw)
    d = d[d['w'] > 0].reset_index(drop=True)
    per = pd.Series('', index=d.index, dtype='object')
    for k, (lo, hi) in m5h.PER.items():
        per[d['year'].between(lo, hi)] = k
    d['per'] = per
    d['raised'] = (d['rel16'] == 'Catholic').astype(float)
    d['is_cath'] = (d['rel'] == 'Catholic').astype(float)
    d['adult0'] = (d['age'] >= 18) & d['rel'].notna() & d['rel16'].notna() & d['gen'].notna() & (d['per'] != '') \
        & d['cohort'].notna()
    d['us'] = d['gen'].isin(['2nd gen', '3rd+ gen'])
    d['third'] = d['gen'] == '3rd+ gen'
    d['band'] = (d['cohort'].fillna(0) // 5 * 5).astype(int)
    d['first'] = (d['gen'] == '1st gen (foreign-born)').astype(float)
    return d


def run_variant(d, keep_last, m):
    """m5h main-spec counterfactuals with the 2021-24 adults restricted to keep_last. Returns m5h.summarise rows plus
    the first-generation share of adults and of Catholics in 2021-24."""
    d['adult'] = d['adult0'] & ((d['per'] != LAST) | keep_last)
    cf, _, _ = m5h.counterfactuals(d, m, m5h.MAIN)
    rows = m5h.summarise(cf)
    s = (d['adult'] & (d['per'] == LAST)).to_numpy()
    w = d['w'].to_numpy()[s] * m[s]
    f = d['first'].to_numpy()[s]
    c = d['is_cath'].to_numpy()[s]
    rows[('level', LAST, 'first-gen share of adults')] = (w * f).sum() / w.sum()
    rows[('level', LAST, 'first-gen share of Catholics')] = (w * f * c).sum() / (w * c).sum()
    rows[('level', LAST, 'unweighted n')] = float(s.sum())
    return rows


KEEP = [('level', LAST, 'S'), ('level', LAST, 'fertility'), ('level', LAST, 'immigration (1st gen)'),
        ('level', LAST, 'immigration (1st+2nd gen)'), ('level', LAST, 'first-gen share of adults'),
        ('level', LAST, 'first-gen share of Catholics'),
        ('change', '2010-18 -> 2021-24', 'dS'), ('change', '2010-18 -> 2021-24', 'fertility'),
        ('change', '2010-18 -> 2021-24', 'immigration (1st gen)'),
        ('change', '2010-18 -> 2021-24', 'immigration(1st) minus fertility'),
        ('change', '1990-99 -> 2021-24', 'dS'), ('change', '1990-99 -> 2021-24', 'fertility'),
        ('change', '1990-99 -> 2021-24', 'immigration (1st gen)')]


def main():
    d = prepare()
    keeps = {k: f(d).to_numpy() for k, f in VARIANTS.items()}
    one = np.ones(len(d))
    pts = {k: run_variant(d, kp, one) for k, kp in keeps.items()}
    print('Unweighted adults in the 2021-24 slot, by variant')
    for k in VARIANTS:
        print(f'  {k}: n={int(pts[k][("level", LAST, "unweighted n")])}')

    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5K_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = {k: [] for k in VARIANTS}
    for i in range(B):
        m = boot_idx(st, ps, rng)
        for k, kp in keeps.items():
            boots[k].append(run_variant(d, kp, m))

    rows = []
    for key in KEEP:
        for k in VARIANTS:
            bs = np.array([b[key] for b in boots[k]])
            lo, hi = np.nanpercentile(bs, [2.5, 97.5])
            rows.append(dict(kind=key[0], period=key[1], quantity=key[2], sample=k,
                             est=100 * pts[k][key], lo=100 * lo, hi=100 * hi))
        for name, a, b in CONTRASTS:
            bs = np.array([x[key] - y[key] for x, y in zip(boots[a], boots[b])])
            lo, hi = np.nanpercentile(bs, [2.5, 97.5])
            rows.append(dict(kind=key[0], period=key[1], quantity=key[2], sample=name,
                             est=100 * (pts[a][key] - pts[b][key]), lo=100 * lo, hi=100 * hi))
    t = pd.DataFrame(rows)
    t.to_csv(HERE / 't31_inperson_accounting.csv', index=False, float_format='%.3f')
    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 500)
    print(f'\nPercentage points (shares in percent); 95% stratified PSU bootstrap, B={B}, seed 1; contrasts paired')
    for (kind, period, q), g in t.groupby(['kind', 'period', 'quantity'], sort=False):
        print(f'\n{kind} {period}: {q}')
        print(g[['sample', 'est', 'lo', 'hi']].round(2).to_string(index=False))


if __name__ == '__main__':
    main()
