"""HCMST couples lens: who breaks up within ~8 years, from one partner's wave-1 report.

Discrete-time logistic hazard on person-period rows of the HCMST 2009 cohort (five follow-up
periods, 2009-2017), held out by couple with 5x-repeated grouped 5-fold cross-validation,
couple-bootstrap 95% intervals, an external check on the independent HCMST 2017 cohort
(break-ups by 2020 and 2022), and an export to ../../app/models/hcmst_couples.json with test
vectors for the browser engine.

Run from this folder after `sh download.sh`:  python3 train_models.py   (~5-10 minutes)
Needs numpy, pandas, scikit-learn 1.7.2 and pyreadstat (requirements.txt).
"""
from pathlib import Path
import json, os, sys, time, warnings
import numpy as np, pandas as pd, sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, SplineTransformer, StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent.parent / 'app' / 'tools'))
import hcmst_data as H  # noqa: E402
from bundle_export import export  # noqa: E402
import ood  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
REPEATS, FOLDS, BOOT = int(os.environ.get('HCMST_REPEATS', 5)), 5, int(os.environ.get('HCMST_BOOT', 1000))
C_GRID = [0.03, 0.1, 0.3, 1.0]
OUT = HERE.parent.parent / 'app' / 'models'
NP = 5  # follow-up periods

MODELS = [
    ('period_only', 'Follow-up period only (baseline curve)', [], ['period']),
    ('quality_only', 'Relationship quality only (plus period)', [], ['period', 'relationship_quality']),
    ('additive_core', 'Additive logistic hazard, core inputs', H.NUMERIC, ['period'] + H.CORE_CATEGORICAL),
    ('additive_full', 'Additive logistic hazard, all inputs', H.NUMERIC, ['period'] + H.FULL_CATEGORICAL),
    ('tree_depth3', 'Hazard tree, depth 3', H.NUMERIC, ['period'] + H.FULL_CATEGORICAL),
    ('boosting', 'Gradient boosting (comparison only, not exported)', H.NUMERIC, ['period'] + H.FULL_CATEGORICAL),
]
EXPORTED = ['period_only', 'quality_only', 'additive_core', 'additive_full', 'tree_depth3']
TUNED = ('additive_core', 'additive_full')


