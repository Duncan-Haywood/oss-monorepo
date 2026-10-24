"""GSS panels 2006-2020: divorced or separated by the next wave (2 years), married respondents.

Rows, weights, outcome and folds are train_models.py's (StratifiedGroupKFold by respondent,
5 folds, seeds SEED + repeat); features are the current model's plus every block added by
extended_predictors.py on the more-predictors branch (family of origin, religion detail,
politics, race detail, occupation and prestige, home and wealth).
Raw data: $GSS_RAW (default <scratch>/gss_raw/x), from reproducibility/gss_panel/download.sh.
"""
import os

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

from . import _common as c

REPEATS = int(os.environ.get('FLEX_GSS_REPEATS', 5))


def load():
    os.environ.setdefault('GSS_RAW', str(c.SCRATCH / 'gss_raw' / 'x'))
    c.lens_path('gss_panel')
    c.extended_eval()
    import gss_data as g
    import train_models as tm
    ext = c.branch_module('gss_panel', 'extended_predictors.py', 'gss_extended_predictors')
    import flex
    g.features = ext.features_ext
    t, _ = g.transitions()
    s = g.analysis_sample(t, 2).reset_index(drop=True)
    num = list(g.NUMERIC) + list(ext.EXTRA_NUMERIC)
    cat = list(g.CATEGORIES) + [x for cols in ext.BLOCKS.values() for x in cols if x not in num and x not in g.CATEGORIES]
    y = s.event.to_numpy().astype(float)
    folds = []
    for r in range(REPEATS):
        f = np.empty(len(s), int)
        for k, (_, te) in enumerate(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=tm.SEED + r).split(s, y, s.pid)):
            f[te] = k
        folds.append(f)

    class Base:
        def __init__(self, d):
            self.p = tm.fit('logistic_additive', d, tm.choose_C(d, tm.SEED))

        def predict(self, d):
            return tm.proba(self.p, d)

    class Ext:  # the same additive L1 logistic on every candidate input (more features, no more flexibility)
        def __init__(self, d):
            cc, nn = ext.split(ext.BASE + [x for cols in ext.BLOCKS.values() for x in cols])
            self.p = ext.additive(cc, nn).fit(d, d.event.to_numpy(), fit__sample_weight=d.weight.to_numpy())

        def predict(self, d):
            return self.p.predict_proba(d)[:, 1]

    class Boost:
        def __init__(self, d):
            self.p = tm.fit('boosted_trees', d)

        def predict(self, d):
            return tm.proba(self.p, d)

    return flex.Lens(
        name='gss_panel', family='binary', df=s, num=num, cat=cat, y=y, w=s.weight.to_numpy(float),
        group=c.group_ids(s.pid), folds=folds, baseline=Base, ycol='event',
        baseline_label='additive L1 logistic, current inputs, C by inner grouped CV (train_models.py logistic_additive)',
        lens_models={'baseline_all_inputs': Ext, 'lens_boosting': Boost},
        metric_label='log-loss gain vs constant; AUC',
        notes=['2-year horizon transitions; StratifiedGroupKFold by respondent, 5 folds x %d repeats' % REPEATS])
