"""Weighted one-year divorce incidence with replicate-weight 95% CIs, by year and by subgroup.

Reads WORK/acs_{YYYY}.parquet (extract.py). For each cell: unweighted people and divorces,
the weighted share divorced in the past 12 months per 1,000 people married at some point in
those months, and a 95% CI from the 80 successive-difference replicate weights
(variance = 4/80 * sum (r_i - r_0)^2). Subgroup cells pool POOLED years: each year's weights are
divided by the number of years and replicate i of the pool is the sum of replicate i across
years (Census guidance for combining ACS years). Cells need >= MIN_N unweighted people.

Usage: python3 -I baselines.py WORK_DIR   -> writes CSVs here and ../../app/data/acs_divorce_baselines.json
"""
import itertools, json, os, sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import derive  # noqa: E402

POOLED = [2019, 2021, 2022, 2023, 2024]  # 2020 used experimental weights (Census); reported, not pooled
MIN_N = 200
DIMS = ['sex', 'age_band', 'education', 'race_ethnicity', 'nativity', 'duration_band', 'times_married',
        'state', 'income_quintile', 'employment', 'occupation_group']
SPECS = [()] + [(d,) for d in DIMS] + list(itertools.combinations(DIMS, 2)) + [
    ('age_band', 'education', 'duration_band', 'times_married'),
    ('sex', 'age_band', 'education', 'duration_band'),
    ('state', 'age_band', 'education', 'duration_band', 'times_married')]
OUT_JSON = HERE.parent.parent / 'app' / 'data' / 'acs_divorce_baselines.json'


def rate_ci(num, den):
    """num, den: (..., 81) arrays of weighted divorces and people; full weight first."""
    r = 1000 * num / den
    se = np.sqrt(4 / 80 * ((r[..., 1:] - r[..., :1]) ** 2).sum(-1))
    return r[..., 0], se


def year_cells(a, R, specs):
    """Per cell: 81 weighted divorce sums (n0..n80), 81 weighted people sums (d0..d80), and
    unweighted people and divorces. Summed column by column with bincount (memory-light)."""
    ev = a.event.to_numpy().astype(np.float64)
    keys = {c: a[c].astype(str) for c in DIMS}
    out = {}
    for spec in specs:
        if spec:
            codes, uniq = pd.MultiIndex.from_arrays([keys[c] for c in spec]).factorize()
            G = len(uniq)
        else:
            codes, uniq, G = np.zeros(len(a), int), None, 1
        cols = {}
        for i in range(81):
            w = R[:, i].astype(np.float64)
            cols[f'n{i}'] = np.bincount(codes, weights=w * ev, minlength=G)
            cols[f'd{i}'] = np.bincount(codes, weights=w, minlength=G)
        cols['people'] = np.bincount(codes, minlength=G)
        cols['divorces'] = np.bincount(codes, weights=ev, minlength=G)
        g = pd.DataFrame(cols, index=uniq if spec else None)
        if spec and len(spec) == 1:
            g.index = g.index.get_level_values(0)
        out[spec] = g
    return out


