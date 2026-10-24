"""How well can divorce be predicted before the wedding? Within- and cross-dataset evaluation
on the harmonized pre-wedding feature set (SPEC.md).

Reads work/<dataset>.csv.gz (built by build_<dataset>.py) and writes:
- within_dataset.csv: each dataset, 5-fold person-held-out, every model family;
- external_validation.csv: train on one dataset, test on each other one;
- feature_coverage.csv: share of rows with a known value, per dataset and feature.

Metrics, all survey-weighted: held-out Poisson deviance gain over the training constant rate
(marriage-year intervals); Harrell's C on the predicted 10-year cumulative hazard; cumulative/
dynamic AUC at 5 and 10 years with inverse-probability-of-censoring weights; calibration at 10
years as observed (weighted Kaplan-Meier) over expected (mean predicted probability).

Run (scikit-learn 1.7.2): python3 crossval.py [--quick]
"""
from pathlib import Path
import argparse, json, sys, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler

warnings.simplefilter('ignore')
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'nlsy79_full'))
import survmetrics as sm  # noqa: E402  (weighted deviance, IPCW AUC, Kaplan-Meier)

SEED = 20261020
MAX_YEARS = 30  # follow-up used for training and scoring
# Models use respondent/spouse columns derived from the SPEC's wife/husband columns: each
# survey interviews one spouse, so the respondent's own traits are nearly always known and
# the spouse's are known wherever the survey asks them.
NUMERIC = ['respondent_age', 'spouse_age', 'age_gap', 'wedding_year']
CATEGORICAL = ['respondent_educ', 'spouse_educ', 'spouse_prior_marriage',
               'respondent_prior_children', 'spouse_prior_children', 'cohabited_first',
               'respondent_race', 'spouse_race', 'same_race', 'intact_family', 'religion_raised',
               'respondent_sex']
MIN_KNOWN = 0.5  # a feature is used only where at least half the rows know it
# No missing-value indicators: whether a spouse trait is known can depend on the outcome (e.g.
# Canada 2017 spouse age is missing for 6.8% of dissolved and 1.5% of intact marriages).


def load(path):
    d = pd.read_csv(path, dtype=str, keep_default_na=False)  # 'None' is a religion level
    for c in ['weight', 'duration_years', 'event', 'wedding_year', 'wife_age', 'husband_age']:
        d[c] = pd.to_numeric(d[c], errors='coerce')
    d['age_gap'] = d.husband_age - d.wife_age  # husband minus wife
    man = (d.respondent_sex == 'Man').to_numpy()
    for trait in ['age', 'educ', 'prior_marriage', 'prior_children', 'race']:
        d['respondent_' + trait] = np.where(man, d['husband_' + trait], d['wife_' + trait])
        d['spouse_' + trait] = np.where(man, d['wife_' + trait], d['husband_' + trait])
    for c in ['respondent_age', 'spouse_age']:
        d[c] = pd.to_numeric(d[c], errors='coerce')
    both = d.wife_race.isin(['Hispanic', 'White', 'Black', 'Other']) & d.husband_race.isin(['Hispanic', 'White', 'Black', 'Other'])
    d['same_race'] = np.where(both, np.where(d.wife_race == d.husband_race, 'Same', 'Different'), 'Unknown')
    for c in CATEGORICAL:
        d[c] = d[c].fillna('Unknown').replace('', 'Unknown')
    d = d[(d.duration_years > 0) & d.weight.notna()].reset_index(drop=True)
    d['weight'] = d.weight / d.weight.mean()
    d['t'] = d.duration_years.clip(upper=MAX_YEARS)
    d['d'] = ((d.event == 1) & (d.duration_years <= MAX_YEARS)).astype(int)
    return d


def coverage(d):
    out = {c: float(d[c].notna().mean()) for c in NUMERIC}
    out.update({c: float((d[c] != 'Unknown').mean()) for c in CATEGORICAL})
    return out


def intervals(d):
    """One row per marriage-year (exposure < 1 in the last year)."""
    n = np.ceil(d.t.to_numpy()).astype(int)
    idx = np.repeat(np.arange(len(d)), n)
    k = np.concatenate([np.arange(m) for m in n])
    t = d.t.to_numpy()[idx]
    iv = d.iloc[idx].reset_index(drop=True)
    iv['marriage_years'] = k.astype(float)
    iv['exposure'] = np.minimum(t, k + 1) - k
    iv['y'] = ((d.d.to_numpy()[idx] == 1) & (t <= k + 1)).astype(int)
    iv['person'] = idx
    return iv


