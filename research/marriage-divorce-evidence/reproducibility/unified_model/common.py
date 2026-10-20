"""Glue shared by validate.py and export.py: measured-by-design maps, model fitting on a set of
completed data sets, prediction, and the single-survey comparators."""
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

import glm
from design import (Design, followup, NB, BANDS, SURVEY_KEYS, DEVIATION, exposure_by_band, band_of,
                    ONEHOT, LINEAR, BINARY, SPLINES)
from harmonize import VARS, SURVEYS

# Inputs that do not carry over to a survey's population: never imputed into its analysis
# design (their columns are held at the training mean for those units, i.e. averaged out).
NOT_TRANSPORTABLE = {}   # superseded: every input a survey did not measure is held at its survey mean
MEASURED_SHARE = 0.3


def measured(U):
    """{input: [surveys where it is measured (exact or coarsened) for >= 30% of units]}."""
    out = {}
    sv = U.survey.to_numpy()
    for v in VARS:
        obs = U[v].notna().to_numpy().copy()
        if v + '__lo' in U:
            obs |= U[v + '__lo'].notna().to_numpy()
        if v + '__set' in U:
            obs |= U[v + '__set'].notna().to_numpy()
        share = pd.Series(obs).groupby(sv).mean()
        out[v] = [s for s in SURVEY_KEYS if share.get(s, 0) >= MEASURED_SHARE]
    out['female'] = list(SURVEY_KEYS)
    return out


def deviation_surveys(meas, train_surveys):
    """Survey deviations are estimated for an input only where >= 2 surveys measure it."""
    out = {}
    for name in DEVIATION:
        v = name.split(':')[0]
        ss = [s for s in meas.get(v, []) if s in train_surveys]
        if len(ss) >= 2:
            out[v] = ss
    return out


def neutralise(X, d, design):
    """Hold non-transportable inputs at the training mean (standardised 0) for those surveys."""
    s = d.survey.to_numpy()
    for sv, vs in NOT_TRANSPORTABLE.items():
        m = s == sv
        if not m.any():
            continue
        for j, grp in enumerate(design.groups):
            if grp in vs:
                X[m, j] = 0.0
    return X