def main(work):
    years = sorted(int(f[4:8]) for f in os.listdir(work) if f.startswith('acs_') and f.endswith('.parquet'))
    manifest = [json.loads(l) for l in open(os.path.join(work, 'manifest.jsonl'))]
    series, pooled = [], {}
    for y in years:
        d = pd.read_parquet(os.path.join(work, f'acs_{y}.parquet'))
        a = derive.derive(d)
        R = derive.replicate_matrix(d)
        del d
        a = a[['event', 'sex'] + [c for c in DIMS if c != 'sex']]
        sex_specs = [(), ('sex',)]
        cells = year_cells(a, R, SPECS if y in POOLED else sex_specs)
        for spec in sex_specs:
            g = cells[spec]
            num = g[[f'n{i}' for i in range(81)]].to_numpy()
            den = g[[f'd{i}' for i in range(81)]].to_numpy()
            r, se = rate_ci(num, den)
            for k in range(len(g)):
                series.append(dict(year=y, group='All' if not spec else g.index[k], people=int(g.people.iloc[k]),
                                   divorces=int(g.divorces.iloc[k]), per_1000=r[k], se=se[k],
                                   ci95_low=max(0.0, r[k] - 1.96 * se[k]), ci95_high=r[k] + 1.96 * se[k],
                                   weighted_millions=den[k, 0] / 1e6,
                                   experimental_weights=y == 2020))
        if y in POOLED:
            for spec, g in cells.items():
                g = g.copy()
                g[[c for c in g.columns if c[0] in 'nd' and c[1:].isdigit()]] /= len(POOLED)
                pooled[spec] = g if spec not in pooled else pooled[spec].add(g, fill_value=0)
        print('year', y, 'people', len(a), 'divorces', int(a.event.sum()), flush=True)
    series = pd.DataFrame(series)
    series.to_csv(HERE / 'year_series.csv', index=False, float_format='%.5g')

    rows = []
    for spec, g in pooled.items():
        g = g[g.people >= MIN_N]
        if not len(g):
            continue
        num = g[[f'n{i}' for i in range(81)]].to_numpy()
        den = g[[f'd{i}' for i in range(81)]].to_numpy()
        r, se = rate_ci(num, den)
        idx = g.index if spec else [()]
        for k, key in enumerate(idx):
            key = key if isinstance(key, tuple) else (key,)
            rows.append(dict(dims='|'.join(spec) or 'overall', values='|'.join(map(str, key)) if spec else 'All',
                             people=int(g.people.iloc[k]), divorces=int(g.divorces.iloc[k]), per_1000=r[k], se=se[k],
                             ci95_low=max(0.0, r[k] - 1.96 * se[k]), ci95_high=r[k] + 1.96 * se[k],
                             weighted_millions_per_year=den[k, 0] / 1e6))
    cells = pd.DataFrame(rows)
    # Duration 'Unknown' is exactly the people who divorced AND remarried within the 12 months
    # (MARHYP dates the new marriage), so every one of them is an event: not a baseline. Drop those
    # cells (the people stay in the overall rate and in every cell that does not use duration).
    unknown_dur = [('duration_band' in d.split('|')) and v.split('|')[d.split('|').index('duration_band')] == 'Unknown'
                   for d, v in zip(cells.dims, cells['values'])]
    cells = cells[~np.array(unknown_dur, bool)]
    nd = cells.dims.str.count(r'\|') + (cells.dims != 'overall')
    cells[nd <= 1].to_csv(HERE / 'baselines_oneway.csv', index=False, float_format='%.5g')
    cells[nd == 2].to_csv(HERE / 'baselines_twoway.csv', index=False, float_format='%.5g')
    cells[nd >= 4].to_csv(HERE / 'baselines_fine.csv.gz', index=False, float_format='%.5g', compression='gzip')

    rnd = lambda v, k=3: None if v is None or not np.isfinite(v) else round(float(v), k)
    over = cells[cells.dims == 'overall'].iloc[0]
    out = dict(
        id='acs_divorce_baselines', version=1,
        source=('U.S. Census Bureau, American Community Survey 1-year Public Use Microdata Sample, person files, '
                f'{years[0]}-{years[-1]} (national, 50 states and DC)'),
        target=('Share of people who report a divorce in the past 12 months, per 1,000 people aged 15+ who were married '
                'at some point in those 12 months (currently married or separated, or divorced or widowed within the '
                '12 months). Cross-sectional one-year incidence from a single interview, not a prospective hazard or '
                'a lifetime risk.'),
        pooled_years=POOLED, excluded_from_pool={'2020': 'Census released 2020 1-year data with experimental weights'},
        min_unweighted_people=MIN_N,
        uncertainty='95% CI = estimate +/- 1.96 SE; SE from the 80 successive-difference replicate weights; pooled years combine replicate i across years',
        caveats=['Characteristics are measured at the interview, after any divorce: income, employment, occupation, '
                 'state of residence and even education can follow the divorce rather than precede it.',
                 'Duration is years since the most recent wedding (survey year minus MARHYP); unknown for people who '
                 'divorced and remarried within the same 12 months, who are all events by construction, so cells by '
                 'duration leave them out (they remain in the overall rate and in cells not split by duration).',
                 'Interviews run through each calendar year, so the 12-month window straddles two calendar years.',
                 'Rates describe people, not couples: each spouse of a divorcing couple can be counted.',
                 'Cells are descriptive; pointwise CIs are not adjusted for the many comparisons.'],
        overall=dict(people=int(over.people), divorces=int(over.divorces), per_1000=rnd(over.per_1000),
                     ci95=[rnd(over.ci95_low), rnd(over.ci95_high)],
                     weighted_millions_per_year=rnd(over.weighted_millions_per_year, 2)),
        year_series=[dict(year=int(s.year), group=s.group, people=int(s.people), divorces=int(s.divorces),
                          per_1000=rnd(s.per_1000), ci95=[rnd(s.ci95_low), rnd(s.ci95_high)],
                          experimental_weights=bool(s.experimental_weights)) for s in series.itertuples()],
        cells={},
        downloads=manifest)
    for dims, g in cells[cells.dims != 'overall'].groupby('dims', sort=False):
        out['cells'][dims] = dict(columns=['values', 'people', 'divorces', 'per_1000', 'ci95_low', 'ci95_high'],
                                  rows=[[v.split('|'), int(p), int(e), rnd(r), rnd(lo), rnd(hi)]
                                        for v, p, e, r, lo, hi in zip(g['values'], g.people, g.divorces, g.per_1000,
                                                                       g.ci95_low, g.ci95_high)])
    old = json.loads(OUT_JSON.read_text()) if OUT_JSON.exists() else {}
    if 'model_predicted_risk' in old:
        out['model_predicted_risk'] = old['model_predicted_risk']
    OUT_JSON.parent.mkdir(exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, separators=(',', ':')))
    print(series[series.group == 'All'].round(3).to_string(index=False))
    print('cells', len(cells), 'json bytes', OUT_JSON.stat().st_size)


if __name__ == '__main__':
    main(sys.argv[1])
