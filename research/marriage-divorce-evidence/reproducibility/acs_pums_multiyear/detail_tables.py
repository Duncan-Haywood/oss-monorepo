"""Detail baselines from the pooled ACS years (2019, 2021-2024): race and Hispanic-origin detail,
Asian subgroups, occupation (detailed Census code, SOC major group, broad group), industry,
household income band and home ownership.

Same population, outcome, weights and replicate-weight CIs as baselines.py (cells >= 200
unweighted people). Joins acs_{YYYY}.parquet (extract.py) to acs_detail_{YYYY}.parquet
(extract_detail.py) on SERIALNO + SPORDER. Each cell also gets an AGE-STANDARDISED rate (direct
standardisation to the pooled at-risk population's age distribution in five bands), because
occupation, income and race groups differ a lot in age and one-year divorce falls steeply with age.
The standardised rate is published only when the cell has people in all five age bands.

CROSS-SECTIONAL: occupation, industry, income and home ownership are measured at the interview,
after any divorce in the past 12 months (a divorce can change all four). They describe who reports
a divorce, not what causes one.

Usage: python3 -I detail_tables.py WORK_DIR [DICT_DIR]
  DICT_DIR holds PUMS_Data_Dictionary_{YYYY}.csv for the pooled years (labels for RAC2P, HISP,
  OCCP, INDP; download.sh fetches them). Writes detail CSVs here, adds cells to
  ../../app/data/acs_divorce_baselines.json and writes ../../app/data/acs_occupation_divorce.json.
"""
import csv, json, os, sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import derive  # noqa: E402
from baselines import rate_ci, POOLED, MIN_N  # noqa: E402

APP = HERE.parent.parent / 'app' / 'data'
STD_BANDS = [(15, 29, '15-29'), (30, 39, '30-39'), (40, 49, '40-49'), (50, 64, '50-64'), (65, 200, '65+')]
CPI = {2019: 255.657, 2021: 270.970, 2022: 292.655, 2023: 304.702, 2024: 313.689}  # CPI-U annual averages
INCOME_BANDS = [(-1e12, 25000, 'Under $25k'), (25000, 50000, '$25k-$50k'), (50000, 75000, '$50k-$75k'),
                (75000, 100000, '$75k-$100k'), (100000, 150000, '$100k-$150k'), (150000, 200000, '$150k-$200k'),
                (200000, 1e12, '$200k or more')]
SOC_MAJOR = {'11': 'Management', '13': 'Business and financial operations', '15': 'Computer and mathematical',
             '17': 'Architecture and engineering', '19': 'Life, physical and social science',
             '21': 'Community and social service', '23': 'Legal', '25': 'Educational instruction and library',
             '27': 'Arts, design, entertainment, sports and media', '29': 'Healthcare practitioners and technical',
             '31': 'Healthcare support', '33': 'Protective service', '35': 'Food preparation and serving',
             '37': 'Building and grounds cleaning and maintenance', '39': 'Personal care and service',
             '41': 'Sales and related', '43': 'Office and administrative support', '45': 'Farming, fishing and forestry',
             '47': 'Construction and extraction', '49': 'Installation, maintenance and repair', '51': 'Production',
             '53': 'Transportation and material moving', '55': 'Military specific'}
INDUSTRY_SECTOR = {'AGR': 'Agriculture, forestry, fishing and hunting', 'EXT': 'Mining, quarrying, oil and gas',
                   'UTL': 'Utilities', 'CON': 'Construction', 'MFG': 'Manufacturing', 'WHL': 'Wholesale trade',
                   'RET': 'Retail trade', 'TRN': 'Transportation and warehousing', 'INF': 'Information',
                   'FIN': 'Finance, insurance and real estate', 'PRF': 'Professional, scientific and technical services',
                   'MED': 'Health care and social assistance', 'EDU': 'Educational services',
                   'SCA': 'Social assistance', 'ENT': 'Arts, entertainment, recreation, accommodation and food',
                   'SRV': 'Other services', 'ADM': 'Public administration', 'MIL': 'Military'}
