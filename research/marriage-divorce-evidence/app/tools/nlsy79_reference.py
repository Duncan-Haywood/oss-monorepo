"""Add an out-of-distribution score (`ood`) and a held-out `population_reference` to the
EXISTING NLSY79 couples bundle (models/nlsy79_couples.json), leaving every other byte as it is.

Those two blocks need the person-level couple intervals, which are not in git. They come from
re-deriving the ml_couples analysis from the public NLSY79 release:

    sh reproducibility/nlsy79_full/download.sh
    python3 reproducibility/nlsy79_full/extract_nlsy79_full.py reproducibility/nlsy79_full/raw/nlsy79_all_1979-2022.zip WORK
    python3 reproducibility/nlsy79_full/reproduce_ml_couples.py WORK SCRATCH     # must report the published sample

Then: python3 app/tools/nlsy79_reference.py SCRATCH/reproducibility/ml_couples
(from research/marriage-divorce-evidence). It refuses to run unless the reproduced sample is the
committed one and every held-out gain is within 0.01 percentage points of the committed value, so
the blocks describe the shipped models' data.

- `ood`: tools/ood.py on the couple-level inputs the models see (both spouses' schooling, wage
  bands, earnings role, respondent's own degree, hours, attendance, family-income band, ages,
  marriage length and order, wife's wage share), one row per couple-interval, with distances
  scored against held-out respondents (the committed 5 respondent folds). Survey wave is left
  out: it is calendar time, not a trait of the couple.
- `population_reference`: survey-weighted quantiles of the held-out (respondent-fold) predicted
  annual divorce rate of the best committed model (additive enriched), over all couple-intervals
  and by subgroup; cells under 100 unweighted intervals are not published.

Also writes models/nlsy79_couples_reference_testvectors.json (rows + Python distances) for the
JS parity test.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MODELS = HERE.parent / 'models'
COMMITTED = ROOT / 'reproducibility' / 'ml_couples'
sys.path.insert(0, str(HERE))
import ood  # noqa: E402

SRC = Path(sys.argv[1])
SEED = 20261019
NUMERIC = ['age', 'current_marriage_years', 'first_marriage_age', 'wife_wage_share']
CATEGORICAL = ['husband_school', 'wife_school', 'total_wage_band', 'earnings_pair', 'sex', 'marriage_order_group',
               'education', 'work', 'religion_refresh', 'family_income_band', 'husband_wage_band_train', 'wife_wage_band_train']


def prepare(t, cuts):
    """ml_couples/train_models.py prepare(), unchanged in substance: training cutpoints -> bands."""
    z = t.copy()
    waves = sorted(int(k) for k in cuts)
    out = {k: [] for k in ['total_wage_band', 'family_income_band', 'husband_wage_band_train', 'wife_wage_band_train']}
    for r in t.itertuples():
        use = max([v for v in waves if v <= int(r.start_wave)], default=min(waves))
        c = cuts[str(use)]

        def band(x, k, zero=True):
            if not np.isfinite(x) or x < 0:
                return 'Unknown'
            if zero and x == 0:
                return 'Zero'
            return 'Q' + str(1 + sum(x > v for v in c[k]))
        out['total_wage_band'].append(band(r.couple_wages, 'total'))
        out['family_income_band'].append(band(r.family_income, 'family', False))
        out['husband_wage_band_train'].append(band(r.husband_wages, 'individual'))
        out['wife_wage_band_train'].append(band(r.wife_wages, 'individual'))
    for k, v in out.items():
        z[k] = v
    for c in CATEGORICAL:
        z[c] = z[c].fillna('Unknown').astype(str)
    return z


def check_reproduction():
    a = json.loads((COMMITTED / 'sample_audit.json').read_text())
    b = json.loads((SRC / 'sample_audit.json').read_text())
    for k in ['intervals', 'respondents', 'events', 'both_zero_wage_intervals', 'missing_couple_wage_intervals']:
        assert a[k] == b[k], f'reproduced {k} {b[k]} != committed {a[k]}'
    ca = pd.read_csv(COMMITTED / 'heldout_model_comparison.csv').set_index('model').deviance_improvement_percent
    cb = pd.read_csv(SRC / 'heldout_model_comparison.csv').set_index('model').deviance_improvement_percent
    # Exact equality is not reachable: weighted-quartile cutpoints depend on the order numpy's
    # unstable sort gives tied incomes (reproducibility/nlsy79_full/METHODS.md). Require the
    # identical sample and held-out gains within 0.01 percentage points of the committed ones.
    gap = float((ca - cb).abs().max())
    assert gap < 0.01, f'held-out comparison differs from the committed one:\n{pd.concat([ca, cb], axis=1)}'
    return gap


def weighted_quantile(x, w, qs):
    o = np.argsort(x, kind='stable')
    x, w = np.asarray(x, float)[o], np.asarray(w, float)[o]
    c = (np.cumsum(w) - 0.5 * w) / w.sum()
    return np.interp(qs, c, x)


def main():
    gap = check_reproduction()
    f = pd.read_csv(SRC / 'ml_couple_input.csv')
    folds = pd.read_csv(SRC / 'respondent_folds.csv')
    f = f.merge(folds, on=['id', 'start_wave'], how='left', validate='one_to_one')
    assert f.fold.notna().all()
    cuts = json.loads((COMMITTED / 'final_training_cutpoints.json').read_text())
    z = prepare(f, cuts)
    levels = {c: sorted(z[c].unique()) for c in CATEGORICAL}
    spec, held, fit = ood.build(z, z.fold.to_numpy(), NUMERIC, CATEGORICAL, levels)
    spec['method'] = ('squared Mahalanobis distance on the couple inputs (survey wave and missing flags excluded); '
                      'percentile against held-out couple-intervals (the 5 committed respondent folds)')
    spec.update(people=int(f.id.nunique()), rows=int(len(f)), unit='couple-interval (one row per respondent per baseline wave)')

    # Population reference from held-out predictions of the best committed model.
    pred = pd.read_csv(SRC / 'heldout_predictions.csv')
    best = 'Additive enriched'
    p = pred[pred.model == best][['id', 'start_wave', 'predicted_rate']]
    d = z.merge(p, on=['id', 'start_wave'], how='left', validate='one_to_one')
    assert d.predicted_rate.notna().all()
    d['age_band'] = pd.cut(d.age, [0, 45, 55, 200], right=False, labels=['35-44', '45-54', '55+']).astype(object).fillna('Unknown')
    d['marriage_length_band'] = pd.cut(d.current_marriage_years, [-1, 10, 20, 30, 200], right=False,
                                       labels=['<10 years', '10-19 years', '20-29 years', '30+ years']).astype(object).fillna('Unknown')
    qs = [0.01, 0.05] + [round(x, 2) for x in np.arange(0.10, 0.91, 0.05)] + [0.95, 0.99]
    by = ['sex', 'age_band', 'marriage_length_band', 'marriage_order_group', 'husband_school', 'wife_school', 'earnings_pair',
          'total_wage_band', 'education', 'religion_refresh']
    w = d.weight.to_numpy()
    cells = []
    for label, c in [('All', None)] + [(c, c) for c in by]:
        lv = [('All', np.ones(len(d), bool))] if c is None else [(v, (d[c].fillna('Unknown').astype(str) == v).to_numpy()) for v in sorted(d[c].fillna('Unknown').astype(str).unique())]
        for v, s in lv:
            if s.sum() < 100 or v in ('Unknown', 'nan'):
                continue
            r = d.predicted_rate.to_numpy()[s]
            cells.append(dict(variable=label, value=v, n=int(s.sum()), respondents=int(d.id[s].nunique()),
                              annual_rate=[round(float(x), 6) for x in weighted_quantile(r, w[s], qs)],
                              p10_constant_rate=[round(float(x), 5) for x in 1 - np.exp(-10 * weighted_quantile(r, w[s], qs))]))
    popref = dict(
        method=(f'Held-out (5 respondent folds, the committed ml_couples folds) predicted annual legal-divorce rate from the '
                f'{best} model for every couple-interval, survey-weighted (baseline-wave weight) quantiles; cells with fewer '
                'than 100 unweighted intervals are not published; Unknown levels omitted. p10_constant_rate is 1 - exp(-10 x rate), '
                'a 10-year projection that holds the rate fixed (the models do not project marriage length or age forward). '
                'Rows are couple-years at ages 35-64 in 2000-2022, not weddings. Held-out predictions come from re-deriving '
                'ml_couples from the public NLSY79 release (identical 40,818-interval sample and folds; held-out gains within '
                f'{gap:.4f} percentage points of the committed ones).'),
        model='additive_enriched', unit='couple-interval', quantiles=qs, cells=cells)

    path = MODELS / 'nlsy79_couples.json'
    text = path.read_text()
    bundle = json.loads(text)
    base = {k: v for k, v in bundle.items() if k not in ('ood', 'population_reference')}
    base_text = json.dumps(base, separators=(',', ':'))
    if 'ood' not in bundle:
        assert base_text == text, 'bundle does not round-trip byte-for-byte; refusing to rewrite it'
    assert base_text.endswith('}')
    new = base_text[:-1] + ',"ood":' + json.dumps(spec, separators=(',', ':')) + \
        ',"population_reference":' + json.dumps(popref, separators=(',', ':')) + '}'
    path.write_text(new)

    # Test vectors: real-looking and unusual couples (no person-level rows: random draws over levels).
    rng = np.random.default_rng(SEED)
    rows = []
    for i in range(50):
        r = {c: str(rng.choice(levels[c])) for c in CATEGORICAL}
        r['age'] = float(rng.uniform(30, 70))
        r['current_marriage_years'] = float(rng.uniform(0, 45))
        r['first_marriage_age'] = None if i % 7 == 0 else float(rng.uniform(16, 45))
        r['wife_wage_share'] = None if i % 5 == 0 else float(rng.uniform(0, 1))
        rows.append(r)
    df = pd.DataFrame(rows)
    for c in NUMERIC:
        df[c] = df[c].astype(float)
    vec = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
               ood_d2=ood.score(fit, df, NUMERIC, CATEGORICAL, levels).tolist())
    (MODELS / 'nlsy79_couples_reference_testvectors.json').write_text(json.dumps(vec))
    qd = spec['heldout_quantiles']
    print(f'ood: {spec["rows"]} intervals, {spec["people"]} respondents; held-out d2 median {np.median(held):.1f}, '
          f'99th pct {np.quantile(held, .99):.1f}')
    print('population reference: overall median annual rate',
          cells[0]['annual_rate'][qs.index(0.5)], 'p5-p95', cells[0]['annual_rate'][1], cells[0]['annual_rate'][-2], len(cells), 'cells')


if __name__ == '__main__':
    main()
