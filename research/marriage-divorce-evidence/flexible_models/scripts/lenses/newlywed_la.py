"""Los Angeles newlyweds (Karney et al., 368 couples): divorce by each follow-up to ~12 years,
discrete-time logistic hazard on couple-intervals.

Couples, intervals and outer folds (StratifiedKFold by divorce, SEED + repeat) are
train_models.py's; unweighted as the lens is. Baseline: the lens's best GLM, ridge logistic on all
29 inputs ('all', C tuned by the lens's own inner CV). Widest set: those inputs plus every other
baseline column in the file (the 16 satisfaction items, both vulnerability indices, the
socioeconomic index and the neighbourhood dummies).
Dyadic specifications (husband H_ / wife W_ columns):
  baseline (lens)      actor and partner terms entered separately (H_x and W_x)
  dyad_apim_glm        + couple mean and absolute H-W gap of every paired measure
  dyad_summary_glm     couple mean and gap only (no separate spouse terms)
Raw data: <scratch> copy of reproducibility/newlywed_la_karney/raw (download.sh); $NL_RAW overrides.
"""
import os

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold

from . import _common as c

REPEATS = int(os.environ.get('FLEX_NL_REPEATS', 5))
PAIRS = ['substance_D', 'ACE_D', 'abuse_D', 'neg_affect_D', 'parent_marriage_D', 'educ_D', 'sat_sum', 'Positivity',
         'Negativity', 'Effective', 'Hostility', 'vulnerability_index']


def load(sample=None):
    import flex
    c.lens_path('newlywed_la_karney')
    import nl_data as N
    raw = os.environ.get('NL_RAW') or (N.RAW if (N.RAW / 'Divorce_Data.csv').exists() else c.SCRATCH / 'flex_data' / 'newlywed_raw')
    from pathlib import Path
    N.RAW = Path(raw)
    import train_models as tm
    d = N.load()
    for p in PAIRS:
        h, w = d[f'H_{p}'].astype(float), d[f'W_{p}'].astype(float)
        d[f'mean_{p}'] = (h + w) / 2
        d[f'gap_{p}'] = (h - w).abs()
    rows = N.rows(d)
    items = [f'{s}_sat{i}' for s in 'HW' for i in (1, 2, 3, 4, 5, 6, 7, 9)]
    extra = ['H_vulnerability_index', 'W_vulnerability_index', 'Socioeconomic_index', 'Neighborhood_unemploy_D',
             'Neighborhood_income_D']
    num = list(N.ALL) + items + extra + ['period_years']
    cat = ['period']
    folds = []
    for r in range(REPEATS):
        fc = np.empty(len(d), int)
        for f, (_, te) in enumerate(StratifiedKFold(tm.FOLDS, shuffle=True, random_state=tm.SEED + r).split(d, d.divorced)):
            fc[te] = f
        folds.append(fc[rows.couple.to_numpy()])

    class Base:
        def __init__(self, dd, key='all'):
            couples = d.iloc[np.unique(dd.couple)].reset_index(drop=True)
            hp = tm.tune(couples, key, tm.SEED)
            self.p = tm.pipeline(key, hp).fit(dd, dd.event)

        def predict(self, dd):
            return tm.proba(self.p, dd)

    means = [f'mean_{p}' for p in PAIRS if p != 'vulnerability_index']
    gaps = [f'gap_{p}' for p in PAIRS if p != 'vulnerability_index']
    couple_only = ['income_k', 'Household_comp', 'Low_income_D', 'Couple_unemployment_D', 'Couple_fin_strain_D',
                   'Neighborhood_unemploy', 'Neighborhood_income_k']
    pcols = list(N.PERIOD_COLS)

    def glm(cols):
        return lambda dd: _Ridge(dd, cols + pcols)

    class _Ridge:
        """The lens's ridge logistic hazard (period terms unpenalised) on a column list, C by inner grouped CV."""
        def __init__(self, dd, cols):
            from sklearn.model_selection import GroupKFold
            y = dd.event.to_numpy()
            best = None
            for C in tm.C_GRID:
                ll = 0.0
                for tr, te in GroupKFold(3, shuffle=True, random_state=tm.SEED).split(dd, groups=dd.couple):
                    p = self._p(cols, C).fit(dd.iloc[tr], y[tr]).predict_proba(dd.iloc[te])[:, 1]
                    ll += tm.ll_rows(y[te], p).sum()
                if best is None or ll < best[0]:
                    best = (ll, C)
            self.p = self._p(cols, best[1]).fit(dd, y)

        def predict(self, dd):
            return self.p.predict_proba(dd)[:, 1]

        @staticmethod
        def _p(cols, C):
            from sklearn.compose import ColumnTransformer
            from sklearn.impute import SimpleImputer
            from sklearn.linear_model import LogisticRegression
            from sklearn.pipeline import Pipeline
            num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', tm.PeriodFreeScaler(n_free=len(pcols)))])
            return Pipeline([('prep', ColumnTransformer([('num', num, cols)])),
                             ('fit', LogisticRegression(C=C, solver='newton-cholesky', max_iter=200, tol=1e-10))])

    sep = [x for x in N.ALL]
    d['T'] = np.where(d.divorced == 1, d.event_wave.fillna(0) - 2, len(N.PERIODS) + 0.5)
    d['D'] = d.divorced.astype(float)
    d['W'] = 1.0
    d['group'] = np.arange(len(d))

    def score(predict, people):
        h = predict(N.expand(people)).reshape(len(people), len(N.PERIODS))
        return 1 - np.prod(1 - h, axis=1)

    rows['w1'] = 1.0
    return flex.Lens(
        name='newlywed_la', family='binary', df=rows, num=num, cat=cat, y=rows.event.to_numpy(float), w=rows.w1.to_numpy(float),
        group=rows.couple.to_numpy(), folds=folds, baseline=Base, ycol='event',
        baseline_label="ridge logistic hazard on all 29 lens inputs (train_models.py 'all', C by the lens's inner CV)",
        lens_models={'dyad_apim_glm': glm(sep + means + gaps), 'dyad_summary_glm': glm(couple_only + means + gaps),
                     'baseline_all_inputs': glm([x for x in num if x != 'period_years'])},
        person=rows.couple.to_numpy(), people=d, score_fn=score,
        score_label="Harrell's C (cumulative divorce risk to ~12 years, discrete periods)",
        metric_label='log-loss gain vs constant (couple-intervals); C-index',
        notes=[f'StratifiedKFold by divorce, {REPEATS} repeats; unweighted'])
