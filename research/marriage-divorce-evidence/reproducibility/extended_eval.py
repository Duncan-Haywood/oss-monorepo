"""Shared helpers for the 2026-10-20 predictor extensions (race detail, family of origin,
religion and politics, occupation, wealth) across the lenses.

- `cluster_gain_table`: held-out gain over a constant model for several candidate models scored
  on the SAME held-out rows, with person-cluster bootstrap 95% CIs for each gain and for each
  model's difference from a reference model (paired: every replicate resamples the same people
  for all models). Inputs are per-row held-out losses already multiplied by the survey weight
  (Bernoulli log loss, or Poisson deviance), so any lens's metric fits.
- `poisson_deviance_rows`, `logloss_rows`: those per-row losses.
- `HARMONIZED_COLUMNS` and `write_harmonized`: the shared person-period schema the extension
  scripts write OUTSIDE the repository (scratch directory in $HARMONIZED_DIR) for pooled modelling.
  Nothing person-level is ever written inside the repository.
"""
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd


def logloss_rows(y, p, w):
    p = np.clip(np.asarray(p, float), 1e-12, 1 - 1e-12)
    y = np.asarray(y, float)
    return -np.asarray(w, float) * (y * np.log(p) + (1 - y) * np.log(1 - p))


def poisson_deviance_rows(y, e, w, rate):
    """Weighted Poisson unit deviance of events y over exposure e at predicted rate."""
    y = np.asarray(y, float)
    mu = np.maximum(np.asarray(rate, float) * np.asarray(e, float), 1e-300)
    t = np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0.0)
    return 2 * np.asarray(w, float) * (t - (y - mu))


