"""Predictor atlas: every effect estimate the project has, in one schema, grouped into families.

Reads the committed result tables of the lenses (rate, odds and hazard ratios with 95% CIs, and the
ACS one-year incidence cells) and the verified literature records (evidence.json: verified, primary
full text, a ratio measure), and writes ../../app/data/predictor_atlas.json. Nothing is computed
except parsing: every number is copied from its source, and every entry names its file and its
1-based data row (or the evidence record id), so test_predictor_atlas.py can trace it back.

Usage: python3 -I build_atlas.py
"""
import csv, json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPRO = HERE.parent
ROOT = REPRO.parent
OUT = ROOT / 'app' / 'data' / 'predictor_atlas.json'

FAMILIES = [
    ('conflict', r'hostil|conflict|negativity|aggress|violence|abuse'),
    ('relationship quality', r'hapmar|happ|satisf|quality|positivity|love|commit'),
    ('age at marriage and age', r'age.?at.?marr|age_band|age at wedding|agewed|wife_age_at|husband_age_at|respondent_age_at|age_pair|sex_age|gap|^age|age_per|age_bin|age_first|num__age'),
    ('marriage length and timing', r'marriage_years|duration|wedding_year|wedding period|cohort|period|survey_cycle|relationship_years|years_since|wave|decade|year'),
    ('education', r'educ|edu_|degree|school|grade|hgc|ba_by|afqt|cognitive|credential|enrolled'),
    ('race/ethnicity', r'race|ethnic|hispanic|black|asian|white|origin|nativity|born_|foreign|language|immigra'),
    ('family of origin', r'family|intact|parent|mother|father|sibs|sibling|step|income_at_16|place_at_16|raised in|parmarr'),
    ('relationship history', r'cohab|prior_union|married_before|prev_married|times_married|divorced_before|prior_marr|marriages|partners|premarital_sex|presex|first_sex|how_met|met_|married=|couple_type|remarr|separated vs|first marriage'),
    ('children', r'child|birth|pregnan|kids|childs'),
    ('religion', r'relig|attend|pray|denomination|fundamental|faith|god|obey|church|spiritual|importance_at_interview|private_practice|_broad|none_pair|weekly_pair|affiliation'),
    ('politics', r'polit|party|polviews|liberal|conservative|democrat|republican'),
    ('occupation', r'occup|prestige|industry|soc_major|job'),
    ('economics and wealth', r'income|earn|wage|wealth|net_worth|debt|asset|equity|bank|stocks|retirement|home|owner|tenure|poverty|work|employ|hours|satfin|business|money|financial'),
    ('health and behaviour', r'health|mhi|depress|alcohol|substance|deliquen|delinquen|rosenberg|rotter|mental|smok|drug|evstray|sexfreq|infidel'),
    ('personality', r'neurot|personality|extravers|agreeab|conscient|openness'),
    ('attitudes', r'fefam|xmarsex|attitude|gender role'),
    ('wedding and courtship', r'wedding cost|ring|honeymoon|proposal|looks'),
    ('demographics and place', r'sex|gender|male|women|region|urban|place|state|province|country|same_sex'),
]


def family(text):
    t = text.lower()
    for name, pat in FAMILIES:
        if re.search(pat, t):
            return name
    return 'other'


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x else None


def rows(path):
    with open(path, newline='') as f:
        return list(csv.DictReader(f))


SOURCES = []


def source(**k):
    SOURCES.append(k)


# ---- lenses (prospective unless the timing says otherwise) ------------------------------------
GSS = dict(lens='gss_panel_marriages', population='U.S. married adults in the GSS panels 2006-2020',
           outcome='divorced or separated 2 years later', timing='measured at the interview before the outcome (prospective)')
source(file='gss_panel/logistic_odds_ratios.csv', measure='odds ratio', adjusted=True,
       adjusted_for='all current GSS-panel inputs (near-unpenalised logistic)', pred='feature', level=None, per='per',
       est='odds_ratio', lo='ci_low', hi='ci_high', **GSS)
source(file='gss_panel/extended_odds_ratios.csv', measure='odds ratio', adjusted=True, adjusted_from='adjusted_for',
       pred='variable', level='level', ref='reference', per='per', est='odds_ratio', lo='ci95_low', hi='ci95_high',
       n='level_records', events='level_events', **GSS)
