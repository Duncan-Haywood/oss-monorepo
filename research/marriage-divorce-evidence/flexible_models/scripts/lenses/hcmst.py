"""HCMST 2009 couples (married and unmarried, incl. same-sex): break-up per follow-up period
(5 periods to 2017), discrete-time logistic hazard on couple-periods.

Couples, couple-periods, outcome and folds (GroupKFold by couple, shuffled, SEED + repeat) are
train_models.py's; models are fit unweighted as the lens does, and scored unweighted.
Features: the lens's full inputs plus every other wave-1 item that describes both partners or the
couple before follow-up (respondent and partner age, schooling, race, religion, party, mothers'
schooling; region, metro, housing tenure, work status; same school/college/town, parents knew
each other, relatives seen, distance moved; age at meeting, years since meeting and cohabiting).
Dyadic specifications for the actor-partner comparison:
  baseline (lens)      couple summaries: mean age, age gap, mean schooling, schooling gap, race pair,
                       party pair, religion pair (train_models.py additive_full, C by inner CV)
  dyad_separate_glm    respondent and partner terms entered separately, no gap/match terms
  dyad_apim_glm        respondent + partner terms + absolute gaps + match indicators
Raw data: $HCMST_RAW (default <scratch>/hcmst_raw), from reproducibility/hcmst/download.sh.
"""
import os

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from . import _common as c
from ._glm import LogitAdditive

ADVANCE = ('r_age', 'p_age', 'years_since_met', 'years_since_cohab')
REPEATS = int(os.environ.get('FLEX_HCMST_REPEATS', 3))
EXTRA_NUM = ['r_age', 'p_age', 'r_yrsed', 'p_yrsed', 'r_mom_yrsed', 'p_mom_yrsed', 'relatives_seen', 'distance_moved_10mi',
             'age_met', 'years_since_met', 'years_since_cohab']
EXTRA_CAT = ['r_race', 'p_race', 'r_party', 'p_party', 'r_religion', 'p_religion', 'r_sex', 'r_work', 'metro', 'region4',
             'housing', 'r_evangelical', 'same_high_school', 'same_college', 'same_town', 'parents_knew', 'us_raised',
             'glb_status', 'r_religion_changed']


def extras(H):
    a, _ = H.read('HCMST_ver_3.04.dta')
    a = a[a.qflag == 1]

    def lab(s, m):
        return s.map(m).fillna('Unknown')

    neg = lambda s: s.where(s >= 0)  # noqa: E731
    yn = {1: 'Yes', 2: 'No'}
    rel = {1: 'Protestant', 2: 'Catholic', 3: 'Other Christian', 4: 'Other Christian', 5: 'Other Christian', 6: 'Jewish',
           7: 'Other', 8: 'Other', 9: 'Other', 10: 'Other', 11: 'Other', 12: 'Other', 13: 'None'}
    x = pd.DataFrame(dict(
        id=a.caseid_new.astype(int).to_numpy(),
        r_age=a.ppage.to_numpy(float), p_age=neg(a.q9).to_numpy(float),
        r_yrsed=neg(a.respondent_yrsed).to_numpy(float), p_yrsed=neg(a.partner_yrsed).to_numpy(float),
        r_mom_yrsed=neg(a.respondent_mom_yrsed).to_numpy(float), p_mom_yrsed=neg(a.partner_mom_yrsed).to_numpy(float),
        relatives_seen=neg(a.q16).to_numpy(float), distance_moved_10mi=neg(a.distancemoved_10mi).to_numpy(float),
        age_met=neg(a.q21a).to_numpy(float), years_since_met=neg(a.how_long_ago_first_met).to_numpy(float),
        years_since_cohab=neg(a.how_long_ago_first_cohab).to_numpy(float),
        r_race=lab(a.respondent_race, {1: 'White', 2: 'Black', 3: 'Native American', 4: 'Asian/PI', 5: 'Other', 6: 'Hispanic'}).to_numpy(),
        p_race=lab(a.partner_race, {1: 'White', 2: 'Black', 3: 'Native American', 4: 'Asian/PI', 5: 'Other', 6: 'Hispanic'}).to_numpy(),
        r_party=lab(a.pppartyid3, {1: 'Republican', 2: 'Other', 3: 'Democrat'}).to_numpy(),
        p_party=lab(a.q12, {1: 'Republican', 2: 'Democrat', 3: 'Other', 4: 'Other'}).to_numpy(),
        r_religion=lab(a.papreligion, rel).to_numpy(), p_religion=lab(a.q7b, rel).to_numpy(),
        r_sex=lab(a.ppgender, {1: 'Male', 2: 'Female'}).to_numpy(),
        r_work=lab(a.ppwork, {1: 'Employed', 2: 'Employed', 3: 'Not working', 4: 'Not working', 5: 'Retired',
                              6: 'Not working', 7: 'Not working'}).to_numpy(),
        metro=lab(a.ppmsacat, {0: 'Non-metro', 1: 'Metro'}).to_numpy(),
        region4=lab(a.ppreg4, {1: 'Northeast', 2: 'Midwest', 3: 'South', 4: 'West'}).to_numpy(),
        housing=lab(a.pprent, {1: 'Owned', 2: 'Rented', 3: 'Occupied without rent'}).to_numpy(),
        r_evangelical=lab(a.papevangelical, yn).to_numpy(),
        same_high_school=lab(a.q25, {1: 'Same', 2: 'Different'}).to_numpy(),
        same_college=lab(a.q26, {1: 'Same', 2: 'Different', 3: 'Did not attend'}).to_numpy(),
        same_town=lab(a.q27, {1: 'Same', 2: 'Different'}).to_numpy(),
        parents_knew=lab(a.q28, yn).to_numpy(),
        us_raised=lab(a.US_raised, {1: 'Yes', 0: 'No'}).to_numpy(),
        glb_status=lab(a.glbstatus, {0: 'No', 1: 'Yes'}).to_numpy(),
        r_religion_changed=lab(a.q13a, yn).to_numpy(),
    ))
    return x


