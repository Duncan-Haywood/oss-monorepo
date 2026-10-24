"""Pooled NSFG 1995-2023 first-marriage dissolution lens: fit, evaluate, compare, export.

Builds marriage-year intervals from harmonise.py's person table, then for two analyses:
  women  - women's first marriages from 8 cycles, with the husband details women report;
  both   - women's and men's first marriages (men: 2002 onward), respondent-level inputs only;
compares models held out by person (5 seeded folds), with deviance, Harrell's C,
time-dependent AUC at 5 and 10 years, decile lift and calibration, person-bootstrap 95%
intervals, out-of-time validation (weddings before 2000 -> 2000 and later), sensitivity
analyses (divorce only, exact-date cycles only, a survey-cycle term) and a head-to-head
against the NSFG 2002-only lens. Exports app/models/nsfg_pooled_first_marriage.json and test
vectors. Aggregate tables only; nothing person-level is written.

Run from this folder after `sh download.sh` (raw files in $NSFG_RAW or ./raw):
    python3 train_pooled.py            # about 15-30 minutes on a laptop
Needs numpy, pandas, scikit-learn 1.7.2.
"""
from pathlib import Path
import json, sys, time, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(ROOT / 'app' / 'tools'))
import harmonise  # noqa: E402
import metrics as M  # noqa: E402
from bundle_export import export  # noqa: E402
import ood  # noqa: E402

warnings.simplefilter('ignore')
assert sklearn.__version__ == '1.7.2', 'use scikit-learn 1.7.2 (requirements.txt)'
SEED = 20261020
OUT = ROOT / 'app' / 'models'
SMOKE = '--smoke' in sys.argv          # 12% subsample end to end, to test the code path only
QUICK = '--quick' in sys.argv or SMOKE  # fewer bootstrap draws, for development
B_DEV = 200 if QUICK else 1000         # person-bootstrap draws for deviance gains
B_DISC = 50 if QUICK else 200          # person-bootstrap draws for C / AUC / lift
B_RR = 3 if SMOKE else 10 if QUICK else 40             # cluster-bootstrap refits for rate ratios (design-based)
GRID_YEARS = 20                        # marriage years predicted for each person (0..19)

# ---------------------------------------------------------------- feature sets
LENS2002_NUM = ['marriage_years', 'wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year']
LENS2002_CAT = ['cohabited_first', 'husband_married_before', 'husband_prior_children',
                'wife_race_ethnicity', 'same_race_ethnicity', 'wife_intact_family']
WOMEN_NUM = LENS2002_NUM + ['wife_premarital_sex_years']
WOMEN_CAT = LENS2002_CAT + ['wife_premarital_birth', 'wife_premarital_partners', 'wife_ba_by_wedding',
                            'wife_mother_education', 'wife_mother_age_first_birth', 'wife_religion_raised',
                            'wife_born_outside_us']
BOTH_NUM = ['marriage_years', 'respondent_age_at_marriage', 'wedding_year', 'respondent_premarital_sex_years']
BOTH_CAT = ['respondent_sex', 'cohabited_first', 'respondent_premarital_birth', 'respondent_race_ethnicity',
            'respondent_intact_family', 'respondent_ba_by_wedding', 'respondent_mother_education',
            'respondent_mother_age_first_birth', 'respondent_religion_raised', 'respondent_born_outside_us']

# 2022-2023 public file gives the husband's age at marriage in 5-year bands; use mid-points.
HX_BAND_MID = {1: 18.5, 2: 22.5, 3: 27.0, 4: 32.0, 5: 37.0, 6: 45.0}


def people_table():
    m, audit = harmonise.build()
    m = m.copy()
    band = m.pop('spouse_age_band_2022') if 'spouse_age_band_2022' in m else pd.Series(np.nan, index=m.index)
    fill = band.map(HX_BAND_MID)
    m['spouse_age_from_band'] = fill.notna()
    m['spouse_age_at_marriage'] = m.spouse_age_at_marriage.fillna(fill)
    m['t'] = (m.months + 0.5) / 12
    for c in ['age_at_marriage', 'premarital_sex_years', 'race_ethnicity', 'intact_family', 'ba_by_wedding',
              'mother_education', 'mother_age_first_birth', 'religion_raised', 'born_outside_us', 'premarital_birth']:
        m['respondent_' + c] = m[c]
    m['respondent_sex'] = m.sex.map({'F': 'Female', 'M': 'Male'})
    ren = dict(age_at_marriage='wife_age_at_marriage', spouse_age_at_marriage='husband_age_at_marriage',
               spouse_married_before='husband_married_before', spouse_prior_children='husband_prior_children',
               race_ethnicity='wife_race_ethnicity', intact_family='wife_intact_family',
               premarital_sex_years='wife_premarital_sex_years', premarital_birth='wife_premarital_birth',
               premarital_partners='wife_premarital_partners', ba_by_wedding='wife_ba_by_wedding',
               mother_education='wife_mother_education', mother_age_first_birth='wife_mother_age_first_birth',
               religion_raised='wife_religion_raised', born_outside_us='wife_born_outside_us')
    m = m.rename(columns=ren)
    return m, audit


def normalise_weights(p):
    p = p.copy()
    p['weight'] = p.cycle_weight / p.cycle_weight.mean()
    return p


def intervals(p, outcome='event'):
    """One row per marriage-year (0 = first year); events placed in the year they occur."""
    t = p.t.to_numpy()
    n = np.ceil(t).astype(int)
    n[n == 0] = 1
    idx = np.repeat(np.arange(len(p)), n)
    k = np.concatenate([np.arange(c) for c in n]).astype(float)
    exp_ = np.minimum(t[idx], k + 1) - k
    last = (k + 1 >= t[idx])
    iv = p.iloc[idx].reset_index(drop=True)
    iv['marriage_years'] = k
    iv['exposure'] = exp_
    iv['y'] = (iv[outcome].to_numpy() * last).astype(float)
    iv['person'] = idx
    return iv


# ---------------------------------------------------------------- models
def onehot():
    return OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)


def spline_num(n_knots=4):
    return Pipeline([('impute', SimpleImputer(strategy='median')),
                     ('spline', SplineTransformer(n_knots=n_knots, degree=2, knots='quantile', include_bias=False,
                                                  extrapolation='linear')),
                     ('scale', StandardScaler())])


# Fixed centres for the interaction products (so train and test folds use the same ones).
CENTER = dict(wife_age_at_marriage=24.0, husband_age_at_marriage=26.0, wedding_year=2000.0,
              wife_premarital_sex_years=5.0, respondent_age_at_marriage=25.0, respondent_premarital_sex_years=6.0)
CLIP = dict(wife_age_at_marriage=(15, 50), husband_age_at_marriage=(15, 50), wedding_year=(1965, 2023),
            wife_premarital_sex_years=(0, 20), respondent_age_at_marriage=(15, 50), respondent_premarital_sex_years=(0, 20))


