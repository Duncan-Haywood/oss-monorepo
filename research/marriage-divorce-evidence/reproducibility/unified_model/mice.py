"""Multiple imputation by chained equations across the stacked surveys.

Each input is imputed from every other input (current values), the survey, the structural
facts (sex, union type, same-sex couple) and, for TRAINING units only, the outcome summaries
recommended for survival models (White & Royston 2009): the number of events and the
cumulative baseline hazard over the unit's follow-up. Held-out (test) units are imputed with a
parallel model that leaves the outcome out, fitted on training units only, so nothing about a
held-out person's outcome reaches their imputed inputs.

Properness: every conditional model is fitted to a bootstrap resample of the observed training
rows (approximate Bayesian bootstrap), so each imputation reflects parameter uncertainty.
  num / ord   predictive mean matching (5 donors) from a ridge linear model; donors must lie
              inside the unit's bounds (coarsened answers, e.g. "weekly or more" = codes 7-8;
              age at marriage no later than the age at observation);
  bin         logistic regression, Bernoulli draw;
  nom         multinomial logistic regression, draw restricted to the unit's allowed set.

Survey terms: dummies for the surveys that measure the input. A unit from a survey that never
measured it gets the average of those surveys' intercepts (equal weights), i.e. the imputation
assumes the input relates to everything else the same way it does where it was measured
(the transportability assumption; METHODS.md tests its consequences).
"""
import warnings
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression

from harmonize import VARS, SURVEYS, UNION_TYPES
from design import BANDS, NB, band_of, exposure_by_band

warnings.simplefilter('ignore')
FIT_N = 30000        # bootstrap sample size for each conditional model
DONORS = 40000       # donor pool cap for predictive mean matching
K_DONORS = 5
ORDER = list(VARS)   # visit order (cheap-to-explain: as listed in harmonize.VARS)


def _bounds(U, v):
    spec = VARS[v]
    n = len(U)
    lo = np.full(n, spec.get('lo', -np.inf) if spec['kind'] == 'num' else 0.0)
    hi = np.full(n, spec.get('hi', np.inf) if spec['kind'] == 'num' else (len(spec['levels']) - 1 if spec['kind'] == 'ord' else 1.0))
    if v + '__lo' in U:
        l, h = U[v + '__lo'].to_numpy(float), U[v + '__hi'].to_numpy(float)
        ok = ~np.isnan(l)
        lo[ok], hi[ok] = l[ok], h[ok]
    return lo, hi


