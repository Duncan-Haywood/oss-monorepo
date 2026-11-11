#!/usr/bin/env python3
"""Milestone 5b (ninth GSS-only step): can reweighting on demographics correct the 2021-24 web respondents?

    python3 experiments/m5j_reweight/run.py      # needs data/raw (data/download.sh or data/download_gssr.sh)

Why. m5f, m5g and m5i found the 2021-24 web respondents are a different slice of people, not people whose answers web
changes: in the 2016-20 panel, those who later chose web already reported 11.1 points less weekly attendance at their
first, in-person interview. The standard fix for such a slice is to reweight it on observed covariates. This step asks
whether that fix works, using the one place where the answer is known.

Part A, validation in the 2016-20 panel. First wave in person (2016 or 2018); 2020 completed by web or phone. The
first-wave gap in weekly attendance between later-web and later-phone completers is pure selection (everyone was
interviewed the same way). Web completers' weights (wtssnr_2) are raked to the phone completers' first-wave margins on
three nested covariate sets, and the first-wave gap is recomputed:
  S1  age band, sex, ethnicity, degree (the m3 T3 adjustment set);
  S2  S1 + region, marital status, number of children, nativity, size of place, household size, work status;
  S3  S2 + political views and party identification (attitudes; not outcomes here, but not demographics either).
The 2020 web-minus-phone gap is also raked, to compare with the within-person estimate of m5i (-1.56 points).

Part B, the 2022 and 2024 cross-sections, in person (mode 1) vs web (mode 4), within year. Web respondents are raked to
the in-person respondents' margins (S1-S3, each year separately), and the web-minus-in-person gaps are recomputed for
weekly attendance (all adults, and Catholics raked within Catholics), the Catholic share, the raised-Catholic share
and the no-religion share. Missing covariate values are a category of their own.

Uncertainty: 300-draw stratified PSU bootstrap (seed 1); raking is redone in every draw, so its variance is carried.

Predictions, written before the first run:
  P1. In the panel, S1 removes less than a third of the 11.1-point first-wave gap and S2 less than half. Refuted
      (demographic reweighting adequate) if S2 removes 75% or more with an interval excluding 50%.
  P2. In 2022-24, the Catholic web-minus-in-person weekly gap stays below -5 points after S2 raking
      (m3 T3: a linear adjustment for S1 left -9.8). Refuted if the S2-raked gap is above -5.
  P3. The raised-Catholic share gap (m5f: web higher) keeps its positive sign after S2 raking.
Implication fixed in advance: if P1 holds, demographic reweighting cannot correct 2021-24 web estimates and the paper
uses in-person 2022-24 estimates (with their wider intervals) for attendance, not reweighted all-mode ones.
"""
import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from cathdem import recode, rake  # noqa: E402

_spec = importlib.util.spec_from_file_location('m5a', HERE.parent / 'm5a_decomp' / 'run.py')
_m5a = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_m5a)
boot_idx = _m5a.boot_idx

B = 300
GSSR = recode.RAW / 'gssr'
S1 = ['ageb', 'sex', 'eth', 'deg']
S2 = S1 + ['region', 'mar', 'kids', 'born', 'place', 'hh', 'work']
S3 = S2 + ['pol', 'party']
SETS = [('raw', []), ('S1', S1), ('S2', S2), ('S3', S3)]


def cut(x, edges):
    """Band codes 0..len(edges)-2 by left-closed intervals; -1 where missing."""
    x = pd.to_numeric(x, errors='coerce').to_numpy(float)
    out = np.full(len(x), -1)
    for i in range(len(edges) - 1):
        out[(x >= edges[i]) & (x < edges[i + 1])] = i
    return out