def pipeline(key, C=0.3, tol=1e-10):
    _, _, num_cols, cat_cols = next(m for m in MODELS if m[0] == key)
    cat = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    parts = [('cat', cat, cat_cols)]
    if key in TUNED:
        num = Pipeline([('impute', SimpleImputer(strategy='median')),
                        ('spline', SplineTransformer(n_knots=4, degree=2, knots='quantile', include_bias=False, extrapolation='linear')),
                        ('scale', StandardScaler())])
        parts = [('num', num, num_cols)] + parts
        est = LogisticRegression(C=C, max_iter=5000, tol=tol)
    elif key in ('tree_depth3', 'boosting'):
        parts = [('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), num_cols)] + parts
        est = (DecisionTreeRegressor(max_depth=3, min_samples_leaf=300, random_state=SEED) if key == 'tree_depth3' else
               HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=150, min_samples_leaf=80,
                                              l2_regularization=1.0, random_state=SEED))
    else:
        est = LogisticRegression(C=1e4, max_iter=5000, tol=1e-10)
    return Pipeline([('prep', ColumnTransformer(parts)), ('fit', est)])


def proba(pipe, X):
    return pipe.predict(X) if isinstance(pipe.named_steps['fit'], DecisionTreeRegressor) else pipe.predict_proba(X)[:, 1]


def logloss(y, p, w):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return -np.dot(w, y * np.log(p) + (1 - y) * np.log1p(-p)) / w.sum()


def choose_C(rows, groups, key, seed):
    best, best_ll = None, np.inf
    for C in C_GRID:
        ll = 0.0
        for tr, te in GroupKFold(5, shuffle=True, random_state=seed).split(rows, groups=groups):
            p = proba(pipeline(key, C, tol=1e-6).fit(rows.iloc[tr], rows.event.iloc[tr]), rows.iloc[te])
            ll += logloss(rows.event.to_numpy()[te], p, np.ones(len(te))) * len(te)
        if ll < best_ll:
            best, best_ll = C, ll
    return best


OFFSET = {str(p + 1): (H.CUT[p] - H.CUT[0]) / 12 for p in range(NP)}  # years from wave 1 to period start
TIME_VARYING = ['relationship_years', 'mean_age']


def advance(d):
    """Relationship duration and age at the START of each row's period (inputs are wave-1 values)."""
    d = d.copy()
    off = d.period.map(OFFSET).to_numpy()
    for c in TIME_VARYING:
        d[c] = d[c] + off
    return d


def expand(couples):
    """Every couple x every period, for cumulative predictions."""
    e = couples.loc[couples.index.repeat(NP)].copy()
    e['period'] = np.tile([str(p) for p in range(1, NP + 1)], len(couples))
    return advance(e)


def hazards(pipe, couples):
    return proba(pipe, expand(couples)).reshape(len(couples), NP)


# ---------------------------------------------------------------- weighted ranking metrics
class Ranker:
    """Weighted AUC-type statistic sum P_g (N_below + N_g/2) for one fixed score vector; the
    bootstrap only changes weights, so the sort is done once."""

    def __init__(self, score, pos):
        order = np.argsort(score, kind='stable')
        s = score[order]
        self.order, self.pos = order, pos[order].astype(bool)
        self.grp = np.concatenate([[0], np.cumsum(s[1:] != s[:-1])])
        self.ng = self.grp[-1] + 1 if len(s) else 0

    def parts(self, w):
        w = w[self.order]
        P = np.bincount(self.grp, weights=w * self.pos, minlength=self.ng)
        N = np.bincount(self.grp, weights=w * ~self.pos, minlength=self.ng)
        below = np.cumsum(N) - N
        return float(np.dot(P, below + 0.5 * N)), float(P.sum() * N.sum())


class Evaluator:
    """Held-out metrics from a couple x period hazard matrix Hm (one per repeat)."""

    def __init__(self, couples, rows):
        self.ci = rows.ci.to_numpy()
        self.pi = rows.period.astype(int).to_numpy() - 1
        self.y = rows.event.to_numpy().astype(float)
        lp = couples.last_period.to_numpy()
        ev = (couples.outcome == 'breakup').to_numpy()
        self.ev, self.lp = ev, lp
        # C-index risk sets: for an event in period t, comparable couples survived period t.
        self.c_sets = [(np.where(ev & (lp == t))[0], np.where((lp > t) | ((lp == t) & ~ev))[0]) for t in range(1, NP + 1)]
        # Two-period (to April 2011, ~2.2 years) status where known.
        self.k2 = np.where((ev & (lp <= 2)) | (lp >= 2))[0]
        self.y2 = (ev & (lp <= 2))[self.k2].astype(float)

    def prepare(self, Hm):
        p = Hm[self.ci, self.pi]
        cum = 1 - np.prod(1 - Hm, axis=1)
        c2 = 1 - (1 - Hm[:, 0]) * (1 - Hm[:, 1])
        cs = []
        for e_idx, c_idx in self.c_sets:
            idx = np.concatenate([e_idx, c_idx])
            cs.append((idx, Ranker(cum[idx], np.r_[np.ones(len(e_idx)), np.zeros(len(c_idx))])))
        pc = np.clip(p, 1e-12, 1 - 1e-12)
        ll = -(self.y * np.log(pc) + (1 - self.y) * np.log1p(-pc))
        return dict(p=p, ll=ll, sq=(self.y - p) ** 2, row_rank=Ranker(p, self.y), cs=cs, c2=c2[self.k2],
                    auc2_rank=Ranker(c2[self.k2], self.y2))

    def metrics(self, prep, wc, const):
        w = wc[self.ci]
        p = prep['p']
        out = dict(logloss=float(np.dot(w, prep['ll']) / w.sum()), brier=float(np.dot(w, prep['sq']) / w.sum()),
                   oe=float(np.dot(w, self.y) / np.dot(w, p)))
        num, den = prep['row_rank'].parts(w)
        out['auc_period'] = num / den if den else np.nan
        num = den = 0.0
        for idx, rk in prep['cs']:
            a, b = rk.parts(wc[idx])
            num, den = num + a, den + b
        out['c_index'] = num / den if den else np.nan
        num, den = prep['auc2_rank'].parts(wc[self.k2])
        out['auc_2y'] = num / den if den else np.nan
        return out


def lift_table(ev, c2_by_repeat, key):
    """Couple-level deciles of predicted two-period break-up risk (mean over repeats)."""
    c2 = np.mean(c2_by_repeat, axis=0)
    y2 = ev.y2
    order = np.argsort(c2, kind='stable')
    dec = np.empty(len(c2), int)
    dec[order] = np.minimum((np.arange(len(c2)) * 10) // len(c2), 9)
    rows = []
    for d in range(10):
        s = dec == d
        rows.append(dict(model=key, decile=d + 1, couples=int(s.sum()), breakups_2y=int(y2[s].sum()),
                         observed_2y=float(y2[s].mean()), predicted_2y=float(c2[s].mean()),
                         lift=float(y2[s].mean() / y2.mean())))
    return rows


def km(rows, couples, w, by=None):
    """Weighted discrete-time survival over the five periods. Returns cumulative break-up by period end."""
    d = rows.assign(w=w[rows.ci.to_numpy()])
    allp = [str(p) for p in range(1, NP + 1)]
    at = d.groupby('period').w.sum().reindex(allp, fill_value=0.0)
    evw = d[d.event == 1].groupby('period').w.sum().reindex(allp, fill_value=0.0)
    with np.errstate(invalid='ignore', divide='ignore'):
        h = np.where(at.to_numpy() > 0, evw.to_numpy() / at.to_numpy(), np.nan)
    cum = 1 - np.cumprod(1 - h)
    for j in range(1, NP):  # once everyone has broken up, cumulative break-up stays at 1
        if np.isnan(cum[j]) and cum[j - 1] >= 1 - 1e-12:
            cum[j] = 1.0
    return cum


def main():
    t0 = time.time()
    couples, periods, audit = H.couples_2009()
    rows = advance(periods.merge(couples.drop(columns=['outcome']), on='id', how='left'))
    couples = couples.reset_index(drop=True)
    couples['ci'] = np.arange(len(couples))
    rows['ci'] = rows.id.map(dict(zip(couples.id, couples.ci)))
    followed = couples[couples.last_period > 0]
    assert rows.event.sum() == (couples.outcome == 'breakup').sum() == 527
    print(f'{len(couples)} couples, {len(followed)} with follow-up, {len(rows)} person-periods, {rows.event.sum()} break-ups')

    ev = Evaluator(couples, rows)
    keys = [m[0] for m in MODELS]
    Hcv = {k: [] for k in keys}
    const_by_rep = []
    # L2 strength chosen once by grouped CV on all couples (not nested; the grid is small, so the
    # optimism this adds to held-out scores is slight).
    final_C = {k: choose_C(rows, rows.id, k, SEED) for k in TUNED}
    print('C', final_C, f'({time.time() - t0:.0f}s)', flush=True)
    for r in range(REPEATS):
        Hr = {k: np.zeros((len(couples), NP)) for k in keys}
        const = np.zeros(len(couples))
        gkf = GroupKFold(FOLDS, shuffle=True, random_state=SEED + r)
        for f, (tr, te) in enumerate(gkf.split(couples, groups=couples.id)):
            tr_ids = set(couples.id.iloc[tr])
            rtr = rows[rows.id.isin(tr_ids)]
            const[te] = rtr.event.mean()
            for k in keys:
                pipe = pipeline(k, final_C.get(k, 0.3)).fit(rtr, rtr.event)
                Hr[k][te] = hazards(pipe, couples.iloc[te])
            print(f'repeat {r + 1} fold {f + 1} done ({time.time() - t0:.0f}s)', flush=True)
        for k in keys:
            Hcv[k].append(Hr[k])
        const_by_rep.append(const)

    # Point estimates (mean over repeats) and couple-bootstrap intervals.
    preps = {k: [ev.prepare(Hm) for Hm in Hcv[k]] for k in keys}
    const_ll = []
    for c in const_by_rep:
        pc = c[ev.ci]
        const_ll.append(-(ev.y * np.log(pc) + (1 - ev.y) * np.log1p(-pc)))

    def all_metrics(wc):
        res = {}
        for k in keys:
            ms = []
            for r in range(REPEATS):
                m = ev.metrics(preps[k][r], wc, 0.0)
                w = wc[ev.ci]
                m['logloss_const'] = float(np.dot(w, const_ll[r]) / w.sum())
                ms.append(m)
            res[k] = {m: float(np.mean([x[m] for x in ms])) for m in ms[0]}
        for k in keys:
            res[k]['gain_vs_constant_pct'] = 100 * (1 - res[k]['logloss'] / res[k]['logloss_const'])
            res[k]['gain_vs_period_only_pct'] = 100 * (1 - res[k]['logloss'] / res['period_only']['logloss'])
            res[k]['brier_skill_vs_period_only_pct'] = 100 * (1 - res[k]['brier'] / res['period_only']['brier'])
        return res

    groups = {'All couples': np.ones(len(couples), bool),
              'Married at wave 1': (couples.married == 'Yes').to_numpy(),
              'Unmarried at wave 1': (couples.married == 'No').to_numpy(),
              'Different-sex couples': (couples.couple_type == 'Man-woman').to_numpy(),
              'Same-sex couples': couples.couple_type.isin(['Two men', 'Two women']).to_numpy()}
    point = {g: all_metrics(m.astype(float)) for g, m in groups.items()}
    point_svy = all_metrics(couples.weight.to_numpy())  # survey-weighted sensitivity (weight2)
    rng = np.random.default_rng(SEED)
    boots = {g: [] for g in groups}
    n = len(couples)
    for b in range(BOOT):
        mult = np.bincount(rng.integers(0, n, n), minlength=n).astype(float)
        for g, m in groups.items():
            boots[g].append(all_metrics(mult * m))
        if b % 100 == 0:
            print(f'bootstrap {b} ({time.time() - t0:.0f}s)', flush=True)
    MET = ['gain_vs_constant_pct', 'gain_vs_period_only_pct', 'brier_skill_vs_period_only_pct', 'auc_period', 'c_index', 'auc_2y', 'brier', 'logloss', 'oe']
    comp = []
    for g in groups:
        for k in keys:
            row = dict(group=g, model=k, couples=int(groups[g][couples.last_period > 0].sum()),
                       breakups=int((groups[g] & (couples.outcome == 'breakup')).sum()))
            for met in MET:
                vals = np.array([bb[k][met] for bb in boots[g]])
                row[met] = point[g][k][met]
                row[met + '_lo'], row[met + '_hi'] = np.nanpercentile(vals, [2.5, 97.5])
            if g == 'All couples':
                row['svy_gain_vs_constant_pct'] = point_svy[k]['gain_vs_constant_pct']
                row['svy_auc_period'] = point_svy[k]['auc_period']
                row['svy_c_index'] = point_svy[k]['c_index']
            comp.append(row)
    comp = pd.DataFrame(comp)
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.5g')

    # Calibration of per-period hazards (pooled over repeats) and couple-level decile lift.
    cal, lift, cumcal = [], [], []
    for k in keys:
        p = np.concatenate([pr['p'] for pr in preps[k]])
        y = np.tile(ev.y, REPEATS)
        order = np.argsort(p, kind='stable')
        dec = np.empty(len(p), int)
        dec[order] = np.minimum((np.arange(len(p)) * 10) // len(p), 9)
        z = np.log(np.clip(p, 1e-9, 1 - 1e-9) / (1 - np.clip(p, 1e-9, 1 - 1e-9)))
        slope = LogisticRegression(C=1e6, max_iter=1000).fit(z[:, None], y).coef_[0, 0] if p.std() > 0 else np.nan
        for d in range(10):
            s = dec == d
            cal.append(dict(model=k, decile=d + 1, person_periods=int(s.sum() / REPEATS), events=float(y[s].sum() / REPEATS),
                            observed=float(y[s].mean()), predicted=float(p[s].mean()), calibration_slope=float(slope)))
        lift += lift_table(ev, [pr['c2'] for pr in preps[k]], k)
        if k in EXPORTED:
            Hm = np.mean(Hcv[k], axis=0)
            for j, lab in [(2, '2.2y'), (3, '4.1y'), (5, '8.4y')]:
                cum = 1 - np.prod(1 - Hm[:, :j], axis=1)
                order = np.argsort(cum, kind='stable')
                dec = np.empty(n, int)
                dec[order] = np.minimum((np.arange(n) * 10) // n, 9)
                for d_ in range(10):
                    idx = np.where(dec == d_)[0]
                    obs = km(rows[rows.ci.isin(idx)], couples, np.ones(n))[j - 1]
                    cumcal.append(dict(model=k, horizon=lab, decile=d_ + 1, couples=len(idx), predicted=float(cum[idx].mean()), observed_km=float(obs)))
    pd.DataFrame(cal).to_csv(HERE / 'heldout_calibration.csv', index=False, float_format='%.5g')
    pd.DataFrame(lift).to_csv(HERE / 'heldout_decile_lift_2y.csv', index=False, float_format='%.5g')
    pd.DataFrame(cumcal).to_csv(HERE / 'heldout_cumulative_calibration.csv', index=False, float_format='%.5g')

    # Population reference: survey-weighted quantiles of HELD-OUT predicted cumulative break-up
    # (hazards averaged over the repeats) by subgroup. Aggregates only; extreme quantiles are
    # withheld in small cells so no value is effectively one couple's prediction.
    QS = [1, 5, 10, 25, 50, 75, 90, 95, 99]
    svw = couples.weight.to_numpy()
    HOR = {'by_2011_2.2y': 2, 'by_2013_4.1y': 3, 'by_2017_8.4y': 5}

    def wquant(x, w, q):
        o = np.argsort(x)
        x, w = x[o], w[o]
        cw = (np.cumsum(w) - 0.5 * w) / w.sum()
        return np.interp(np.asarray(q) / 100, cw, x)

    agebin = pd.cut(couples.mean_age, [0, 30, 45, 60, 200], right=False, labels=['under 30', '30-44', '45-59', '60+'])
    edubin = pd.cut(couples.edu_years_mean, [0, 12, 14, 16, 99], right=False, labels=['under 12 years', '12-13.5 years', '14-15.5 years', '16+ years'])
    durbin = pd.cut(couples.relationship_years, [0, 2, 5, 10, 20, 200], right=False, labels=['under 2 years', '2-4 years', '5-9 years', '10-19 years', '20+ years'])
    ref_groups = [('all', 'All couples', np.ones(n, bool))]
    ref_groups += [('married', v, (couples.married == k).to_numpy()) for k, v in [('Yes', 'Married'), ('No', 'Unmarried')]]
    ref_groups += [('couple_type', v, m) for v, m in [('Different-sex', (couples.couple_type == 'Man-woman').to_numpy()),
                                                      ('Same-sex', couples.couple_type.isin(['Two men', 'Two women']).to_numpy())]]
    ref_groups += [('relationship_quality', q, (couples.relationship_quality == q).to_numpy()) for q in ['Excellent', 'Good', 'Fair', 'Poor or very poor']]
    ref_groups += [('mean_age_band', str(b), (agebin == b).to_numpy()) for b in agebin.cat.categories]
    ref_groups += [('edu_years_mean_band', str(b), (edubin == b).to_numpy()) for b in edubin.cat.categories]
    ref_groups += [('how_met', h, (couples.how_met == h).to_numpy()) for h in sorted(couples.how_met.unique()) if h != 'Unknown']
    ref_groups += [('interracial', v, m) for v, m in [('Interracial', (couples.couple_race == 'Interracial').to_numpy()),
                                                      ('Same race-ethnicity', couples.couple_race.str.startswith('Both').to_numpy())]]
    ref_groups += [('relationship_years_band', str(b), (durbin == b).to_numpy()) for b in durbin.cat.categories]
    popref = dict(method=('Survey-weighted (weight2) quantiles of held-out predicted probability of a break-up by each horizon, '
                          f'from {REPEATS}x{FOLDS}-fold couple-held-out hazards averaged over repeats; all couples partnered at wave 1. '
                          'Cells need >=100 unweighted couples (50-99 reported with small_cell=true); p5/p95 need >=200 and p1/p99 >=500, '
                          'otherwise null. Aggregates only.'),
                  quantiles=[f'p{q}' for q in QS], horizons={h: H.PERIODS[k - 1]['years_since_start_at_end'] for h, k in HOR.items()},
                  models={})
    pr_rows = []
    for k in ('quality_only', 'additive_core', 'additive_full'):
        Hm = np.mean(Hcv[k], axis=0)
        cells = []
        for dim, lab, m in ref_groups:
            nn = int(m.sum())
            if nn < 50:
                continue
            cell = dict(dimension=dim, group=lab, n=nn, small_cell=nn < 100, weighted_share=round(float(svw[m].sum() / svw.sum()), 4))
            for h, kk in HOR.items():
                cum = 1 - np.prod(1 - Hm[m, :kk], axis=1)
                vals = wquant(cum, svw[m], QS)
                out = {}
                for q, v in zip(QS, vals):
                    ok = nn >= (500 if q in (1, 99) else 200 if q in (5, 95) else 50)
                    out[f'p{q}'] = round(float(v), 4) if ok else None
                    pr_rows.append(dict(model=k, dimension=dim, group=lab, n=nn, horizon=h, quantile=f'p{q}', value=out[f'p{q}']))
                cell[h] = out
            cells.append(cell)
        popref['models'][k] = cells
    pd.DataFrame(pr_rows).to_csv(HERE / 'population_reference_quantiles.csv', index=False, float_format='%.4f')

    # Descriptive break-up rates by group (weighted and unweighted Kaplan-Meier over periods).
    desc_groups = [('All couples', np.ones(n, bool))]
    desc_groups += [(f'Quality: {q}', (couples.relationship_quality == q).to_numpy()) for q in ['Excellent', 'Good', 'Fair', 'Poor or very poor']]
    desc_groups += [('Married', (couples.married == 'Yes').to_numpy()), ('Unmarried', (couples.married == 'No').to_numpy())]
    for mlab, mval in [('Married', 'Yes'), ('Unmarried', 'No')]:
        for q in ['Excellent', 'Good', 'Fair', 'Poor or very poor']:
            desc_groups.append((f'{mlab}, quality: {q}', ((couples.married == mval) & (couples.relationship_quality == q)).to_numpy()))
    desc_groups += [(f'Couple type: {t}', (couples.couple_type == t).to_numpy()) for t in ['Man-woman', 'Two men', 'Two women']]
    desc_groups += [('Met online', (couples.how_met == 'Online').to_numpy()), ('Did not meet online', (couples.how_met != 'Online').to_numpy())]
    svw = couples.weight.to_numpy()
    rates = []
    rng = np.random.default_rng(SEED + 1)
    ends = [p['years_since_start_at_end'] for p in H.PERIODS]
    for name, sel in desc_groups:
        idx = np.where(sel)[0]
        rsub = rows[rows.ci.isin(idx)]
        unw, wtd = km(rsub, couples, np.ones(n)), km(rsub, couples, svw)
        bs_u, bs_w = [], []
        for b in range(BOOT):
            mult = np.zeros(n)
            mult[idx] = np.bincount(rng.integers(0, len(idx), len(idx)), minlength=len(idx))
            bs_u.append(km(rsub, couples, mult))
            bs_w.append(km(rsub, couples, mult * svw))
        bs_u, bs_w = np.array(bs_u), np.array(bs_w)
        row = dict(group=name, couples=int(len(idx)), followed_up=int((couples.last_period.to_numpy()[idx] > 0).sum()),
                   breakups=int((couples.outcome.to_numpy()[idx] == 'breakup').sum()))
        for j, lab in [(1, '2011'), (2, '2013'), (4, '2017')]:
            row[f'unweighted_by_{lab}'] = unw[j]
            row[f'unweighted_by_{lab}_lo'], row[f'unweighted_by_{lab}_hi'] = np.nanpercentile(bs_u[:, j], [2.5, 97.5])
            row[f'weighted_by_{lab}'] = wtd[j]
            row[f'weighted_by_{lab}_lo'], row[f'weighted_by_{lab}_hi'] = np.nanpercentile(bs_w[:, j], [2.5, 97.5])
        rates.append(row)
    rates = pd.DataFrame(rates)
    rates.to_csv(HERE / 'breakup_rates_by_group.csv', index=False, float_format='%.4f')

    # Event and attrition audit.
    ev_period = rows.groupby('period').agg(person_periods=('event', 'size'), breakups=('event', 'sum')).reset_index()
    ev_period = ev_period.merge(pd.DataFrame(H.PERIODS), on='period')
    ev_period['crude_hazard'] = ev_period.breakups / ev_period.person_periods
    ev_period.to_csv(HERE / 'events_by_period.csv', index=False, float_format='%.4f')
    by_wave = pd.crosstab(couples.outcome, couples.reported_wave)

    # Final fits on everyone.
    pipes = {k: pipeline(k, final_C.get(k, 0.3)).fit(rows, rows.event) for k in keys}
    (HERE / 'tree_depth3.txt').write_text(export_text(
        pipes['tree_depth3'].named_steps['fit'],
        feature_names=pipes['tree_depth3'].named_steps['prep'].get_feature_names_out().tolist(), decimals=4))
    for k in ('additive_core', 'additive_full', 'quality_only'):
        pd.DataFrame(dict(feature=pipes[k].named_steps['prep'].get_feature_names_out(), coef=pipes[k].named_steps['fit'].coef_[0])).to_csv(
            HERE / f'coefficients_{k}.csv', index=False, float_format='%.6g')

    # Odds ratios with couple-bootstrap intervals: a near-unpenalised linear-logit hazard with
    # readable units (not exported; the exported models use splines and an L2 penalty).
    def or_frame(d):
        x = pd.DataFrame(dict(
            age_per_10y=d.mean_age.fillna(couples.mean_age.median()) / 10,
            age_gap_per_5y=d.age_gap.fillna(couples.age_gap.median()) / 5,
            log2_relationship_years_plus1=np.log2(d.relationship_years.fillna(couples.relationship_years.median()) + 1),
            edu_mean_per_4y=d.edu_years_mean.fillna(couples.edu_years_mean.median()) / 4,
            edu_gap_per_4y=d.edu_gap.fillna(couples.edu_gap.median()) / 4,
            income_per_50k=d.hh_income_k / 50,
            children_in_hh=d.children_in_hh.clip(upper=4)), index=d.index)
        for c in ['period'] + H.FULL_CATEGORICAL:
            levels = sorted(couples[c].unique()) if c != 'period' else ['1', '2', '3', '4', '5']
            ref = REF.get(c, levels[0])
            for lv in levels:
                if lv != ref and lv != 'Unknown':
                    x[f'{c}={lv}'] = (d[c] == lv).astype(float)
        return x
    REF = dict(relationship_quality='Excellent', married='Yes', cohabiting='Yes', couple_type='Man-woman',
               couple_race='Both White', party_pair='Both Democrats', how_met='Through friends', prior_marriage='No',
               earnings='One earned more', religion_pair='Same religion', parental_approval='Approve')
    Xo = or_frame(rows)
    fit_or = lambda X, y: LogisticRegression(C=1e4, max_iter=5000, tol=1e-10).fit(X, y).coef_[0]
    beta = fit_or(Xo, rows.event)
    rng = np.random.default_rng(SEED + 2)
    by_ci = rows.groupby('ci').indices
    cis = np.array(list(by_ci.keys()))
    bb = []
    for b in range(300):
        pick = rng.choice(cis, len(cis))
        ix = np.concatenate([by_ci[c] for c in pick])
        bb.append(fit_or(Xo.iloc[ix], rows.event.iloc[ix]))
    bb = np.array(bb)
    ors = pd.DataFrame(dict(term=Xo.columns, odds_ratio=np.exp(beta), ci_low=np.exp(np.percentile(bb, 2.5, axis=0)),
                            ci_high=np.exp(np.percentile(bb, 97.5, axis=0))))
    ors['reference'] = [REF.get(t.split('=')[0], '1' if t.startswith('period=') else '') if '=' in t else 'per unit shown' for t in ors.term]
    ors.to_csv(HERE / 'odds_ratios.csv', index=False, float_format='%.4f')

    # External check on the independent HCMST 2017 cohort with the 2009-trained core models.
    c17, audit17 = H.couples_2017()
    H17 = {k: hazards(pipes[k], c17) for k in ('period_only', 'quality_only', 'additive_core')}
    tgrid = np.r_[0, ends]
    ext = []
    rng = np.random.default_rng(SEED + 3)
    for col, horizon in [('breakup_by_2020', (2020 * 12 + 9 - (2017 * 12 + 7)) / 12), ('breakup_by_2022', (2022 * 12 + 3 - (2017 * 12 + 7)) / 12)]:
        known = c17[col].notna().to_numpy()
        y = c17[col].to_numpy()[known]
        boots17 = np.array([np.bincount(rng.integers(0, len(y), len(y)), minlength=len(y)) for _ in range(BOOT)], float)
        preds = {}
        for k, Hm in H17.items():
            L = np.c_[np.zeros(len(c17)), np.cumsum(-np.log1p(-Hm), axis=1)]
            Lh = np.array([np.interp(horizon, tgrid, l) for l in L])
            preds[k] = 1 - np.exp(-Lh[known])
        rk = {k: Ranker(p, y) for k, p in preds.items()}
        for k, p in preds.items():
            def mets(w):
                num, den = rk[k].parts(w)
                return np.array([num / den if den else np.nan, logloss(y, p, w), logloss(y, preds['period_only'], w),
                                 np.dot(w, (y - p) ** 2) / w.sum(), np.dot(w, y) / np.dot(w, p)])
            pt = mets(np.ones(len(y)))
            bs = np.array([mets(w) for w in boots17])
            gain = 100 * (1 - bs[:, 1] / bs[:, 2])
            ext.append(dict(outcome=col, horizon_years=round(horizon, 3), model=k, couples=int(len(y)), breakups=int(y.sum()),
                            observed_rate=float(y.mean()), mean_predicted=float(p.mean()),
                            auc=pt[0], auc_lo=np.percentile(bs[:, 0], 2.5), auc_hi=np.percentile(bs[:, 0], 97.5),
                            gain_vs_period_only_pct=100 * (1 - pt[1] / pt[2]),
                            gain_lo=np.percentile(gain, 2.5), gain_hi=np.percentile(gain, 97.5),
                            brier=pt[3], observed_expected=pt[4],
                            oe_lo=np.percentile(bs[:, 4], 2.5), oe_hi=np.percentile(bs[:, 4], 97.5)))
    ext = pd.DataFrame(ext)
    ext.to_csv(HERE / 'external_validation_hcmst2017.csv', index=False, float_format='%.4f')

    # Partial effects of the final core model: cumulative break-up to 2017 for a reference couple,
    # changing one input at a time.
    REFP = dict(mean_age=float(couples.mean_age.median()), age_gap=float(couples.age_gap.median()),
                relationship_years=float(couples.relationship_years.median()), edu_years_mean=float(couples.edu_years_mean.median()),
                edu_gap=float(couples.edu_gap.median()), hh_income_k=float(couples.hh_income_k.median()), children_in_hh=0.0,
                **REF)
    def cum8(k, prof):
        return float(1 - np.prod(1 - hazards(pipes[k], pd.DataFrame([prof]))[0]))
    eff = []
    for k in ('quality_only', 'additive_core', 'additive_full'):
        base = cum8(k, REFP)
        eff.append(dict(model=k, input='(reference couple)', value='', cumulative_breakup_8y=base, difference_points=0.0))
        used = set(next(m for m in MODELS if m[0] == k)[2]) | set(next(m for m in MODELS if m[0] == k)[3])
        for c in ['relationship_quality', 'married', 'cohabiting', 'couple_type', 'how_met', 'party_pair', 'prior_marriage', 'religion_pair', 'parental_approval', 'couple_race']:
            if c not in used:
                continue
            for lv in sorted(couples[c].unique()):
                if lv == REFP[c] or lv == 'Unknown':
                    continue
                v = cum8(k, {**REFP, c: lv})
                eff.append(dict(model=k, input=c, value=lv, cumulative_breakup_8y=v, difference_points=100 * (v - base)))
        for c, vals in dict(mean_age=[25, 35, 55, 70], age_gap=[0, 10, 20], relationship_years=[1, 3, 6, 25, 40],
                            edu_years_mean=[12, 16, 18], hh_income_k=[20, 40, 100, 150], children_in_hh=[1, 2]).items():
            if c not in used:
                continue
            for v0 in vals:
                v = cum8(k, {**REFP, c: float(v0)})
                eff.append(dict(model=k, input=c, value=v0, cumulative_breakup_8y=v, difference_points=100 * (v - base)))
    pd.DataFrame(eff).to_csv(HERE / 'partial_effects_8y.csv', index=False, float_format='%.4f')

    # Out-of-distribution score on the couple-level inputs (tools/ood.py).
    levels = {c: sorted(couples[c].unique()) for c in H.FULL_CATEGORICAL}
    gkf = GroupKFold(FOLDS, shuffle=True, random_state=SEED)
    fold = np.zeros(n, int)
    for f, (_, te) in enumerate(gkf.split(couples, groups=couples.id)):
        fold[te] = f
    ood_spec, _, ood_fit = ood.build(couples, fold, H.NUMERIC, H.FULL_CATEGORICAL, levels)

    # Sample audit.
    audit_out = dict(
        hcmst2009=dict(**audit, documented=dict(respondents=4002, partnered=3009, wave2=2520, wave3=1960, wave4=1536, wave5=1127,
                                                 source='HCMST brief user guide v5 (2016) and data.stanford.edu/hcmst'),
                       couples_with_followup=int((couples.last_period > 0).sum()), couples_without_followup=int((couples.last_period == 0).sum()),
                       person_periods=len(rows), breakups=int(rows.event.sum()),
                       breakups_matching_w2345_combo_plus_w6=int(rows.event.sum()) == 503 + 24,
                       partner_deaths_censored=int((couples.outcome == 'partner_died').sum()),
                       breakups_reported_after_a_skipped_wave=int((couples.skipped_wave & (couples.outcome == 'breakup')).sum()),
                       breakups_with_reported_date=int(couples.dated.sum()),
                       outcome_by_reporting_wave={o: {str(k): int(v) for k, v in by_wave.loc[o].items()} for o in by_wave.index},
                       unknown_counts={c: int((couples[c] == 'Unknown').sum()) for c in H.FULL_CATEGORICAL},
                       missing_numeric={c: int(couples[c].isna().sum()) for c in H.NUMERIC}),
        hcmst2017=dict(**audit17, documented=dict(respondents=3510, partnered=2862, surveyed_2020=2107, surveyed_2022=1722,
                                                   source='data.stanford.edu/hcmst2017'),
                       breakups_by_2020=int(c17.breakup_by_2020.sum()), known_2020=int(c17.breakup_by_2020.notna().sum()),
                       breakups_by_2022=int(c17.breakup_by_2022.sum()), known_2022=int(c17.breakup_by_2022.notna().sum())),
        cv=f'{REPEATS} repeats x {FOLDS}-fold GroupKFold by couple (shuffled, seeds {SEED}+repeat); L2 C chosen once by 5-fold grouped CV on all couples from {C_GRID}',
        final_C=final_C,
        bootstrap=f'{BOOT} couple resamples', python_sklearn=sklearn.__version__)
    (HERE / 'sample_audit.json').write_text(json.dumps(audit_out, indent=1) + '\n')
    for k in ('hcmst2009', 'hcmst2017'):
        for f, v in audit_out[k]['documented'].items():
            if f != 'source':
                got = {'partnered': audit_out[k].get('partnered_qflag', audit_out[k].get('partnered_2017')),
                       'wave2': audit_out[k].get('wave2_completed'), 'wave3': audit_out[k].get('wave3_completed'),
                       'wave4': audit_out[k].get('wave4_completed'), 'wave5': audit_out[k].get('wave5_completed')}.get(f, audit_out[k].get(f))
                assert got == v, (k, f, got, v)

    # Bundle.
    allc = comp[comp.group == 'All couples'].set_index('model')
    def held(k):
        r = allc.loc[k]
        ci = lambda m: [round(float(r[m + '_lo']), 4), round(float(r[m + '_hi']), 4)]
        out = dict(logloss_improvement_percent=round(float(r.gain_vs_constant_pct), 3), logloss_improvement_ci=ci('gain_vs_constant_pct'),
                   improvement_over_period_only_percent=round(float(r.gain_vs_period_only_pct), 3), improvement_over_period_only_ci=ci('gain_vs_period_only_pct'),
                   auc_per_period=round(float(r.auc_period), 4), auc_per_period_ci=ci('auc_period'),
                   c_index=round(float(r.c_index), 4), c_index_ci=ci('c_index'),
                   auc_breakup_by_2011=round(float(r.auc_2y), 4), auc_breakup_by_2011_ci=ci('auc_2y'),
                   brier=round(float(r.brier), 5), brier_skill_vs_period_only_percent=round(float(r.brier_skill_vs_period_only_pct), 3),
                   observed_expected_ratio=round(float(r.oe), 4),
                   calibration_slope=round(float(pd.DataFrame(cal).query('model == @k').calibration_slope.iloc[0]), 3),
                   top_decile_lift_2y=round(float(pd.DataFrame(lift).query('model == @k and decile == 10').lift.iloc[0]), 3),
                   by_group={g: dict(c_index=round(float(comp.query('group == @g and model == @k').c_index.iloc[0]), 4),
                                     improvement_over_period_only_percent=round(float(comp.query('group == @g and model == @k').gain_vs_period_only_pct.iloc[0]), 3))
                             for g in groups if g != 'All couples'})
        e = ext[ext.model == k]
        if len(e):
            out['external_hcmst2017'] = {r2.outcome: dict(auc=round(r2.auc, 4), auc_ci=[round(r2.auc_lo, 4), round(r2.auc_hi, 4)],
                                                          observed_expected=round(r2.observed_expected, 3),
                                                          improvement_over_period_only_percent=round(r2.gain_vs_period_only_pct, 3))
                                         for r2 in e.itertuples()}
        return out

    def exported(k):
        e = export(pipes[k])
        if e['numeric'] is None:
            e['numeric'] = dict(columns=[], impute=[])
        return e

    num_support = {c: [float(couples[c].quantile(0.005)), float(couples[c].quantile(0.995))] for c in H.NUMERIC}
    labels = dict(MODELS and {m[0]: m[1] for m in MODELS})
    bundle = dict(
        id='hcmst_couples', version=1,
        source='How Couples Meet and Stay Together (HCMST) 2009, Stanford University (Rosenfeld, Thomas & Falcon): public version 3.04 (waves 1-3) with wave 4, 5 and 6 supplements; U.S. adults with a spouse or partner, interviewed Feb-Apr 2009 and followed to 2017. External check: HCMST 2017-2022 (Rosenfeld, Thomas & Hausen), public version 2.2.',
        target='Probability that a couple together at the start of a follow-up period breaks up (divorce, separation or break-up of an unmarried couple) during that period; five periods from 2009 to 2017 (see periods). Partner deaths censored. A per-period probability, not an annual rate.',
        outcome='probability_per_period',
        population="U.S. adults (English-literate, KnowledgePanel) with a spouse or main romantic partner in 2009: married and unmarried, different-sex and same-sex couples (same-sex oversampled); one partner's report of both",
        weights='Models are fitted unweighted, following the HCMST weights notes (Winship & Radbill) because of the GLB oversample; inputs include the main predictors of weight2. Descriptive rates are given with and without weight2.',
        training=dict(couples=int(len(couples)), couples_with_followup=int((couples.last_period > 0).sum()),
                      person_periods=int(len(rows)), events=int(rows.event.sum()),
                      events_by_period={str(r.period): int(r.breakups) for r in ev_period.itertuples()},
                      married_couples=int((couples.married == 'Yes').sum()), unmarried_couples=int((couples.married == 'No').sum()),
                      same_sex_couples=int(couples.couple_type.isin(['Two men', 'Two women']).sum())),
        constant_rate=float(rows.event.mean()),
        periods=H.PERIODS,
        time_offsets={k: round(v, 4) for k, v in OFFSET.items()},
        how_to_combine='P(no break-up through period k) = product over j<=k of (1 - p_j), with p_j the model prediction for period=j, relationship_years and mean_age advanced by time_offsets[j], and all other inputs as of today. Period ends are about 1.1, 2.2, 4.1, 5.8 and 8.4 years after the start.',
        support=num_support,
        inputs=dict(
            period="follow-up period '1'-'5' (see periods); the app sets it, not the user",
            relationship_quality="Excellent / Good / Fair / Poor or very poor: the reporting partner's answer to 'In general, how would you describe the quality of your relationship?'",
            married='Yes/No: married to each other', cohabiting='Yes/No: live together',
            couple_type='Man-woman / Two men / Two women',
            couple_race="Both White / Both Black / Both Hispanic / Both Other / Interracial (Hispanic of any race; Other includes Asian, Native American and other)",
            party_pair='Both Republicans / Both Democrats / One Republican, one Democrat / Other or independent (either partner independent, other or no preference); leaners count as partisans for the reporting partner',
            how_met='Online / Through friends / Through family / Work or coworkers / School or college / Bar or restaurant / Church / Other (first match in that order; HCMST coding of how the couple met)',
            prior_marriage="Yes/No: the reporting partner was married before (the other partner's history is not recorded)",
            earnings='About equal / One earned more (income in the previous year)',
            religion_pair='Same religion / Different religions / One no religion / Both no religion (current religion, 13 HCMST categories)',
            parental_approval="Approve / Neutral or unsure / Disapprove / Not asked (no living parent): the reporting partner's parents' view of the partner",
            mean_age="mean of the two ages, years, AT THE START OF THE PERIOD: today's value + periods[k].start offset (time_offsets)", age_gap='absolute age difference, years',
            relationship_years="years since the romantic relationship began, AT THE START OF THE PERIOD: today's value + time_offsets[period]",
            edu_years_mean='mean years of schooling of the two partners (12 = high school, 16 = bachelor, 18 = master, 20 = doctorate/professional)',
            edu_gap='absolute difference in years of schooling',
            hh_income_k='household income, thousands of 2009 dollars (HCMST top code 175,000+ valued at 200)',
            children_in_hh='children under 18 living in the household'),
        abstain=['partners under 18', 'couples who are not currently together', 'any numeric input outside support',
                 'profiles above the out-of-distribution threshold (ood)', 'horizons beyond period 5 (about 8.4 years)'],
        models=[dict(key=k, label=labels[k], heldout=held(k), **exported(k)) for k in EXPORTED],
        not_exported=dict(boosting=dict(label=labels['boosting'], heldout={kk: vv for kk, vv in held('boosting').items() if kk != 'by_group'},
                                        reason=(f"held-out log-loss gain over period-only {allc.loc['boosting', 'gain_vs_period_only_pct']:.1f}% "
                                                f"vs {allc.loc['additive_core', 'gain_vs_period_only_pct']:.1f}% for the additive core model, with overlapping "
                                                "intervals; not exported because the engine has no logistic boosting kind and the additive model is exactly explainable"))),
        rates_by_group=json.loads(rates.to_json(orient='records')),
        population_reference=popref,
        ood=ood_spec,
        sklearn=sklearn.__version__,
    )
    OUT.mkdir(exist_ok=True)
    (OUT / 'hcmst_couples.json').write_text(json.dumps(bundle, separators=(',', ':')))

    # Test vectors spanning categories (including unseen ones), numeric ranges and missing values.
    rng = np.random.default_rng(SEED)
    tv = []
    allcats = {c: sorted(couples[c].unique()) for c in H.FULL_CATEGORICAL}
    for i in range(80):
        r = {c: (str(rng.choice(allcats[c])) if i % 17 else 'Not a category') for c in H.FULL_CATEGORICAL}
        r['period'] = str(rng.integers(1, 6))
        r['mean_age'] = float(rng.uniform(18, 95))
        r['age_gap'] = None if i % 11 == 0 else float(rng.uniform(0, 40))
        r['relationship_years'] = float(rng.uniform(0, 70))
        r['edu_years_mean'] = None if i % 13 == 0 else float(rng.uniform(6, 20))
        r['edu_gap'] = float(rng.uniform(0, 12))
        r['hh_income_k'] = float(rng.uniform(2, 250))
        r['children_in_hh'] = float(rng.integers(0, 6))
        tv.append(r)
    tdf = pd.DataFrame(tv)
    vectors = dict(rows=json.loads(tdf.replace({np.nan: None}).to_json(orient='records')),
                   predictions={k: proba(pipes[k], tdf).tolist() for k in EXPORTED},
                   ood_d2=ood.score(ood_fit, tdf, H.NUMERIC, H.FULL_CATEGORICAL, levels).tolist())
    (OUT / 'hcmst_couples_testvectors.json').write_text(json.dumps(vectors))

    pd.set_option('display.width', 250)
    print(comp[['group', 'model', 'couples', 'breakups', 'gain_vs_constant_pct', 'gain_vs_period_only_pct', 'gain_vs_period_only_pct_lo', 'gain_vs_period_only_pct_hi',
                'c_index', 'c_index_lo', 'c_index_hi', 'auc_period', 'auc_2y', 'oe']].round(3).to_string(index=False))
    print(rates.round(3).to_string(index=False))
    print(ors.round(3).to_string(index=False))
    print(ext.round(3).to_string(index=False))
    print(ev_period.to_string(index=False))
    print('final C', final_C)
    print(f'done in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