def interaction_frame(d, num, cat, levels):
    """Linear-by-duration and age-pair products for the interaction GLM (evaluated, not exported)."""
    cols = {}
    # Products are winsorised (duration at 25 years, inputs to CLIP) so a profile far outside
    # the data cannot send exp(eta) to infinity; an earlier unclipped version did on one fold.
    my = np.minimum(d['marriage_years'].to_numpy(float), 25.0) - 5.0
    for c in num:
        if c == 'marriage_years':
            continue
        x = np.clip(d[c].to_numpy(float), *CLIP[c]) - CENTER[c]
        cols[f'{c}__x_years'] = my * np.where(np.isnan(x), 0.0, x)
    for c in cat:
        v = d[c].astype(str).to_numpy()
        for lv in levels[c][1:]:
            if lv in ('Unknown', 'Not asked'):   # rare or structural levels: a handful of people
                continue                         # each, and their duration slopes blew up a fold
            cols[f'{c}={lv}__x_years'] = my * (v == lv)
    ages = [c for c in num if 'age_at_marriage' in c]
    for i in range(len(ages)):
        for j in range(i + 1, len(ages)):
            a = np.clip(d[ages[i]].to_numpy(float), 15, 50)
            b = np.clip(d[ages[j]].to_numpy(float), 15, 50)
            a = np.where(np.isnan(a), 25.0, a) - 25
            b = np.where(np.isnan(b), 27.0, b) - 25
            cols[f'{ages[i]}__x_{ages[j]}'] = a * b
            cols[f'{ages[i]}__minus_{ages[j]}_abs'] = np.abs(a - b)
    return pd.DataFrame(cols, index=d.index)


class InteractionGLM:
    def __init__(self, num, cat, levels, alpha=1e-3):
        self.num, self.cat, self.levels, self.alpha = num, cat, levels, alpha

    def _x(self, d):
        # Duration is capped at 25 years here: with interactions, a fold's spline tail can be
        # steep where few marriages remain, and one unclipped fold sent 2022-2023 marriages of
        # 30+ years to rates in the thousands.
        d = d.assign(marriage_years=np.minimum(d.marriage_years.to_numpy(float), 25.0))
        return pd.concat([d[self.num + self.cat], interaction_frame(d, self.num, self.cat, self.levels)], axis=1)

    def fit(self, d, y, w):
        x = self._x(d)
        self.inter = [c for c in x.columns if c not in self.num + self.cat]
        prep = ColumnTransformer([('num', spline_num(), self.num), ('cat', onehot(), self.cat),
                                  ('int', Pipeline([('scale', StandardScaler())]), self.inter)])
        self.pipe = Pipeline([('prep', prep), ('fit', PoissonRegressor(alpha=self.alpha, max_iter=3000, tol=1e-8,
                                                                       solver='newton-cholesky'))])
        self.pipe.fit(x, y, fit__sample_weight=w)
        return self

    def predict(self, d):
        return self.pipe.predict(self._x(d))


def pipeline(kind, num, cat):
    if kind == 'duration_only':
        prep = ColumnTransformer([('num', spline_num(5), ['marriage_years'])])
        est = PoissonRegressor(alpha=1e-6, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    elif kind == 'additive_spline':
        prep = ColumnTransformer([('num', spline_num(), num), ('cat', onehot(), cat)])
        est = PoissonRegressor(alpha=1e-4, max_iter=2000, tol=1e-9, solver='newton-cholesky')
    else:
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), num),
                                  ('cat', onehot(), cat)])
        if kind == 'tree_depth4':
            est = DecisionTreeRegressor(criterion='poisson', max_depth=4, min_samples_leaf=3000, random_state=SEED)
        elif kind == 'gradient_boosting':
            est = HistGradientBoostingRegressor(loss='poisson', max_depth=3, max_iter=250, learning_rate=0.05,
                                                min_samples_leaf=1000, l2_regularization=1.0,
                                                early_stopping=False, random_state=SEED)
        else:
            raise KeyError(kind)
    return Pipeline([('prep', prep), ('fit', est)])


class Model:
    def __init__(self, kind, num, cat, levels=None, clip_year=None):
        self.kind, self.num, self.cat, self.levels, self.clip_year = kind, num, cat, levels, clip_year

    def _d(self, d):
        if self.clip_year:
            d = d.copy()
            d['wedding_year'] = d.wedding_year.clip(*self.clip_year)
        return d

    def fit(self, iv, outcome_col='y'):
        d = self._d(iv)
        w = (d.weight * d.exposure).to_numpy()
        y = (d[outcome_col] / d.exposure).to_numpy()
        if self.kind == 'interaction_glm':
            self.m = InteractionGLM(self.num, self.cat, self.levels).fit(d, y, w)
        elif self.kind == 'constant':
            self.rate = float((d.weight * d[outcome_col]).sum() / (d.weight * d.exposure).sum())
        else:
            self.m = pipeline(self.kind, self.num, self.cat).fit(d[self.num + self.cat], y, fit__sample_weight=w)
        return self

    def predict(self, d):
        if self.kind == 'constant':
            return np.full(len(d), self.rate)
        d = self._d(d)
        if self.kind == 'interaction_glm':
            return self.m.predict(d)
        return self.m.predict(d[self.num + self.cat])


def grid_predict(model, people, years=GRID_YEARS):
    """Predicted annual rates for marriage years 0..years-1 for each person: shape (n, years)."""
    g = people.loc[people.index.repeat(years)].copy()
    g['marriage_years'] = np.tile(np.arange(years, dtype=float), len(people))
    return model.predict(g).reshape(len(people), years)