def cluster_gain_table(clusters, losses, constant='constant', reference=None, reps=1000, seed=20261020):
    """losses: dict name -> per-row weighted loss (same rows). Returns one row per model with the
    gain % vs `constant` and, when `reference` is given, the difference in gain points
    (model minus reference), each with a cluster-bootstrap 95% CI."""
    codes, uniq = pd.factorize(pd.Series(clusters).astype(str))
    G = len(uniq)
    sums = {k: np.bincount(codes, weights=np.asarray(v, float), minlength=G) for k, v in losses.items()}
    rng = np.random.default_rng(seed)
    gains = {k: [] for k in losses}
    for _ in range(reps):
        cnt = np.bincount(rng.integers(0, G, G), minlength=G).astype(float)
        base = cnt @ sums[constant]
        for k in losses:
            gains[k].append(100 * (1 - (cnt @ sums[k]) / base))
    point = {k: 100 * (1 - sums[k].sum() / sums[constant].sum()) for k in losses}
    rows = []
    for k in losses:
        b = np.array(gains[k])
        r = dict(model=k, gain_percent=point[k], gain_ci95_low=float(np.percentile(b, 2.5)),
                 gain_ci95_high=float(np.percentile(b, 97.5)))
        if reference is not None:
            d = b - np.array(gains[reference])
            r.update(diff_vs_reference_points=point[k] - point[reference],
                     diff_ci95_low=float(np.percentile(d, 2.5)), diff_ci95_high=float(np.percentile(d, 97.5)),
                     reference=reference)
        rows.append(r)
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------------------------
# Harmonized person-period schema (for a pooled multi-survey model built elsewhere). Every lens
# writes these columns; a predictor the survey did not measure is NaN and is absent from that
# lens's `measured` list (written next to the parquet as <lens>.measured.json).
# --------------------------------------------------------------------------------------------
HARMONIZED_COLUMNS = {
    # ids and design
    'lens': 'lens id (bundle id)',
    'person_id': 'respondent id within the lens (string)',
    'couple_id': 'couple id when the unit is a couple, else NaN',
    'cluster_id': 'resampling cluster (respondent, or household)',
    'weight': 'survey weight normalised to mean 1 over the lens rows',
    'unit': "'person_period' (one row per marriage-year interval), 'transition' (married at one wave, status at the next) or 'person'",
    'outcome': 'outcome definition (text, same for every row of a lens)',
    # time
    't_start': 'years since the wedding at the start of the row (NaN when the lens has no wedding date)',
    't_end': 'years since the wedding at the end of the row',
    'exposure': 'years at risk in the row',
    'event': '1 if the marriage ended (as `outcome` defines) within the row',
    'calendar_year': 'calendar year at the start of the row',
    'wedding_year': 'calendar year of the wedding (NaN if unknown)',
    'marriage_order': "'first' or 'any' (lens population)",
    # person
    'sex': "'Woman' or 'Man'",
    'age': 'age in years at the start of the row',
    'age_at_marriage': 'age at this wedding',
    'race_eth': "'White','Black','Hispanic','Asian','American Indian or Alaska Native','Native Hawaiian or Pacific Islander','Multiracial','Other' (NaN if not measured; see race_eth_detail_measured)",
    'race_eth_coarse': "the lens's own published race grouping (text)",
    'education': "'Less than high school','High school','Some college','Bachelor','Graduate'",
    'married_before': '1 if this is not a first marriage',
    'cohabited_first': '1 if the couple lived together before the wedding',
    'children_before': '1 if the respondent had a child before the wedding',
    'premarital_conception': '1 if a birth came within 7 months after the wedding',
    'family_origin': "'Both parents','Parents divorced or separated','Parent died','Never-married single parent','Stepfamily','Single parent, reason not known','Other' (growing up; age varies by lens; a lens uses only the levels its data separate)",
    'intact_family': '1 if lived with both (biological or adoptive) parents growing up',
    'attend': "religious service attendance, common 6-level: 'Never','Less than monthly','About monthly','2-3 times a month','Weekly','More than weekly'",
    'attend_weekly': '1 if weekly or more',
    'religion': "'None','Catholic','Protestant','Jewish','Other'",
    'religion_raised': 'same coding as religion, for the religion the person was raised in',
    'religion_importance': "'Very important','Somewhat important','Not important' (or the lens's closest item)",
    'pray': "'Several times a day','Once a day','Several times a week','Once a week','Less than weekly','Never'",
    'polviews': 'political views 1 extremely liberal ... 7 extremely conservative',
    'party': "'Democrat','Independent','Republican','Other'",
    'family_income_2024usd': 'household income in 2024 dollars (CPI-U)',
    'net_worth_2024usd': 'household net worth in 2024 dollars',
    'home_owner': '1 if owns the home',
    'occupation_group': "'Management, business, science and arts','Service','Sales and office','Natural resources, construction and maintenance','Production, transportation and material moving','Military','Not working'",
    'earnings_2024usd': "own earnings in 2024 dollars",
    'hapmar': "'Very happy','Pretty happy','Not too happy' (marriage happiness)",
    'region': "U.S. Census region or Canadian region (text)",
    'country': "'US' or 'Canada'",
}


def write_harmonized(df, lens, measured, notes=None):
    """Write $HARMONIZED_DIR/<lens>.parquet (scratch, never committed) with the shared columns."""
    out = os.environ.get('HARMONIZED_DIR')
    if not out:
        return None
    out = Path(out)
    root = Path(__file__).resolve().parents[3]
    if root in out.resolve().parents:
        raise SystemExit('HARMONIZED_DIR must be outside the repository (person-level rows never go in git)')
    out.mkdir(parents=True, exist_ok=True)
    d = pd.DataFrame(index=df.index)
    for c in HARMONIZED_COLUMNS:
        d[c] = df[c] if c in df else np.nan
    d['lens'] = lens
    extra = [c for c in df.columns if c.startswith('x_')]
    for c in extra:  # lens-specific extras keep an x_ prefix
        d[c] = df[c]
    bad = [m for m in measured if m not in HARMONIZED_COLUMNS]
    if bad:
        raise ValueError(f'unknown harmonized columns {bad}')
    for c in d.columns:
        if d[c].dtype == object:
            d[c] = d[c].astype('string')
    d.reset_index(drop=True).to_parquet(out / f'{lens}.parquet', index=False)
    (out / f'{lens}.measured.json').write_text(json.dumps(dict(lens=lens, rows=len(d), measured=list(measured),
                                                               extras=extra, notes=notes or []), indent=1))
    return out / f'{lens}.parquet'
