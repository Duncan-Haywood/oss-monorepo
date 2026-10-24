"""Leakage refit for the NLSY79 first-marriage lens (SPEC.md, "Leakage audit").

Uses the lens's own code (../nlsy79_full/train_first_marriage.py: people(), intervals(), make(),
cross_validate(), its seeds and 5-fold person splits repeated 3 times) on the lens's own
first_marriages.csv, rebuilt by build_nlsy79.py in work/nlsy79_lens/. Nothing is re-specified:
models are refit with the lens's `drop=` argument, which removes columns from the same pipelines.

Held-out deviance gain vs the training-fold constant rate, mean of the 3 repeats (as the lens
reports it), for the additive spline Poisson and Poisson gradient boosting:

- delayed-entry sample (the published 6,645 marriages, risk from the first post-wedding interview):
  as published; without every predictor flagged yes/possible in leakage_nlsy79.csv; and without
  only the post-wedding-measured spouse traits (keeping spouse age at the wedding, which cannot change);
- from-the-wedding sample (all 6,768, risk from the wedding month): with every lens predictor,
  and without the spouse block.

Writes leakage_refit_nlsy79.csv. leakage_nlsy79.csv (the predictor-timing table) is hand-written
from the lens's METHODS.md and build_first_marriages.py.

Usage: OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python3 leakage_nlsy79.py [--warm CONFIG:REPEAT ...]
(scikit-learn 1.7.2; --warm fills work/nlsy79_lens/cv_cache in parallel processes.)
"""
import sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
LENS = HERE.parent / 'nlsy79_full'
WORK = HERE / 'work' / 'nlsy79_lens'
_argv = sys.argv
sys.argv = ['train_first_marriage.py', str(WORK)]
sys.path.insert(0, str(LENS))
import train_first_marriage as T  # noqa: E402  (reads WORK from argv at import)
sys.argv = _argv
sm = T.sm

SPOUSE_POST = ['spouse_education', 'spouse_worked', 'spouse_in_household']
FLAGGED = SPOUSE_POST + ['spouse_age_at_marriage']  # leaks yes (3) + possible (spouse age: availability is post-wedding)
KEYS = ['constant', 'additive_spline', 'gradient_boosting']


def from_wedding():
    """The lens's own from-the-wedding sample (train_first_marriage.main, 'Sensitivity')."""
    allm = pd.read_csv(WORK / 'first_marriages.csv', keep_default_na=False, na_values=[''])
    allm = allm.assign(a=0.0, t=(allm.exit_month - allm.wedding_month + 0.5) / 12, d=allm.event.astype(int))
    allm['weight'] = allm.weight / allm.weight.mean()
    allm['mother_education'] = T.band_grade(allm.mother_grade)
    allm['father_education'] = T.band_grade(allm.father_grade)
    for c, flag in [('afqt', 'afqt_missing'), ('income_percentile', 'income_missing'), ('rosenberg', 'rosenberg_missing'),
                    ('delinquency', 'delinquency_missing')]:
        allm[flag] = np.where(allm[c].isna(), 'Missing', 'Observed')
    return allm


CONFIGS = {
    'delayed_all': ('delayed', ()),
    'delayed_noflag': ('delayed', tuple(FLAGGED)),
    'delayed_nopost': ('delayed', tuple(SPOUSE_POST)),
    'wedding_all': ('wedding', ()),
    'wedding_nospouse': ('wedding', tuple(FLAGGED)),
}
_samples = {}


def sample(kind):
    if kind not in _samples:
        m = T.people() if kind == 'delayed' else from_wedding()
        _samples[kind] = (m, T.intervals(m))
    return _samples[kind]


def run(cfg, only=None):
    kind, drop = CONFIGS[cfg]
    m, iv = sample(kind)
    return T.cross_validate(m, iv, KEYS, T.REPEATS, drop=drop, tag=f'prewedding_{cfg}', only=only)


def gains(cfg):
    kind, _ = CONFIGS[cfg]
    m, iv = sample(kind)
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    out = {}
    for k in KEYS[1:]:
        g = [100 * (1 - sm.deviance(y, e, w, r['rates'][k]) / sm.deviance(y, e, w, r['rates']['constant'])) for r in run(cfg)]
        out[k] = (float(np.mean(g)), float(min(g)), float(max(g)))
    return out, len(m), int(m.d.sum())


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--warm':
        for part in sys.argv[2:]:
            c, r = part.split(':')
            run(c, only=int(r))
        sys.exit()
    G = {c: gains(c) for c in CONFIGS}
    for c, (g, n, ev) in G.items():
        print(c, n, 'marriages', ev, 'divorces', {k: tuple(round(x, 3) for x in v) for k, v in g.items()})
    label = {'additive_spline': 'additive spline Poisson', 'gradient_boosting': 'Poisson gradient boosting'}
    rows = []
    for k in KEYS[1:]:
        for name, with_c, without_c, removed, note in [
            ('delayed entry (published sample)', 'delayed_all', 'delayed_noflag', FLAGGED,
             'all leak=yes/possible predictors removed'),
            ('delayed entry (published sample)', 'delayed_all', 'delayed_nopost', SPOUSE_POST,
             'post-wedding spouse traits removed; spouse age at the wedding (fixed) kept'),
            ('from the wedding (all 6,768 first marriages)', 'wedding_all', 'wedding_nospouse', FLAGGED,
             'risk from the wedding month; with = every lens predictor incl. the spouse block read after the wedding'),
        ]:
            gw, gwo = G[with_c][0][k], G[without_c][0][k]
            rows.append(dict(dataset='nlsy79', model=f'{label[k]}; {name}', predictors_removed=' '.join(removed),
                             gain_with_percent=round(gw[0], 4), gain_without_percent=round(gwo[0], 4),
                             change_points=round(gwo[0] - gw[0], 4),
                             marriages=G[with_c][1], events=G[with_c][2],
                             repeat_range_with=f'{gw[1]:.3f}-{gw[2]:.3f}', repeat_range_without=f'{gwo[1]:.3f}-{gwo[2]:.3f}',
                             note=note + '; event = legal divorce (lens target); mean of 3 repeats of 5-fold person-held-out CV'))
    pd.DataFrame(rows).to_csv(HERE / 'leakage_refit_nlsy79.csv', index=False)
    print(pd.DataFrame(rows)[['model', 'predictors_removed', 'gain_with_percent', 'gain_without_percent', 'change_points']].to_string())