def covariates(v):
    """Category codes for the raking covariates from a frame with GSS-named columns (one wave)."""
    num = lambda c: pd.to_numeric(v[c], errors='coerce')
    hisp, race = num('hispanic'), num('race')
    eth = np.full(len(v), -1)
    eth[(hisp >= 2).to_numpy()] = 0
    eth[((hisp == 1) & (race == 1)).to_numpy()] = 1
    eth[((hisp == 1) & (race == 2)).to_numpy()] = 2
    eth[((hisp == 1) & (race == 3)).to_numpy()] = 3
    code = lambda c: num(c).fillna(-1).astype(int).to_numpy()
    mar = num('marital').map({1: 0, 2: 1, 3: 2, 4: 2, 5: 3}).fillna(-1).astype(int).to_numpy()
    work = num('wrkstat').map({1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 2, 8: 2}).fillna(-1).astype(int).to_numpy()
    return pd.DataFrame({
        'ageb': cut(v['age'], [18, 30, 45, 60, 75, 200]), 'sex': code('sex'), 'eth': eth,
        'deg': code('degree'), 'region': code('region'), 'mar': mar,
        'kids': cut(v['childs'], [0, 1, 2, 3, 99]), 'born': code('born'),
        'place': cut(v['xnorcsiz'], [1, 3, 5, 8, 11]), 'hh': cut(v['hompop'], [1, 2, 3, 4, 99]), 'work': work,
        'pol': cut(v['polviews'], [1, 4, 5, 8]), 'party': cut(v['partyid'], [0, 3, 4, 7]),
    }, index=v.index)


def raked_gap(y, w, src, tgt, cov, cols):
    """Weighted mean of y in src minus in tgt, after raking src's weights to tgt's margins on cols."""
    ws = w[src].copy()
    if cols:
        targets = [rake.margins(cov[c].to_numpy()[tgt], w[tgt]) for c in cols]
        ws, gap, _ = rake.rake(ws, [cov[c].to_numpy()[src] for c in cols], targets)
        if gap > 1e-6:
            raise RuntimeError(f'raking did not converge (max margin gap {gap:.2e})')
    ys, yt = y[src], y[tgt]
    ms, mt = ~np.isnan(ys) & (ws > 0), ~np.isnan(yt) & (w[tgt] > 0)
    a = (ws[ms] * ys[ms]).sum() / ws[ms].sum()
    b = (w[tgt][mt] * yt[mt]).sum() / w[tgt][mt].sum()
    return a - b, rake.kish_deff(ws[ms]) / max(rake.kish_deff(w[src][ms]), 1e-12)


def gaps(pieces, w, cols):
    """Sum over pieces (years) of each piece's raked gap, weighted by the piece's target weight total."""
    tot, num, deffs = 0.0, 0.0, []
    for y, src, tgt, cov in pieces:
        g, dd = raked_gap(y, w, src, tgt, cov, cols)
        wt = w[tgt].sum()
        num += wt * g; tot += wt; deffs.append(dd)
    return num / tot, float(np.mean(deffs))


def table(name, pieces_fn, w, s, p, rng, out, rows, extra):
    """Point estimate and bootstrap interval of the gap for each covariate set."""
    pt = {k: gaps(pieces_fn(), w, cols) for k, cols in SETS}
    draws = {k: [] for k, _ in SETS}
    for _ in range(B):
        wb = w * boot_idx(s, p, rng)
        for k, cols in SETS:
            draws[k].append(gaps(pieces_fn(), wb, cols)[0])
    raw = np.array(draws['raw'])
    for k, _ in SETS:
        d = np.array(draws[k])
        lo, hi = np.percentile(d, [2.5, 97.5])
        removed = 1 - pt[k][0] / pt['raw'][0] if pt['raw'][0] != 0 else np.nan
        rem = 1 - d / raw
        rlo, rhi = np.percentile(rem, [2.5, 97.5])
        rows.append(dict(extra, quantity=name, set=k, gap=pt[k][0], lo=lo, hi=hi, removed=removed,
                         removed_lo=rlo, removed_hi=rhi, deff_ratio=pt[k][1]))
        out.append(f"  {name:<44} {k:<3}  gap {100 * pt[k][0]:+6.2f} [{100 * lo:+6.2f}, {100 * hi:+6.2f}]"
                   + (f"  removed {100 * removed:5.1f}% [{100 * rlo:5.1f}, {100 * rhi:5.1f}]  deff x{pt[k][1]:.2f}"
                      if k != 'raw' else ''))


