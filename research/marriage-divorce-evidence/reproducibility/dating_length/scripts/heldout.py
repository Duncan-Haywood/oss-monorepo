"""Does how long a couple dated (or knew each other) before marrying predict divorce, held out?

Data: HCMST 2009 married couples (the HCMST couples lens, ../../hcmst/), followed to 2017.
Dating length = age at marriage (Q21D) - age when the romantic relationship began (Q21B); time
known = Q21D - age when they first met (Q21A). Ages are whole years, so each length is accurate
to about a year; bands follow Francis-Tan & Mialon (2015): under 1 year (0), 1-2, 3+.

Same machinery as the lens (../../hcmst/train_models.py): discrete-time logistic hazard over the
five follow-up periods, the lens's spline + one-hot additive pipeline, grouped 5-fold CV by couple
repeated 5 times, held-out log loss and Harrell's C (cumulative 8-year risk, risk sets by period),
and a paired couple bootstrap (1,000 resamples) of the DIFFERENCE between models.

Models (married couples only):
  core            the lens's additive_core inputs (relationship years = dating + married years)
  core+dating     core + dating length (spline, years)
  core+band       core + dating band (under 1 / 1-2 / 3+ years)
  core+known      core + years known before marrying (spline)
  period+dating   follow-up period + dating length only (the unadjusted association)

Outputs (aggregates only): ../heldout_comparison.csv, ../dating_bands.csv, ../sample_audit.json.
Run: HCMST_RAW=... python3 scripts/heldout.py   (~3-6 min)
"""
from pathlib import Path
import json
import os
import sys
import time
import warnings

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
LENS = OUT.parent / 'hcmst'
sys.path.insert(0, str(LENS))
sys.path.insert(0, str(OUT.parent))
sys.path.insert(0, str(OUT.parent.parent / 'app' / 'tools'))
import hcmst_data as H  # noqa: E402
import train_models as T  # noqa: E402

from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
REPEATS = int(os.environ.get('DL_REPEATS', 5))
BOOT = int(os.environ.get('DL_BOOT', 1000))
NP = T.NP
CORE_NUM = list(H.NUMERIC)
CORE_CAT = ['period'] + [c for c in H.CORE_CATEGORICAL if c != 'married']
SPECS = {
    'core': (CORE_NUM, CORE_CAT),
    'core+dating': (CORE_NUM + ['dating_years'], CORE_CAT),
    'core+band': (CORE_NUM, CORE_CAT + ['dating_band']),
    'core+known': (CORE_NUM + ['known_years'], CORE_CAT),
    'period+dating': (['dating_years'], ['period']),
}
BANDS = ['under 1 year', '1-2 years', '3+ years']


def pipe(num, cat, C):
    nump = Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                     ('scale', StandardScaler())])
    prep = ColumnTransformer([('num', nump, num), ('cat', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False), cat)])
    return Pipeline([('prep', prep), ('fit', LogisticRegression(C=C, max_iter=5000, tol=1e-8))])


def dating_vars():
    import pyreadstat
    a, _ = pyreadstat.read_dta(str(H.RAW / 'HCMST_ver_3.04.dta'), usecols=['caseid_new', 'q21a', 'q21b', 'q21d', 'married', 'qflag'])
    a = a[(a.qflag == 1) & (a.married == 1)].copy()
    ok = lambda s: s.where(s > 0)  # noqa: E731  (negative codes are refusals)
    a['dating_years'] = (ok(a.q21d) - ok(a.q21b)).where(lambda x: x.between(0, 40))
    a['known_years'] = (ok(a.q21d) - ok(a.q21a)).where(lambda x: x.between(0, 60))
    a['dating_band'] = pd.cut(a.dating_years, [-0.5, 0.5, 2.5, 99], labels=BANDS).astype(object).fillna('Unknown')
    return a[['caseid_new', 'dating_years', 'known_years', 'dating_band']].rename(columns={'caseid_new': 'id'})