source(file='gss_panel/extended_rates.csv', measure='risk ratio (unadjusted, 2-year)', adjusted=False, pred='group',
       level='level', est='ratio_vs_reference', lo='ratio_ci_low', hi='ratio_ci_high', n='records', events='events',
       skip=lambda r: r['ratio_vs_reference'] in ('1', '1.0', '1.00000') and r['ratio_ci_low'] == r['ratio_ci_high'], **GSS)
source(file='gss_panel/hapmar_dissolution_rates.csv', measure='risk ratio (unadjusted)', adjusted=False, pred='group',
       level='level', est='ratio_vs_reference', lo='ratio_ci_low', hi='ratio_ci_high', n='records', events='events',
       variant_col='variant', horizon_col='horizon',
       skip=lambda r: r['variant'] != 'main' or r['ratio_ci_low'] == r['ratio_ci_high'], **GSS)
source(file='gss_panel/xs_logistic_odds_ratios.csv', lens='gss_cumulative_cross_section', population_col='sample',
       population='GSS cumulative cross-sections 1972-2024', outcome='ever divorced (cross-sectional)', measure='odds ratio',
       adjusted=True, adjusted_for='other inputs of the cross-sectional model',
       timing='CROSS-SECTIONAL: reported at one interview, often long after any divorce', pred='feature', est='odds_ratio',
       lo='ci_low', hi='ci_high')
N97 = dict(lens='nlsy97_first_marriage', population='NLSY97 first marriages (born 1980-84), followed from the wedding',
           outcome='separation or divorce (annual rate)', timing='fixed at or before the wedding (prospective)')
source(file='nlsy97_first_marriage/additive_rate_ratios.csv', measure='rate ratio', adjusted=True,
       adjusted_for='additive spline Poisson GLM, all inputs', pred='input', level='value', ref='reference',
       est='rate_ratio', lo='ci95_low', hi='ci95_high', **N97)
source(file='nlsy97_first_marriage/extended_rate_ratios.csv', measure='rate ratio', adjusted=True, adjusted_from='adjusted_for',
       pred='variable', level='level', ref='reference', per='per', est='rate_ratio', lo='ci95_low', hi='ci95_high',
       n='marriages', events='dissolutions', **N97)
N79 = dict(lens='nlsy79_first_marriage', population='NLSY79 first marriages begun 1981-2022 (born 1957-64)',
           outcome='legal divorce (annual rate)', timing='fixed at or before the wedding (prospective)')
source(file='nlsy79_full/extended_rate_ratios.csv', measure='rate ratio', adjusted=True, adjusted_from='adjusted_for',
       pred='variable', level='level', ref='reference', per='per', est='rate_ratio', lo='ci95_low', hi='ci95_high',
       n='marriages', events='divorces', **N79)
NSFG = dict(lens='nsfg_pooled_first_marriage', population="U.S. women's first marriages, NSFG 1995-2023 pooled",
            outcome='dissolution: divorce, annulment or separation (annual rate)', timing='fixed at or before the wedding')
source(file='nsfg_pooled_first_marriage/additive_partial_effects.csv', measure='rate ratio (partial effect)', adjusted=True,
       adjusted_for='additive spline Poisson GLM (women), all inputs', pred='input', level='value', est='rate_ratio',
       lo='ci95_low', hi='ci95_high', skip=lambda r: r['rate_ratio'] in ('1.0000', '1') and r['ci95_low'] == r['ci95_high'], **NSFG)
source(file='nsfg_pooled_first_marriage/extended_rate_ratios.csv', measure='rate ratio', adjusted=True,
       adjusted_from='adjusted_for', pred='variable', level='level', ref='reference', per='per', est='rate_ratio',
       lo='ci95_low', hi='ci95_high', n='marriages', events='dissolutions', **NSFG)
CAN = dict(lens='canada_gss_first_marriage', population='Canadian first marriages, Statistics Canada GSS 1995-2017',
           outcome='separation (annual rate)', timing='fixed at the wedding unless stated')
source(file='canada_gss_family/rate_ratios.csv', measure='rate ratio', adjusted=True, adjusted_for_col='model',
       pred='input', level='level', ref='reference', est='rate_ratio', lo='ci95_low', hi='ci95_high', n='marriages',
       events='dissolutions', **CAN)