ASIAN_NAMES = [('Chinese', 'Chinese'), ('Taiwanese', 'Taiwanese'), ('Asian Indian', 'Asian Indian'),
               ('Filipino', 'Filipino'), ('Vietnamese', 'Vietnamese'), ('Korean', 'Korean'), ('Japanese', 'Japanese'),
               ('Pakistani', 'Pakistani'), ('Bangladeshi', 'Bangladeshi'), ('Hmong', 'Hmong'), ('Cambodian', 'Cambodian'),
               ('Laotian', 'Laotian'), ('Thai', 'Thai'), ('Nepalese', 'Nepalese'), ('Burmese', 'Burmese'),
               ('Indonesian', 'Indonesian'), ('Sri Lankan', 'Sri Lankan')]
HISP_GROUPS = {2: 'Mexican', 3: 'Puerto Rican', 4: 'Cuban', 5: 'Dominican', 6: 'Central American', 7: 'Central American',
               8: 'Central American', 9: 'Central American', 10: 'Central American', 11: 'Salvadoran',
               12: 'Central American', 13: 'South American', 14: 'South American', 15: 'South American',
               16: 'Colombian', 17: 'South American', 18: 'South American', 19: 'South American',
               20: 'South American', 21: 'South American', 22: 'South American', 23: 'Spaniard',
               24: 'Other Hispanic or Latino'}


def labels(dict_dir, year, var):
    out = {}
    with open(os.path.join(dict_dir, f'PUMS_Data_Dictionary_{year}.csv'), newline='', encoding='latin-1') as f:
        for row in csv.reader(f):
            if len(row) >= 7 and row[0] == 'VAL' and row[1] == var and row[4] == row[5]:
                out[row[4].strip()] = row[6].strip()
    return out


def lab_int(m):
    o = {}
    for k, v in m.items():
        try:
            o[int(k)] = v
        except ValueError:
            pass
    return o


def detail_columns(a, x, y, dict_dir):
    """a: derive.derive output; x: matching detail rows. Adds the new analysis columns."""
    r1, hisp = x.RAC1P.astype(float), x.HISP.astype(float)
    nh = hisp == 1
    race8 = np.select([~nh, r1 == 1, r1 == 2, r1 == 6, r1.isin([3, 4, 5]), r1 == 7, r1 == 9, r1 == 8],
                      ['Hispanic', 'White', 'Black', 'Asian', 'American Indian or Alaska Native',
                       'Native Hawaiian or Pacific Islander', 'Multiracial', 'Other'], 'Unknown')
    a['race_detail'] = race8
    rac2 = lab_int(labels(dict_dir, y, 'RAC2P'))
    lab2 = x.RAC2P.map(lambda v: rac2.get(int(v), '') if v == v else '')
    asian = pd.Series('Other Asian', index=a.index, dtype=object)
    for key, name in ASIAN_NAMES:
        # labels start with the group ("Chinese alone", "Chinese, except Taiwanese alone", "Taiwanese alone")
        asian[lab2.str.startswith(key)] = name
    a['asian_detail'] = np.where((race8 == 'Asian'), asian, 'Not non-Hispanic Asian alone')
    a['hispanic_origin'] = np.where(nh, 'Not Hispanic', x.HISP.astype(float).map(HISP_GROUPS).fillna('Other Hispanic or Latino'))
    occl = lab_int(labels(dict_dir, y, 'OCCP'))
    a['occupation_detail'] = x.OCCP.map(lambda v: f'{int(v):04d} {occl.get(int(v), "")}'.strip() if v == v else 'None or not in universe')
    soc = x.SOCP.fillna('').astype(str).str[:2]
    a['soc_major'] = soc.map(SOC_MAJOR).fillna('None or not in universe')
    a.loc[x.OCCP.astype(float) == 9920, 'soc_major'] = 'Unemployed, no work in the last 5 years'
    indl = lab_int(labels(dict_dir, y, 'INDP'))
    il = x.INDP.map(lambda v: indl.get(int(v), '') if v == v else '')
    a['industry_sector'] = il.str[:3].map(INDUSTRY_SECTOR).fillna('None or not in universe')
    a.loc[x.INDP.astype(float) == 9920, 'industry_sector'] = 'Unemployed, no work in the last 5 years'
    a['industry_detail'] = x.INDP.map(lambda v: f'{int(v):04d} {indl.get(int(v), "")}'.strip() if v == v else 'None or not in universe')
    inc = x.HINCP.astype(float) * x.ADJINC.astype(float) / 1e6 * CPI[2024] / CPI[y]
    band = pd.Series('Group quarters or unknown', index=a.index, dtype=object)
    for lo, hi, name in INCOME_BANDS:
        band[(inc >= lo) & (inc < hi)] = name
    a['household_income_band'] = band
    a['tenure'] = x.TEN.astype(float).map({1: 'Owned with a mortgage or loan', 2: 'Owned free and clear', 3: 'Rented',
                                           4: 'Occupied without payment of rent'}).fillna('Group quarters')
    a['owner'] = a.tenure.map(lambda t: 'Owner' if t.startswith('Owned') else 'Renter or other' if t != 'Group quarters' else 'Group quarters')
    age = a.age
    sb = pd.Series(None, index=a.index, dtype=object)
    for lo, hi, name in STD_BANDS:
        sb[(age >= lo) & (age <= hi)] = name
    a['std_age'] = sb
    return a


