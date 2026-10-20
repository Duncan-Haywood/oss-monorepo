"""Population reference and partner distribution for the NSFG 2002 lenses (app section C).

Adds two aggregate blocks to app/models/nsfg2002_first_marriage.json and nsfg2002_family.json
and leaves every other byte of each bundle unchanged (checked before writing):

population_reference
    Survey-weighted quantiles (p1..p99) of each woman's HELD-OUT predicted chance that her
    first marriage dissolves within 5, 10 and 20 years of the wedding, overall and within
    subgroups. "Held out" means each woman is scored by models fitted on the other four person
    folds of train_models.py (the same folds as every held-out metric in the bundles). Her own
    inputs at the wedding are used, including her real wedding year. The lens's number is the
    one the app shows: 1 minus the mean, over the lens's scoring models (baselines and naive
    Bayes excluded, as in couple.js), of each model's survival exp(-sum of annual rates).
    Each pK value is a list aligned to `horizons`. Subgroup cells need at least 100 unweighted
    marriages; `n` is that count. Nothing person-level is written.

partner_distribution
    Weighted joint frequencies of the partner's traits, conditional on the respondent's own
    coarse traits, for the app's "just me" mode. Two directions, because the survey only
    interviewed wives: given the wife's age band and race-ethnicity, the husband's age gap,
    earlier marriage, children from before, same or different race-ethnicity and whether the
    couple lived together first; and given the husband's age band and race-ethnicity (as the
    wife reported them), the wife's age gap, race-ethnicity, family of origin and living
    together first. Conditioning cells need at least 30 unweighted marriages, and a partner
    profile is kept only when at least 10 marriages in the cell share it; the kept profiles
    are renormalised and `coverage` records the weighted share they cover.

Run from research/marriage-divorce-evidence after `sh reproducibility/nsfg2002_first_marriage/download.sh`:
    OPENBLAS_NUM_THREADS=1 python3 app/tools/population_reference.py
Needs numpy, pandas and scikit-learn 1.7.2.
"""
from pathlib import Path
import json, sys, warnings
import numpy as np, pandas as pd, sklearn

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = ROOT / 'reproducibility' / 'nsfg2002_first_marriage'
OUT = HERE.parent / 'models'
sys.path.insert(0, str(SRC))
sys.path.insert(0, str(HERE))
import train_models as tm  # noqa: E402
import train_nsfg2002_family as fam  # noqa: E402

assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2'
HORIZONS = [5, 10, 20]
MIN_CELL = 100          # unweighted marriages per population_reference subgroup cell
MIN_COND = 30           # unweighted marriages per partner_distribution conditioning cell
MIN_PROFILE = 10        # unweighted marriages sharing a partner profile within a cell
PCTS = list(range(1, 100))

AGE_BANDS = [(None, 20, 'under 20'), (20, 25, '20-24'), (25, 30, '25-29'), (30, None, '30+')]
HUSBAND_AGE_BANDS = [(None, 22, 'under 22'), (22, 25, '22-24'), (25, 30, '25-29'), (30, None, '30+')]
DECADES = [(1970, 1980, '1970s'), (1980, 1990, '1980s'), (1990, 2000, '1990s'), (2000, 2004, '2000-2003')]
# Age gap (husband minus wife, years at the wedding): bins with the weighted median gap of
# all marriages in the bin as the value the app scores.
GAP_BINS = [(None, 0, 'wife older'), (0, 3, '0-2 years'), (3, 6, '3-5 years'), (6, 10, '6-9 years'), (10, None, '10+ years')]

SUBGROUPS = {
    'wife_age_band': dict(label="Wife's age at the wedding", column='wife_age_at_marriage', bins=AGE_BANDS),
    'cohabited_first': dict(label='Lived together before marrying', column='cohabited_first'),
    'husband_married_before': dict(label='Husband married before', column='husband_married_before'),
    'husband_prior_children': dict(label='Husband has children from before', column='husband_prior_children'),
    'wife_race_ethnicity': dict(label="Wife's race-ethnicity", column='wife_race_ethnicity'),
    'wife_intact_family': dict(label='Wife lived with both parents to 18', column='wife_intact_family'),
    'wedding_decade': dict(label='Wedding decade', column='wedding_year', bins=DECADES),
}
LENS_MODELS = {'nsfg2002_first_marriage': ['additive_spline', 'tree_depth3'],
               'nsfg2002_family': ['logistic_hazard', 'random_forest', 'gradient_boosting']}


def band(x, bins):
    for lo, hi, name in bins:
        if (lo is None or x >= lo) and (hi is None or x < hi):
            return name
    return None


