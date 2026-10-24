"""Statistics Canada GSS Families (1995, 2006, 2011, 2017): first-marriage dissolution from the
wedding, annual rate (follow-up capped at 30 years).

People, intervals, weights and person folds (assign_folds) are train_models.py's. Features: the
shipped inputs plus every PRE-WEDDING candidate in the analysis file and the more-predictors
extension: detailed family of origin, partner age gap (1995/2011/2017), partner previously
married (1995), parents ever separated. Religion, education and attendance at the interview are
excluded (they can follow the dissolution). Out of time: weddings before 1990 train, 1990+ test.
Data: first_marriages.pkl from tables.load_first_marriages (re-saved as parquet in <scratch>/flex_data)
and the GSS PUMF CSVs in $CANADA_RAW (default <scratch>/canada_work/raw).
"""
import os

import numpy as np
import pandas as pd

from . import _common as c

LENS = 'canada_gss_family'


def load(sample=None):
    import flex
    os.environ.setdefault('CANADA_RAW', str(c.SCRATCH / 'canada_work' / 'raw'))
    os.environ.setdefault('CANADA_WORK', str(c.SCRATCH / 'canada_work' / 'work'))
    c.lens_path(LENS)
    c.extended_eval()
    import train_models as T
    ext = c.branch_module(LENS, 'extended_predictors.py', 'canada_extended_predictors')
    p = pd.read_parquet(c.SCRATCH / 'flex_data' / 'canada_first_marriages.parquet').reset_index(drop=True)
    x = ext.extras().reset_index()[['id', 'family_origin']].drop_duplicates('id')
    p = p.merge(x, on='id', how='left')
    p['family_origin'] = p.family_origin.fillna('Unknown')
    if sample:
        p = p.sample(frac=sample, random_state=1).reset_index(drop=True)
    fold_p = T.assign_folds(p)
    iv = T.intervals(p)
    person = iv.person.to_numpy()
    num = list(T.NUM) + ['partner_age_gap']
    cat = list(T.CAT) + ['family_origin', 'partner_prev_married', 'parents_ever_separated']
    p['T'], p['D'], p['W'], p['group'] = np.minimum(p.t, T.MAX_YEARS), p.event * (p.t <= T.MAX_YEARS), p.weight, np.arange(len(p))
    p['marriage_years'] = 0.0
    wy = iv.wedding_year.to_numpy()

    def model(kind, num_=None, cat_=None):
        return lambda d: T.Model(kind, num_ or T.NUM, cat_ or T.CAT).fit(d)

    L = flex.Lens(
        name='canada_gss', family='poisson', df=iv, num=num, cat=cat, y=iv.y.to_numpy(float), e=iv.exposure.to_numpy(float),
        w=iv.weight.to_numpy(float), group=person, folds=[fold_p[person]], baseline=model('additive_spline'), ycol='y',
        dur='marriage_years', baseline_label='additive spline Poisson GLM, shipped inputs (train_models.py additive_spline)',
        lens_models={'baseline_all_inputs': model('additive_spline', num, cat), 'lens_boosting': model('gradient_boosting')},
        person=person, people=p, score_fn=c.grid_score('marriage_years', 10), score_label="Harrell's C (10-year cumulative hazard)",
        oot=(wy < 1990, wy >= 1990), metric_label='Poisson deviance gain vs constant; Harrell C',
        notes=['person folds = train_models.assign_folds (one seeded permutation)'] + ([f'grouped subsample {sample}'] if sample else []))
    L.oot_label = 'train weddings before 1990, test 1990 and later'
    return L