NEW = ['race_detail', 'asian_detail', 'hispanic_origin', 'occupation_detail', 'soc_major', 'industry_sector',
       'industry_detail', 'household_income_band', 'tenure', 'owner']
OLD = ['sex', 'age_band', 'education', 'nativity', 'times_married', 'duration_band', 'occupation_group']
# (dims) specs; every spec is also tabulated by std_age for the age-standardised rate.
SPECS = [(d,) for d in NEW] + [
    ('race_detail', 'sex'), ('race_detail', 'age_band'), ('race_detail', 'education'), ('race_detail', 'nativity'),
    ('race_detail', 'times_married'), ('race_detail', 'duration_band'),
    ('asian_detail', 'sex'), ('asian_detail', 'nativity'), ('hispanic_origin', 'sex'), ('hispanic_origin', 'nativity'),
    ('soc_major', 'sex'), ('occupation_group', 'sex'), ('industry_sector', 'sex'), ('occupation_detail', 'sex'),
    ('household_income_band', 'age_band'), ('household_income_band', 'education'), ('household_income_band', 'sex'),
    ('household_income_band', 'times_married'), ('tenure', 'age_band'), ('tenure', 'household_income_band'),
    ('owner', 'age_band'), ('owner', 'sex'), ('owner', 'duration_band')]
SPECS += [('occupation_group',)]


def cells_for(a, R, specs):
    ev = a.event.to_numpy().astype(np.float64)
    out = {}
    for spec in specs:
        for full in (spec, spec + ('std_age',)):
            if full in out:
                continue
            codes, uniq = pd.MultiIndex.from_arrays([a[c].astype(str) for c in full]).factorize()
            G = len(uniq)
            cols = {}
            for i in range(81):
                w = R[:, i].astype(np.float64)
                cols[f'n{i}'] = np.bincount(codes, weights=w * ev, minlength=G)
                cols[f'd{i}'] = np.bincount(codes, weights=w, minlength=G)
            cols['people'] = np.bincount(codes, minlength=G)
            cols['divorces'] = np.bincount(codes, weights=ev, minlength=G)
            out[full] = pd.DataFrame(cols, index=uniq)
    # age distribution of the whole population (standard), 81 replicate columns
    codes, uniq = pd.factorize(a.std_age.astype(str))
    out[('std_age',)] = pd.DataFrame({f'd{i}': np.bincount(codes, weights=R[:, i].astype(np.float64), minlength=len(uniq))
                                      for i in range(81)}, index=uniq)
    return out