def make(kind, num, cat):
    # "Unknown" is imputed with the most common known level rather than given its own column:
    # in several datasets whether a spouse trait is known depends on how the marriage went
    # (NLSY97 spouses are recorded after the wedding, so couples who split early go unrecorded).
    onehot = Pipeline([('impute', SimpleImputer(missing_values='Unknown', strategy='most_frequent')),
                       ('onehot', OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False))])
    if kind == 'duration_only':
        prep = ColumnTransformer([('num', Pipeline([('spline', SplineTransformer(n_knots=5, degree=2, knots='quantile', include_bias=False, extrapolation='linear')), ('scale', StandardScaler())]), ['marriage_years'])])
        return Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=1e-6, max_iter=3000, solver='newton-cholesky'))])
    numcols = ['marriage_years'] + num
    if kind in ('additive_spline', 'logistic_hazard'):
        nump = Pipeline([('impute', SimpleImputer(strategy='median')),
                         ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='constant')),
                         ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', nump, numcols)] + ([('cat', onehot, cat)] if cat else []))
        est = PoissonRegressor(alpha=1e-4, max_iter=3000, solver='newton-cholesky') if kind == 'additive_spline' \
            else LogisticRegression(C=1.0, max_iter=5000)
        return Pipeline([('prep', prep), ('fit', est)])
    prep = ColumnTransformer([('num', SimpleImputer(strategy='median'), numcols)] + ([('cat', onehot, cat)] if cat else []))
    est = HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=150, learning_rate=0.05,
                                        min_samples_leaf=200, l2_regularization=1.0, early_stopping=False, random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


KINDS = ['duration_only', 'additive_spline', 'logistic_hazard', 'gradient_boosting']


class Model:
    def __init__(self, kind, num, cat):
        self.kind, self.pipe = kind, make(kind, num, cat)

    def fit(self, iv):
        if self.kind == 'logistic_hazard':
            self.pipe.fit(iv, iv.y, fit__sample_weight=iv.weight)
        else:
            self.pipe.fit(iv, iv.y / iv.exposure, fit__sample_weight=iv.weight * iv.exposure)
        return self

    def rate(self, frame):
        if self.kind == 'logistic_hazard':
            return -np.log1p(-np.clip(self.pipe.predict_proba(frame)[:, 1], 0, 1 - 1e-12))
        return self.pipe.predict(frame)

    def cumhaz(self, people, horizon):
        """Predicted cumulative hazard over the first `horizon` marriage-years, per person."""
        h = np.zeros(len(people))
        for k in range(horizon):
            f = people.copy()
            f['marriage_years'] = float(k)
            h += self.rate(f)
        return h


def harrell_c_fast(t, d, score, w):
    """Weighted Harrell's C in O(n log n): pairs (i event at t_i, j with t_j > t_i), weight w_i w_j."""
    o = np.argsort(-t, kind='stable')
    t, d, s, w = t[o], d[o], score[o], w[o]
    ranks = np.searchsorted(np.unique(s), s)
    size = ranks.max() + 2
    tree_w = np.zeros(size)

    def add(i, v):
        i += 1
        while i < size:
            tree_w[i] += v
            i += i & -i

    def prefix(i):  # sum of weights with rank < i
        tot = 0.0
        while i > 0:
            tot += tree_w[i]
            i -= i & -i
        return tot
    num = den = total = 0.0
    i = 0
    n = len(t)
    while i < n:
        j = i
        while j < n and t[j] == t[i]:
            j += 1
        # risk set strictly later: everything already added
        for k in range(i, j):
            if d[k] == 1 and total > 0:
                below = prefix(ranks[k])
                tie = prefix(ranks[k] + 1) - below
                num += w[k] * (below + 0.5 * tie)
                den += w[k] * total
        for k in range(i, j):
            add(ranks[k], w[k])
            total += w[k]
        i = j
    return num / den if den > 0 else np.nan


def evaluate(people, iv, rate, h10, train_const):
    """Metrics for one test set given interval rates and per-person 10-year cumulative hazards."""
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    dev = sm.deviance(y, e, w, rate)
    base = sm.deviance(y, e, w, np.full(len(y), train_const))
    t, d, wp = people.t.to_numpy(), people.d.to_numpy(), people.weight.to_numpy()
    a = np.zeros(len(t))
    g = sm.km_censoring(a, t, d, wp)
    out = dict(deviance_gain_percent=100 * (1 - dev / base), c_index=harrell_c_fast(t, d, h10, wp))
    for hz in (5, 10):
        out[f'auc_{hz}y'] = sm.auc_at(a, t, d, h10, wp, hz, g)
    obs = sm.km_dissolution(a, t, d, wp, 10)
    exp = float(np.average(1 - np.exp(-h10), weights=wp))
    out.update(observed_10y=obs, expected_10y=exp, observed_over_expected_10y=obs / exp)
    return out


# Education is "Unknown" whenever it cannot be dated before the wedding, and that group
# over-represents people who studied after it (NSFG audit), so an Unknown level would carry
# post-wedding information. Education is used only where nearly everyone's is dated.
EDU_MIN_KNOWN = 0.9


def usable(cov_a, cov_b=None):
    need = lambda c: EDU_MIN_KNOWN if c.endswith('_educ') else MIN_KNOWN
    ok = lambda c: cov_a[c] >= need(c) and (cov_b is None or cov_b[c] >= need(c))
    return [c for c in NUMERIC if ok(c)], [c for c in CATEGORICAL if ok(c)]