class Imputer:
    def __init__(self, U, spells, train, seed, iters=6, verbose=False):
        """U: units (harmonize output); spells: their follow-up; train: bool mask over units."""
        self.U = U.reset_index(drop=True)
        self.spells = spells
        self.train = np.asarray(train, bool)
        self.rng = np.random.default_rng(seed)
        self.iters = iters
        self.verbose = verbose
        self.n = len(self.U)
        self.surveys = self.U.survey.to_numpy()
        self._sidx = pd.Index(list(SURVEYS)).get_indexer(self.surveys)
        self._prepare()

    # ------------------------------------------------------------------ setup
    def _prepare(self):
        U = self.U
        self.obs, self.val, self.lo, self.hi, self.allowed = {}, {}, {}, {}, {}
        for v, spec in VARS.items():
            if spec['kind'] == 'nom':
                lv = spec['levels']
                x = U[v].to_numpy(object)
                code = np.array([lv.index(a) if isinstance(a, str) and a in lv else -1 for a in x])
                allow = np.ones((self.n, len(lv)), bool)
                if v + '__set' in U:
                    sets = U[v + '__set'].to_numpy(object)
                    for i in np.where(pd.notna(sets))[0]:
                        allow[i] = [l in sets[i].split('|') for l in lv]
                self.obs[v] = code >= 0
                self.val[v] = code.astype(float)
                self.allowed[v] = allow
            else:
                x = U[v].to_numpy(float)
                self.obs[v] = ~np.isnan(x)
                self.val[v] = x.copy()
                self.lo[v], self.hi[v] = _bounds(U, v)
        # Units whose duration at entry is unknown get it from the imputed age at marriage.
        self.age_obs = U.age_obs.to_numpy(float).copy() if 'age_obs' in U else np.full(self.n, np.nan)
        for s in np.unique(self.surveys):             # a few GSS ages are missing: survey median
            m = (self.surveys == s) & np.isnan(self.age_obs)
            ok = (self.surveys == s) & ~np.isnan(self.age_obs)
            if m.any() and ok.any():
                self.age_obs[m] = np.median(self.age_obs[ok])
        self.obs_year = U.obs_year.to_numpy(float).copy() if 'obs_year' in U else np.full(self.n, np.nan)
        idx = pd.Index(U.uid)
        self.sp_unit = idx.get_indexer(self.spells.uid)
        t0 = self.spells.t0.to_numpy(float)
        self.t0_unknown = np.zeros(self.n, bool)
        self.t0_unknown[self.sp_unit[np.isnan(t0)]] = True
        hi = self.hi['age_at_marriage']
        hi[self.t0_unknown] = np.minimum(hi[self.t0_unknown], np.nan_to_num(self.age_obs[self.t0_unknown], nan=70.0))
        # Structural columns and survey dummies.
        st = [U.female.to_numpy(float), U.same_sex.to_numpy(float)]
        st += [(U.union_type.to_numpy() == u).astype(float) for u in UNION_TYPES[1:]]
        self.struct = np.column_stack(st)
        self._outcome_terms()
        self._init_values()

    def _outcome_terms(self):
        """Events and the survey's cumulative baseline hazard over each unit's follow-up, from
        training units only (piecewise-constant band rates; constant rate when t0 is unknown)."""
        sp = self.spells
        u = self.sp_unit
        tr = self.train[u]
        ev = sp.event.to_numpy(float)
        t0, t1 = sp.t0.to_numpy(float), sp.t1.to_numpy(float)
        length = np.where(np.isnan(t0), sp.length.to_numpy(float) if 'length' in sp else 2.0, t1 - t0)
        surveys = self.surveys[u]
        H = np.zeros(len(sp))
        for s in np.unique(surveys):
            m = surveys == s
            known = m & ~np.isnan(t0)
            mt = known & tr
            if mt.any():
                ex = exposure_by_band(t0[mt], t1[mt])
                mid = band_of((t0[mt] + t1[mt]) / 2) if SURVEYS[s]['timing'] == 'interval' else band_of(np.maximum(t1[mt] - 1e-9, 0))
                evb = np.bincount(mid, weights=ev[mt], minlength=NB)
                rate = (evb + 0.5) / (ex.sum(0) + 1.0)
                H[known] = exposure_by_band(t0[known], t1[known]) @ rate
            unk = m & np.isnan(t0)
            if unk.any():
                mt2 = m & tr
                rate = ev[mt2].sum() / max(length[mt2].sum(), 1e-9)
                H[unk] = rate * length[unk]
        self.E = np.bincount(u, weights=ev, minlength=self.n)
        self.H = np.bincount(u, weights=H, minlength=self.n)

    def _init_values(self):
        for v, spec in VARS.items():
            miss = ~self.obs[v]
            if not miss.any():
                continue
            if spec['kind'] == 'nom':
                p = np.bincount(self.val[v][self.obs[v] & self.train].astype(int), minlength=len(spec['levels'])) + 1.0
                pr = self.allowed[v][miss] * p
                pr /= pr.sum(1, keepdims=True)
                c = (pr.cumsum(1) > self.rng.random(miss.sum())[:, None]).argmax(1)
                self.val[v][miss] = c
            else:
                pool = self.val[v][self.obs[v] & self.train]
                if len(pool) == 0:
                    pool = np.array([0.0])
                draw = self.rng.choice(pool, miss.sum())
                self.val[v][miss] = np.clip(draw, self.lo[v][miss], self.hi[v][miss])
        self._derive()

    def _derive(self):
        """Duration at entry and wedding year for units whose timing comes from the age at marriage."""
        m = self.t0_unknown
        if m.any():
            t0 = np.clip(self.age_obs[m] - self.val['age_at_marriage'][m], 0, 70)
            self.val['wedding_year'][m] = self.obs_year[m] - t0
            self.unit_t0 = np.full(self.n, np.nan)
            self.unit_t0[m] = t0

    # ------------------------------------------------------------------ predictors
    def _encode(self, v):
        spec = VARS[v]
        x = self.val[v]
        if spec['kind'] == 'nom':
            K = len(spec['levels'])
            return np.column_stack([(x == k) for k in range(1, K)]).astype(np.float32)
        if spec['kind'] == 'num':
            o = self.obs[v] & self.train
            mu, sd = (x[o].mean(), x[o].std() + 1e-9) if o.any() else (0.0, 1.0)
            return ((x - mu) / sd)[:, None].astype(np.float32)
        if spec['kind'] == 'ord':
            return (x / max(len(spec['levels']) - 1, 1))[:, None].astype(np.float32)
        return x[:, None].astype(np.float32)

    def _meas(self, v):
        """Surveys with exact training answers (coarsened-only surveys get the average and their bounds)."""
        if v not in self._sc_cache:
            self._sc_cache[v] = [s for s in SURVEYS if (self.obs[v] & self.train & (self.surveys == s)).sum() >= 30]
        return self._sc_cache[v]

    def _survey_rows(self, v, rows):
        """Survey dummies (first measuring survey = reference) for some rows; units of surveys that
        never measured v get 1/K in each, i.e. the average of the measuring surveys' intercepts."""
        meas = self._meas(v)
        if len(meas) <= 1:
            return np.zeros((len(rows), 0), np.float32)
        sv = self.surveys[rows]
        cols = np.zeros((len(rows), len(meas) - 1), np.float32)
        for j, s in enumerate(meas[1:]):
            cols[sv == s, j] = 1
        cols[~np.isin(sv, meas)] = 1.0 / len(meas)
        return cols

    def _outcome_rows(self, v, rows):
        """Outcome terms interacted with the surveys that measure v exactly: an outcome-input
        relation learned in one survey's follow-up design is never applied to another survey."""
        meas = self._meas(v)
        sv = self.surveys[rows]
        B = np.zeros((len(rows), 3 * len(meas)), np.float32)
        for k, s in enumerate(meas):
            m = sv == s
            B[m, 3 * k:3 * k + 3] = self.O[rows][m]
        return B

    def _build_Z(self):
        """All inputs' current encodings side by side (updated in place as inputs are imputed)."""
        enc = {w: self._encode(w) for w in VARS}
        self.cols, parts, j = {}, [], 0
        for w in VARS:
            k = enc[w].shape[1]
            self.cols[w] = slice(j, j + k)
            parts.append(enc[w])
            j += k
        parts.append(self.struct.astype(np.float32))
        self.Z = np.hstack(parts)
        O = np.column_stack([self.E, np.log1p(self.H), self.H])
        self.O = ((O - O[self.train].mean(0)) / (O[self.train].std(0) + 1e-9)).astype(np.float32)

    def _update_Z(self, v):
        self.Z[:, self.cols[v]] = self._encode(v)

    def _A(self, v, rows, with_outcome):
        """Design for the fit rows only: other inputs, structural, survey dummies, outcome terms."""
        keep = np.ones(self.Z.shape[1], bool)
        keep[self.cols[v]] = False
        parts = [self.Z[rows][:, keep], self._survey_rows(v, rows)]
        if with_outcome:
            parts.append(self._outcome_rows(v, rows))
        return np.hstack(parts).astype(np.float64), keep

    def _lin_all(self, v, coef, keep, with_outcome):
        """Linear predictor for every unit from coefficients on the _A layout (no intercept)."""
        bz = np.zeros(self.Z.shape[1], np.float32)
        nz = keep.sum()
        bz[keep] = coef[:nz]
        out = (self.Z @ bz).astype(np.float64)
        meas = self._meas(v)
        k = max(len(meas) - 1, 0)
        if k:
            eff = np.r_[0.0, coef[nz:nz + k]]          # per measuring survey
            per = dict(zip(meas, eff))
            avg = eff.mean()
            out += np.array([per.get(s, avg) for s in SURVEYS])[self._sidx]
        if with_outcome:
            co = coef[nz + k:nz + k + 3 * len(meas)]
            for j, s in enumerate(meas):
                m = self.surveys == s
                out[m] += self.O[m] @ co[3 * j:3 * j + 3]
        return out

    # ------------------------------------------------------------------ one variable
    def _fit_rows(self, v, cap=FIT_N):
        """Bootstrap resample of the training rows that have an exact value of v."""
        o = np.where(self.obs[v] & self.train)[0]
        if len(o) == 0:
            return o
        return self.rng.choice(o, min(len(o), cap), replace=True)

    def _impute_var(self, v):
        spec = VARS[v]
        miss = ~self.obs[v]
        if not miss.any():
            return
        rows = self._fit_rows(v, FIT_N if spec['kind'] in ('num', 'ord') else FIT_N // 2)
        if len(rows) < 20:
            return
        # Training units of surveys that measure v use the outcome terms (learned within their
        # own survey); held-out units and surveys that never measured v are imputed without them.
        own = np.isin(self.surveys, self._meas(v))
        for with_outcome, target in ((True, miss & self.train & own), (False, miss & ~(self.train & own))):
            if not target.any():
                continue
            if spec['kind'] in ('num', 'ord'):
                self._pmm(v, rows, target, with_outcome)
            elif spec['kind'] == 'bin':
                self._logit(v, rows, target, with_outcome)
            else:
                self._multinom(v, rows, target, with_outcome)

    def _pmm(self, v, rows, target, with_outcome):
        y = self.val[v][rows]
        A, keep = self._A(v, rows, with_outcome)
        A1 = np.hstack([np.ones((len(rows), 1)), A])
        lam = 1e-3 * len(rows)
        beta = np.linalg.solve(A1.T @ A1 + lam * np.eye(A1.shape[1]), A1.T @ y)
        lin = beta[0] + self._lin_all(v, beta[1:], keep, with_outcome)
        donors_all = np.where(self.obs[v] & self.train)[0]
        donors = self.rng.choice(donors_all, min(len(donors_all), DONORS), replace=False)
        dy = lin[donors]
        dv = self.val[v][donors]
        order = np.argsort(dy)
        dy, dv = dy[order], dv[order]
        t = np.where(target)[0]
        ty = lin[t]
        lo, hi = self.lo[v][t], self.hi[v][t]
        out = np.empty(len(t))
        if VARS[v]['kind'] == 'ord':
            # Group recipients by their bounds; match among donors inside the bounds.
            keys = lo * 100 + hi
            for kv in np.unique(keys):
                g = keys == kv
                ok = (dv >= lo[g][0]) & (dv <= hi[g][0])
                if not ok.any():
                    out[g] = np.clip(np.round(ty[g]), lo[g][0], hi[g][0])
                    continue
                out[g] = self._match(dy[ok], dv[ok], ty[g])
        elif not (lo > VARS[v].get('lo', -np.inf)).any() and not (hi < VARS[v].get('hi', np.inf)).any():
            out = self._match(dy, dv, ty)                       # no unit-specific bounds
        else:
            # Unit-specific bounds (age at marriage <= age at observation): 24 nearest by
            # prediction, keep those inside the bounds, pick among 5.
            pos = np.clip(np.searchsorted(dy, ty), 0, len(dy) - 1)
            w = 24
            cand = np.clip(pos[:, None] + np.arange(-w // 2, w // 2)[None, :], 0, len(dy) - 1)
            cv = dv[cand]
            dist = np.abs(dy[cand] - ty[:, None])
            dist[(cv < lo[:, None]) | (cv > hi[:, None])] = np.inf
            ordd = np.argpartition(dist, K_DONORS, axis=1)[:, :K_DONORS]
            pick = ordd[np.arange(len(t)), self.rng.integers(0, K_DONORS, len(t))]
            chosen = cv[np.arange(len(t)), pick]
            bad = ~np.isfinite(dist[np.arange(len(t)), pick])
            chosen[bad] = np.clip(ty[bad], lo[bad], hi[bad])
            out = chosen
        self.val[v][t] = out

    def _match(self, dy, dv, ty):
        pos = np.clip(np.searchsorted(dy, ty), 0, len(dy) - 1)
        w = 2 * K_DONORS
        cand = np.clip(pos[:, None] + np.arange(-K_DONORS, K_DONORS)[None, :], 0, len(dy) - 1)
        dist = np.abs(dy[cand] - ty[:, None])
        ordd = np.argsort(dist, axis=1)[:, :K_DONORS]
        pick = ordd[np.arange(len(ty)), self.rng.integers(0, K_DONORS, len(ty))]
        return dv[cand[np.arange(len(ty)), pick]]

    def _model(self, v, with_outcome):
        key = (v, with_outcome)
        if key not in self._models:
            self._models[key] = LogisticRegression(C=1.0, max_iter=200, tol=1e-4, warm_start=True)
        return self._models[key]

    def _logit(self, v, rows, target, with_outcome):
        y = self.val[v][rows]
        if y.min() == y.max():
            self.val[v][target] = y[0]
            return
        A, keep = self._A(v, rows, with_outcome)
        m = self._model(v, with_outcome)
        m.fit(A, y)
        lin = m.intercept_[0] + self._lin_all(v, m.coef_[0], keep, with_outcome)[target]
        p = 1 / (1 + np.exp(-lin))
        self.val[v][target] = (self.rng.random(len(p)) < p).astype(float)

    def _multinom(self, v, rows, target, with_outcome):
        K = len(VARS[v]['levels'])
        y = self.val[v][rows].astype(int)
        A, keep = self._A(v, rows, with_outcome)
        m = self._model(v, with_outcome)
        if hasattr(m, 'classes_') and len(np.unique(y)) != len(m.classes_):
            m = self._models[(v, with_outcome)] = LogisticRegression(C=1.0, max_iter=200, tol=1e-4, warm_start=True)
        m.fit(A, y)
        logits = np.full((target.sum(), K), -np.inf)
        for j, c in enumerate(m.classes_):
            logits[:, c] = m.intercept_[j] + self._lin_all(v, m.coef_[j], keep, with_outcome)[target]
        logits -= logits.max(1, keepdims=True)
        P = np.exp(logits) * self.allowed[v][target]
        bad = P.sum(1) <= 0
        P[bad] = self.allowed[v][target][bad]
        P /= P.sum(1, keepdims=True)
        self.val[v][target] = (P.cumsum(1) > self.rng.random(len(P))[:, None]).argmax(1)

    # ------------------------------------------------------------------ run
    def run(self):
        self._sc_cache, self._models = {}, {}
        for it in range(self.iters):
            self._build_Z()
            for v in ORDER:
                self._impute_var(v)
                self._update_Z(v)
                if v == 'age_at_marriage':
                    self._derive()
                    self._update_Z('wedding_year')
            if self.verbose:
                print(f'  iteration {it + 1}: mean age at marriage (imputed GSS) '
                      f'{np.nanmean(self.val["age_at_marriage"][self.surveys == "gss_panel"]):.2f}', flush=True)
        return self.completed()

    def completed(self):
        """Imputed units (labels restored) and spells with numeric t0/t1."""
        d = self.U[['uid', 'survey', 'cluster', 'weight', 'female', 'union_type', 'same_sex', 'sub']].copy()
        for v, spec in VARS.items():
            if spec['kind'] == 'nom':
                d[v] = np.array(spec['levels'], dtype=object)[self.val[v].astype(int)]
            else:
                d[v] = self.val[v]
        sp = self.spells.copy()
        unk = np.isnan(sp.t0.to_numpy(float))
        if unk.any():
            t0 = self.unit_t0[self.sp_unit[unk]]
            sp.loc[unk, 't0'] = t0
            sp.loc[unk, 't1'] = t0 + sp.length.to_numpy(float)[unk]
        return d, sp


def impute(U, spells, train, M, seed, iters=6, verbose=False):
    """M completed data sets [(units, spells)], each from its own chain."""
    out = []
    for m in range(M):
        imp = Imputer(U, spells, train, seed + 1009 * m, iters=iters, verbose=verbose)
        out.append(imp.run())
    return out