def main(work, dict_dir):
    pooled = {}
    for y in POOLED:
        d = pd.read_parquet(os.path.join(work, f'acs_{y}.parquet'))
        x = pd.read_parquet(os.path.join(work, f'acs_detail_{y}.parquet'))
        x = x.drop_duplicates(['SERIALNO', 'SPORDER'])
        key = d[['SERIALNO', 'SPORDER']].astype({'SPORDER': 'int64'}).merge(
            x.assign(SPORDER=x.SPORDER.astype('int64')), on=['SERIALNO', 'SPORDER'], how='left', validate='one_to_one')
        assert key.RAC2P.notna().mean() > 0.999, (y, key.RAC2P.notna().mean())
        key['RAC1P'] = d.RAC1P.to_numpy()
        key['HISP'] = d.HISP.to_numpy()
        key.index = d.index
        a = derive.derive(d)
        R = derive.replicate_matrix(d)
        del d
        a = detail_columns(a, key, y, dict_dir)
        c = cells_for(a, R, SPECS)
        for spec, g in c.items():
            g = g / [len(POOLED) if (k[0] in 'nd' and k[1:].isdigit()) else 1 for k in g.columns]
            pooled[spec] = g if spec not in pooled else pooled[spec].add(g, fill_value=0)
        print('year', y, len(a), flush=True)
        del a, R, key, x
    std = pooled[('std_age',)]
    std = std / std.sum(axis=0)  # share of the at-risk population in each age band, per replicate
    rows = []
    for spec in SPECS:
        g = pooled[spec]
        g = g[g.people >= MIN_N]
        num = g[[f'n{i}' for i in range(81)]].to_numpy()
        den = g[[f'd{i}' for i in range(81)]].to_numpy()
        r, se = rate_ci(num, den)
        ga = pooled[spec + ('std_age',)]
        for k, key in enumerate(g.index):
            key = key if isinstance(key, tuple) else (key,)
            # age-standardised: sum over age bands of band rate x standard share, per replicate
            sub = ga.loc[[key + (b,) for _, _, b in STD_BANDS if key + (b,) in ga.index]]
            std_r = std_lo = std_hi = None
            if len(sub) == len(STD_BANDS) and (sub[[f'd{i}' for i in range(81)]].to_numpy() > 0).all():
                br = 1000 * sub[[f'n{i}' for i in range(81)]].to_numpy() / sub[[f'd{i}' for i in range(81)]].to_numpy()
                sw = std.loc[[b for _, _, b in STD_BANDS]].to_numpy()
                sr = (br * sw).sum(axis=0)
                sse = np.sqrt(4 / 80 * ((sr[1:] - sr[0]) ** 2).sum())
                std_r, std_lo, std_hi = sr[0], max(0.0, sr[0] - 1.96 * sse), sr[0] + 1.96 * sse
            rows.append(dict(dims='|'.join(spec), values='|'.join(map(str, key)), people=int(g.people.iloc[k]),
                             divorces=int(g.divorces.iloc[k]), per_1000=r[k], se=se[k],
                             ci95_low=max(0.0, r[k] - 1.96 * se[k]), ci95_high=r[k] + 1.96 * se[k],
                             age_std_per_1000=std_r, age_std_ci95_low=std_lo, age_std_ci95_high=std_hi,
                             weighted_thousands_per_year=den[k, 0] / 1e3))
    cells = pd.DataFrame(rows)
    unknown_dur = cells.apply(lambda r: 'duration_band' in r.dims.split('|') and
                              r['values'].split('|')[r.dims.split('|').index('duration_band')] == 'Unknown', axis=1)
    cells = cells[~unknown_dur]
    cells.to_csv(HERE / 'baselines_detail.csv.gz', index=False, float_format='%.5g', compression='gzip')
    rnd = lambda v, k=3: None if v is None or not np.isfinite(v) else round(float(v), k)

    # 1) race/ethnicity, Asian and Hispanic detail, income and tenure into the baselines file
    base = json.loads((APP / 'acs_divorce_baselines.json').read_text())
    race_like = ('race_detail', 'asian_detail', 'hispanic_origin', 'household_income_band', 'tenure', 'owner')
    occ_like = ('occupation_detail', 'soc_major', 'industry_sector', 'industry_detail', 'occupation_group')
    for dims, g in cells.groupby('dims', sort=False):
        if dims.split('|')[0] not in race_like:
            continue
        g = g[~g['values'].str.contains('Not non-Hispanic Asian alone|^Not Hispanic', regex=True)]
        base['cells'][dims] = dict(columns=['values', 'people', 'divorces', 'per_1000', 'ci95_low', 'ci95_high'],
                                   rows=[[v.split('|'), int(p), int(e), rnd(r), rnd(lo), rnd(hi)]
                                         for v, p, e, r, lo, hi in zip(g['values'], g.people, g.divorces, g.per_1000,
                                                                        g.ci95_low, g.ci95_high)])
    base.setdefault('age_standardised', {})
    for dims, g in cells.groupby('dims', sort=False):
        if dims.split('|')[0] in race_like and '|' not in dims:
            base['age_standardised'][dims] = dict(
                columns=['values', 'age_std_per_1000', 'ci95_low', 'ci95_high'],
                rows=[[v.split('|'), rnd(r), rnd(lo), rnd(hi)] for v, r, lo, hi in
                      zip(g['values'], g.age_std_per_1000, g.age_std_ci95_low, g.age_std_ci95_high) if r == r and r is not None])
    base['age_standardised_note'] = ('Direct age standardisation to the pooled at-risk population (ages 15-29, 30-39, 40-49, '
                                     '50-64, 65+), computed in every replicate for the CI; published only when a cell has '
                                     'people in all five bands.')
    base['detail_dims_note'] = (
        'race_detail: Hispanic (any race), then non-Hispanic single races (RAC1P) and Multiracial (two or more races). '
        'asian_detail: non-Hispanic Asian alone by RAC2P detailed group. hispanic_origin: HISP detailed origin, small '
        'origins grouped as Central/South American. household_income_band: HINCP x ADJINC in 2024 dollars (CPI-U). '
        'tenure/owner: TEN. Income and tenure are measured at the interview, after any divorce.')
    base['detail_downloads'] = [json.loads(l) for l in open(os.path.join(work, 'manifest_detail.jsonl'))]
    (APP / 'acs_divorce_baselines.json').write_text(json.dumps(base, separators=(',', ':')))

    # 2) occupation and industry into their own file, clearly labelled as measured after the event
    occ = dict(
        id='acs_occupation_divorce', version=1,
        source=base['source'].split(',')[0] + ', pooled 1-year PUMS person files 2019 and 2021-2024',
        target=base['target'],
        timing_warning=('Occupation and industry are the current job, or the most recent job in the last 5 years, reported '
                        'at the interview, AFTER any divorce in the past 12 months. A divorce can change a job, and people '
                        'in different jobs differ in age, sex, education and earlier marriages. These are descriptive rates '
                        'of who reports a divorce, not effects of a job and not a forecast for a marriage.'),
        pooled_years=POOLED, min_unweighted_people=MIN_N, uncertainty=base['uncertainty'],
        age_standardisation=base['age_standardised_note'],
        codes=('OCCP: 2018 Census occupation codes (stable 2019-2024); SOC major group from SOCP; industry sector from the '
               'INDP label prefix; detailed industry from INDP. Labels from the Census PUMS data dictionaries.'),
        overall=base['overall'], tables={})
    for dims, g in cells.groupby('dims', sort=False):
        if dims.split('|')[0] not in occ_like:
            continue
        occ['tables'][dims] = dict(
            columns=['values', 'people', 'divorces', 'per_1000', 'ci95_low', 'ci95_high', 'age_std_per_1000',
                     'age_std_ci95_low', 'age_std_ci95_high'],
            rows=[[v.split('|'), int(p), int(e), rnd(r), rnd(lo), rnd(hi), rnd(sr), rnd(sl), rnd(sh)]
                  for v, p, e, r, lo, hi, sr, sl, sh in zip(g['values'], g.people, g.divorces, g.per_1000, g.ci95_low,
                                                            g.ci95_high, g.age_std_per_1000, g.age_std_ci95_low,
                                                            g.age_std_ci95_high)])
    (APP / 'acs_occupation_divorce.json').write_text(json.dumps(occ, separators=(',', ':')))
    for d in ['race_detail', 'asian_detail', 'hispanic_origin', 'soc_major', 'industry_sector', 'household_income_band', 'tenure']:
        print(cells[cells.dims == d][['values', 'people', 'divorces', 'per_1000', 'ci95_low', 'ci95_high',
                                      'age_std_per_1000']].round(2).to_string(index=False))
    print('cells', len(cells))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(sys.argv[1], 'dict'))