def weighted_quantiles(x, w, pcts=PCTS):
    """Linear interpolation of the weighted CDF at bin midpoints (Hazen-type plotting positions)."""
    o = np.argsort(x, kind='stable')
    x, w = np.asarray(x, float)[o], np.asarray(w, float)[o]
    c = (np.cumsum(w) - w / 2) / w.sum()
    return [float(np.interp(p / 100, c, x)) for p in pcts]


def heldout_risk(m, iv, fold_of, levels):
    """Each woman's held-out cumulative dissolution at HORIZONS, mean survival over each lens's models."""
    keys = sorted({k for ks in LENS_MODELS.values() for k in ks})
    H = max(HORIZONS)
    surv = {k: np.zeros((len(m), len(HORIZONS))) for k in keys}
    preds = {k: np.zeros(len(iv)) for k in keys + ['constant']}
    mfold = m.id.map(fold_of).to_numpy()
    for f in range(5):
        tr, te = iv[iv.fold != f], iv[iv.fold == f]
        ix = te.index.to_numpy()
        preds['constant'][ix] = (tr.weight * tr.event).sum() / (tr.weight * tr.exposure).sum()
        women = m[mfold == f]
        grid = women.loc[women.index.repeat(H)].copy()
        grid['marriage_years'] = np.tile(np.arange(H, dtype=float), len(women))
        for k in keys:
            model = tm.fit(k, tr) if k in ('additive_spline', 'tree_depth3') else fam.make(k, levels).fit(tr)
            preds[k][ix] = model.predict(te)
            cum = np.cumsum(model.predict(grid).reshape(len(women), H), axis=1)
            surv[k][mfold == f] = np.exp(-cum[:, [h - 1 for h in HORIZONS]])
        print('fold', f, 'done', flush=True)
    # Sanity check: the refitted held-out predictions reproduce the published comparison.
    y, e, w = iv.event.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    base = tm.deviance(y, e, w, preds['constant'])
    gains = {k: 100 * (1 - tm.deviance(y, e, w, preds[k]) / base) for k in keys}
    return {lens: 1 - np.mean([surv[k] for k in ks], axis=0) for lens, ks in LENS_MODELS.items()}, gains


def cell(risk, w):
    return dict(n=int(len(w)), quantiles={f'p{p}': [round(v, 6) for v in vals]
                                          for p, vals in zip(PCTS, zip(*[weighted_quantiles(risk[:, j], w) for j in range(len(HORIZONS))]))})


def reference(m, risk):
    w = m.weight.to_numpy()
    subs = {}
    for var, spec in SUBGROUPS.items():
        col = m[spec['column']]
        lv = col.map(lambda v: band(v, spec['bins'])) if 'bins' in spec else col
        cells = {}
        for level in sorted(x for x in lv.dropna().unique() if x != 'Unknown'):
            s = (lv == level).to_numpy()
            if s.sum() >= MIN_CELL:
                cells[str(level)] = cell(risk[s], w[s])
        if cells:
            subs[var] = cells
    defs = {}
    for var, spec in SUBGROUPS.items():
        d = dict(label=spec['label'], column=spec['column'])
        if 'bins' in spec:
            d['bins'] = [dict(level=name, min=lo, max=hi) for lo, hi, name in spec['bins']]
        defs[var] = d
    return dict(
        about=('Survey-weighted quantiles of held-out predicted first-marriage dissolution (divorce, annulment or '
               'separation) within each horizon of the wedding, for the 4,126 first marriages in NSFG 2002, scored '
               'by models fitted on the other person folds, with each woman\'s own inputs and real wedding year. '
               'Each pK is a list aligned to horizons. Subgroup cells have at least 100 unweighted marriages. '
               'Built by app/tools/population_reference.py.'),
        quantity='cumulative_dissolution_probability', horizons=HORIZONS, weights='NSFG final weights',
        min_cell=MIN_CELL, overall=cell(risk, w), subgroups=subs, subgroup_defs=defs)