def within(name, d, kinds, folds=5):
    num, cat = usable(coverage(d))
    rng = np.random.default_rng(SEED)
    ids = d.id.unique()
    rng.shuffle(ids)
    fold_of = dict(zip(ids, np.arange(len(ids)) % folds))
    d = d.assign(fold=d.id.map(fold_of))
    iv = intervals(d)
    rows = []
    preds = {k: (np.zeros(len(iv)), np.zeros(len(d))) for k in kinds}
    const = np.zeros(len(iv))
    for f in range(folds):
        tr_iv, te_mask = iv[iv.fold != f], (iv.fold == f).to_numpy()
        pm = (d.fold == f).to_numpy()
        c = (tr_iv.weight * tr_iv.y).sum() / (tr_iv.weight * tr_iv.exposure).sum()
        const[te_mask] = c
        for k in kinds:
            m = Model(k, num, cat).fit(tr_iv)
            preds[k][0][te_mask] = m.rate(iv[te_mask])
            preds[k][1][pm] = m.cumhaz(d[pm], 10)
        print(f'  {name} fold {f}', flush=True)
    for k in kinds:
        r = evaluate(d, iv, preds[k][0], preds[k][1], 0)
        # Gain against the fold-specific training constants, not one global one.
        y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
        r['deviance_gain_percent'] = 100 * (1 - sm.deviance(y, e, w, preds[k][0]) / sm.deviance(y, e, w, const))
        rows.append(dict(dataset=name, model=k, marriages=len(d), dissolutions=int(d.d.sum()),
                         features=';'.join(num + cat), **r))
    return rows


def external(train_name, tr, test_name, te, kinds):
    """Train on one dataset, test on another. Two feature sets: every shared feature, and the
    same without wedding year (cohorts barely overlap, so a period trend must extrapolate).
    Deviance gain is reported twice: against the TRAINING constant rate (what transports as
    is) and after rescaling the model's rates to the test data's overall level, against the
    test data's own constant (ranking and shape only; calibration-in-the-large removed)."""
    num_all, cat = usable(coverage(tr), coverage(te))
    tr_iv, te_iv = intervals(tr), intervals(te)
    const = (tr_iv.weight * tr_iv.y).sum() / (tr_iv.weight * tr_iv.exposure).sum()
    y, e, w = te_iv.y.to_numpy(), te_iv.exposure.to_numpy(), te_iv.weight.to_numpy()
    te_const = np.dot(w, y) / np.dot(w, e)
    rows = []
    for variant, num in [('all_shared', num_all), ('no_wedding_year', [c for c in num_all if c != 'wedding_year'])]:
        for k in kinds:
            if variant == 'no_wedding_year' and k == 'duration_only':
                continue
            m = Model(k, num, cat).fit(tr_iv)
            rate = m.rate(te_iv)
            r = evaluate(te, te_iv, rate, m.cumhaz(te, 10), const)
            scaled = rate * np.dot(w, y) / np.dot(w, e * rate)
            r['deviance_gain_recalibrated_percent'] = 100 * (1 - sm.deviance(y, e, w, scaled) / sm.deviance(y, e, w, np.full(len(y), te_const)))
            rows.append(dict(train=train_name, test=test_name, variant=variant, model=k, features=';'.join(num + cat), **r))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quick', action='store_true', help='additive model only, for a smoke test')
    ap.add_argument('--only', nargs='*', help='dataset names to include')
    args = ap.parse_args()
    kinds = ['duration_only', 'additive_spline'] if args.quick else KINDS
    data = {p.name.split('.')[0]: load(p) for p in sorted((HERE / 'work').glob('*.csv.gz'))
            if not args.only or p.name.split('.')[0] in args.only}
    cov = pd.DataFrame({k: coverage(v) for k, v in data.items()}).T
    cov.index.name = 'dataset'
    cov.round(4).to_csv(HERE / 'feature_coverage.csv')
    print(cov.round(2).to_string())
    win = []
    for name, d in data.items():
        win += within(name, d, kinds)
    win = pd.DataFrame(win)
    win.to_csv(HERE / 'within_dataset.csv', index=False, float_format='%.5g')
    print(win.drop(columns='features').round(4).to_string(index=False))
    ext = []
    for a in data:
        for b in data:
            if a != b:
                ext += external(a, data[a], b, data[b], kinds)
                print('  external', a, '->', b, flush=True)
    ext = pd.DataFrame(ext)
    if ext.empty:
        return
    ext.to_csv(HERE / 'external_validation.csv', index=False, float_format='%.5g')
    print(ext.drop(columns='features').round(4).to_string(index=False))
    (HERE / 'run_audit.json').write_text(json.dumps(dict(sklearn=sklearn.__version__, seed=SEED, max_years=MAX_YEARS,
                                                         min_known=MIN_KNOWN, datasets={k: len(v) for k, v in data.items()}), indent=1) + '\n')


if __name__ == '__main__':
    main()