def load(sample=None):
    import flex
    os.environ.setdefault('HCMST_RAW', str(c.SCRATCH / 'hcmst_raw'))
    c.lens_path('hcmst')
    import hcmst_data as H
    import train_models as tm
    couples, periods, _ = H.couples_2009()
    couples = couples.merge(extras(H), on='id', how='left').reset_index(drop=True)
    # dyadic gap / match terms (actor-partner model)
    couples['same_race'] = np.where(couples.r_race == couples.p_race, 'Same', 'Different')
    couples['same_party'] = np.where(couples.r_party == couples.p_party, 'Same', 'Different')
    couples['same_religion'] = np.where(couples.r_religion == couples.p_religion, 'Same', 'Different')
    couples['mom_edu_gap'] = (couples.r_mom_yrsed - couples.p_mom_yrsed).abs()
    rows = tm.advance(periods.merge(couples.drop(columns=['outcome']), on='id', how='left'))
    # r_age and p_age are wave-1 values; advance them like mean_age
    off = rows.period.map(tm.OFFSET).to_numpy()
    for col in ADVANCE:
        rows[col] = rows[col] + off
    couples['ci'] = np.arange(len(couples))
    rows['ci'] = rows.id.map(dict(zip(couples.id, couples.ci))).to_numpy()
    rows['w1'] = 1.0
    num = list(H.NUMERIC) + EXTRA_NUM
    cat = ['period'] + list(H.FULL_CATEGORICAL) + EXTRA_CAT
    folds = []
    for r in range(REPEATS):
        fc = np.empty(len(couples), int)
        for f, (_, te) in enumerate(GroupKFold(tm.FOLDS, shuffle=True, random_state=tm.SEED + r).split(couples, groups=couples.id)):
            fc[te] = f
        folds.append(fc[rows.ci.to_numpy()])

    class Base:
        def __init__(self, d):
            C = tm.choose_C(d, d.id, 'additive_full', tm.SEED)
            self.p = tm.pipeline('additive_full', C).fit(d, d.event)

        def predict(self, d):
            return tm.proba(self.p, d)

    class Boost:
        def __init__(self, d):
            self.p = tm.pipeline('boosting').fit(d, d.event)

        def predict(self, d):
            return tm.proba(self.p, d)

    summ_num = ['relationship_years', 'hh_income_k', 'children_in_hh']
    shared_cat = ['period', 'relationship_quality', 'married', 'cohabiting', 'couple_type', 'how_met', 'prior_marriage',
                  'earnings', 'parental_approval']
    sep_num = summ_num + ['r_age', 'p_age', 'r_yrsed', 'p_yrsed']
    sep_cat = shared_cat + ['r_race', 'p_race', 'r_party', 'p_party', 'r_religion', 'p_religion']
    apim_num = sep_num + ['age_gap', 'edu_gap']
    apim_cat = sep_cat + ['same_race', 'same_party', 'same_religion']

    def glm(num_, cat_):
        return lambda d: LogitAdditive(d, num_, cat_, 'event', 'id')

    couples['T'] = couples.last_period + np.where(couples.outcome == 'breakup', 0.0, 0.5)
    couples['D'] = (couples.outcome == 'breakup').astype(float)
    couples['W'] = 1.0
    couples['group'] = np.arange(len(couples))

    def score(predict, people):
        e = tm.expand(people)  # every couple x period; advances mean_age and relationship_years
        o = e.period.map(tm.OFFSET).to_numpy()
        for col in ADVANCE:
            e[col] = e[col] + o
        h = predict(e).reshape(len(people), tm.NP)
        return 1 - np.prod(1 - h, axis=1)

    keep = (couples.last_period > 0).to_numpy()
    L = flex.Lens(
        name='hcmst', family='binary', df=rows, num=num, cat=cat, y=rows.event.to_numpy(float), w=rows.w1.to_numpy(float),
        group=rows.ci.to_numpy(), folds=folds, baseline=Base, ycol='event',
        baseline_label='additive logistic hazard, all lens inputs (train_models.py additive_full; C by inner grouped CV)',
        lens_models={'lens_boosting': Boost, 'dyad_separate_glm': glm(sep_num, sep_cat), 'dyad_apim_glm': glm(apim_num, apim_cat),
                     'baseline_all_inputs': glm(num, cat)},
        person=rows.ci.to_numpy(), people=couples, score_fn=score,
        score_label='discrete-time C-index (cumulative break-up risk over 5 periods)',
        metric_label='log-loss gain vs constant (couple-periods); C-index',
        notes=['unweighted, as the lens fits; couples without follow-up have no rows',
               f'GroupKFold by couple, {REPEATS} repeats'])
    L.score_keep = keep
    return L