def main():
    t0 = time.time()
    couples, periods, audit = H.couples_2009()
    couples = couples[couples.married == 'Yes'].merge(dating_vars(), on='id', how='left').reset_index(drop=True)
    couples['dating_band'] = couples.dating_band.fillna('Unknown')
    couples['ci'] = np.arange(len(couples))
    rows = T.advance(periods[periods.id.isin(couples.id)].merge(couples.drop(columns=['outcome']), on='id', how='left'))
    rows['ci'] = rows.id.map(dict(zip(couples.id, couples.ci)))
    followed = couples[couples.last_period > 0]
    aud = dict(married_couples=int(len(couples)), with_follow_up=int(len(followed)), breakups=int((couples.outcome == 'breakup').sum()),
               person_periods=int(len(rows)), dating_known=int(couples.dating_years.notna().sum()), known_known=int(couples.known_years.notna().sum()))
    print(aud, flush=True)

    # Descriptive: break-up by 2017 (discrete-time KM over the five periods), weighted, by band.
    bands = []
    w = couples.weight.to_numpy()
    for b in BANDS + ['Unknown']:
        m = (couples.dating_band == b).to_numpy()
        if m.sum() < 30:
            continue
        r = rows[m[rows.ci.to_numpy()]]
        surv = 1.0
        for p in range(1, NP + 1):
            x = r[r.period == str(p)]
            if len(x):
                ww = w[x.ci.to_numpy()]
                surv *= 1 - np.dot(ww, x.event) / ww.sum()
        bands.append(dict(band=b, couples=int(m.sum()), breakups=int((m & (couples.outcome == 'breakup').to_numpy()).sum()),
                          weighted_breakup_by_2017=1 - surv, median_dating_years=float(couples.dating_years[m].median()) if b != 'Unknown' else None))
    pd.DataFrame(bands).to_csv(OUT / 'dating_bands.csv', index=False, float_format='%.4f')

    # C chosen once for the core spec on all married rows (as the lens does), reused for all specs.
    best, best_ll = None, np.inf
    for C in T.C_GRID:
        ll = 0.0
        for tr, te in GroupKFold(5, shuffle=True, random_state=SEED).split(rows, groups=rows.id):
            p = pipe(*SPECS['core'], C).fit(rows.iloc[tr], rows.event.iloc[tr]).predict_proba(rows.iloc[te])[:, 1]
            ll += T.logloss(rows.event.to_numpy()[te], p, np.ones(len(te))) * len(te)
        if ll < best_ll:
            best, best_ll = C, ll
    print('C', best, flush=True)

    ev = T.Evaluator(couples, rows)
    Hcv = {k: [] for k in SPECS}
    const_ll = []
    for r in range(REPEATS):
        Hr = {k: np.zeros((len(couples), NP)) for k in SPECS}
        const = np.zeros(len(couples))
        for tr, te in GroupKFold(5, shuffle=True, random_state=SEED + r).split(couples, groups=couples.id):
            rtr = rows[rows.id.isin(set(couples.id.iloc[tr]))]
            const[te] = rtr.event.mean()
            for k, (num, cat) in SPECS.items():
                fit = pipe(num, cat, best).fit(rtr, rtr.event)
                Hr[k][te] = fit.predict_proba(T.expand(couples.iloc[te]))[:, 1].reshape(len(te), NP)
        for k in SPECS:
            Hcv[k].append(ev.prepare(Hr[k]))
        pc = const[ev.ci]
        const_ll.append(-(ev.y * np.log(pc) + (1 - ev.y) * np.log1p(-pc)))
        print(f'repeat {r + 1} ({time.time() - t0:.0f}s)', flush=True)

    def mets(wc):
        out = {}
        wr = wc[ev.ci]
        lc = np.mean([np.dot(wr, c) / wr.sum() for c in const_ll])
        for k in SPECS:
            ms = [ev.metrics(p, wc, 0.0) for p in Hcv[k]]
            ll = float(np.mean([m['logloss'] for m in ms]))
            out[k] = dict(gain_vs_constant_pct=100 * (1 - ll / lc), c_index=float(np.mean([m['c_index'] for m in ms])), logloss=ll)
        return out

    n = len(couples)
    point = mets(np.ones(n))
    rng = np.random.default_rng(SEED)
    boots = []
    for b in range(BOOT):
        boots.append(mets(np.bincount(rng.integers(0, n, n), minlength=n).astype(float)))
    res = []
    for k in SPECS:
        row = dict(model=k, inputs='+'.join(SPECS[k][0] + SPECS[k][1]))
        for m in ['gain_vs_constant_pct', 'c_index']:
            v = np.array([bb[k][m] for bb in boots])
            row[m], (row[m + '_lo'], row[m + '_hi']) = point[k][m], np.nanpercentile(v, [2.5, 97.5])
            if k != 'core' and not k.startswith('period'):
                d = np.array([bb[k][m] - bb['core'][m] for bb in boots])
                row['delta_' + m] = point[k][m] - point['core'][m]
                row['delta_' + m + '_lo'], row['delta_' + m + '_hi'] = np.nanpercentile(d, [2.5, 97.5])
        res.append(row)
    comp = pd.DataFrame(res)
    comp.to_csv(OUT / 'heldout_comparison.csv', index=False, float_format='%.5f')
    # Odds ratios from an unpenalised fit of core+band on all married rows (descriptive).
    fit = pipe(SPECS['core+band'][0], SPECS['core+band'][1], 1e4).fit(rows, rows.event)
    names = fit.named_steps['prep'].get_feature_names_out()
    coefs = dict(zip(names, fit.named_steps['fit'].coef_[0]))
    ors = {k.replace('cat__dating_band_', ''): float(np.exp(v)) for k, v in coefs.items() if k.startswith('cat__dating_band_')}
    aud.update(C=best, repeats=REPEATS, bootstrap=BOOT, seed=SEED, band_odds_ratios_vs_1_2_years_adjusted=ors,
               note='Odds ratios are per follow-up period, from one unpenalised fit (no interval); the held-out comparison is the test.')
    (OUT / 'sample_audit.json').write_text(json.dumps(aud, indent=1) + '\n')
    print(pd.DataFrame(bands).to_string())
    print(comp.to_string())
    print(json.dumps(aud))


if __name__ == '__main__':
    sys.exit(main())
