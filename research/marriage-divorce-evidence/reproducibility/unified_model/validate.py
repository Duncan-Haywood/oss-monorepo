"""Validation of the pooled model: person-held-out within every survey and leave-one-survey-out.

  python3 -I validate.py tau  WORK                choose the survey-deviation scale tau
  python3 -I validate.py task WORK cv:K           fold K (0-4) of the person-held-out split
  python3 -I validate.py task WORK loso:SURVEY    fit on every other survey, predict SURVEY
  python3 -I validate.py report WORK              tables (CSV/JSON next to this file)

WORK holds units.parquet / spells.parquet from harmonize.py; tasks write WORK/val/<task>.npz.

Every task imputes with training units only (held-out units are imputed without their outcome,
from models fitted on training units), fits the pooled model on training units, and predicts
each held-out unit's hazard in every duration band. Comparators on the same held-out units:
  - duration_only: the survey's own band rates (training units of that survey);
  - single_glm: the same Bayesian hazard GLM fitted on that survey alone, with the inputs that
    survey measures (lens practice: median/mode fill + missing indicators, no pooling);
  - single_hgb: Poisson gradient boosting on that survey alone (native missing values);
  - pooled_hgb: Poisson gradient boosting on all training surveys stacked, survey as a
    categorical input, missing values native (the flexible competitor).
"""
import json, os, sys, time
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import common, glm, mice  # noqa: E402
from design import NB, BANDS, SURVEY_KEYS, Design, followup  # noqa: E402
from harmonize import VARS, SURVEYS  # noqa: E402

SEED = 20261020
K_FOLDS = 5
M_VAL = int(os.environ.get("UM_M", 5))      # imputations per validation task
ITERS = int(os.environ.get("UM_ITERS", 6))
DRAWS = int(os.environ.get("UM_DRAWS", 200))   # posterior draws for interval coverage
TAU_GRID = [0.05, 0.1, 0.2, 0.4]


def load(work):
    U = pd.read_parquet(Path(work) / 'units.parquet')
    S = pd.read_parquet(Path(work) / 'spells.parquet')
    return U, S


def folds(U):
    """Person (cluster) folds within each survey."""
    rng = np.random.default_rng(SEED)
    f = np.empty(len(U), int)
    for s, g in U.groupby('survey'):
        cl = g.cluster.unique()
        rng.shuffle(cl)
        m = pd.Series(np.arange(len(cl)) % K_FOLDS, index=cl)
        f[g.index] = g.cluster.map(m).to_numpy()
    return f


def subset(d, sp, mask):
    keep = d.uid[mask]
    return d[mask].reset_index(drop=True), sp[sp.uid.isin(keep)].reset_index(drop=True)


def rate_matrix(base_su, lp):
    return np.exp(base_su + lp[:, None])


def tau_path(work):
    with open(Path(work) / 'tau.json') as fh:
        return json.load(fh)['tau']


# ----------------------------------------------------------------------------- tau
def choose_tau(work):
    U, S = load(work)
    meas = common.measured(U)
    train = np.ones(len(U), bool)
    comp = mice.impute(U, S, train, 1, SEED + 7, iters=ITERS)
    out = {}
    theta0 = None
    for tau in TAU_GRID:
        F = common.Fitted(comp, SURVEY_KEYS, meas, tau, theta0=theta0)
        theta0 = F.fits[0][0]
        out[tau] = F.evidence()
        print(f'tau {tau}: log evidence {out[tau]:.2f}', flush=True)
    best = max(out, key=out.get)
    (Path(work) / 'tau.json').write_text(json.dumps(dict(tau=best, log_evidence={str(k): v for k, v in out.items()}), indent=1))
    print('chosen', best)