class Fitted:
    """One analysis fit per completed data set, sharing a design and survey indexing."""

    def __init__(self, completed, train_surveys, meas, tau, verbose=False, theta0=None):
        self.train_surveys = list(train_surveys)
        self.sidx = {s: i for i, s in enumerate(self.train_surveys)}
        self.tau = tau
        d0 = completed[0][0]
        self.design = Design(d0, deviation_surveys(meas, self.train_surveys))
        # Inputs a survey never measured enter its units' design at that survey's training mean
        # (a constant the survey baseline absorbs): the survey neither informs nor biases them.
        self.unmeasured = {s: [j for j, g in enumerate(self.design.groups)
                               if g not in ('female', 'same_sex', 'union_type') and s not in meas.get(g, [])]
                           for s in SURVEY_KEYS}
        self.fill = {}
        Xs = [self.design.matrix(d) for d, _ in completed]
        for s in self.train_surveys:
            m = (d0.survey == s).to_numpy()
            cols = self.unmeasured[s]
            self.fill[s] = np.mean([X[m][:, cols].mean(0) for X in Xs], axis=0) if cols else np.zeros(0)
        del Xs
        self.layout = glm.Layout(len(self.train_surveys), self.design.n_main, len(self.design.dev))
        self.fits = []
        for d, sp in completed:
            D = self.data(d, sp)
            th, H, lpost = glm.fit(self.layout, D, tau, theta0=theta0, verbose=verbose)
            theta0 = th
            self.fits.append((th, H, lpost))

    def X(self, d):
        X = self.design.matrix(d)
        s = d.survey.to_numpy()
        for sv in np.unique(s):
            cols = self.unmeasured.get(sv, [])
            if not cols:
                continue
            m = s == sv
            # Surveys not in the fit (leave-one-survey-out) use their own mean of the
            # outcome-free imputations.
            fill = self.fill[sv] if sv in self.fill else X[m][:, cols].mean(0)
            X[np.ix_(m, cols)] = fill
        return X

    def data(self, d, sp):
        E, Y, iv = followup(d, sp)
        s = d.survey.map(self.sidx).to_numpy()
        return glm.Data(s, self.X(d), E, Y, iv, (d.wedding_year.to_numpy() - 1990) / 10, self.layout.S)

    def evidence(self):
        return float(np.mean([glm.log_evidence(self.layout, th, H, lp, self.tau) for th, H, lp in self.fits]))

    def draws(self, n_total, rng):
        per = max(1, n_total // len(self.fits))
        return np.vstack([glm.draws(th, H, per, rng) for th, H, _ in self.fits]), per


def predict_units(F, theta, d, sp, base_override=None):
    """Expected events for units of d under parameters theta.

    Returns per-unit arrays for exact follow-up (mu, (n, NB)) and per-spell probabilities for
    interval follow-up, plus the unit linear predictor. Units of a survey the model was not fitted
    on use base_override (an (NB,) baseline) and no cohort slope / deviations."""
    L = F.layout
    X = F.X(d)
    s = d.survey.to_numpy()
    known = np.isin(s, F.train_surveys)
    sidx = np.array([F.sidx.get(v, 0) for v in s])
    cz = (d.wedding_year.to_numpy() - 1990) / 10
    lp = X @ theta[np.r_[L.ib, L.id]] + np.where(known, theta[L.ic][sidx] * cz, 0.0)
    base = L.base(theta)[sidx]
    if base_override is not None:
        base = np.where(known[:, None], base, base_override[None, :])
    E, Y, iv = followup(d, sp)
    mu = E * np.exp(base + lp[:, None])
    p = None
    if len(iv['unit']):
        m = iv['length'] * np.exp(base[iv['unit'], iv['band']] + lp[iv['unit']])
        p = -np.expm1(-m)
    return dict(mu=mu, p=p, lp=lp, E=E, Y=Y, iv=iv, base=base)


class Prepared:
    """Design and follow-up of a set of units, computed once and scored under many parameter draws."""

    def __init__(self, F, d, sp):
        L = F.layout
        self.L = L
        self.X = F.X(d)
        s = d.survey.to_numpy()
        self.known = np.isin(s, F.train_surveys)
        self.sidx = np.array([F.sidx.get(v, 0) for v in s])
        self.cz = (d.wedding_year.to_numpy() - 1990) / 10
        self.E, self.Y, self.iv = followup(d, sp)
        self.cols = np.r_[L.ib, L.id]
        self.n = len(d)

    def base_lp(self, theta, base_override=None):
        L = self.L
        lp = self.X @ theta[self.cols] + np.where(self.known, theta[L.ic][self.sidx] * self.cz, 0.0)
        base = L.base(theta)[self.sidx]
        if base_override is not None:
            base = np.where(self.known[:, None], base, base_override[None, :])
        return base, lp

    def expected(self, theta, base_override=None):
        """Expected events per unit (exact: sum of band means; interval: sum of spell probabilities)."""
        base, lp = self.base_lp(theta, base_override)
        e = (self.E * np.exp(base + lp[:, None])).sum(1)
        iv = self.iv
        if len(iv['unit']):
            m = iv['length'] * np.exp(base[iv['unit'], iv['band']] + lp[iv['unit']])
            e += np.bincount(iv['unit'], weights=-np.expm1(-m), minlength=self.n)
        return e


# ----------------------------------------------------------------------------- comparators
def simple_fill(U, train):
    """Single-survey comparator inputs: exact values; coarse ordinal -> midpoint of bounds;
    coarse nominal -> most common allowed level; missing -> training median / mode, with a
    missing indicator for every input that has any missing value (the lenses' approach)."""
    d = U[['uid', 'survey', 'cluster', 'weight', 'female', 'union_type', 'same_sex', 'sub', 'wedding_year']].copy()
    ind = {}
    for v, spec in VARS.items():
        x = U[v]
        if spec['kind'] == 'nom':
            x = x.astype(object).copy()
            if v + '__set' in U:
                st = U[v + '__set']
                m = x.isna() & st.notna()
                if m.any():
                    mode_by_set = {}
                    for sset in st[m].unique():
                        lv = sset.split('|')
                        cnt = x[train & x.isin(lv)].value_counts()
                        mode_by_set[sset] = cnt.index[0] if len(cnt) else lv[0]
                    x[m] = st[m].map(mode_by_set)
            miss = x.isna()
            mode = x[train & ~miss].mode()
            x[miss] = mode.iloc[0] if len(mode) else spec['levels'][0]
        else:
            x = x.astype(float).copy()
            if v + '__lo' in U:
                lo, hi = U[v + '__lo'], U[v + '__hi']
                m = x.isna() & lo.notna()
                x[m] = np.round((lo[m] + hi[m]) / 2) if spec['kind'] == 'ord' else (lo[m] + hi[m]) / 2
            miss = x.isna()
            med = x[train & ~miss].median()
            x[miss] = med if np.isfinite(med) else 0.0
        d[v] = x
        ind[v] = miss.to_numpy()
    d['wedding_year'] = d['wedding_year'].fillna(d.loc[train, 'wedding_year'].median())
    return d, ind


def hgb_rows(d, sp, surveys_cat, raw=None):
    """Unit x band rows for gradient boosting: inputs (NaN = missing), survey code, band, entry
    duration, exposure and events. Interval spells: one row at their mid band (Poisson approx)."""
    E, Y, iv = followup(d, sp)
    n = len(d)
    feats = []
    src = raw if raw is not None else d
    for v, spec in VARS.items():
        x = src[v]
        if spec['kind'] == 'nom':
            lv = spec['levels']
            feats.append(x.map({l: i for i, l in enumerate(lv)}).astype(float).to_numpy())
        else:
            x = x.astype(float).to_numpy()
            if raw is not None and v + '__lo' in raw:
                lo, hi = raw[v + '__lo'].to_numpy(float), raw[v + '__hi'].to_numpy(float)
                m = np.isnan(x) & ~np.isnan(lo)
                x = x.copy()
                x[m] = (lo[m] + hi[m]) / 2
            feats.append(x)
    feats.append(d.female.to_numpy(float))
    feats.append(d.same_sex.to_numpy(float))
    feats.append(d.union_type.map({'Married': 0, 'Cohabiting, unmarried': 1, 'Dating, not living together': 2}).to_numpy(float))
    feats.append(d.survey.map({s: i for i, s in enumerate(surveys_cat)}).fillna(-1).to_numpy(float))
    F = np.column_stack(feats)
    ui, bi = np.nonzero(E > 0)
    rows_x = np.column_stack([F[ui], bi.astype(float)])
    rows = dict(unit=ui, band=bi, X=rows_x, expo=E[ui, bi], y=Y[ui, bi], kind=np.zeros(len(ui), int))
    if len(iv['unit']):
        rx = np.column_stack([F[iv['unit']], iv['band'].astype(float)])
        rows = dict(unit=np.r_[ui, iv['unit']], band=np.r_[bi, iv['band']], X=np.vstack([rows_x, rx]),
                    expo=np.r_[E[ui, bi], iv['length']], y=np.r_[Y[ui, bi], iv['y']],
                    kind=np.r_[np.zeros(len(ui), int), np.ones(len(iv['unit']), int)])
    return rows, len(VARS) + 3


def hgb_fit(rows, survey_col, seed, max_iter=300):
    cat = np.zeros(rows['X'].shape[1], bool)
    cat[survey_col] = True
    m = HistGradientBoostingRegressor(loss='poisson', learning_rate=0.08, max_iter=max_iter, max_leaf_nodes=31,
                                      min_samples_leaf=200, l2_regularization=1.0, categorical_features=cat,
                                      random_state=seed, early_stopping=False)
    m.fit(rows['X'], rows['y'] / rows['expo'], sample_weight=rows['expo'])
    return m


def hgb_predict(m, rows):
    rate = m.predict(rows['X'])
    mu = rate * rows['expo']
    return mu