source(file='canada_gss_family/extended_rate_ratios.csv', measure='rate ratio', adjusted=True, adjusted_from='adjusted_for',
       pred='variable', level='level', ref='reference', per='per', est='rate_ratio', lo='ci95_low', hi='ci95_high',
       n='marriages', events='dissolutions', timing_col='timing', population_col='sample',
       **{k: v for k, v in CAN.items() if k != 'timing'}, timing='see row')
SIPP = dict(lens='sipp_prospective_couples', population='U.S. married co-resident couples, SIPP 2018-2025',
            outcome='separation or divorce within the next year', timing='baseline December, before the outcome year')
source(file='sipp_marital_history/extended_rate_ratios.csv', measure='odds ratio', adjusted=True, adjusted_from='adjusted_for',
       pred='variable', level='level', ref='reference', per='per', est='odds_ratio', lo='ci95_low', hi='ci95_high',
       n='couple_years', events='events', **SIPP)
source(file='hcmst/odds_ratios.csv', lens='hcmst_couples', population='U.S. couples (married and unmarried), HCMST 2009-2017',
       outcome='break-up by the next wave', timing='measured at wave 1 (prospective)', measure='odds ratio', adjusted=True,
       adjusted_for='other HCMST model inputs', pred='term', ref_col='reference', est='odds_ratio', lo='ci_low', hi='ci_high')
source(file='annual_nlsy/annual_adjusted_rate_ratios.csv', lens='nlsy79_couples', population='NLSY79 married respondents 2000-2022',
       outcome='divorce (annual rate)', timing='measured at the interview before the year (prospective)', measure='rate ratio',
       adjusted=True, adjusted_for='other inputs of the annual model', pred='term', sex_col='sex', est='rate_ratio',
       lo='ci_low', hi='ci_high', skip=lambda r: r['term'] == 'Intercept')
source(file='pairing_religion/religion_adjusted_rate_ratios.csv', lens='nlsy79_couples', population='NLSY79 married respondents',
       outcome='divorce (annual rate)', timing='attendance reported at the interview before the year', measure='rate ratio',
       adjusted=True, adjusted_for_col='model', pred='term', est='rate_ratio', lo='ci95_low', hi='ci95_high', n='n', events='events',
       skip=lambda r: r['term'] == 'Intercept')
source(file='politics_nlsy/politics_adjusted_rate_ratios.csv', lens='nlsy79_couples', population='NLSY79 married respondents',
       outcome='divorce (annual rate)', timing='party reported in 2008, before the follow-up years', measure='rate ratio',
       adjusted=True, adjusted_for_col='model', pred='term', est='rate_ratio', lo='ci95_low', hi='ci95_high', n='n', events='events',
       skip=lambda r: r['term'] == 'Intercept')
source(file='couple_profiles/joint_model_coefficients.csv', lens='nlsy79_couples', population='NLSY79 married couples (respondent and spouse)',
       outcome='divorce (annual rate)', timing='measured at the interview before the year', measure='rate ratio', adjusted=True,
       adjusted_for='joint couple-profile model', pred='term', est='rate_ratio', lo='ci_low', hi='ci_high',
       skip=lambda r: r['term'] == 'Intercept')
source(file='direct_earnings/husband_only_vs_majority_direct.csv', lens='nlsy79_couples', population='NLSY79 married couples',
       outcome='divorce (annual rate)', timing='earnings in the year before', measure='rate ratio (direct standardised contrast)',
       adjusted=True, adjusted_for_col='context', pred=None, fixed_predictor='husband-only earner vs husband-majority dual earners',
       est='rate_ratio', lo='ratio_ci95_low', hi='ratio_ci95_high')
source(file='acs/adjusted_models.csv', lens='acs_one_year_divorce', population='U.S. ACS 2023, married in the past year',
       outcome='divorced in the past 12 months', timing='CROSS-SECTIONAL: characteristics measured after any divorce',
       measure='odds ratio', adjusted=True, adjusted_for_col='model', pred='term', sex_col='sex', est='odds_ratio',
       lo='ci95_low', hi='ci95_high', n='unweighted_n', events='events', skip=lambda r: r['term'] == 'Intercept')
source(file='thornes_collard_presex/odds_ratios.csv', lens='thornes_collard_1979', population='British married people, Thornes & Collard (1979) published counts',
       outcome='divorced vs still married', timing='premarital sex, reported retrospectively', measure='odds ratio (crude, from published counts)',
       adjusted=False, pred='exposure', sex_col='group', est='odds_ratio', lo='ci_low', hi='ci_high')