# ----------------------------------------------------------------------------- one task
def single_survey(U, S, train, test, s, meas, seed):
    """Comparators fitted on survey s alone: duration-only, Bayesian GLM, gradient boosting."""
    ins = (U.survey == s).to_numpy()
    tr, te = train & ins, test & ins
    filled, ind = common.simple_fill(U, tr)
    vars_s = [v for v in VARS if s in meas[v]]
    d_tr, sp_tr = subset(filled, S, tr)
    d_te, sp_te = subset(filled, S, te)
    out = {}
    # Duration-only and the single-survey GLM share the machinery (one survey, no deviations).
    for name, cols in (('duration_only', []), ('single_glm', vars_s)):
        X_tr, X_te = single_design(d_tr, ind, tr, cols, tr), single_design(d_te, ind, te, cols, tr)
        mu, sd = X_tr.mean(0), X_tr.std(0)
        sd[sd < 1e-9] = 1
        X_tr, X_te = (X_tr - mu) / sd, (X_te - mu) / sd
        L = glm.Layout(1, X_tr.shape[1], 0)
        E, Y, iv = followup(d_tr, sp_tr)
        cz = np.zeros(len(d_tr)) if name == 'duration_only' else (d_tr.wedding_year.to_numpy() - 1990) / 10
        D = glm.Data(np.zeros(len(d_tr), int), X_tr, E, Y, iv, cz, 1)
        th, H, _ = glm.fit(L, D, 1.0)
        cz_te = np.zeros(len(d_te)) if name == 'duration_only' else (d_te.wedding_year.to_numpy() - 1990) / 10
        lp = X_te @ th[L.ib] + th[L.ic][0] * cz_te
        out[name] = rate_matrix(L.base(th)[np.zeros(len(d_te), int)], lp)
    # Single-survey boosting on raw inputs (missing native), its measured inputs only.
    Utr, Str = subset(U, S, tr)
    rows_tr, _ = common.hgb_rows(Utr, Str, [s], raw=Utr)
    keep = [j for j, v in enumerate(VARS) if v in vars_s] + list(range(len(VARS), len(VARS) + 3)) + [len(VARS) + 4]
    rows_tr['X'] = rows_tr['X'][:, keep]
    m = common.hgb_fit(rows_tr, survey_col=[], seed=seed, max_iter=200)
    out['single_hgb'] = hgb_rates(m, subset(U, S, te)[0], keep)
    return out, d_te.uid.to_numpy()


def single_design(d, ind, mask, cols, train_mask):
    if not cols:
        return np.zeros((len(d), 0))
    from design import SPLINE_TF, ONEHOT
    parts = []
    for v in cols:
        spec = VARS[v]
        if v in SPLINE_TF:
            parts.append(SPLINE_TF[v].transform(d[[v]].to_numpy(float)))
        elif v in ONEHOT:
            parts.append(np.column_stack([(d[v].to_numpy() == lv) for lv in ONEHOT[v][1:]]).astype(float))
        else:
            parts.append(d[[v]].to_numpy(float))
        mi = ind[v][mask]
        mt = ind[v][train_mask]
        if mt.any() and not mt.all():
            parts.append(mi[:, None].astype(float))
    parts.append(d[['female']].to_numpy(float))
    ut = d.union_type.to_numpy()
    if d.survey.iat[0] == 'hcmst':
        parts.append(np.column_stack([(ut == u) for u in ['Cohabiting, unmarried', 'Dating, not living together']]).astype(float))
    return np.hstack(parts)


def hgb_rates(m, d, keep=None, surveys_cat=None):
    """Predicted hazard in every band for every unit (rows for all bands)."""
    n = len(d)
    F = common_features(d, surveys_cat or [])
    X = np.vstack([np.column_stack([F, np.full(n, b, float)]) for b in range(NB)])
    if keep is not None:
        X = X[:, keep]
    r = m.predict(X).reshape(NB, n).T
    return r


def common_features(d, surveys_cat):
    feats = []
    for v, spec in VARS.items():
        x = d[v]
        if spec['kind'] == 'nom':
            feats.append(x.map({l: i for i, l in enumerate(spec['levels'])}).astype(float).to_numpy())
        else:
            x = x.astype(float).to_numpy().copy()
            if v + '__lo' in d:
                lo, hi = d[v + '__lo'].to_numpy(float), d[v + '__hi'].to_numpy(float)
                mm = np.isnan(x) & ~np.isnan(lo)
                x[mm] = (lo[mm] + hi[mm]) / 2
            feats.append(x)
    feats.append(d.female.to_numpy(float))
    feats.append(d.same_sex.to_numpy(float))
    feats.append(d.union_type.map({'Married': 0, 'Cohabiting, unmarried': 1, 'Dating, not living together': 2}).to_numpy(float))
    feats.append(d.survey.map({s: i for i, s in enumerate(surveys_cat)}).astype(float).fillna(-1).to_numpy())
    return np.column_stack(feats)


