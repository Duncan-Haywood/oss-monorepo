"""Shared encodings: duration bands, the analysis design matrix and the follow-up layout.

The analysis model works on UNITS (one row per union record) because every input is fixed at
the start of follow-up; duration enters only through the survey-specific baseline. Exact-time
follow-up is summarised per unit as exposure and events in each duration band (piecewise-
constant hazard = Poisson likelihood); interval-censored follow-up (panels) is kept per spell
(complementary log-log likelihood for "event somewhere in this spell").
"""
import numpy as np, pandas as pd
from sklearn.preprocessing import SplineTransformer

from harmonize import VARS, SURVEYS, UNION_TYPES

BANDS = np.array([0, 1, 2, 3, 5, 7, 10, 15, 20, 30, 1e9])   # years since the wedding
NB = len(BANDS) - 1
BAND_LABELS = ['0-1', '1-2', '2-3', '3-5', '5-7', '7-10', '10-15', '15-20', '20-30', '30+']
SURVEY_KEYS = list(SURVEYS)

# Spline inputs: uniform knots on fixed ranges (quantile knots repeat at piled-up values and
# break JS/sklearn parity), linear extrapolation outside.
SPLINES = {'age_at_marriage': (16.0, 45.0), 'wedding_year': (1955.0, 2025.0)}
N_KNOTS, DEGREE = 4, 3

# Reference level first for every nominal / one-hot ordinal input.
ONEHOT = {
    'race': ['White', 'Black', 'Hispanic', 'Asian', 'Other'],
    'religion_raised': ['Protestant', 'Catholic', 'None', 'Other'],
    'religion_now': ['Protestant', 'Catholic', 'None', 'Other'],
    'party': ['Independent or other', 'Democrat', 'Republican'],
    'region': ['South', 'Northeast', 'Midwest', 'West', 'Canada'],
    'educ': [1, 0, 2, 3, 4],            # high school is the reference
    'spouse_educ': [1, 0, 2, 3, 4],
    'mother_educ': [1, 0, 2, 3],
    'attend': [0, 1, 2, 3, 4, 5, 6, 7, 8],   # full GSS resolution, "never" is the reference
    'rel_quality': [2, 1, 0],          # very happy is the reference
}
LINEAR = ['abs_age_gap', 'pray', 'polviews', 'premarital_sex_years', 'premarital_partners', 'satisfaction_z',
          'hostility_z', 'negativity_z', 'log_income', 'log_earnings', 'net_worth', 'prestige', 'health',
          'mental_health', 'self_esteem', 'afqt', 'delinquency']
BINARY = ['foreign_born', 'interracial', 'intact_family', 'cohab_first', 'prior_union_other', 'premarital_birth',
          'married_before', 'spouse_married_before', 'spouse_prior_children', 'ever_unfaithful', 'home_owner',
          'employed', 'spouse_employed', 'urban']
STRUCT = ['female', 'same_sex']   # plus union-type dummies

# One "primary contrast" per input whose effect may differ between surveys (partial pooling).
DEVIATION = {
    'age_at_marriage': ('lin', None), 'abs_age_gap': ('lin', None), 'race': ('lvl', 'Black'), 'race:h': ('lvl', 'Hispanic'),
    'foreign_born': ('lin', None), 'educ': ('code', None), 'spouse_educ': ('code', None), 'interracial': ('lin', None),
    'intact_family': ('lin', None), 'mother_educ': ('code', None), 'religion_raised': ('lvl', 'None'), 'attend': ('code', None),
    'party': ('lvl', 'Republican'), 'cohab_first': ('lin', None), 'premarital_birth': ('lin', None),
    'married_before': ('lin', None), 'spouse_married_before': ('lin', None), 'spouse_prior_children': ('lin', None),
    'rel_quality': ('code', None), 'log_income': ('lin', None), 'net_worth': ('lin', None), 'home_owner': ('lin', None),
    'employed': ('lin', None), 'spouse_employed': ('lin', None), 'urban': ('lin', None), 'afqt': ('lin', None),
    'delinquency': ('lin', None), 'female': ('lin', None),
}


def spline_transformer(name):
    lo, hi = SPLINES[name]
    st = SplineTransformer(n_knots=N_KNOTS, degree=DEGREE, knots='uniform', extrapolation='linear', include_bias=False)
    st.fit(np.array([[lo], [hi]]))
    return st


SPLINE_TF = {k: spline_transformer(k) for k in SPLINES}


def band_of(t):
    return np.clip(np.searchsorted(BANDS, t, side='right') - 1, 0, NB - 1)


def exposure_by_band(t0, t1):
    """(n, NB) exposure in each band for follow-up (t0, t1]."""
    lo, hi = BANDS[:-1][None, :], BANDS[1:][None, :]
    return np.clip(np.minimum(t1[:, None], hi) - np.maximum(t0[:, None], lo), 0, None)