ACS_DIMS = {'race_detail': 'race/ethnicity', 'asian_detail': 'race/ethnicity', 'hispanic_origin': 'race/ethnicity',
            'race_ethnicity': 'race/ethnicity', 'household_income_band': 'economics and wealth', 'tenure': 'economics and wealth',
            'income_quintile': 'economics and wealth', 'education': 'education', 'times_married': 'relationship history',
            'duration_band': 'marriage length and timing', 'age_band': 'age at marriage and age', 'employment': 'economics and wealth',
            'occupation_group': 'occupation', 'soc_major': 'occupation', 'industry_sector': 'occupation', 'nativity': 'race/ethnicity'}


def build():
    entries = []
    for s in SOURCES:
        path = REPRO / s['file']
        if not path.exists():
            continue
        for i, r in enumerate(rows(path), start=1):
            if s.get('skip') and s['skip'](r):
                continue
            est = num(r.get(s['est']))
            lo, hi = num(r.get(s['lo'])), num(r.get(s['hi']))
            if est is None or lo is None or hi is None:
                continue
            pred = r[s['pred']] if s.get('pred') else s['fixed_predictor']
            level = r.get(s['level'], '') if s.get('level') else ''
            if level in ('Unknown', 'Not measured before wedding', 'Not asked', 'Missing'):
                continue  # missing-data indicator levels are not predictors
            if s.get('pred') and re.search(r'_(Unknown|Missing)$|missingindicator|: Unknown vs', str(r[s['pred']])):
                continue
            ref = r.get(s['ref'], '') if s.get('ref') else r.get(s.get('ref_col', ''), '') if s.get('ref_col') else ''
            per = r.get(s['per'], '') if s.get('per') else ''
            contrast = ' '.join(x for x in [level and f'{level}', ref and f'vs {ref}', per if per and per != 'vs reference' else ''] if x)
            pop = s['population'] + (f" ({r[s['population_col']]})" if s.get('population_col') else '')
            sub = r.get(s['sex_col']) if s.get('sex_col') else None
            adj_for = r[s['adjusted_from']] if s.get('adjusted_from') else (
                f"model: {r[s['adjusted_for_col']]}" if s.get('adjusted_for_col') else s.get('adjusted_for', ''))
            text = f'{pred} {level}'
            e = dict(family=family(text), predictor=pred, level=level, reference=ref, contrast=contrast or pred,
                     measure=s['measure'], estimate=est, ci95=[lo, hi], lens=s['lens'], population=pop,
                     subgroup=sub, outcome=s['outcome'], adjusted=s['adjusted'], adjusted_for=adj_for,
                     timing=r.get(s['timing_col']) if s.get('timing_col') else s['timing'],
                     n=num(r.get(s['n'])) if s.get('n') else None, events=num(r.get(s['events'])) if s.get('events') else None,
                     source=dict(file=f'reproducibility/{s["file"]}', row=i, column=s['est']))
            if s.get('horizon_col'):
                e['outcome'] = f"{s['outcome'].replace('2 years', r[s['horizon_col']] + ' years')}"
            entries.append(e)
    # ACS one-year incidence cells (descriptive group rates, not ratios)
    for f in ['acs_pums_multiyear/baselines_oneway.csv']:
        for i, r in enumerate(rows(REPRO / f), start=1):
            if r['dims'] not in ACS_DIMS:
                continue
            entries.append(dict(family=ACS_DIMS[r['dims']], predictor=r['dims'], level=r['values'], reference='',
                                contrast=f"{r['dims']} = {r['values']}", measure='one-year divorce incidence per 1,000 (group rate)',
                                estimate=num(r['per_1000']), ci95=[num(r['ci95_low']), num(r['ci95_high'])],
                                lens='acs_one_year_divorce', population='U.S. ACS 2019, 2021-2024 pooled; married at some point in the past 12 months',
                                subgroup=None, outcome='divorced in the past 12 months', adjusted=False, adjusted_for='',
                                timing='CROSS-SECTIONAL: measured at the interview, after any divorce',
                                n=num(r['people']), events=num(r['divorces']), source=dict(file=f'reproducibility/{f}', row=i, column='per_1000')))
    detail = REPRO / 'acs_pums_multiyear/baselines_detail.csv.gz'
    if detail.exists():
        import gzip
        with gzip.open(detail, 'rt', newline='') as fh:
            for i, r in enumerate(csv.DictReader(fh), start=1):
                if '|' in r['dims'] or r['dims'] not in ACS_DIMS:
                    continue
                if r['values'].startswith(('Not non-Hispanic', 'Not Hispanic')):
                    continue
                entries.append(dict(family=ACS_DIMS[r['dims']], predictor=r['dims'], level=r['values'], reference='',
                                    contrast=f"{r['dims']} = {r['values']}", measure='one-year divorce incidence per 1,000 (group rate)',
                                    estimate=num(r['per_1000']), ci95=[num(r['ci95_low']), num(r['ci95_high'])],
                                    lens='acs_one_year_divorce', population='U.S. ACS 2019, 2021-2024 pooled; married at some point in the past 12 months',
                                    subgroup=None, outcome='divorced in the past 12 months', adjusted=False, adjusted_for='',
                                    age_standardised=dict(per_1000=num(r['age_std_per_1000']),
                                                          ci95=[num(r['age_std_ci95_low']), num(r['age_std_ci95_high'])]),
                                    timing='CROSS-SECTIONAL: measured at the interview, after any divorce',
                                    n=num(r['people']), events=num(r['divorces']),
                                    source=dict(file='reproducibility/acs_pums_multiyear/baselines_detail.csv.gz', row=i, column='per_1000')))
    # verified literature: primary full text, a ratio measure, a number and a CI
    ev = json.loads((REPRO / 'literature_evidence/evidence.json').read_text())
    for rec in ev['records']:
        m = rec.get('measure', '')
        if not (rec.get('verified') and rec.get('provenance') == 'primary' and re.match(r'(HR|OR|RR|IRR)\b|odds ratio|hazard ratio|relative risk', m, re.I)):
            continue
        est, lo, hi = num(rec.get('estimate')), num(rec.get('ci_low')), num(rec.get('ci_high'))
        if est is None:
            continue
        entries.append(dict(family=family(rec.get('predictor', '') + ' ' + rec.get('contrast', '')), predictor=rec.get('predictor'),
                            level='', reference='', contrast=rec.get('contrast'), measure=m, estimate=est,
                            ci95=[lo, hi] if lo is not None and hi is not None else None, lens='literature',
                            population=rec.get('population'), subgroup=None, outcome=rec.get('contrast'),
                            adjusted=bool(rec.get('adjusted_for')) and rec.get('adjusted_for') not in ('none', 'None'),
                            adjusted_for=rec.get('adjusted_for'), timing=rec.get('design'), n=None, events=None,
                            citation=rec.get('citation'), doi=rec.get('doi'), usable_in_app=bool(rec.get('usable_in_app')),
                            source=dict(file='reproducibility/literature_evidence/evidence.json', record=rec['id'], column='estimate')))
    for k, e in enumerate(entries):
        e['id'] = f'a{k:05d}'
    fams = sorted({e['family'] for e in entries})
    out = dict(
        id='predictor_atlas', version=1, built='2026-10-20',
        about=('Every effect estimate in this project in one schema: rate, odds and hazard ratios with 95% CIs from the lenses\' '
               'committed result tables, ACS one-year incidence by group (descriptive), and verified primary literature records. '
               'Numbers are copied, never computed; each entry names its source file and row (or evidence record id). '
               'Estimates from different lenses use different outcomes, populations, horizons and adjustment sets and must not be '
               'pooled or compared as if they were the same quantity. Cross-sectional entries are measured after any divorce.'),
        schema=dict(family='predictor family (keyword rules in build_atlas.py)', predictor='input or term as the source names it',
                    level='level of a categorical input', reference='reference level', contrast='what is compared',
                    measure='odds ratio / rate ratio / hazard ratio / risk ratio / group rate per 1,000', estimate='point estimate',
                    ci95='95% interval as published by the source', lens='lens id or "literature"', adjusted='true if from a multivariable model',
                    timing='when the predictor was measured relative to the outcome', source='file and 1-based data row (or record id)'),
        families={f: sum(e['family'] == f for e in entries) for f in fams},
        lenses=sorted({e['lens'] for e in entries}),
        entries=entries)
    OUT.write_text(json.dumps(out, separators=(',', ':'), allow_nan=False))
    print(len(entries), 'entries', out['families'])


if __name__ == '__main__':
    build()