def part_a(out, rng):
    d = recode.read_rda(GSSR / 'gss_panel20.rda')
    first = np.where(d['samptype'] == 2016, '1a', '1b')
    cols = ['age', 'sex', 'degree', 'hispanic', 'race', 'region', 'marital', 'childs', 'born', 'xnorcsiz', 'hompop',
            'wrkstat', 'polviews', 'partyid', 'attend', 'relig', 'mode']
    v1 = pd.DataFrame({c: np.where(first == '1a', d[f'{c}_1a'], d[f'{c}_1b']) for c in cols}, index=d.index)
    cov = covariates(v1)
    att1 = pd.to_numeric(v1['attend'], errors='coerce')
    att2 = pd.to_numeric(d['attend_2'], errors='coerce')
    wk1 = np.where(att1.notna(), (att1 >= 7).astype(float), np.nan)
    wk2 = np.where(att2.notna(), (att2 >= 7).astype(float), np.nan)
    w = d['wtssnr_2'].astype(float).fillna(0.0).to_numpy()
    s = (d['samptype'].astype(float) * 10000 + d['vstrat_2'].fillna(0)).to_numpy(float)
    p = d['vpsu_2'].fillna(0).to_numpy(float)
    m1 = pd.to_numeric(v1['mode'], errors='coerce').to_numpy()
    m2 = pd.to_numeric(d['mode_2'], errors='coerce').to_numpy()
    both = ~np.isnan(wk1) & ~np.isnan(wk2) & (m1 == 1) & (w > 0)
    web, phone = both & (m2 == 4), both & (m2 == 2)
    rel1 = pd.to_numeric(v1['relig'], errors='coerce').to_numpy()
    out.append(f'Part A. 2016-20 panel, first wave in person; 2020 web n={web.sum()}, phone n={phone.sum()} '
               f'(Catholic at first wave: {(web & (rel1 == 2)).sum()}/{(phone & (rel1 == 2)).sum()})')
    out.append('  web minus phone, percentage points; covariates from the first wave; 95% bootstrap intervals')
    rows = []
    for y, lab in ((wk1, 'weekly attendance, first wave (selection)'), (wk2, 'weekly attendance, 2020'),
                   (wk2 - wk1, 'change, first wave to 2020')):
        table(lab, lambda y=y: [(y, web, phone, cov)], w, s, p, rng, out, rows, dict(part='A', group='everyone'))
    pd.DataFrame(rows).to_csv(HERE / 't29_panel_reweight.csv', index=False, float_format='%.4f')
    return rows


def part_b(out, rng):
    raw = recode.load(cols=recode.COLS + ['mode', 'region', 'xnorcsiz', 'hompop', 'wrkstat'])
    d = recode.recode(raw)
    d = d[(d['age'] >= 18) & d['year'].isin([2022, 2024]) & d['mode'].isin([1, 4]) & (d['w'] > 0)].reset_index(drop=True)
    cov = covariates(d)
    w, s, p = d['w'].to_numpy(float), d['strat'].to_numpy(float), d['psu'].to_numpy(float)
    yr, md = d['year'].to_numpy(), d['mode'].to_numpy()
    rel, rel16 = d['relig'].to_numpy(float), d['relig16'].to_numpy(float)
    ind = lambda c, v: np.where(np.isnan(v), np.nan, c.astype(float))
    outcomes = {'weekly attendance': d['weekly'].to_numpy(float), 'Catholic now': ind(rel == 2, rel),
                'raised Catholic': ind(rel16 == 2, rel16), 'no religion': ind(rel == 4, rel)}
    cath = rel == 2
    out.append('')
    out.append(f'Part B. 2022 and 2024 cross-sections, web minus in person, within year then pooled '
               f'(web n={(md == 4).sum()}, in person n={(md == 1).sum()}; Catholics {(cath & (md == 4)).sum()}/'
               f'{(cath & (md == 1)).sum()})')
    rows = []
    for name, y in outcomes.items():
        pieces = lambda y=y: [(y, (yr == t) & (md == 4), (yr == t) & (md == 1), cov) for t in (2022, 2024)]
        table(f'{name}, all adults', pieces, w, s, p, rng, out, rows, dict(part='B', group='all adults'))
    y = outcomes['weekly attendance']
    pieces = lambda: [(y, (yr == t) & (md == 4) & cath, (yr == t) & (md == 1) & cath, cov) for t in (2022, 2024)]
    table('weekly attendance, Catholics (raked within)', pieces, w, s, p, rng, out, rows, dict(part='B', group='Catholics'))
    pd.DataFrame(rows).to_csv(HERE / 't30_cross_section_reweight.csv', index=False, float_format='%.4f')
    return rows


def main():
    out = []
    rng = np.random.default_rng(1)
    part_a(out, rng)
    part_b(out, rng)
    text = '\n'.join(out) + '\n'
    (HERE / 'results.txt').write_text(text)
    print(text)


if __name__ == '__main__':
    main()
