"""Write ../../app/data/race_coverage.json: for every lens, the race/ethnicity categories its data
distinguish and how each category of the (finer) form maps onto them, so the app can say, e.g.,
"NSFG scores Asian as 'Other'". Hand-coded from each bundle's documented inputs and its source
variables; `null` means the lens cannot place that answer and the adapter should say so (or refuse
when the model has no unknown level). Finer categories that exist only in the 2026-10-20 extended
models or the ACS detail baselines are listed under `finer_available`.
Usage: python3 -I race_coverage.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'app' / 'data' / 'race_coverage.json'
FORM = ['White', 'Black', 'Hispanic', 'Asian', 'American Indian or Alaska Native', 'Native Hawaiian or Pacific Islander',
        'Multiracial', 'Other']


def m(**kw):
    out = {f: None for f in FORM}
    for k, v in kw.items():
        out[{'AIAN': 'American Indian or Alaska Native', 'NHPI': 'Native Hawaiian or Pacific Islander'}.get(k, k)] = v
    return out


NBNH = 'Non-Black non-Hispanic'
LENSES = [
    dict(lens='nlsy79_couples', input=None, categories=[], form_mapping=m(),
         note='These models have no race-ethnicity input (the couple models use schooling, earnings, ages, religion and marriage history).'),
    dict(lens='nlsy79_individuals', input=None, categories=[], form_mapping=m(), note='No race-ethnicity input.'),
    dict(lens='nlsy79_first_marriage', input='race', source='screener race-ethnicity cohort (R0214700)',
         categories=['Hispanic', 'Black', NBNH],
         form_mapping=m(White=NBNH, Black='Black', Hispanic='Hispanic', Asian=NBNH, AIAN=NBNH, NHPI=NBNH, Multiracial=None, Other=NBNH),
         finer_available=dict(where='models_extended (race_detail)', categories=['Hispanic', 'Black', 'Asian or Pacific Islander',
                                                                              'American Indian', 'White and other'],
                              note='from the 1979 first racial/ethnic origin among non-Black non-Hispanic respondents; small '
                                   'Asian cell, American Indian origin overstated in 1979 (NLS note); held out it added nothing'),
         note="NLSY79 sampled Hispanic, Black and 'non-Black non-Hispanic' cohorts; Asian, AIAN, NHPI and Other are scored "
              "as non-Black non-Hispanic. Multiracial cannot be placed (a multiracial Black or Hispanic person would be in those cohorts)."),
    *[dict(lens=lens, input='race_ethnicity', source='KEY!RACE_ETHNICITY (1997)',
         categories=['Black', 'Hispanic', NBNH],
         form_mapping=m(White=NBNH, Black='Black', Hispanic='Hispanic', Asian=NBNH, AIAN=NBNH, NHPI=NBNH, Multiracial=NBNH, Other=NBNH),
         note="Same NLSY97 race-ethnicity coding as the first-marriage lens: Asian, AIAN, NHPI, Multiracial and Other are scored "
              "as non-Black non-Hispanic.")
      for lens in ('nlsy97_cohab_marriage', 'nlsy97_cohab_split')],
    dict(lens='nlsy97_first_marriage', input='race_ethnicity', source='KEY!RACE_ETHNICITY (1997)',
         categories=['Black', 'Hispanic', NBNH],
         form_mapping=m(White=NBNH, Black='Black', Hispanic='Hispanic', Asian=NBNH, AIAN=NBNH, NHPI=NBNH, Multiracial=NBNH, Other=NBNH),
         finer_available=dict(where='models_extended (race_detail)', categories=['Hispanic', 'White', 'Black', 'American Indian or Alaska Native',
                                                                              'Asian or Pacific Islander', 'Other'],
                              note='KEY!RACE x KEY!ETHNICITY; Asian and Pacific Islander are one category; 74 Asian/PI first marriages; '
                                   'added nothing held out'),
         note="NLSY97 groups mixed race (non-Hispanic) with non-Black non-Hispanic."),
    dict(lens='nsfg_pooled_first_marriage', input='wife_race_ethnicity', source='HISPRACE / HISPRACE2',
         categories=['Hispanic', 'White', 'Black', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Other', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'),
         note="NSFG public files give Hispanic, non-Hispanic White, non-Hispanic Black and non-Hispanic Other (Asian, AIAN, NHPI "
              "and multiple races are all 'Other'). The husband's group is coded the same way."),
    dict(lens='nsfg2002_first_marriage', input='wife_race_ethnicity', source='HISPRACE (2002)',
         categories=['Hispanic', 'White', 'Black', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Other', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'), note="Asian, AIAN, NHPI and multiracial are 'Other'."),
    dict(lens='nsfg2002_family', input='wife_race_ethnicity', source='HISPRACE (2002)',
         categories=['Hispanic', 'White', 'Black', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Other', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'), note="Asian, AIAN, NHPI and multiracial are 'Other'."),
    dict(lens='gss_panel_marriages', input='race', source='RACE (interviewer-coded White / Black / Other)',
         categories=['White', 'Black', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic=None, Asian='Other', AIAN='Other', NHPI='Other',
                        Multiracial=None, Other='Other'),
         finer_available=dict(where='models_extended (race_detail)', categories=['White', 'Black', 'Hispanic', 'Asian',
                                                                              'American Indian or Alaska Native',
                                                                              'Native Hawaiian or Pacific Islander', 'Multiracial', 'Other'],
                              note='RACECEN1-2 and HISPANIC; 135 Asian, 9 AIAN and 2 NHPI follow-ups, so these levels are '
                                   'very imprecise; added nothing held out'),
         note='GSS RACE does not ask Hispanic origin and a multiracial respondent picks one race, so Hispanic and Multiracial '
              'cannot be placed in the current model (the adapter refuses rather than guess).'),
    dict(lens='hcmst_couples', input='couple_race', source='HCMST couple race composition',
         categories=['White', 'Black', 'Hispanic', 'Other'],
         couple_categories=['Both White', 'Both Black', 'Both Hispanic', 'Both Other', 'Interracial'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Other', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'),
         note="Per partner: White, Black, Hispanic (any race), Other (Asian, Native American, other). The couple input is 'Both <group>' "
              "when the two partners map to the same group, else 'Interracial'."),
    *[dict(lens=lens, input='couple_race', source='HCMST couple race composition (unmarried couples, 2009)',
           categories=['White', 'Black', 'Hispanic', 'Other'],
           couple_categories=['Both White', 'Both Hispanic', 'Both Other', 'Interracial', 'Unknown'],
           form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Other', AIAN='Other', NHPI='Other',
                          Multiracial='Other', Other='Other'),
           note="Same coding as the HCMST couples lens: per partner White, Black, Hispanic (any race) or Other; the couple input "
                "is 'Both <group>' when both map to the same group, else 'Interracial' (Both Black is the reference level).")
      for lens in ('hcmst_dating_marriage', 'hcmst_dating_breakup')],
    dict(lens='prewedding_harmonized', input='respondent_race', source='NSFG race-ethnicity recode (HISPRACE), harmonized',
         categories=['Hispanic', 'White', 'Black', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Other', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'),
         note="Four groups, as harmonized across NSFG, NLSY, SIPP and Canada: Asian, AIAN, NHPI and Multiracial are scored as "
              "'Other'. The spouse's race uses the same four groups and same_race compares them."),
    dict(lens='newlywed_la_couples', input=None, categories=[], form_mapping=m(), note='No race-ethnicity input.'),
    dict(lens='canada_gss_first_marriage', input=None, categories=[], form_mapping=m(),
         note='The Canadian GSS PUMF has no race input in these models (it carries a visible-minority flag only); '
              'the lens uses first language and birthplace instead.'),
    dict(lens='sipp_first_marriage', input='race_ethnicity', source='ERACE and EORIGIN',
         categories=['Hispanic', 'White', 'Black', 'Asian', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Asian', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'),
         note="SIPP's public ERACE is White alone / Black alone / Asian alone / residual: AIAN, NHPI and multiracial are one "
              "residual group ('Other'). The 2001-2008 panels code Asian with Pacific Islander."),
    dict(lens='sipp_prospective_couples', input='wife_race_ethnicity', source='ERACE and EORIGIN',
         categories=['Hispanic', 'White', 'Black', 'Asian', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Asian', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'),
         finer_available=dict(where='models_extended (husband_race_ethnicity)', categories=['Hispanic', 'White', 'Black', 'Asian', 'Other'],
                              note="the husband's own group; SIPP has no finer public categories"),
         note='AIAN, NHPI and multiracial are the SIPP residual group.'),
    dict(lens='acs_one_year_divorce', input='race_ethnicity', source='RAC1P and HISP',
         categories=['Hispanic', 'White', 'Black', 'Asian', 'Other'],
         form_mapping=m(White='White', Black='Black', Hispanic='Hispanic', Asian='Asian', AIAN='Other', NHPI='Other',
                        Multiracial='Other', Other='Other'),
         finer_available=dict(where='app/data/acs_divorce_baselines.json cells race_detail, asian_detail, hispanic_origin',
                              categories=['Hispanic', 'White', 'Black', 'Asian', 'American Indian or Alaska Native',
                                          'Native Hawaiian or Pacific Islander', 'Multiracial', 'Other'],
                              note='observed rates only (no model), cells >= 200 people with replicate-weight CIs; Asian '
                                   'subgroups (Chinese, Asian Indian, Filipino, Vietnamese, Korean, Japanese, ...) and Hispanic '
                                   'origins (Mexican, Puerto Rican, Cuban, Dominican, ...)'),
         note='The models use five groups; the baselines file has every census group (see finer_available).'),
    dict(lens='fair_pt1969', input=None, categories=[], form_mapping=m(), note='No race-ethnicity input (affairs data).'),
    dict(lens='fair_redbook1974', input=None, categories=[], form_mapping=m(), note='No race-ethnicity input (affairs data).'),
]

if __name__ == '__main__':
    out = dict(id='race_coverage', version=1, built='2026-10-20',
               about=('How each lens can use a person\'s race and ethnicity. form_categories are the answers the form offers; '
                      'form_mapping gives the category each lens scores for that answer, or null when the lens cannot place it '
                      '(the app should say so, and refuse when the model has no unknown level). Hispanic is an origin, so '
                      '"Hispanic" means Hispanic of any race and the other categories are non-Hispanic.'),
               form_categories=FORM, lenses=LENSES)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
    print('lenses', len(LENSES))
