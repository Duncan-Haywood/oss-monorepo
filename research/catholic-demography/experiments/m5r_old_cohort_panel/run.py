#!/usr/bin/env python3
"""Milestone 5b, seventeenth GSS-only step: is the oldest mothers' fall in reported Catholic upbringing a re-reporting drift?

    python3 experiments/m5r_old_cohort_panel/run.py   # needs data/raw/gssr (data/download_gssr.sh) and pyreadr; ~2-5 min

Why. m5q found that for the mothers' cohorts born 1937-49 (64% of m5o's child weight) the current-Catholic share falls
between interviews at 25-44 and at 45+ (D_P about +3.7 to +4.0 points), but the raised-Catholic share (`relig16`) falls
about as much (D_R = D_P - D_S, about +3.4 to +3.5 over a 21-year age gap, roughly 0.17 points a year), so net switching
D_S is near zero. Upbringing is fixed by 16, so a within-cohort fall of R16 is either (i) the same people re-reporting
their upbringing differently as they age (or as years pass), or (ii) composition: who is left to interview at 45+
(mortality, emigration, response). m5p tested this for all US-born adults 25-64 and found the cross-section slope (-0.07
a year) matches the 2006-10 panels' within-person drift (-0.08), but did not look at these cohorts, whose R16 fall is
about twice as fast. Their own panel re-reports exist: the 2006, 2008 and 2010 panels saw people born 1937-49 at ages
57-73 and asked `relig16` again two and four years later. (The 2016-20 panel did not re-ask `relig16` in 2020.)

If the panel drift of these cohorts is as fast as their cross-section fall, the m5q pattern (D_P large, D_S near zero)
reads as reporting: the same women stop reporting a Catholic upbringing at about the rate they stop reporting being
Catholic, and m5o's "switching after child-rearing" does not apply to them. If the panel drift is near zero, the fall
is composition, and the D_S netting in m5q removes a real selection effect rather than a reporting one.

Estimands.
XS (cross-sections, as m5q): US-born women with at least one child, born 1937-49, surveyed 1977+, current religion and
  `relig16` known. (a) band rate: D_R(1937-49) / age difference, where both are averaged over single-year cohorts with
  both bands (25-44, 45+), own weights (each cohort's total weight in the two bands) and m5o's child weights; points per
  year of age, negative when the share falls with age. (b) within-cohort slope of raised-Catholic on age with
  single-year cohort fixed effects (m5p's `within_slope`), by age segment 25-44, 45-56, 57-77 and all ages 25+; also for
  US-born women and all US-born adults born 1937-49 at 57-77. Survey years 1977-2024 all modes (m5q's main) and
  1977-2018 (in person). 500-draw stratified PSU bootstrap over the file (seed 1), everything re-estimated per draw.
PN (panels 2006, 2008, 2010 pooled, as m5p, but no age cap). US-born at wave 1, cohort (wave-1 year - wave-1 age) in the
  group, `relig16` at both waves. Per person (later - first report of raised Catholic) / years between waves; wave 1 to 3
  (4 years, `wtpannr123`, main) and wave 1 to 2 (2 years, `wtpannr12`); design-based mean and interval. Groups for
  cohorts 1937-49: all adults, women, mothers (women with `childs` >= 1 at wave 1, main); and, as a contrast, women and
  mothers born 1950-71.
Comparison. XS - PN, intervals from the two standard errors combined as independent (as m5p).

Predictions, written before the first run:
P1. The oldest mothers re-report a Catholic upbringing less often: PN, mothers 1937-49, wave 1 to 3, per-year change < 0
    (point estimate). Refuted if >= 0.
P2. Main test: their cross-section fall is re-reporting, not composition. XS band rate (own weights, 1977-2024, the m5q
    numbers) minus PN rate (mothers 1937-49, wave 1 to 3) has an interval including zero. Refuted if it excludes zero.
P3. The panel drift accounts for at least half of the cross-section fall: PN rate / XS band rate >= 0.5 (point
    estimates, XS rate < 0), same pair as P2. Refuted below 0.5.
P4. Same ages, same answer: XS within-cohort slope at ages 57-77, mothers 1937-49, 1977-2018, minus PN rate (mothers
    1937-49, wave 1 to 3) has an interval including zero. Refuted if it excludes zero.
Where along the age range the cross-section fall happens (segment slopes) and the 1950-71 contrast are reported without
a prediction.
Limits stated in advance. The panel sees these cohorts only at 57-77 (2006-14), while the band rate covers the move from
25-44 (surveys 1977-1994) to 45+ (1982-2024); a constant per-year drift is assumed in comparing them. Age and survey year
are not separated. The panel cell is small (a few hundred mothers), so P2 and P4 have low power: the minimum detectable
difference (2.8 x the standard error) is printed. Panel attrition is handled only by the nonresponse-adjusted weights.
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
OLD = (1937, 1949)
YOUNGER = (1950, 1971)
YEARS = {'1977-2024 all modes': (1977, 2024), '1977-2018': (1977, 2018)}
SEGS = {'25-44': (25, 44), '45-56': (45, 56), '57-77': (57, 77), '25+': (25, 200)}


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m5q = _load('m5q', HERE.parent / 'm5q_cohort_std_switching' / 'run.py')
m5p = _load('m5p', HERE.parent / 'm5p_recall_drift' / 'run.py')
m5o = m5q.m5o


def xs_stats(d, m):
    out = {}
    cw, _ = m5q.child_weights(d, m)
    w = d['w'].to_numpy() * m
    coh = d['cohort'].to_numpy()
    yr = d['year'].to_numpy()
    age = d['age'].to_numpy(float)
    rc = (d['rel16'] == 'Catholic').to_numpy().astype(float)
    known = (d['born'] == 1).to_numpy() & d['rel16'].notna().to_numpy() & np.isfinite(age) & np.isfinite(coh)
    fem = (d['sex'] == 2).to_numpy()
    moth = fem & d['rel'].notna().to_numpy() & (d['childs_f'].to_numpy() >= 1)
    old = (coh >= OLD[0]) & (coh <= OLD[1])
    cc = np.where(np.isfinite(coh), coh, 0).astype(int) - OLD[0]
    sel = np.zeros(m5q.MOTH[1] - m5q.MOTH[0] + 1)
    sel[OLD[0] - m5q.MOTH[0]:OLD[1] - m5q.MOTH[0] + 1] = 1
    for ylab, (y0, y1) in YEARS.items():
        t = m5q.cell_tables(d, m, y0, y1)
        yo, ol = t['young'], t['old']
        both = (yo['W'] > 0) & (ol['W'] > 0)
        dR, dA = yo['R'] - ol['R'], yo['A'] - ol['A']
        for wname, wt in (('own', yo['W'] + ol['W']), ('child', cw)):
            wt = np.where(both, wt, 0.0) * sel
            r, a = m5q.wavg(dR, wt), m5q.wavg(dA, wt)
            out[('band', f'mothers 1937-49, {wname} weights', ylab, 'D_R (points)')] = r
            out[('band', f'mothers 1937-49, {wname} weights', ylab, 'age difference (years)')] = a
            out[('band', f'mothers 1937-49, {wname} weights', ylab, 'rate D_R / age difference')] = r / a
        inyr = (yr >= y0) & (yr <= y1)
        for slab, (a0, a1) in SEGS.items():
            s = known & moth & old & inyr & (age >= a0) & (age <= a1)
            out[('slope', 'mothers 1937-49', ylab, f'ages {slab}')] = m5p.within_slope(rc[s], age[s], cc[s], w[s])
        for gname, g in (('women 1937-49', fem), ('all adults 1937-49', np.ones(len(d), bool))):
            s = known & g & old & inyr & (age >= 57) & (age <= 77)
            out[('slope', gname, ylab, 'ages 57-77')] = m5p.within_slope(rc[s], age[s], cc[s], w[s])
    return out


def num(x):
    return pd.to_numeric(pd.Series(x).astype(str).str.extract(r'(\d+)')[0], errors='coerce').to_numpy()


def panel_frame():
    rows = []
    for k, f in enumerate(['gss_panel06_long', 'gss_panel08_long', 'gss_panel10_long']):
        d = recode.read_rda(GSSR / f'{f}.rda')
        for c in ['relig16', 'born', 'sex']:
            d[c] = d[c].astype(str).where(d[c].notna())
        for c in ['age', 'year', 'childs']:
            d[c] = num(d[c]) if not pd.api.types.is_numeric_dtype(d[c]) else d[c].to_numpy(float)
        w1 = d[d['wave'] == 1].set_index('firstid')
        for later, wt, gap in [(3, 'wtpannr123', 4.0), (2, 'wtpannr12', 2.0)]:
            wl = d[d['wave'] == later].set_index('firstid')
            j = w1[['relig16', 'born', 'sex', 'age', 'year', 'childs']].join(wl[['relig16']], rsuffix='_l', how='inner')
            j['w'] = pd.to_numeric(w1[wt], errors='coerce').reindex(j.index).fillna(0.0).to_numpy()
            if 'vstrat' in w1.columns and 'vpsu' in w1.columns:
                vs = pd.to_numeric(w1['vstrat'], errors='coerce').reindex(j.index)
                vp = pd.to_numeric(w1['vpsu'], errors='coerce').reindex(j.index)
                j['strat'] = (k + 1) * 100000 + vs.fillna(0).to_numpy()
                j['psu'] = np.where(vp.notna(), vp.fillna(0), j.index.to_numpy(float) + (k + 1) * 1e6)
            else:  # as m5i and m5p: one stratum, each person a PSU
                j['strat'] = (k + 1) * 100000
                j['psu'] = j.index.to_numpy(float) + (k + 1) * 1e6
            j['gap'] = gap
            j['pair'] = f'wave 1 to {later}'
            rows.append(j.reset_index())
    j = pd.concat(rows, ignore_index=True)
    a = j['relig16'].notna() & j['relig16_l'].notna()
    j['first'] = (j['relig16'] == 'Catholic').astype(float)
    j['d'] = np.where(a, ((j['relig16_l'] == 'Catholic').astype(float) - j['first']) / j['gap'], np.nan)
    j['coh'] = j['year'] - j['age']
    j['ok'] = a & (j['born'] == 'Yes') & j['coh'].notna()
    return j


def panel_stats(j):
    out = {}
    s, p, w = j['strat'].to_numpy(float), j['psu'].to_numpy(float), j['w'].to_numpy(float)
    y = j['d'].fillna(0).to_numpy(float)
    fem = (j['sex'] == 'Female').to_numpy()
    moth = fem & (j['childs'].to_numpy() >= 1)
    coh = j['coh'].to_numpy()
    for pair in ('wave 1 to 3', 'wave 1 to 2'):
        base = (j['pair'] == pair).to_numpy() & j['ok'].to_numpy()
        for (c0, c1) in (OLD, YOUNGER):
            inc = (coh >= c0) & (coh <= c1)
            groups = (('mothers', moth), ('women', fem)) if (c0, c1) == YOUNGER else \
                (('mothers', moth), ('women', fem), ('all adults', np.ones(len(j), bool)))
            for gname, g in groups:
                dom = base & inc & g
                mn, se, n = survey.domain_mean(y, w, dom, s, p)
                first = survey.domain_mean(j['first'].to_numpy(float), w, dom, s, p)[0]
                age = np.average(j['age'].to_numpy(float)[dom], weights=w[dom]) if w[dom].sum() > 0 else np.nan
                out[(pair, f'{gname} {c0}-{c1}')] = dict(m=mn, se=se, n=int(dom.sum()), first=first, age=age)
    return out


def main():
    d = m5o.prepare()
    pt = xs_stats(d, np.ones(len(d)))
    rng = np.random.default_rng(1)
    B = int(os.environ.get('M5R_B', 500))
    st, ps = d['strat'].to_numpy(), d['psu'].to_numpy()
    boots = [xs_stats(d, boot_idx(st, ps, rng)) for _ in range(B)]
    rows, xse = [], {}
    for key, v in pt.items():
        bs = np.array([b.get(key, np.nan) for b in boots], float)
        lo, hi = np.nanpercentile(bs, [2.5, 97.5])
        sc = 1 if key[3].startswith('age difference') else 100
        xse[key] = np.nanstd(bs, ddof=1)
        rows.append(dict(table=key[0], group=key[1], years=key[2], quantity=key[3], est=sc * v, lo=sc * lo, hi=sc * hi,
                         se=sc * xse[key]))
    t = pd.DataFrame(rows)
    t.to_csv(HERE / 't49_old_cohort_xs.csv', index=False, float_format='%.4f')

    j = panel_frame()
    pn = panel_stats(j)
    prow = []
    for (pair, g), r in pn.items():
        lo, hi = survey.ci(r['m'], r['se'])
        prow.append(dict(pair=pair, group=g, n=r['n'], mean_age_w1=r['age'], raised_catholic_w1=100 * r['first'],
                         est=100 * r['m'], lo=100 * lo, hi=100 * hi, se=100 * r['se']))
    tp = pd.DataFrame(prow)
    tp.to_csv(HERE / 't50_old_cohort_panel.csv', index=False, float_format='%.4f')

    pd.set_option('display.width', 250)
    pd.set_option('display.max_rows', 500)
    L = [f't49 cross-sections, US-born, cohorts 1937-49: raised-Catholic band rate and within-cohort slopes, points per '
         f'year of age (D_R in points, age difference in years); {B}-draw PSU bootstrap, seed 1',
         t.round(3).to_string(index=False),
         '\nt50 panels 2006-10 pooled, US-born at wave 1: within-person change in raised-Catholic, points per year; '
         'design-based intervals (raised Catholic at wave 1 in percent)',
         tp.round(3).to_string(index=False),
         '\nComparisons (points per year; XS - PN, independent standard errors; MDD = 2.8 x se)']
    P = pn[('wave 1 to 3', 'mothers 1937-49')]
    for key in [('band', 'mothers 1937-49, own weights', '1977-2024 all modes', 'rate D_R / age difference'),
                ('band', 'mothers 1937-49, child weights', '1977-2024 all modes', 'rate D_R / age difference'),
                ('band', 'mothers 1937-49, own weights', '1977-2018', 'rate D_R / age difference'),
                ('slope', 'mothers 1937-49', '1977-2018', 'ages 57-77'),
                ('slope', 'mothers 1937-49', '1977-2024 all modes', 'ages 57-77'),
                ('slope', 'mothers 1937-49', '1977-2018', 'ages 25+')]:
        x, xs = pt[key], xse[key]
        dif, dse = x - P['m'], np.hypot(xs, P['se'])
        lo, hi = survey.ci(dif, dse)
        frac = P['m'] / x if abs(x) > 1e-12 else np.nan
        L.append(f'  {key[0]} {key[1]}, {key[2]}, {key[3]}: XS {100 * x:+.3f} - PN mothers 1937-49 wave 1-3 '
                 f'{100 * P["m"]:+.3f} = {100 * dif:+.3f} [{100 * lo:+.3f}, {100 * hi:+.3f}], MDD {280 * dse:.3f}; '
                 f'PN / XS {frac:.2f}')
    for g in ('women 1937-49', 'all adults 1937-49'):
        key = ('slope', g, '1977-2018', 'ages 57-77')
        Q = pn[('wave 1 to 3', g)]
        dif, dse = pt[key] - Q['m'], np.hypot(xse[key], Q['se'])
        lo, hi = survey.ci(dif, dse)
        L.append(f'  slope {g}, 1977-2018, ages 57-77: XS {100 * pt[key]:+.3f} - PN {g} wave 1-3 {100 * Q["m"]:+.3f} '
                 f'= {100 * dif:+.3f} [{100 * lo:+.3f}, {100 * hi:+.3f}], MDD {280 * dse:.3f}')
    for g in ('mothers', 'women'):
        a, b = pn[('wave 1 to 3', f'{g} 1937-49')], pn[('wave 1 to 3', f'{g} 1950-71')]
        dif, dse = a['m'] - b['m'], np.hypot(a['se'], b['se'])
        lo, hi = survey.ci(dif, dse)
        L.append(f'  PN wave 1-3, {g} 1937-49 - {g} 1950-71: {100 * dif:+.3f} [{100 * lo:+.3f}, {100 * hi:+.3f}]')
    text = '\n'.join(L)
    print(text)
    (HERE / 'results.txt').write_text(text + '\n')


if __name__ == '__main__':
    main()
