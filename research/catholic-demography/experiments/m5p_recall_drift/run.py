#!/usr/bin/env python3
"""Milestone 5b, fifteenth GSS-only step: is the fall of "raised Catholic" with age a within-person reporting drift?

    python3 experiments/m5p_recall_drift/run.py   # needs data/raw/gssr (data/download_gssr.sh) and pyreadr; ~2-5 min

Why. m5o found that the same mothers' cohorts (US-born women with children, born about 1937-71) report a Catholic
upbringing (`relig16`) 2.4 points [0.7, 4.2] more often when interviewed at 25-44 than at 45+. Upbringing is fixed by
age 16, so in a cohort the true share cannot change with age; the fall is either (i) the same people reporting their
upbringing differently as they age or as years pass (recall drift, wording or context), or (ii) composition: who is
left to be interviewed (differential mortality, emigration, response), or (iii) the 2021-24 web waves, where many of
these cohorts are first seen at 45+ (m5f: web respondents report a raised-Catholic share 5.3 points above in-person).

The two sources in the GSS see different parts of this. In repeated cross-sections, within a cohort, age and survey
year advance together (age = year - cohort), so the within-cohort slope of the raised-Catholic share is the combined
age-and-year drift *plus* any composition change. In the 2006-10 panels the same people answer again two and four
years later, so the within-person change per year is the same age-and-year drift *without* composition. Comparing the
two slopes, per year, separates (i) from (ii); dropping 2021-24 from the cross-sections removes (iii).

Data and estimands.
XS (cross-sections). US-born (`born` 1) adults surveyed 1977-2018 (the in-person era, before the 2021-24 web waves),
  aged 25-64 (to keep mortality and late-life selection small), non-missing `relig16`. Within-cohort slope: weighted
  least squares of raised-Catholic (0/1) on single-year cohort fixed effects and age (linear), i.e. the slope of the
  within-cohort demeaned outcome on demeaned age; points per year. Weights `wtssps` (as all earlier steps); 500-draw
  stratified PSU bootstrap over the file (seed 1). Groups: all adults (main, comparable to the panel), women, and
  m5o's population (women with at least one child, cohorts 1937-71).
PN (panels 2006, 2008, 2010 pooled, as m5i). US-born at wave 1, aged 25-64 at wave 1, `relig16` at both waves. Per person
  (later report - first report) / years between waves, wave 1 to 3 (4 years, weight `wtpannr123`, main) and wave 1 to
  2 (2 years, `wtpannr12`); design-based mean and interval (strata `vstrat`, PSU `vpsu` of wave 1, panels kept apart).
  Groups: all adults (main), women.
Comparison. XS slope - PN slope, interval from the two standard errors combined as independent (the panels' first waves
  are a small part of the 1977-2018 file; stated as a limit).
Accounting for m5o. Among m5o's population, the cohort-standardised raised-Catholic difference between the 25-44 and 45+
  bands (cohorts with both bands, each cohort weighted by its total weight) and the matching mean age difference.
  Predicted difference = -(slope) x (age difference), for the PN and XS slopes. Computed for 1977-2018 and, as m5o
  did, 1977-2024 all modes.

Predictions, written before the first run:
P1. XS: the within-cohort slope for US-born adults 1977-2018 is negative with an interval excluding zero (the share
    reporting a Catholic upbringing falls as a cohort ages, also without the web waves). Refuted otherwise.
P2. PN: the within-person drift per year, wave 1 to 3, US-born adults, is negative (point estimate). m5i's all-adult
    wave 1-3 net change was -0.77 points over 4 years [-1.44, -0.11]; US-born only is not yet seen. Refuted if >= 0.
P3. Main test: the drift is within-person reporting, not composition. XS slope - PN slope (wave 1 to 3, all adults) has
    an interval including zero. Refuted if it excludes zero (then composition or year effects the panel does not see
    carry part of the fall).
P4. The panel drift accounts for at least half of the 1977-2018 band difference among m5o's population: predicted / observed
    >= 0.5 (point estimates; observed > 0). Refuted below 0.5. Reported for the XS slope and all years too, untested.
Limits stated in advance. Linear age within cohort is an approximation (slopes by age segment, 25-44 and 45-64, are
reported). Age and year are not separated by either source: both measure their sum per year, which is what the m5o
band difference also mixes. The panel spans 2006-14 only; drift before 2006 is assumed the same. Panel attrition is
handled only by the nonresponse-adjusted panel weights.
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
from cathdem import recode, survey  # noqa: E402

GSSR = recode.RAW / 'gssr'
AGE = (25, 64)
YEARS_MAIN = (1977, 2018)
YEARS_ALL = (1977, 2024)
M5O_COH = (1937, 1971)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def within_slope(y, a, c, w):
    """WLS slope of y on a with fixed effects for c (integer codes), by weighted within-group demeaning."""
    keep = w > 0
    y, a, c, w = y[keep], a[keep], c[keep], w[keep]
    W = np.bincount(c, weights=w)
    with np.errstate(invalid='ignore', divide='ignore'):
        ybar = np.bincount(c, weights=w * y) / W
        abar = np.bincount(c, weights=w * a) / W
    ad, yd = a - abar[c], y - ybar[c]
    den = (w * ad * ad).sum()
    return (w * ad * yd).sum() / den if den > 0 else np.nan


def band_diff(y, age, c, w):
    """Cohort-standardised (25-44) - (45+) difference of y and of age, cohorts with weight in both bands."""
    young = age <= 44
    res = {}
    for name, v in (('y', y), ('age', age)):
        tot, acc = 0.0, 0.0
        for k in np.unique(c):
            s = c == k
            wy, wo = w[s & young], w[s & ~young]
            if wy.sum() <= 0 or wo.sum() <= 0:
                continue
            diff = (wy * v[s & young]).sum() / wy.sum() - (wo * v[s & ~young]).sum() / wo.sum()
            tw = w[s].sum()
            tot += tw
            acc += tw * diff
        res[name] = acc / tot if tot > 0 else np.nan
    return res


def xs_frame():
    m5n = _load('m5n', HERE.parent / 'm5n_siblings' / 'run.py')
    d = m5n.prepare()
    q = (d['born'] == 1) & d['rel16'].notna() & d['cohort'].notna() & d['age'].notna()
    d = d[q].copy()
    d['rc'] = (d['rel16'] == 'Catholic').astype(float)
    d['coh'] = d['cohort'].astype(int)
    return d


def xs_stats(d, m):
    out = {}
    w_all = d['w'].to_numpy() * m
    age = d['age'].to_numpy(float)
    yr = d['year'].to_numpy()
    coh = d['coh'].to_numpy()
    rc = d['rc'].to_numpy()
    fem = (d['sex'] == 2).to_numpy()
    moth = fem & (d['childs_f'].to_numpy() >= 1) & (coh >= M5O_COH[0]) & (coh <= M5O_COH[1])
    inyr = (yr >= YEARS_MAIN[0]) & (yr <= YEARS_MAIN[1])
    inage = (age >= AGE[0]) & (age <= AGE[1])
    cc = coh - coh.min()
    for gname, g in (('all adults', np.ones(len(d), bool)), ('women', fem), ('m5o mothers 1937-71', moth)):
        for seg, sa in (('25-64', inage), ('25-44', (age >= 25) & (age <= 44)), ('45-64', (age >= 45) & (age <= 64))):
            s = g & inyr & sa
            out[('XS slope', gname, f'ages {seg}, 1977-2018')] = within_slope(rc[s], age[s], cc[s], w_all[s])
        s = g & (yr >= YEARS_ALL[0]) & inage
        out[('XS slope', gname, 'ages 25-64, 1977-2024 all modes')] = within_slope(rc[s], age[s], cc[s], w_all[s])
    for lab, (y0, y1) in (('1977-2018', YEARS_MAIN), ('1977-2024 all modes', YEARS_ALL)):
        s = moth & (yr >= y0) & (yr <= y1) & (age >= 25)
        bd = band_diff(rc[s], age[s], coh[s], w_all[s])
        out[('band', 'm5o mothers 1937-71', f'R16(25-44) - R16(45+), {lab}')] = bd['y']
        out[('band', 'm5o mothers 1937-71', f'age difference (years), {lab}')] = bd['age']
    return out


def panel_frame():
    rows = []
    for k, f in enumerate(['gss_panel06_long', 'gss_panel08_long', 'gss_panel10_long']):
        d = recode.read_rda(GSSR / f'{f}.rda')
        for c in ['relig16', 'born', 'sex']:
            d[c] = d[c].astype(str).where(d[c].notna())
        w1 = d[d['wave'] == 1].set_index('firstid')
        for later, wt, gap in [(3, 'wtpannr123', 4.0), (2, 'wtpannr12', 2.0)]:
            wl = d[d['wave'] == later].set_index('firstid')
            j = w1[['relig16', 'born', 'sex', 'age']].join(wl[['relig16']], rsuffix='_l', how='inner')
            j['w'] = pd.to_numeric(w1[wt], errors='coerce').reindex(j.index).fillna(0.0).to_numpy()
            vs = pd.to_numeric(w1['vstrat'], errors='coerce').reindex(j.index)
            vp = pd.to_numeric(w1['vpsu'], errors='coerce').reindex(j.index)
            j['strat'] = (k + 1) * 100000 + vs.fillna(0).to_numpy()
            j['psu'] = np.where(vp.notna(), vp.fillna(0), j.index.to_numpy(float) + (k + 1) * 1e6)
            j['gap'] = gap
            j['pair'] = f'wave 1 to {later}'
            rows.append(j.reset_index())
    j = pd.concat(rows, ignore_index=True)
    a = j['relig16'].notna() & j['relig16_l'].notna()
    j['d'] = np.where(a, ((j['relig16_l'] == 'Catholic').astype(float)
                          - (j['relig16'] == 'Catholic').astype(float)) / j['gap'], np.nan)
    j['ok'] = a & (j['born'] == 'Yes') & j['age'].between(*AGE)
    return j


def panel_stats(j):
    out = {}
    s, p, w = j['strat'].to_numpy(float), j['psu'].to_numpy(float), j['w'].to_numpy(float)
    y = j['d'].fillna(0).to_numpy(float)
    for pair in ('wave 1 to 3', 'wave 1 to 2'):
        for gname, g in (('all adults', np.ones(len(j), bool)), ('women', (j['sex'] == 'Female').to_numpy())):
            dom = (j['pair'] == pair).to_numpy() & j['ok'].to_numpy() & g
            m, se, n = survey.domain_mean(y, w, dom, s, p)
            out[(pair, gname)] = (m, se, int(dom.sum()))
    return out


def main():
    lines = []
    d = xs_frame()
    pt = xs_stats(d, np.ones(len(d)))
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5P_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [xs_stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows = []
    xs_se = {}
    for key, v in pt.items():
        bs = np.array([b.get(key, np.nan) for b in boots], float)
        lo, hi = np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if key[2].startswith('age difference') else 100
        rows.append(dict(table=key[0], group=key[1], quantity=key[2], est=sc * v, lo=sc * lo, hi=sc * hi,
                         se=sc * np.nanstd(bs, ddof=1)))
        xs_se[key] = np.nanstd(bs, ddof=1)
    t = pd.DataFrame(rows)
    t.to_csv(HERE / 't45_cross_section_drift.csv', index=False, float_format='%.4f')

    j = panel_frame()
    pn = panel_stats(j)
    prow = []
    for (pair, g), (m, se, n) in pn.items():
        lo, hi = survey.ci(m, se)
        prow.append(dict(pair=pair, group=g, n=n, est=100 * m, lo=100 * lo, hi=100 * hi, se=100 * se))
    pt_ = pd.DataFrame(prow)
    pt_.to_csv(HERE / 't46_panel_drift.csv', index=False, float_format='%.4f')

    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 500)
    lines.append('t45 cross-sections, US-born: within-cohort slope of raised-Catholic, points per year of age '
                 '(band rows: points, and years); 500-draw PSU bootstrap')
    lines.append(t.round(3).to_string(index=False))
    lines.append('\nt46 panels 2006-10, US-born, aged 25-64 at wave 1: within-person change in raised-Catholic, points '
                 'per year; design-based intervals')
    lines.append(pt_.round(3).to_string(index=False))

    lines.append('\nComparison and accounting (points per year; points)')
    for g in ('all adults', 'women'):
        xk = ('XS slope', g, 'ages 25-64, 1977-2018')
        xm, xse = pt[xk], xs_se[xk]
        for pair in ('wave 1 to 3', 'wave 1 to 2'):
            pm, pse, _ = pn[(pair, g)]
            dif, dse = xm - pm, np.hypot(xse, pse)
            lo, hi = survey.ci(dif, dse)
            lines.append(f'  {g:10s} XS slope - PN slope ({pair}): {100 * dif:+.3f} [{100 * lo:+.3f}, {100 * hi:+.3f}]'
                         f'  (XS {100 * xm:+.3f}, PN {100 * pm:+.3f})')
    for lab in ('1977-2018', '1977-2024 all modes'):
        obs = pt[('band', 'm5o mothers 1937-71', f'R16(25-44) - R16(45+), {lab}')]
        dage = pt[('band', 'm5o mothers 1937-71', f'age difference (years), {lab}')]
        for src, slope in (('PN wave 1-3 all adults', pn[('wave 1 to 3', 'all adults')][0]),
                           ('PN wave 1-3 women', pn[('wave 1 to 3', 'women')][0]),
                           ('XS 25-64 1977-2018 m5o mothers', pt[('XS slope', 'm5o mothers 1937-71',
                                                                   'ages 25-64, 1977-2018')]),
                           ('XS 25-64 1977-2018 all adults', pt[('XS slope', 'all adults', 'ages 25-64, 1977-2018')])):
            pred = -slope * dage
            frac = pred / obs if abs(obs) > 1e-9 else np.nan
            lines.append(f'  m5o mothers, {lab}: observed {100 * obs:+.2f}, age gap {dage:.1f} y; predicted from '
                         f'{src}: {100 * pred:+.2f} (fraction {frac:.2f})')
    text = '\n'.join(lines)
    print(text)
    (HERE / 'results.txt').write_text(text + '\n')


if __name__ == '__main__':
    main()