class Design:
    """Builds the unit-level analysis matrix from an imputed data frame (values filled in)."""

    def __init__(self, train_df, deviation_surveys=None):
        self.columns, self.groups = [], []          # column names and the input each belongs to
        for v in SPLINES:
            k = SPLINE_TF[v].n_features_out_
            self.columns += [f'{v}[s{j}]' for j in range(k)]
            self.groups += [v] * k
        for v, levels in ONEHOT.items():
            self.columns += [f'{v}={lv}' for lv in levels[1:]]
            self.groups += [v] * (len(levels) - 1)
        for v in LINEAR + BINARY:
            self.columns.append(v)
            self.groups.append(v)
        for u in UNION_TYPES[1:]:
            self.columns.append(f'union_type={u}')
            self.groups.append('union_type')
        self.columns += STRUCT
        self.groups += STRUCT
        raw = self._raw(train_df)
        self.mean = raw.mean(axis=0)
        self.scale = raw.std(axis=0)
        self.scale[self.scale < 1e-9] = 1.0
        self.n_main = len(self.columns)
        # Survey-deviation columns: only for surveys where the input is measured (not imputed).
        self.dev = []                                 # (name, survey)
        if deviation_surveys:
            for name in DEVIATION:
                for s in deviation_surveys.get(name.split(':')[0], []):
                    self.dev.append((name, s))
        self.dev_mean, self.dev_scale = None, None
        D = self._dev_raw(train_df)
        if D.shape[1]:
            self.dev_mean = np.zeros(D.shape[1])
            self.dev_scale = np.ones(D.shape[1])
            for j, (name, s) in enumerate(self.dev):
                m = (train_df.survey == s).to_numpy()
                col = D[m, j]
                self.dev_mean[j] = col.mean()
                self.dev_scale[j] = max(col.std(), 1e-9)

    def _raw(self, d):
        cols = []
        for v in SPLINES:
            x = d[v].to_numpy(float)[:, None]
            cols.append(SPLINE_TF[v].transform(x))
        for v, levels in ONEHOT.items():
            x = d[v].to_numpy()
            cols.append(np.column_stack([(x == lv) for lv in levels[1:]]).astype(float))
        for v in LINEAR + BINARY:
            cols.append(d[v].to_numpy(float)[:, None])
        ut = d.union_type.to_numpy()
        cols.append(np.column_stack([(ut == u) for u in UNION_TYPES[1:]]).astype(float))
        cols.append(d[STRUCT].to_numpy(float))
        return np.hstack(cols)

    def primary(self, d, name):
        v = name.split(':')[0]
        kind, lv = DEVIATION[name]
        if v in SPLINES or kind == 'lin':
            return d[v].to_numpy(float)
        if kind == 'code':
            return d[v].to_numpy(float)
        return (d[v].to_numpy() == lv).astype(float)

    def _dev_raw(self, d):
        if not self.dev:
            return np.zeros((len(d), 0))
        s = d.survey.to_numpy()
        return np.column_stack([np.where(s == sv, self.primary(d, name), 0.0) for name, sv in self.dev])

    def matrix(self, d):
        X = (self._raw(d) - self.mean) / self.scale
        if self.dev:
            D = self._dev_raw(d)
            s = d.survey.to_numpy()
            for j, (name, sv) in enumerate(self.dev):
                m = s == sv
                D[m, j] = (D[m, j] - self.dev_mean[j]) / self.dev_scale[j]
            X = np.hstack([X, D])
        return X


def followup(units, spells):
    """Unit-level exposure/events by band (exact surveys) and spell rows (interval surveys).

    `spells` must already carry numeric t0/t1 (derived ones filled in for GSS etc.)."""
    idx = pd.Index(units.uid)
    ui = idx.get_indexer(spells.uid)
    assert (ui >= 0).all()
    exact = (spells.kind == 'exact').to_numpy()
    n = len(units)
    E = np.zeros((n, NB))
    Y = np.zeros((n, NB))
    se = spells[exact]
    t0, t1 = se.t0.to_numpy(float), se.t1.to_numpy(float)
    ex = exposure_by_band(t0, t1)
    np.add.at(E, ui[exact], ex)
    ev = se.event.to_numpy() == 1
    b_end = band_of(np.maximum(t1 - 1e-9, 0))
    np.add.at(Y, (ui[exact][ev], b_end[ev]), 1.0)
    si = spells[~exact]
    mid = (si.t0.to_numpy(float) + si.t1.to_numpy(float)) / 2
    iv = dict(unit=ui[~exact], band=band_of(mid), length=(si.t1 - si.t0).to_numpy(float),
              y=si.event.to_numpy(float), t0=si.t0.to_numpy(float), t1=si.t1.to_numpy(float))
    return E, Y, iv