def clean(o):
    """JSON-safe copy: NaN/inf become null, numpy scalars become Python numbers."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.integer):
        return int(o)
    return o


def deviance(y, e, w, rate):
    mu = e * rate
    term = np.zeros(len(y))
    ok = y > 0
    term[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * np.dot(w, term - y + mu) / np.dot(w, e)


def unit_deviance(y, e, w, rate):
    mu = e * rate
    t = np.zeros(len(y))
    ok = y > 0
    t[ok] = y[ok] * np.log(y[ok] / mu[ok])
    return 2 * w * (t - y + mu)


# ---------------------------------------------------------------- evaluation
def person_scores(grid):
    """Cumulative hazard to 5 and 10 years (risk scores) and 5/10/20-year dissolution probability."""
    ch = np.cumsum(grid, axis=1)
    return dict(score5=ch[:, 4], score10=ch[:, 9], p5=1 - np.exp(-ch[:, 4]), p10=1 - np.exp(-ch[:, 9]),
                p20=1 - np.exp(-ch[:, 19]))


def disc_metrics(t, d, s, pw, mult=None, ivp=None, iv_pred=None, iv_e=None, iv_y=None, iv_w=None):
    """Harrell's C (10-year score), AUC(5), AUC(10), decile lift and person-decile calibration.
    `pw` are person survey weights, `mult` optional bootstrap counts per person; interval arrays
    carry the person index `ivp` and the interval survey weight `iv_w`."""
    w = pw if mult is None else pw * mult
    out = dict(harrell_c=M.harrell_c(t, d, s['score10'], w), auc5=M.auc_at(t, d, s['score5'], w, 5.0),
               auc10=M.auc_at(t, d, s['score10'], w, 10.0))
    if ivp is not None:
        sel = w > 0
        dec_all = np.full(len(w), -1)
        dec_all[sel] = M.deciles(s['score10'][sel], w[sel])
        k_iv = dec_all[ivp] + 1
        ww = iv_w if mult is None else iv_w * mult[ivp]
        num_o = np.bincount(k_iv, weights=ww * iv_y, minlength=11)[1:]
        num_p = np.bincount(k_iv, weights=ww * iv_e * iv_pred, minlength=11)[1:]
        den = np.bincount(k_iv, weights=ww * iv_e, minlength=11)[1:]
        obs, pred = num_o / den, num_p / den
        out.update(decile_lift=obs[9] / obs[0] if obs[0] > 0 else np.nan, decile_observed=obs, decile_predicted=pred)
    return out


def cv_analysis(name, people, models, folds=5, outcome='event'):
    """Person-held-out predictions for every model: interval rates and person grids. With
    $NSFG_CACHE set (a private scratch folder, never the repository: the cache is
    person-level), results are reused across runs."""
    import os, pickle
    cache = os.environ.get('NSFG_CACHE')
    key = f'{name}_{outcome}_{len(people)}_{"-".join(models)}{"_smoke" if SMOKE else ""}.pkl'
    if cache and (Path(cache) / key).exists():
        return pickle.loads((Path(cache) / key).read_bytes())
    res = _cv(name, people, models, folds, outcome)
    if cache:
        Path(cache).mkdir(parents=True, exist_ok=True)
        (Path(cache) / key).write_bytes(pickle.dumps(res))
    return res


def _cv(name, people, models, folds, outcome):
    people = people.reset_index(drop=True)
    rng = np.random.default_rng(SEED)
    perm = rng.permutation(len(people))
    fold = np.empty(len(people), int)
    fold[perm] = np.arange(len(people)) % folds
    people['fold'] = fold
    iv = intervals(people, outcome)
    iv['fold'] = fold[iv.person.to_numpy()]
    preds = {k: np.zeros(len(iv)) for k in models}
    grids = {k: np.zeros((len(people), GRID_YEARS)) for k in models}
    for f in range(folds):
        tr_iv = iv[iv.fold != f]
        te_iv = iv[iv.fold == f]
        te_p = people[people.fold == f]
        for k, factory in models.items():
            t0 = time.time()
            mdl = factory(tr_iv)
            preds[k][te_iv.index.to_numpy()] = mdl.predict(te_iv)
            grids[k][te_p.index.to_numpy()] = grid_predict(mdl, te_p)
            print(f'  {name} fold {f} {k}: {time.time() - t0:.1f}s', flush=True)
    return people, iv, preds, grids


def summarise(name, people, iv, preds, grids, ref='constant', dur='duration_only', subset=None, boot=True):
    """Metrics table (with person-bootstrap CIs) for one analysis, optionally on a subset of people."""
    if subset is not None:
        keep_p = subset(people)
        pidx = np.where(keep_p)[0]
        keep_iv = keep_p[iv.person.to_numpy()]
        people = people[keep_p].reset_index(drop=True)
        remap = -np.ones(len(keep_p), int)
        remap[pidx] = np.arange(len(pidx))
        iv = iv[keep_iv].copy()
        iv['person'] = remap[iv.person.to_numpy()]
        iv = iv.reset_index(drop=True)
        preds = {k: v[keep_iv] for k, v in preds.items()}
        grids = {k: v[pidx] for k, v in grids.items()}
    y, e, w = iv.y.to_numpy(), iv.exposure.to_numpy(), iv.weight.to_numpy()
    iv = iv.assign(y_eval=y)
    people = people.assign(event_eval=people.event if 'event_eval' not in people else people.event_eval)
    pw = people.weight.to_numpy()
    pt, pd_ = people.t.to_numpy(), people.event_eval.to_numpy()
    base = deviance(y, e, w, preds[ref])
    dref = deviance(y, e, w, preds[dur]) if dur in preds else np.nan
    codes = iv.person.to_numpy()
    per = {k: np.bincount(codes, weights=unit_deviance(y, e, w, v), minlength=len(people)) for k, v in preds.items()}
    rng = np.random.default_rng(SEED)
    counts = rng.multinomial(len(people), np.full(len(people), 1 / len(people)), size=B_DEV)
    rows, cal, boot_c = [], [], {}
    LENS = 'lens2002_2002data'
    imp_lens = 100 * (1 - counts @ per[LENS] / (counts @ per[ref])) if LENS in per else None
    for k in preds:
        dk = deviance(y, e, w, preds[k])
        imp = 100 * (1 - counts @ per[k] / (counts @ per[ref]))
        imp_d = 100 * (1 - counts @ per[k] / (counts @ per[dur])) if dur in per else np.full(B_DEV, np.nan)
        r = dict(analysis=name, model=k, people=len(people), events=int(people.event_eval.sum()),
                 heldout_mean_deviance=dk, deviance_improvement_percent=100 * (1 - dk / base),
                 dev_ci95_low=np.quantile(imp, 0.025), dev_ci95_high=np.quantile(imp, 0.975),
                 improvement_over_duration_only_percent=100 * (1 - dk / dref),
                 dur_ci95_low=np.quantile(imp_d, 0.025), dur_ci95_high=np.quantile(imp_d, 0.975),
                 observed_expected_ratio=float(np.dot(w, y) / np.dot(w, e * preds[k])))
        if imp_lens is not None and k not in (ref, LENS):
            # Paired person-bootstrap difference in deviance gain versus the refit 2002 lens.
            dd = imp - imp_lens
            r['gain_minus_lens2002'] = r['deviance_improvement_percent'] - 100 * (1 - deviance(y, e, w, preds[LENS]) / base)
            r['gain_minus_lens2002_ci95'] = [float(np.quantile(dd, 0.025)), float(np.quantile(dd, 0.975))]
        if k not in (ref, dur):   # the constant and duration-only curves rank nobody (same score for all)
            s = person_scores(grids[k])
            args = dict(ivp=codes, iv_pred=preds[k], iv_e=e, iv_y=y, iv_w=w)
            dm = disc_metrics(pt, pd_, s, pw, **args)
            r.update({m: dm[m] for m in ['harrell_c', 'auc5', 'auc10', 'decile_lift']})
            for b in range(10):
                cal.append(dict(analysis=name, model=k, decile=b + 1, observed_rate=dm['decile_observed'][b],
                                predicted_rate=dm['decile_predicted'][b]))
            if boot:
                bs = {m: [] for m in ['harrell_c', 'auc5', 'auc10', 'decile_lift']}
                for bi in range(B_DISC):
                    dmb = disc_metrics(pt, pd_, s, pw, mult=counts[bi], **args)
                    for m in bs:
                        bs[m].append(dmb[m])
                for m in bs:
                    r[m + '_ci95'] = [float(np.nanquantile(bs[m], 0.025)), float(np.nanquantile(bs[m], 0.975))]
                boot_c[k] = np.array(bs['harrell_c'])
        rows.append(r)
    if LENS in boot_c:   # paired bootstrap difference in Harrell's C versus the refit 2002 lens
        for r in rows:
            if r['model'] in boot_c and r['model'] != LENS:
                lens_c = next(x['harrell_c'] for x in rows if x['model'] == LENS)
                dc = boot_c[r['model']] - boot_c[LENS]
                r['c_minus_lens2002'] = r['harrell_c'] - lens_c
                r['c_minus_lens2002_ci95'] = [float(np.nanquantile(dc, 0.025)), float(np.nanquantile(dc, 0.975))]
    return pd.DataFrame(rows), pd.DataFrame(cal)


# ---------------------------------------------------------------- descriptive survival
def km(t, ev, w, years=(1, 2, 3, 5, 10, 15, 20)):
    order = np.argsort(t)
    t, ev, w = t[order], ev[order], w[order]
    times, idx = np.unique(t, return_index=True)
    d = np.add.reduceat(w * ev, idx)
    leave = np.add.reduceat(w, idx)
    at_risk = w.sum() - np.concatenate([[0], np.cumsum(leave)[:-1]])
    s = np.cumprod(1 - d / at_risk)
    out = {}
    for yr in years:
        j = np.searchsorted(times, yr, side='right') - 1
        out[yr] = float(s[j]) if j >= 0 and yr <= t.max() else (1.0 if j < 0 else np.nan)
    return out


def survival_table(p):
    groups = [('All first marriages (women)', p.sex == 'F'), ('All first marriages (men)', p.sex == 'M')]
    for c in harmonise.CYCLE_ORDER:
        groups.append((f'Women, NSFG {c.replace("_", "-")}', (p.sex == 'F') & (p.cycle == c)))
    for a, b in [(1964, 1979), (1980, 1989), (1990, 1999), (2000, 2009), (2010, 2023)]:
        groups.append((f'Women, wedding {a}-{b}', (p.sex == 'F') & p.wedding_year.between(a, b)))
        groups.append((f'Men, wedding {a}-{b}', (p.sex == 'M') & p.wedding_year.between(a, b)))
    age = p.wife_age_at_marriage
    for lab, lo, hi in [('under 20', 0, 20), ('20-24', 20, 25), ('25-29', 25, 30), ('30+', 30, 99)]:
        groups.append((f'Women married {lab}', (p.sex == 'F') & (age >= lo) & (age < hi)))
    for v in ['Yes', 'No']:
        groups.append((f'Women, cohabited first: {v}', (p.sex == 'F') & (p.cohabited_first == v)))
        groups.append((f'Women, BA by wedding: {v}', (p.sex == 'F') & (p.wife_ba_by_wedding == v)))
        groups.append((f'Women, premarital birth: {v}', (p.sex == 'F') & (p.wife_premarital_birth == v)))
    rows = []
    for name, sel in groups:
        g = p[sel]
        if len(g) == 0:
            continue
        t, w = g.t.to_numpy(), g.weight.to_numpy()
        s = km(t, g.event.to_numpy(), w)
        sd = km(t, g.divorced_only.to_numpy(), w)
        rows.append(dict(group=name, marriages=len(g), dissolutions=int(g.event.sum()),
                         **{f'still_married_{yr}y': s[yr] for yr in s},
                         **{f'not_divorced_{yr}y': sd[yr] for yr in (5, 10, 20)}))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- population reference and partners
# The shapes below are the ones app/population.js reads, as written for the NSFG 2002 lenses by
# app/tools/population_reference.py (same helpers: band, weighted_quantiles, cell, the
# subgroup_defs layout and the given_wife / given_husband partner profiles).
HORIZONS = [5, 10, 20]
PCTS = list(range(1, 100))
MIN_CELL, MIN_COND, MIN_PROFILE = 100, 30, 10
AGE_BANDS = [(None, 20, 'under 20'), (20, 25, '20-24'), (25, 30, '25-29'), (30, None, '30+')]
HUSBAND_AGE_BANDS = [(None, 22, 'under 22'), (22, 25, '22-24'), (25, 30, '25-29'), (30, None, '30+')]
DECADES = [(1960, 1980, '1960s-1970s'), (1980, 1990, '1980s'), (1990, 2000, '1990s'), (2000, 2010, '2000s'),
           (2010, 2024, '2010-2023')]
GAP_BINS = [(None, 0, 'wife older'), (0, 3, '0-2 years'), (3, 6, '3-5 years'), (6, 10, '6-9 years'), (10, None, '10+ years')]
WOMEN_SUBGROUPS = {
    'wife_age_band': dict(label="Wife's age at the wedding", column='wife_age_at_marriage', bins=AGE_BANDS),
    'husband_age_band': dict(label="Husband's age at the wedding", column='husband_age_at_marriage', bins=HUSBAND_AGE_BANDS),
    'wife_ba_by_wedding': dict(label="Wife had a bachelor's degree by the wedding", column='wife_ba_by_wedding'),
    'wife_race_ethnicity': dict(label="Wife's race-ethnicity", column='wife_race_ethnicity'),
    'cohabited_first': dict(label='Lived together before marrying', column='cohabited_first'),
    'husband_married_before': dict(label='Husband married before', column='husband_married_before'),
    'husband_prior_children': dict(label='Husband has children from before', column='husband_prior_children'),
    'wife_intact_family': dict(label='Wife lived with both parents to 18', column='wife_intact_family'),
    'wife_religion_raised': dict(label='Religion the wife was raised in', column='wife_religion_raised'),
    'wife_premarital_birth': dict(label='Wife had a birth before the wedding', column='wife_premarital_birth'),
    'wedding_decade': dict(label='Wedding decade', column='wedding_year', bins=DECADES),
}
BOTH_SUBGROUPS = {
    'respondent_sex': dict(label='Spouse who reported', column='respondent_sex'),
    'respondent_age_band': dict(label="Reporting spouse's age at the wedding", column='respondent_age_at_marriage', bins=AGE_BANDS),
    'respondent_ba_by_wedding': dict(label="Bachelor's degree by the wedding", column='respondent_ba_by_wedding'),
    'respondent_race_ethnicity': dict(label='Race-ethnicity', column='respondent_race_ethnicity'),
    'cohabited_first': dict(label='Lived together before marrying', column='cohabited_first'),
    'respondent_intact_family': dict(label='Lived with both parents to 18', column='respondent_intact_family'),
    'respondent_religion_raised': dict(label='Religion raised in', column='respondent_religion_raised'),
    'wedding_decade': dict(label='Wedding decade', column='wedding_year', bins=DECADES),
}


def band(x, bins):
    if x is None or not np.isfinite(x):
        return None
    for lo, hi, name in bins:
        if (lo is None or x >= lo) and (hi is None or x < hi):
            return name
    return None


def weighted_quantiles(x, w, pcts=PCTS):
    o = np.argsort(x, kind='stable')
    x, w = np.asarray(x, float)[o], np.asarray(w, float)[o]
    c = (np.cumsum(w) - w / 2) / w.sum()
    return [float(np.interp(p / 100, c, x)) for p in pcts]


def cell(risk, w):
    return dict(n=int(len(w)), quantiles={f'p{p}': [round(v, 6) for v in vals]
                                          for p, vals in zip(PCTS, zip(*[weighted_quantiles(risk[:, j], w) for j in range(len(HORIZONS))]))})


def population_reference(d, risk, specs, about):
    """`risk`: (n, 3) held-out cumulative dissolution at HORIZONS for the rows of `d`."""
    w = d.weight.to_numpy()
    subs, defs = {}, {}
    for var, spec in specs.items():
        col = d[spec['column']]
        lv = col.map(lambda v: band(v, spec['bins'])) if 'bins' in spec else col.astype(str)
        cells = {}
        for level in sorted(x for x in lv.dropna().unique() if x not in ('Unknown', 'Not asked', 'nan')):
            s = (lv == level).to_numpy()
            if s.sum() >= MIN_CELL:
                cells[str(level)] = cell(risk[s], w[s])
        if cells:
            subs[var] = cells
        dd = dict(label=spec['label'], column=spec['column'])
        if 'bins' in spec:
            dd['bins'] = [dict(level=name, min=lo, max=hi) for lo, hi, name in spec['bins']]
        defs[var] = dd
    return dict(about=about, quantity='cumulative_dissolution_probability', horizons=HORIZONS,
                weights='cycle-adjusted NSFG final weights (see `weights`)', min_cell=MIN_CELL,
                overall=cell(risk, w), subgroups=subs, subgroup_defs=defs)


def heldout_cumulative(grids, keys):
    """1 - mean over `keys` of each model's survival exp(-sum of annual rates): the number the app
    shows for a lens (couple.js averages its non-baseline models' survival curves)."""
    surv = np.mean([np.exp(-np.cumsum(grids[k], axis=1)) for k in keys], axis=0)
    return 1 - surv[:, [h - 1 for h in HORIZONS]]


def partner_distribution(m):
    """Weighted joint frequencies of partner traits given the respondent's coarse traits (women's
    reports), in the given_wife / given_husband layout of population_reference.py. Rows with a
    trait not asked in their cycle (1995 prior children, 2022-2023 husband race) or unknown are
    left out of that table."""
    m = m[(m.sex == 'F')]
    w = m.weight.to_numpy()
    gap = (m.husband_age_at_marriage - m.wife_age_at_marriage).to_numpy()
    gap_bin = pd.Series([band(g, GAP_BINS) for g in gap], index=m.index)
    reps = {}
    for lo, hi, name in GAP_BINS:
        s = (gap_bin == name).to_numpy()
        reps[name] = round(weighted_quantiles(gap[s], w[s], [50])[0])
    d = m.assign(gap_bin=gap_bin, wife_age_band=m.wife_age_at_marriage.map(lambda v: band(v, AGE_BANDS)),
                 husband_age_band=m.husband_age_at_marriage.map(lambda v: band(v, HUSBAND_AGE_BANDS)))
    d = d[d.gap_bin.notna()]

    def table(given, traits):
        rows = []
        dd = d.dropna(subset=given)
        for c in given + traits:
            dd = dd[~dd[c].isin(['Unknown', 'Not asked'])]
        for key, grp in dd.groupby(given):
            if len(grp) < MIN_COND:
                continue
            key = key if isinstance(key, tuple) else (key,)
            prof = grp.groupby(traits).agg(n=('weight', 'size'), w=('weight', 'sum')).reset_index()
            kept = prof[prof.n >= MIN_PROFILE]
            if kept.empty:
                continue
            rows.append(dict(given=dict(zip(given, map(str, key))), n=int(len(grp)),
                             coverage=round(float(kept.w.sum() / grp.weight.sum()), 4),
                             profiles=[dict(traits={t: str(r[t]) for t in traits}, share=round(float(r.w / kept.w.sum()), 6))
                                       for _, r in kept.sort_values('w', ascending=False).iterrows()]))
        return rows

    return dict(
        about=('Weighted joint frequencies of partner traits given the respondent\'s own coarse traits, in women\'s first '
               'marriages pooled over NSFG 1995-2023 (the wife\'s report). Conditioning cells have at least 30 unweighted '
               'marriages; a partner profile is listed only when at least 10 marriages in the cell share it, and shares are '
               'renormalised over the listed profiles (coverage = weighted share they cover). Marriages whose cycle did not '
               'ask a trait (husband\'s prior children in 1995, husband\'s race in 2022-2023) are left out of that table. '
               'gap_bin is husband minus wife age at the wedding (2022-2023 husband ages are 5-year band mid-points); '
               'gap_values gives the weighted median gap in each bin, the value the app scores.'),
        min_conditioning_cell=MIN_COND, min_profile=MIN_PROFILE,
        age_bands=dict(wife=[dict(level=n, min=lo, max=hi) for lo, hi, n in AGE_BANDS],
                       husband=[dict(level=n, min=lo, max=hi) for lo, hi, n in HUSBAND_AGE_BANDS]),
        gap_bins=[dict(level=n, min=lo, max=hi) for lo, hi, n in GAP_BINS], gap_values=reps,
        given_wife=table(['wife_age_band', 'wife_race_ethnicity'],
                         ['gap_bin', 'husband_married_before', 'husband_prior_children', 'same_race_ethnicity', 'cohabited_first']),
        given_husband=table(['husband_age_band', 'husband_race_ethnicity'],
                            ['gap_bin', 'wife_race_ethnicity', 'wife_intact_family', 'cohabited_first']))


# ---------------------------------------------------------------- main
def main():
    t_start = time.time()
    people, audit = people_table()
    if SMOKE:
        people = people.sample(frac=0.12, random_state=1)
    audit.to_csv(HERE / 'cycle_audit.csv', index=False)
    print(audit.to_string(index=False))
    women = normalise_weights(people[people.sex == 'F']).reset_index(drop=True)
    both = normalise_weights(people).reset_index(drop=True)
    lw = {c: sorted(women[c].astype(str).unique()) for c in WOMEN_CAT}
    lb = {c: sorted(both[c].astype(str).unique()) for c in BOTH_CAT}

    # ------------- women: main comparison, including the 2002-only lens
    is2002 = lambda d: (d.cycle == '2002').to_numpy()  # noqa: E731
    women_models = {
        'constant': lambda tr: Model('constant', [], []).fit(tr),
        'duration_only': lambda tr: Model('duration_only', ['marriage_years'], []).fit(tr),
        'lens2002_2002data': lambda tr: Model('additive_spline', LENS2002_NUM, LENS2002_CAT, clip_year=(1972, 2002)).fit(tr[is2002(tr)]),
        'additive_2002features_pooled': lambda tr: Model('additive_spline', LENS2002_NUM, LENS2002_CAT).fit(tr),
        'additive_spline': lambda tr: Model('additive_spline', WOMEN_NUM, WOMEN_CAT).fit(tr),
        'interaction_glm': lambda tr: Model('interaction_glm', WOMEN_NUM, WOMEN_CAT, levels=lw).fit(tr),
        'tree_depth4': lambda tr: Model('tree_depth4', WOMEN_NUM, WOMEN_CAT).fit(tr),
        'gradient_boosting': lambda tr: Model('gradient_boosting', WOMEN_NUM, WOMEN_CAT).fit(tr),
    }
    inter = women_models.pop('interaction_glm')
    wp, wiv, wpred, wgrid = cv_analysis('women', women, women_models)
    _, _, ipred, igrid = cv_analysis('women_interaction', women, {'interaction_glm': inter})
    wpred['interaction_glm'], wgrid['interaction_glm'] = ipred['interaction_glm'], igrid['interaction_glm']
    # Ensemble: geometric mean of the additive GLM and boosting rates (evaluated; components exported).
    wpred['ensemble_glm_boost'] = np.sqrt(wpred['additive_spline'] * wpred['gradient_boosting'])
    wgrid['ensemble_glm_boost'] = np.sqrt(wgrid['additive_spline'] * wgrid['gradient_boosting'])
    comp_w, cal_w = summarise('women_all', wp, wiv, wpred, wgrid)
    comp_w2002, cal_w2002 = summarise('women_2002_cycle_only', wp, wiv, wpred, wgrid, subset=is2002)
    comp_wcm, _ = summarise('women_exact_date_cycles', wp, wiv, wpred, wgrid, boot=False,
                            subset=lambda d: d.cycle.isin(sorted(harmonise.CM_CYCLES)).to_numpy())
    comp_wrec, _ = summarise('women_weddings_2000_on', wp, wiv, wpred, wgrid, boot=False,
                             subset=lambda d: (d.wedding_year >= 2000).to_numpy())
    print(comp_w.round(4).to_string(index=False))
    print(comp_w2002.round(4).to_string(index=False))

    # ------------- both sexes, respondent-level inputs
    both_models = {
        'constant': lambda tr: Model('constant', [], []).fit(tr),
        'duration_only': lambda tr: Model('duration_only', ['marriage_years'], []).fit(tr),
        'additive_spline': lambda tr: Model('additive_spline', BOTH_NUM, BOTH_CAT).fit(tr),
        'gradient_boosting': lambda tr: Model('gradient_boosting', BOTH_NUM, BOTH_CAT).fit(tr),
    }
    bp, biv, bpred, bgrid = cv_analysis('both', both, both_models)
    comp_b, cal_b = summarise('both_sexes', bp, biv, bpred, bgrid)
    comp_bm, _ = summarise('both_sexes_men_only', bp, biv, bpred, bgrid, subset=lambda d: (d.sex == 'M').to_numpy())
    print(comp_b.round(4).to_string(index=False))

    # ------------- sensitivity: divorce/annulment only (separation censored)
    div_models = {k: women_models[k] for k in ['constant', 'duration_only', 'additive_spline', 'gradient_boosting']}
    dp, div_iv, dpred, dgrid = cv_analysis('women_divorce_only', women, div_models, outcome='divorced_only')
    dp['event_eval'] = dp.divorced_only
    comp_div, _ = summarise('women_divorce_only', dp, div_iv, dpred, dgrid, boot=False)

    # ------------- sensitivity: a survey-cycle term in the additive GLM
    cyc_models = {'constant': women_models['constant'], 'duration_only': women_models['duration_only'],
                  'additive_spline': women_models['additive_spline'],
                  'additive_spline_plus_cycle': lambda tr: Model('additive_spline', WOMEN_NUM, WOMEN_CAT + ['cycle']).fit(tr)}
    cp, civ, cpred, cgrid = cv_analysis('women_cycle_term', women, cyc_models)
    comp_cyc, _ = summarise('women_cycle_term', cp, civ, cpred, cgrid, boot=False)

    # ------------- out-of-time: train on weddings before 2000, test on 2000 and later
    tr_p = women[women.wedding_year < 2000].reset_index(drop=True)
    te_p = women[women.wedding_year >= 2000].reset_index(drop=True)
    tr_iv, te_iv = intervals(tr_p), intervals(te_p)
    oot = {}
    oot_factories = {
        'constant': lambda tr: Model('constant', [], []).fit(tr),
        'duration_only': lambda tr: Model('duration_only', ['marriage_years'], []).fit(tr),
        'lens2002_2002data': lambda tr: Model('additive_spline', LENS2002_NUM, LENS2002_CAT, clip_year=(1972, 2002)).fit(tr[is2002(tr)]),
        'additive_spline': lambda tr: Model('additive_spline', WOMEN_NUM, WOMEN_CAT).fit(tr),
        'gradient_boosting': lambda tr: Model('gradient_boosting', WOMEN_NUM, WOMEN_CAT).fit(tr),
    }
    oot_grid = {}
    for k, fac in oot_factories.items():
        mdl = fac(tr_iv)
        oot[k] = mdl.predict(te_iv)
        oot_grid[k] = grid_predict(mdl, te_p)
    oot['ensemble_glm_boost'] = np.sqrt(oot['additive_spline'] * oot['gradient_boosting'])
    oot_grid['ensemble_glm_boost'] = np.sqrt(oot_grid['additive_spline'] * oot_grid['gradient_boosting'])
    comp_oot, _ = summarise('women_out_of_time', te_p.assign(fold=0), te_iv, oot, oot_grid)

    comp = pd.concat([comp_w, comp_w2002, comp_wcm, comp_wrec, comp_b, comp_bm, comp_div, comp_cyc, comp_oot],
                     ignore_index=True)
    for c in [c for c in comp.columns if c.endswith('_ci95')]:
        comp[c] = comp[c].apply(lambda v: json.dumps([round(x, 4) for x in v]) if isinstance(v, list) else '')
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.6g')
    pd.concat([cal_w, cal_w2002, cal_b], ignore_index=True).to_csv(HERE / 'heldout_calibration_deciles.csv',
                                                                   index=False, float_format='%.6g')

    # ------------- descriptive survival
    surv = survival_table(both)
    surv.to_csv(HERE / 'weighted_survival.csv', index=False, float_format='%.4f')
    print(surv.round(3).to_string(index=False))

    # ------------- final fits on everyone
    wall = intervals(women)
    ball = intervals(both)
    finals = {k: Model(k, ['marriage_years'] if k == 'duration_only' else WOMEN_NUM,
                       [] if k == 'duration_only' else WOMEN_CAT).fit(wall)
              for k in ['duration_only', 'additive_spline', 'tree_depth4', 'gradient_boosting']}
    finals_b = {k: Model(k, ['marriage_years'] if k == 'duration_only' else BOTH_NUM,
                         [] if k == 'duration_only' else BOTH_CAT).fit(ball)
                for k in ['duration_only', 'additive_spline', 'gradient_boosting']}
    glm = finals['additive_spline'].m
    pd.DataFrame(dict(feature=glm.named_steps['prep'].get_feature_names_out(), coef=glm.named_steps['fit'].coef_)).to_csv(
        HERE / 'coefficients_additive_spline.csv', index=False, float_format='%.6g')
    (HERE / 'tree_depth4.txt').write_text(export_text(
        finals['tree_depth4'].m.named_steps['fit'],
        feature_names=finals['tree_depth4'].m.named_steps['prep'].get_feature_names_out().tolist(), decimals=4))

    # ------------- rate ratios of the additive GLM with design-based (cluster) bootstrap CIs
    ref = {c: float(women[c].median()) for c in WOMEN_NUM if c != 'marriage_years'}
    ref['marriage_years'] = 0.0
    ref['wedding_year'] = 2000.0
    refcat = dict(cohabited_first='No', husband_married_before='No', husband_prior_children='No',
                  wife_race_ethnicity='White', same_race_ethnicity='Same', wife_intact_family='Yes',
                  wife_premarital_birth='No', wife_premarital_partners='1', wife_ba_by_wedding='No',
                  wife_mother_education='HS', wife_mother_age_first_birth='20-24', wife_religion_raised='Protestant',
                  wife_born_outside_us='No')
    ref.update(refcat)
    grid = dict(marriage_years=[0, 1, 2, 3, 5, 7, 10, 15, 20, 25],
                wife_age_at_marriage=[17, 19, 21, 23, 25, 28, 32, 38],
                husband_age_at_marriage=[19, 21, 23, 25, 28, 32, 38, 45],
                wedding_year=[1970, 1980, 1990, 2000, 2010, 2020],
                wife_premarital_sex_years=[0, 1, 3, 5, 8, 12])
    eff_rows = [(c, v) for c, vals in grid.items() for v in vals] + \
               [(c, v) for c in WOMEN_CAT for v in lw[c] if v not in ('Unknown', 'Not asked')]

    def effects(mdl):
        base = pd.DataFrame([ref])
        r0 = mdl.predict(base)[0]
        rows = pd.DataFrame([{**ref, c: (float(v) if c in grid else v)} for c, v in eff_rows])
        return mdl.predict(rows) / r0, r0
    rr, r0 = effects(finals['additive_spline'])
    clusters = women.cluster.to_numpy()
    strata = women.stratum.to_numpy()
    rng = np.random.default_rng(SEED + 3)
    uniq_strata = np.unique(strata)
    cl_by_stratum = {s: np.unique(clusters[strata == s]) for s in uniq_strata}
    person_by_cluster = pd.Series(np.arange(len(women))).groupby(clusters).apply(np.array).to_dict()
    import os, pickle
    rr_cache = Path(os.environ['NSFG_CACHE']) / f'rr_boot_{B_RR}_{len(women)}.pkl' if os.environ.get('NSFG_CACHE') else None
    boot_rr = pickle.loads(rr_cache.read_bytes()) if rr_cache and rr_cache.exists() else []
    for b in range(len(boot_rr), B_RR):
        take = []
        for s in uniq_strata:
            cl = cl_by_stratum[s]
            for c in rng.choice(cl, size=len(cl), replace=True):
                take.append(person_by_cluster[c])
        idx = np.concatenate(take)
        sample = women.iloc[idx].reset_index(drop=True)
        mb = Model('additive_spline', WOMEN_NUM, WOMEN_CAT).fit(intervals(sample))
        boot_rr.append(effects(mb)[0])
        if rr_cache:
            rr_cache.write_bytes(pickle.dumps(boot_rr))
        if b % 10 == 0:
            print('  rr bootstrap', b, flush=True)
    boot_rr = np.array(boot_rr)
    eff = pd.DataFrame(dict(input=[c for c, _ in eff_rows], value=[v for _, v in eff_rows], rate_ratio=rr,
                            ci95_low=np.quantile(boot_rr, 0.025, axis=0), ci95_high=np.quantile(boot_rr, 0.975, axis=0)))
    eff.to_csv(HERE / 'additive_partial_effects.csv', index=False, float_format='%.4f')
    print(f'reference profile rate {r0:.4f}')
    print(eff.round(3).to_string(index=False))

    # ------------- population reference from held-out predictions, as the app scores a lens
    # The bundle's scoring models (couple.js averages every non-baseline model's survival) are
    # additive_spline and gradient_boosting; the depth-4 tree is exported under extra_models.
    SCORING = ['additive_spline', 'gradient_boosting']
    shipped = 'mean survival of ' + ' and '.join(SCORING)
    wd = women
    assert (wd.id.to_numpy() == wp.id.to_numpy()).all()
    risk_w = heldout_cumulative(wgrid, SCORING)
    pop_women = population_reference(
        wd, risk_w, WOMEN_SUBGROUPS,
        about=(f'Survey-weighted quantiles of held-out predicted first-marriage dissolution (divorce, annulment or separation) '
               f'within each horizon of the wedding, for the {len(women):,} women\'s first marriages in NSFG 1995-2023, each '
               'scored by models fitted on the other four person folds with her own inputs and real wedding year; the lens '
               'number is 1 minus the mean survival of additive_spline and gradient_boosting, as the app computes it. Each pK '
               'is a list aligned to horizons. Subgroup cells have at least 100 unweighted marriages; Unknown and Not asked '
               'levels are omitted. Built by reproducibility/nsfg_pooled_first_marriage/train_pooled.py.'))
    bd = both.reset_index(drop=True)
    assert (bd.id.to_numpy() == bp.id.to_numpy()).all()
    risk_b = heldout_cumulative(bgrid, SCORING)
    pop_both = population_reference(
        bd, risk_b, BOTH_SUBGROUPS,
        about=(f'As population_reference, for the both-sexes models (models_both_sexes) over {len(both):,} first marriages '
               'reported by women (1995-2023) and men (2002-2023); subgroup respondent_sex splits by who reported.'))
    partners = partner_distribution(women)

    # ------------- out-of-distribution score on the women's fixed inputs
    ood_num = [c for c in WOMEN_NUM if c != 'marriage_years']
    ood_spec, _, ood_fit = ood.build(wp, wp.fold.to_numpy(), ood_num, WOMEN_CAT, lw)

    # ------------- support and audit
    support = {c: [float(women[c].quantile(0.005)), float(women[c].quantile(0.995))]
               for c in ['wife_age_at_marriage', 'husband_age_at_marriage', 'wedding_year', 'wife_premarital_sex_years']}
    at_risk = wall.groupby('marriage_years').size()
    support = {'marriage_years': [0.0, float(at_risk[at_risk >= 50].index.max())], **support}
    support_b = {c: [float(both[c].quantile(0.005)), float(both[c].quantile(0.995))]
                 for c in ['respondent_age_at_marriage', 'wedding_year', 'respondent_premarital_sex_years']}
    at_risk_b = ball.groupby('marriage_years').size()
    support_b = {'marriage_years': [0.0, float(at_risk_b[at_risk_b >= 50].index.max())], **support_b}
    sample = dict(
        cycles=harmonise.CYCLE_ORDER, files=audit.to_dict(orient='records'),
        women=dict(marriages=len(women), dissolutions=int(women.event.sum()), divorce_or_annulment=int(women.divorced_only.sum()),
                   widowed_censored=int(women.widowed.sum()), intervals=len(wall), person_years=round(float(wall.exposure.sum()), 1),
                   dates_imputed=int(women.dates_imputed.sum()), husband_age_from_2022_bands=int(women.spouse_age_from_band.sum()),
                   husband_age_missing=int(women.husband_age_at_marriage.isna().sum())),
        men=dict(marriages=int((both.sex == 'M').sum()), dissolutions=int(both.event[both.sex == 'M'].sum()),
                 divorce_or_annulment=int(both.divorced_only[both.sex == 'M'].sum())),
        both=dict(marriages=len(both), dissolutions=int(both.event.sum()), intervals=len(ball),
                  person_years=round(float(ball.exposure.sum()), 1)),
        unknown_counts={c: int((women[c] == 'Unknown').sum()) for c in WOMEN_CAT},
        not_asked_counts={c: int((women[c] == 'Not asked').sum()) for c in WOMEN_CAT},
        wedding_years=[int(both.wedding_year.min()), int(both.wedding_year.max())],
        folds='5 folds by person, seeded permutation', python_sklearn=sklearn.__version__, shipped_model=shipped)
    (HERE / 'sample_audit.json').write_text(json.dumps(sample, indent=1, default=str) + '\n')

    # ------------- bundle
    def heldout(row, extra=True):
        h = dict(deviance_improvement_percent=round(float(row['deviance_improvement_percent']), 3),
                 ci95=[round(float(row['dev_ci95_low']), 3), round(float(row['dev_ci95_high']), 3)],
                 improvement_over_duration_only_percent=round(float(row['improvement_over_duration_only_percent']), 3),
                 observed_expected_ratio=round(float(row['observed_expected_ratio']), 4))
        for m in ['gain_minus_lens2002', 'c_minus_lens2002']:
            if not pd.isna(row.get(m, np.nan)):
                h[m] = round(float(row[m]), 4)
                if isinstance(row.get(m + '_ci95'), list):
                    h[m + '_ci95'] = [round(v, 4) for v in row[m + '_ci95']]
        if extra and not pd.isna(row.get('harrell_c', np.nan)):
            for m in ['harrell_c', 'auc5', 'auc10', 'decile_lift']:
                h[m] = round(float(row[m]), 4)
                ci = row.get(m + '_ci95')
                if isinstance(ci, list):
                    h[m + '_ci95'] = [round(v, 4) for v in ci]
        return h
    cw = comp_w.set_index('model')
    cb = comp_b.set_index('model')
    co = comp_oot.set_index('model')
    c2 = comp_w2002.set_index('model')
    labels = dict(duration_only='Marriage length only (baseline curve)', additive_spline='Additive spline Poisson',
                  tree_depth4='Poisson tree, depth 4', gradient_boosting='Poisson gradient boosting (250 trees, depth 3)')
    women_inputs = dict(
        marriage_years='completed years since the wedding at the start of the year being scored (0 = first year)',
        wife_age_at_marriage="wife's age in years on the wedding day",
        husband_age_at_marriage="husband's age in years on the wedding day (wife's report)",
        wedding_year='calendar year of the wedding; outside the support is extrapolation, so hold it at the support edge and say so',
        wife_premarital_sex_years="years between the wife's first sexual intercourse and the wedding (0 if none before the wedding)",
        cohabited_first='Yes/No: lived together before marrying', husband_married_before='Yes/No',
        husband_prior_children='Yes/No: husband had children from a prior relationship',
        wife_race_ethnicity='Hispanic, White, Black, Other (non-Hispanic unless Hispanic)',
        same_race_ethnicity="Same/Different: husband's broad race-ethnicity group versus the wife's",
        wife_intact_family='Yes/No: wife lived with both (biological or adoptive) parents from birth to 18',
        wife_premarital_birth='Yes/No: the wife had a birth before the wedding',
        wife_premarital_partners="wife's number of male sex partners before the first marriage: 0, 1, 2, 3-4, 5-9, 10+",
        wife_ba_by_wedding="Yes/No: the wife had a bachelor's degree by the wedding (from degree dates)",
        wife_mother_education="wife's mother's education: <HS, HS, Some college, BA+, No mother figure",
        wife_mother_age_first_birth="wife's mother's age at her first birth: <18, 18-19, 20-24, 25+, No mother figure",
        wife_religion_raised='religion the wife was raised in: None, Catholic, Protestant, Other',
        wife_born_outside_us='Yes/No')
    both_inputs = dict(
        marriage_years=women_inputs['marriage_years'],
        respondent_age_at_marriage="the reporting spouse's age on the wedding day",
        wedding_year=women_inputs['wedding_year'],
        respondent_premarital_sex_years='years between the reporting spouse\'s first intercourse and the wedding (0 if none before)',
        respondent_sex='Female/Male: which spouse reported (the data are not couples)',
        cohabited_first=women_inputs['cohabited_first'],
        respondent_premarital_birth='Yes/No: the reporting spouse had (or fathered) a birth before the wedding',
        respondent_race_ethnicity=women_inputs['wife_race_ethnicity'],
        respondent_intact_family='Yes/No: lived with both parents from birth to 18',
        respondent_ba_by_wedding="Yes/No: bachelor's degree by the wedding",
        respondent_mother_education=women_inputs['wife_mother_education'],
        respondent_mother_age_first_birth=women_inputs['wife_mother_age_first_birth'],
        respondent_religion_raised=women_inputs['wife_religion_raised'],
        respondent_born_outside_us='Yes/No')
    lens = json.loads((OUT / 'nsfg2002_first_marriage.json').read_text())

    def model_entry(k):
        return dict(key=k, label=labels[k], heldout=heldout(cw.loc[k]),
                    heldout_2002_cycle=heldout(c2.loc[k]) if k in c2.index else None,
                    out_of_time=heldout(co.loc[k]) if k in co.index else None,
                    calibration=cal_w[cal_w.model == k].drop(columns=['analysis', 'model']).round(6).to_dict(orient='records'),
                    **export(finals[k].m))
    bundle = dict(
        id='nsfg_pooled_first_marriage', version=1,
        source=('National Survey of Family Growth (NCHS) public-use respondent files, pooled: 1995 (Cycle 5), 2002, '
                '2006-2010, 2011-2013, 2013-2015, 2015-2017, 2017-2019 and 2022-2023 female files; male files 2002 onward. '
                'Respondents aged 15-44 (15-49 from 2015); first marriages begun 1964-2023'),
        target=lens['target'],
        population=("U.S. household population; the women's models use women's FIRST marriages (husbands of any marital history), "
                    "the wife's own report; models_both_sexes add men's first marriages with respondent-level inputs only"),
        weights=('NSFG final weights rescaled within each file to average 1 over all its respondents (so each cycle counts '
                 'in proportion to its sample size), then normalised to mean 1 over the marriages, times exposure'),
        training=dict(intervals=len(wall), respondents=len(women), events=int(women.event.sum()),
                      person_years=round(float(wall.exposure.sum()), 1), cycles=harmonise.CYCLE_ORDER),
        constant_rate=float((wall.weight * wall.y).sum() / (wall.weight * wall.exposure).sum()),
        support=support, inputs=women_inputs,
        abstain=['same-sex couples', 'wife previously married (only first marriages of women are in the data)',
                 'any partner outside the age-at-marriage support', 'wedding year after the support (hold at the edge, label it)'],
        models=[model_entry(k) for k in ['duration_only', 'additive_spline', 'gradient_boosting']],
        extra_models=[dict(model_entry('tree_depth4'),
                           note='evaluated and exported for inspection; weaker than the others held out, so not a scoring model')],
        scoring_models=SCORING, shipped_model=shipped,
        ensemble=dict(key='ensemble_glm_boost', members=['additive_spline', 'gradient_boosting'],
                      rule='rate = sqrt(rate_additive_spline * rate_gradient_boosting)', heldout=heldout(cw.loc['ensemble_glm_boost']),
                      out_of_time=heldout(co.loc['ensemble_glm_boost'])),
        comparison_vs_2002_lens=dict(
            note=('Same person folds. lens2002_2002data refits the published 2002 lens (same inputs, same spline GLM) on the '
                  '2002-cycle training women only, with wedding_year held inside 1972-2002 as the app does; '
                  'additive_2002features_pooled uses the same inputs on all cycles; additive_spline adds the new inputs.'),
            all_heldout_women={k: heldout(cw.loc[k]) for k in cw.index if k != 'constant'},
            heldout_2002_cycle_women={k: heldout(c2.loc[k]) for k in c2.index if k != 'constant'},
            out_of_time_weddings_2000_on={k: heldout(co.loc[k]) for k in co.index if k != 'constant'}),
        inputs_both_sexes=both_inputs, support_both_sexes=support_b,
        models_both_sexes=[dict(key=k, label=labels[k], heldout=heldout(cb.loc[k]),
                                **export(finals_b[k].m)) for k in ['duration_only', 'additive_spline', 'gradient_boosting']],
        population_reference=pop_women, population_reference_both_sexes=pop_both,
        partner_distribution=partners,
        ood=ood_spec,
        weighted_survival=json.loads(surv.to_json(orient='records')),
        sklearn=sklearn.__version__)
    OUT.mkdir(exist_ok=True)
    (OUT / 'nsfg_pooled_first_marriage.json').write_text(json.dumps(clean(bundle), separators=(',', ':'), allow_nan=False))

    # ------------- test vectors
    vr = np.random.default_rng(SEED)
    rows = []
    for i in range(60):
        r = {c: str(vr.choice(lw[c])) for c in WOMEN_CAT}
        r.update({c: str(vr.choice(lb[c])) for c in BOTH_CAT if c not in r})
        r['marriage_years'] = float(vr.uniform(0, 35))
        r['wife_age_at_marriage'] = float(vr.uniform(14, 48))
        r['husband_age_at_marriage'] = None if i % 9 == 0 else float(vr.uniform(15, 65))
        r['wedding_year'] = float(vr.integers(1960, 2030))
        r['wife_premarital_sex_years'] = None if i % 11 == 0 else float(vr.uniform(0, 20))
        r['respondent_age_at_marriage'] = float(vr.uniform(14, 48))
        r['respondent_premarital_sex_years'] = None if i % 7 == 0 else float(vr.uniform(0, 20))
        rows.append(r)
    df = pd.DataFrame(rows)
    for c in ['husband_age_at_marriage', 'wife_premarital_sex_years', 'respondent_premarital_sex_years']:
        df[c] = df[c].astype(float)
    vectors = dict(rows=json.loads(df.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: finals[k].predict(df).tolist() for k in finals},
                   predictions_both_sexes={k: finals_b[k].predict(df).tolist() for k in finals_b},
                   ood_d2=ood.score(ood_fit, df, ood_num, WOMEN_CAT, lw).tolist())
    (OUT / 'nsfg_pooled_first_marriage_testvectors.json').write_text(json.dumps(clean(vectors), allow_nan=False))
    print('shipped', shipped, f'total {time.time() - t_start:.0f}s')


if __name__ == '__main__':
    main()