def run_task(work, task):
    t_start = time.time()
    U, S = load(work)
    tau = tau_path(work)
    meas = common.measured(U)
    f = folds(U)
    kind, arg = task.split(':')
    if kind == 'cv':
        test = f == int(arg)
    else:
        test = (U.survey == arg).to_numpy()
    train = ~test
    train_surveys = [s for s in SURVEY_KEYS if (train & (U.survey == s).to_numpy()).any()]
    seed = SEED + (int(arg) if kind == 'cv' else 100 + SURVEY_KEYS.index(arg))
    rng = np.random.default_rng(seed)
    print(f'[{task}] imputing ({M_VAL} chains)', flush=True)
    comp = mice.impute(U, S, train, M_VAL, seed, iters=ITERS)
    print(f'[{task}] imputed in {time.time() - t_start:.0f}s; fitting', flush=True)
    trc = [subset(d, sp, train) for d, sp in comp]
    tec = [subset(d, sp, test) for d, sp in comp]
    F = common.Fitted(trc, train_surveys, meas, tau)
    L = F.layout
    d_te0 = tec[0][0]
    n_te = len(d_te0)
    uid = d_te0.uid.to_numpy()
    # Pooled GLM: mean over imputations of the band hazards (integrates over missing inputs).
    mean_base = None
    if kind == 'loso':
        # No information about the held-out survey: global duration curve plus the average
        # survey level (r = 0, no cohort slope, no deviations).
        mean_base = lambda th: th[L.ig] + th[L.ia].mean()
    R = np.zeros((n_te, NB))
    offs = np.zeros(n_te)
    prep = [common.Prepared(F, d, sp) for d, sp in tec]
    for (th, H, _), pp in zip(F.fits, prep):
        base, lp = pp.base_lp(th, mean_base(th) if mean_base else None)
        R += rate_matrix(base, lp)
        offs += np.exp(lp)
    R /= len(F.fits)
    out = dict(uid=uid, survey=d_te0.survey.to_numpy(), cluster=d_te0.cluster.to_numpy(), weight=d_te0.weight.to_numpy(),
               pooled_glm=R, pooled_offset=np.log(offs / len(F.fits)))
    if kind == 'loso':
        out['pooled_base_mean'] = np.mean([mean_base(th) for th, _, _ in F.fits], axis=0)
    # Posterior draws: expected events per held-out unit under each draw (for coverage).
    Th, per = F.draws(DRAWS, rng)
    EV = np.zeros((n_te, len(Th)), np.float32)
    for j, th in enumerate(Th):
        pp = prep[min(j // per, len(prep) - 1)]
        EV[:, j] = pp.expected(th, mean_base(th) if mean_base else None)
    out['draw_expected'] = EV
    print(f'[{task}] pooled GLM done {time.time() - t_start:.0f}s; boosting', flush=True)
    # Pooled boosting on raw inputs.
    S_imp = comp[0][1]   # follow-up with derived durations (GSS, some SIPP couples) from chain 1
    out['coef_mean'] = np.mean([th for th, _, _ in F.fits], axis=0)
    out['columns'] = np.array(F.design.columns + [f'{n}@{s}' for n, s in F.design.dev])
    test_spells = tec[0][1]
    del comp, trc, tec, prep, F, EV, Th                # free memory before boosting
    Utr, Str = subset(U, S_imp, train)
    rows, scol = common.hgb_rows(Utr, Str, train_surveys, raw=Utr)
    m = common.hgb_fit(rows, survey_col=[len(VARS) + 3], seed=seed)
    Ute, _ = subset(U, S, test)
    out['pooled_hgb'] = hgb_rates(m, Ute, surveys_cat=train_surveys)
    # Single-survey comparators (person-held-out split only).
    if kind == 'cv':
        for s in SURVEY_KEYS:
            res, ids = single_survey(U, S_imp, train, test, s, meas, seed)
            pos = pd.Index(uid).get_indexer(ids)
            for k, v in res.items():
                if k not in out:
                    out[k] = np.full((n_te, NB), np.nan)
                out[k][pos] = v
            print(f'[{task}] single-survey {s} done {time.time() - t_start:.0f}s', flush=True)
    vd = Path(work) / 'val'
    vd.mkdir(exist_ok=True)
    np.savez_compressed(vd / f'{task.replace(":", "_")}.npz', **out)
    # Held-out follow-up with imputed durations (GSS) from the first chain, for metrics.
    test_spells.to_parquet(vd / f'{task.replace(":", "_")}_spells.parquet')
    print(f'[{task}] saved in {time.time() - t_start:.0f}s', flush=True)


if __name__ == '__main__':
    mode, work = sys.argv[1], sys.argv[2]
    if mode == 'tau':
        choose_tau(work)
    elif mode == 'task':
        run_task(work, sys.argv[3])
    elif mode == 'report':
        import report
        report.main(work)
