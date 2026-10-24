"""U.S. single-year death rates by sex (UN WPP 2024) for the app's lifelong-marriage estimate.

Extracts United States (country code 840) central death rates m(x) by single year of age and
sex for 2024-2100 (UN medium-variant projections after 2023), checks them by recomputing life
expectancy at birth against the package's own e0 table, and writes
../../app/data/us_mortality_wpp2024.json. It also holds the Python reference for the
competing-risks calculation that ../../app/mortality.js implements, and writes test vectors.

Run from this folder after `sh download.sh`:  python3 extract.py   (needs pandas, pyreadr)
"""
from pathlib import Path
import json, math
import numpy as np, pandas as pd, pyreadr

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / 'app' / 'data'
YEARS = range(2024, 2101)
AGES = range(15, 101)  # 100 is the open age group 100+
US = 840


def e0(mx):
    """Life expectancy at birth from single-age rates, constant hazard within each year of age;
    the open interval 100+ contributes 1/m."""
    s, e = 1.0, 0.0
    for m in mx[:-1]:
        e += s * (1 - math.exp(-m)) / m
        s *= math.exp(-m)
    return e + s / mx[-1]


def rate(table, sex, year, age):
    y = min(max(year, table['years'][0]), table['years'][-1]) - table['years'][0]
    a = min(max(age, table['ages'][0]), table['ages'][-1]) - table['ages'][0]
    return table[f'mx{sex}'][y][a]


def competing(table, a, b, start_year, divorce_rates, horizon):
    """Year-by-year competing risks for a married couple: divorce (annual rates supplied by a
    model; None means not estimated), death of partner a, death of partner b. Hazards are
    constant within each year, so the shares are exact: P(first event is divorce in year k) =
    h_d / h * (1 - exp(-h)) times P(still married at k-1). Deaths are independent, cohort
    rates follow the calendar year, ages are whole years at the wedding. Years after the
    supplied divorce rates end are left unresolved instead of guessed."""
    married, out = 1.0, dict(divorce=[], widowhood=[], married=[])
    for k in range(horizon):
        if k >= len(divorce_rates) or divorce_rates[k] is None:
            break
        hd = divorce_rates[k]
        ha = rate(table, a['sex'], start_year + k, a['age'] + k)
        hb = rate(table, b['sex'], start_year + k, b['age'] + k)
        h = hd + ha + hb
        p_any = 1 - math.exp(-h)
        out['divorce'].append(married * hd / h * p_any)
        out['widowhood'].append(married * (ha + hb) / h * p_any)
        married *= math.exp(-h)
        out['married'].append(married)
    return dict(p_divorce=sum(out['divorce']), p_widowhood=sum(out['widowhood']),
                p_still_married=married, years=len(out['married']), **out)


def main():
    mx = pyreadr.read_r(HERE / 'raw' / 'mx1dt.rda')['mx1dt']
    e0t = pyreadr.read_r(HERE / 'raw' / 'e01dt.rda')['e01dt']
    us = mx[mx.country_code == US].sort_values(['year', 'age'])
    e = e0t[e0t.country_code == US].set_index('year')

    # Check: e0 recomputed from the single-age rates against the UN's published e0.
    check = []
    # e01dt holds estimates only (1950-2023); projected e0 lives in a separate table.
    for year in [y for y in (1950, 1960, 1970, 1980, 1990, 2000, 2010, 2019, 2020, 2021, 2022, 2023) if y in e.index]:
        g = us[us.year == year].sort_values('age')
        assert list(g.age) == list(range(101))
        for sex in ('M', 'F'):
            mine = e0(g[f'mx{sex}'].to_numpy())
            check.append(dict(year=year, sex=sex, e0_from_rates=round(mine, 3), e0_un=round(float(e.loc[year, f'e0{sex}']), 3),
                              difference=round(mine - float(e.loc[year, f'e0{sex}']), 3)))
    check = pd.DataFrame(check)
    check.to_csv(HERE / 'e0_check.csv', index=False)
    worst = float(check.difference.abs().max())
    assert worst < 0.5, check

    sub = us[us.year.isin(YEARS) & us.age.isin(AGES)]
    table = dict(
        id='us_mortality_wpp2024', version=1,
        source='United Nations, DESA, Population Division (2024). World Population Prospects 2024, single-year central death rates by age and sex (mx1dt), via the wpp2024 R package (github.com/PPgp/wpp2024, commit 2da7768).',
        licence='CC BY 3.0 IGO (https://creativecommons.org/licenses/by/3.0/igo/). Changes: United States only, ages 15-100 and years 2024-2100 kept, values rounded to 6 significant figures.',
        notes=('Rates after 2023 are UN medium-variant projections. Age 100 is the open group 100+. '
               'Population averages: married people die at lower rates than average and spouses\' deaths are correlated, '
               'and neither is modelled. Annual death probability at rate m is 1 - exp(-m).'),
        years=[YEARS.start, YEARS.stop - 1], ages=[AGES.start, AGES.stop - 1],
        e0_check_max_abs_difference_years=worst)
    for sex in ('M', 'F'):
        table[f'mx{sex}'] = [[float(f'{v:.6g}') for v in sub[sub.year == y].sort_values('age')[f'mx{sex}']] for y in YEARS]
    table['years'] = list(YEARS)
    table['ages'] = list(AGES)
    OUT.mkdir(exist_ok=True)
    (OUT / 'us_mortality_wpp2024.json').write_text(json.dumps(table, separators=(',', ':')))

    # Reference results and test vectors for app/mortality.js (computed from the rounded table).
    cases = []
    rng = np.random.default_rng(20261020)
    for i in range(24):
        a = dict(sex=['M', 'F'][i % 2], age=int(rng.integers(18, 70)))
        b = dict(sex=['F', 'M', 'F', 'M'][i % 4], age=int(rng.integers(18, 70)))
        n = int(rng.integers(5, 70))
        base = float(rng.uniform(0.002, 0.04))
        rates = [base * math.exp(-0.03 * k) for k in range(n)]
        if i % 6 == 5:
            rates[n // 2] = None  # a year the model cannot speak to stops the calculation
        start = int(rng.integers(2020, 2110))
        cases.append(dict(a=a, b=b, start_year=start, divorce_rates=rates, horizon=80,
                          expected=competing(table, a, b, start, rates, 80)))
    (OUT / 'us_mortality_wpp2024_testvectors.json').write_text(json.dumps(cases))

    # Headline: a couple who are both 30, marrying in 2025, with no divorce at all.
    nodiv = competing(table, dict(sex='M', age=30), dict(sex='F', age=30), 2025, [0.0] * 80, 80)
    both = [r for r in [nodiv['married'][k] for k in (9, 19, 29, 39, 49)]]
    summary = dict(couple='man 30 and woman 30, wed 2025, divorce rate 0', both_alive_after=dict(zip(['10y', '20y', '30y', '40y', '50y'], [round(x, 4) for x in both])))
    with_div = competing(table, dict(sex='M', age=30), dict(sex='F', age=30), 2025, [0.01] * 80, 80)
    summary['with_constant_divorce_rate_0.01'] = dict(p_divorce=round(with_div['p_divorce'], 4), p_widowhood=round(with_div['p_widowhood'], 4),
                                                       p_still_married_80y=round(with_div['p_still_married'], 6))
    (HERE / 'summary.json').write_text(json.dumps(summary, indent=1) + '\n')
    print(check.to_string(index=False))
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