def partner_distribution(m):
    w = m.weight.to_numpy()
    gap = (m.husband_age_at_marriage - m.wife_age_at_marriage).to_numpy()
    gap_bin = pd.Series([band(g, GAP_BINS) if np.isfinite(g) else None for g in gap], index=m.index)
    reps = {}
    for lo, hi, name in GAP_BINS:
        s = (gap_bin == name).to_numpy()
        reps[name] = round(weighted_quantiles(gap[s], w[s], [50])[0])
    d = m.assign(gap_bin=gap_bin,
                 wife_age_band=m.wife_age_at_marriage.map(lambda v: band(v, AGE_BANDS)),
                 husband_age_band=m.husband_age_at_marriage.map(lambda v: band(v, HUSBAND_AGE_BANDS) if np.isfinite(v) else None))
    d = d[d.gap_bin.notna()]

    def table(given, traits):
        rows = []
        dd = d.dropna(subset=given)
        for g in given:
            dd = dd[dd[g] != 'Unknown']
        for key, grp in dd.groupby(given):
            if len(grp) < MIN_COND:
                continue
            key = key if isinstance(key, tuple) else (key,)
            prof = grp.groupby(traits).agg(n=('weight', 'size'), w=('weight', 'sum')).reset_index()
            kept = prof[prof.n >= MIN_PROFILE]
            if kept.empty:
                continue
            total = grp.weight.sum()
            rows.append(dict(given=dict(zip(given, map(str, key))), n=int(len(grp)),
                             coverage=round(float(kept.w.sum() / total), 4),
                             profiles=[dict(traits={t: str(r[t]) for t in traits}, share=round(float(r.w / kept.w.sum()), 6))
                                       for _, r in kept.sort_values('w', ascending=False).iterrows()]))
        return rows

    return dict(
        about=('Weighted joint frequencies of partner traits given the respondent\'s own coarse traits, in NSFG 2002 '
               'first marriages (the wife\'s report). Conditioning cells have at least 30 unweighted marriages; a partner '
               'profile is listed only when at least 10 marriages in the cell share it, and shares are renormalised over '
               'the listed profiles (coverage = weighted share they cover). gap_bin is husband minus wife age at the '
               'wedding; gap_values gives the weighted median gap of all marriages in each bin, the value the app scores. '
               'Built by app/tools/population_reference.py.'),
        min_conditioning_cell=MIN_COND, min_profile=MIN_PROFILE,
        age_bands=dict(wife=[dict(level=n, min=lo, max=hi) for lo, hi, n in AGE_BANDS],
                       husband=[dict(level=n, min=lo, max=hi) for lo, hi, n in HUSBAND_AGE_BANDS]),
        gap_bins=[dict(level=n, min=lo, max=hi) for lo, hi, n in GAP_BINS], gap_values=reps,
        given_wife=table(['wife_age_band', 'wife_race_ethnicity'],
                         ['gap_bin', 'husband_married_before', 'husband_prior_children', 'same_race_ethnicity', 'cohabited_first']),
        given_husband=table(['husband_age_band', 'husband_race_ethnicity'],
                            ['gap_bin', 'wife_race_ethnicity', 'wife_intact_family', 'cohabited_first']))


def write(name, blocks):
    path = OUT / f'{name}.json'
    text = path.read_text()
    b = json.loads(text)
    old = {k: b.pop(k) for k in blocks if k in b}
    # The bundle round-trips byte for byte, so only the added blocks change.
    assert json.dumps({**b, **old}, separators=(',', ':')) == text, f'{name} does not round-trip'
    path.write_text(json.dumps({**b, **blocks}, separators=(',', ':')))


def main():
    m = tm.marriages()
    iv = tm.intervals(m)
    rng = np.random.default_rng(tm.SEED)  # identical fold assignment to train_models.py
    ids = m.id.to_numpy().copy()
    rng.shuffle(ids)
    fold_of = {i: k % 5 for k, i in enumerate(ids)}
    iv['fold'] = iv.id.map(fold_of)
    levels = {c: sorted(m[c].unique()) for c in tm.CATEGORICAL}
    risk, gains = heldout_risk(m, iv, fold_of, levels)
    for name, ks in LENS_MODELS.items():
        b = json.loads((OUT / f'{name}.json').read_text())
        for mm in b['models']:
            if mm['key'] in ks:
                assert abs(mm['heldout']['deviance_improvement_percent'] - gains[mm['key']]) < 0.01, (mm['key'], gains[mm['key']])
    print('held-out gains reproduced:', {k: round(v, 3) for k, v in gains.items()})
    pdist = partner_distribution(m)
    for name in LENS_MODELS:
        ref = reference(m, risk[name])
        write(name, dict(population_reference=ref, partner_distribution=pdist))
        o = ref['overall']['quantiles']
        print(name, 'median 5/10/20-year dissolution', o['p50'], 'p10', o['p10'], 'p90', o['p90'])
        for var, cells in ref['subgroups'].items():
            print('  ', var, {lv: (c['n'], c['quantiles']['p50'][1]) for lv, c in cells.items()})
    print('partner cells: given wife', len(pdist['given_wife']), 'given husband', len(pdist['given_husband']),
          'gap values', pdist['gap_values'])


if __name__ == '__main__':
    main()
