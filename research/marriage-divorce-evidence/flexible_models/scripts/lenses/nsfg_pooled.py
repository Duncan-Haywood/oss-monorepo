"""NSFG 1995-2023 pooled women's first marriages: annual dissolution rate from the wedding.

People, intervals, weights and person folds are train_pooled.py's (one seeded permutation,
5 folds); features are the women's model inputs plus the three childhood blocks of
extended_predictors.py (family of origin, attendance at 14, religion raised in full detail).
Out of time: weddings before 2000 train, 2000-2023 test (train_pooled.py's split).
Raw data: $NSFG_RAW (default <scratch>/nsfg_raw), from reproducibility/nsfg_pooled_first_marriage/download.sh.
"""
import os

import numpy as np

from . import _common as c

LENS = 'nsfg_pooled_first_marriage'
NEW = ['wife_family_origin', 'wife_attend14', 'wife_religion_raised_detail']


def build():
    os.environ.setdefault('NSFG_RAW', str(c.SCRATCH / 'nsfg_raw'))
    c.lens_path(LENS)
    c.extended_eval()
    import train_pooled as tp
    ext = c.branch_module(LENS, 'extended_predictors.py', 'nsfg_extended_predictors')
    people, _ = tp.people_table()
    women = tp.normalise_weights(people[people.sex == 'F']).reset_index(drop=True)
    women = women.join(ext.extras(), on='id')
    for col in NEW:
        women[col] = women[col].where(women.cycle.isin(ext.EXTRA_CYCLES), ext.NOT_ASKED).fillna('Unknown')
    return tp, women


def load(sample=None):
    import flex
    tp, women = build()
    if sample:
        women = women.sample(frac=sample, random_state=1).reset_index(drop=True)
    fold_p = c.person_folds(len(women), tp.SEED)
    iv = tp.intervals(women)
    person = iv.person.to_numpy()
    num = list(tp.WOMEN_NUM)
    cat = list(tp.WOMEN_CAT) + NEW
    women['T'], women['D'], women['W'], women['group'] = women.t, women.event, women.weight, np.arange(len(women))
    women['marriage_years'] = 0.0

    def base(tr):
        return tp.Model('additive_spline', tp.WOMEN_NUM, tp.WOMEN_CAT).fit(tr)

    def base_all(tr):
        return tp.Model('additive_spline', tp.WOMEN_NUM, cat).fit(tr)

    def boost(tr):
        return tp.Model('gradient_boosting', tp.WOMEN_NUM, tp.WOMEN_CAT).fit(tr)

    wy = iv.wedding_year.to_numpy()
    L = flex.Lens(
        name='nsfg_pooled', family='poisson', df=iv, num=num, cat=cat, y=iv.y.to_numpy(float), e=iv.exposure.to_numpy(float),
        w=iv.weight.to_numpy(float), group=person, folds=[fold_p[person]], baseline=base, ycol='y', dur='marriage_years',
        baseline_label='additive spline Poisson GLM, women inputs (train_pooled.py additive_spline)',
        lens_models={'baseline_all_inputs': base_all, 'lens_boosting': boost},
        person=person, people=women, score_fn=c.grid_score('marriage_years', 10), score_label="Harrell's C (10-year cumulative hazard)",
        oot=(wy < 2000, wy >= 2000), metric_label='Poisson deviance gain vs constant; Harrell C',
        notes=['women only; person folds = train_pooled.py permutation (seed 20261020)'])
    L.oot_label = 'train weddings before 2000, test 2000-2023'
    return L
