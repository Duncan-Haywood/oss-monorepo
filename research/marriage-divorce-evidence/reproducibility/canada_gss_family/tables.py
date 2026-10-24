"""Design-based descriptive tables for the Canadian GSS Family lens (aggregates only).

  weighted_survival.csv        survey-weighted Kaplan-Meier: share of first marriages not yet
                               dissolved (separation or divorce) 1-20 years after the wedding,
                               with design-bootstrap 95% CIs at 5, 10 and 20 years
  canada_vs_us_survival.csv    the same for Canadian women against the U.S. NSFG 2002 bundle
  rate_ratios.csv              banded piecewise-constant Poisson models (main effects) with
                               design-bootstrap 95% CIs: the fixed-at-marriage model, and labelled
                               sensitivity models (interview-time education/religion; partner age
                               gap; 1995-only partner marital history)
  cohabitation_survival.csv    first common-law unions (DESCRIPTIVE, a different target)
  missingness_by_outcome.csv   share Unknown among dissolved vs intact marriages, per cycle

Design bootstrap: replicates perturb one group of cycles at a time (harmonise.bootstrap_variance):
1995 + 2017 (standard / person bootstrap) and 2006 + 2011 (mean bootstrap, x25).

Run: python3 tables.py [--quick]
"""
from pathlib import Path
import json, sys, time, pickle, warnings
import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import harmonise as H  # noqa: E402
import cohab  # noqa: E402

warnings.simplefilter('ignore')
QUICK = '--quick' in sys.argv
N_KM = 100 if QUICK else 500        # replicates per group for Kaplan-Meier CIs
N_RR = 20 if QUICK else 200         # replicates per group for rate-ratio CIs (refits)
YEARS = (1, 2, 3, 5, 10, 15, 20)
MAX_YEARS = 30.0
NSFG = HERE.parent.parent / 'app' / 'models' / 'nsfg2002_first_marriage.json'


def load_first_marriages():
    cache = HERE / 'work' / 'first_marriages.pkl'
    srcs = [HERE / 'harmonise.py']
    if cache.exists() and all(cache.stat().st_mtime > s.stat().st_mtime for s in srcs):
        return pickle.loads(cache.read_bytes())
    out = H.first_marriages()
    cache.parent.mkdir(exist_ok=True)
    cache.write_bytes(pickle.dumps(out))
    return out


# ------------------------------------------------------------------ Kaplan-Meier with replicates
def km_matrix(t, ev, W, years=YEARS):
    """Weighted KM survival at `years` for each column of the weight matrix W (n x R)."""
    order = np.argsort(t, kind='stable')
    t, ev, W = t[order], ev[order], W[order]
    times, idx = np.unique(t, return_index=True)
    d = np.add.reduceat(W * ev[:, None], idx, axis=0)
    leave = np.add.reduceat(W, idx, axis=0)
    at_risk = W.sum(axis=0) - np.vstack([np.zeros((1, W.shape[1])), np.cumsum(leave, axis=0)[:-1]])
    with np.errstate(divide='ignore', invalid='ignore'):
        s = np.cumprod(np.where(at_risk > 0, 1 - d / np.where(at_risk > 0, at_risk, 1), 1.0), axis=0)
    out = np.full((len(years), W.shape[1]), np.nan)
    for i, yr in enumerate(years):
        if yr > t.max():
            continue
        j = np.searchsorted(times, yr, side='right') - 1
        out[i] = 1.0 if j < 0 else s[j]
    return out


def design_reps(p, B, sel, n):
    """Weight matrices for the selected rows: (full, group-A replicates, group-B replicates)."""
    w = p.weight.to_numpy()[sel]
    g = p.boot_group.to_numpy()[sel]
    Bs = B[sel][:, :n].astype(np.float64)
    WA = np.repeat(w[:, None], n, axis=1)
    WB = WA.copy()
    WA[g == 'A'] = Bs[g == 'A']
    WB[g == 'B'] = Bs[g == 'B']
    return w, WA, WB


def km_with_ci(p, B, sel, event_col='event', years=YEARS, n=N_KM):
    sel = np.asarray(sel)
    t = p.t.to_numpy()[sel]
    ev = p[event_col].to_numpy()[sel].astype(float)
    w, WA, WB = design_reps(p, B, sel, n)
    est = km_matrix(t, ev, w[:, None], years)[:, 0]
    ra = km_matrix(t, ev, WA, years)
    rb = km_matrix(t, ev, WB, years)
    se = np.sqrt(H.bootstrap_variance(est, ra.T, rb.T))
    return est, se


def survival_rows(p, B, groups, label_n='marriages', label_ev='dissolutions', prefix='still_married', ci_years=(5, 10, 20),
                  extra_event=None):
    rows = []
    for name, sel in groups:
        sel = np.asarray(sel, bool)
        if sel.sum() < 30:
            continue
        est, se = km_with_ci(p, B, sel)
        r = {'group': name, label_n: int(sel.sum()), label_ev: int(p.event.to_numpy()[sel].sum())}
        for yr, e, s in zip(YEARS, est, se):
            r[f'{prefix}_{yr}y'] = e
            if yr in ci_years:
                r[f'{prefix}_{yr}y_ci95'] = '' if np.isnan(e) else f'{max(0, e - 1.96 * s):.4f}-{min(1, e + 1.96 * s):.4f}'
        if extra_event:
            est2, _ = km_with_ci(p, B, sel, event_col=extra_event, n=2)
            for yr, e in zip(YEARS, est2):
                if yr in ci_years:
                    r[f'not_divorced_{yr}y'] = e
        rows.append(r)
    return pd.DataFrame(rows)


def band(x, edges, labels):
    return pd.cut(x, edges, right=False, labels=labels).astype(str)


AGE_EDGES, AGE_LABELS = [0, 20, 25, 30, 35, 200], ['<20', '20-24', '25-29', '30-34', '35+']
WED_EDGES, WED_LABELS = [1950, 1970, 1980, 1990, 2000, 2010, 2030], ['1950-69', '1970-79', '1980-89', '1990-99', '2000-09', '2010-17']


def gap_band(g):
    return np.select([g.isna(), g <= -6, g <= -2, g < 2, g < 6], ['Unknown', 'Spouse 6+ years younger', 'Spouse 2-5 younger',
                                                                  'Within 1 year', 'Spouse 2-5 older'], 'Spouse 6+ years older')


def first_marriage_groups(p):
    g = [('All first marriages', np.ones(len(p), bool))]
    g += [(f'Respondent: {v.lower()}', p.respondent_sex == v) for v in ['Female', 'Male']]
    g += [(f'GSS {c}', p.cycle == c) for c in H.CYCLES]
    wed = band(p.wedding_year, WED_EDGES, WED_LABELS)
    g += [(f'Wedding {v}', wed == v) for v in WED_LABELS]
    ab = band(p.age_at_marriage, AGE_EDGES, AGE_LABELS)
    g += [(f'Age at marriage {v}', ab == v) for v in AGE_LABELS]
    for c, lab in [('cohabited_first', 'Lived together first'), ('prior_union', 'Earlier common-law union with someone else'),
                   ('premarital_birth', 'Child born before the wedding'), ('intact_family_15', 'Lived with both parents to 15'),
                   ('born_outside_canada', 'Born outside Canada')]:
        g += [(f'{lab}: {v}', p[c] == v) for v in ['Yes', 'No']]
    g += [(f'First language: {v}', p.first_language == v) for v in ['English', 'French', 'Other', 'Multiple']]
    g += [(f'Region (at interview): {v}', p.region == v) for v in ['Atlantic', 'Quebec', 'Ontario', 'Prairies', 'British Columbia']]
    for c, lab, levels in [('education_at_interview', 'Education at interview (timing caveat)',
                            ['Less than high school', 'High school', 'College/trade', 'Bachelor+']),
                           ('religion_at_interview', 'Religious affiliation at interview (timing caveat)', ['Affiliated', 'No affiliation']),
                           ('attendance_at_interview', 'Religious attendance at interview (timing caveat)',
                            ['Weekly', 'Monthly', 'Less than monthly', 'Not at all'])]:
        g += [(f'{lab}: {v}', p[c] == v) for v in levels]
    gb = gap_band(p.partner_age_gap)
    known = p.cycle.isin(['1995', '2011', '2017'])
    g += [(f'Spouse age gap (1995/2011/2017, known only; outcome-related missingness): {v}', known & (gb == v))
          for v in ['Spouse 6+ years younger', 'Spouse 2-5 younger', 'Within 1 year', 'Spouse 2-5 older', 'Spouse 6+ years older']]
    g += [(f'Spouse previously married (1995 only): {v}', (p.cycle == '1995') & (p.partner_prev_married == v)) for v in ['Yes', 'No']]
    g += [(f'Parents ever separated (1995, 2017): {v}', p.parents_ever_separated == v) for v in ['Yes', 'No']]
    q = p.region == 'Quebec'
    for v in ['1950-69', '1970-79', '1980-89', '1990-99', '2000-09']:
        g.append((f'Quebec, wedding {v}', q & (wed == v)))
        g.append((f'Outside Quebec, wedding {v}', ~q & (wed == v)))
    return g


# ------------------------------------------------------------------ banded Poisson rate ratios
DBANDS = [0, 2, 4, 6, 10, 15, 20, 30]
REF = dict(respondent_sex='Female', cohabited_first='No', prior_union='No', premarital_birth='No', intact_family_15='Yes',
           born_outside_canada='No', first_language='English', region='Ontario', survey_cycle='2017',
           age_band='20-24', wedding_period='1980-89', education_at_interview='High school',
           religion_at_interview='Affiliated', attendance_at_interview='Not at all', gap_band='Within 1 year',
           partner_prev_married='No', parents_ever_separated='No')


def band_exposure(p):
    t = np.minimum(p.t.to_numpy(), MAX_YEARS)
    ev = (p.event.to_numpy() == 1) & (p.t.to_numpy() <= MAX_YEARS)
    E = np.zeros((len(p), len(DBANDS) - 1))
    Y = np.zeros_like(E)
    for j, (a, b) in enumerate(zip(DBANDS[:-1], DBANDS[1:])):
        E[:, j] = np.clip(np.minimum(t, b) - a, 0, b - a)
        last = j == len(DBANDS) - 2
        Y[:, j] = ev & (t >= a) & ((t < b) | (last & (t <= b)))
    return E, Y


def rr_design(df, covs):
    """Patterns of banded covariates -> design (patterns x dummies) with explicit references."""
    pat = df[covs].astype(str)
    key = pat.agg('|'.join, axis=1)
    codes, uniq = pd.factorize(key)
    first = pd.Series(np.arange(len(df))).groupby(codes).first().to_numpy()
    up = pat.iloc[first].reset_index(drop=True)
    cols, names = [], []
    for c in covs:
        for lv in sorted(up[c].unique()):
            if lv == REF[c]:
                continue
            cols.append((up[c] == lv).to_numpy(float))
            names.append((c, lv))
    for c in covs:
        assert REF[c] in set(df[c].astype(str)), (c, REF[c])
    return codes, np.column_stack(cols), names


def fit_rr(codes, X, E, Y, w):
    npat, nb = X.shape[0], E.shape[1]
    Ec = np.column_stack([np.bincount(codes, weights=w * E[:, j], minlength=npat) for j in range(nb)])
    Yc = np.column_stack([np.bincount(codes, weights=w * Y[:, j], minlength=npat) for j in range(nb)])
    rows_p, rows_b = np.nonzero(Ec > 0)
    D = np.zeros((len(rows_p), nb - 1))
    for j in range(1, nb):
        D[rows_b == j, j - 1] = 1.0
    Z = np.hstack([X[rows_p], D])
    e, y = Ec[rows_p, rows_b], Yc[rows_p, rows_b]
    m = PoissonRegressor(alpha=0.0, max_iter=300, tol=1e-10, solver='newton-cholesky').fit(Z, y / e, sample_weight=e)
    return m.coef_[:X.shape[1]], m.coef_[X.shape[1]:]


def rate_ratio_table(p, B, covs, label, sel=None, n=N_RR):
    sel = np.ones(len(p), bool) if sel is None else np.asarray(sel)
    d = p[sel].reset_index(drop=True)
    E, Y = band_exposure(d)
    codes, X, names = rr_design(d, covs)
    w, WA, WB = design_reps(p, B, sel, n)
    beta, dur = fit_rr(codes, X, E, Y, w)
    ra = np.array([fit_rr(codes, X, E, Y, WA[:, r])[0] for r in range(n)])
    rb = np.array([fit_rr(codes, X, E, Y, WB[:, r])[0] for r in range(n)])
    se = np.sqrt(np.mean((ra - beta) ** 2, axis=0) + 25.0 * np.mean((rb - beta) ** 2, axis=0))
    ev = d.event.to_numpy()
    rows = []
    for (c, lv), b, s, j in zip(names, beta, se, range(len(names))):
        has = (d[c].astype(str) == lv).to_numpy()
        rows.append(dict(model=label, input=c, level=lv, reference=REF[c], marriages=int(has.sum()),
                         dissolutions=int(ev[has].sum()), rate_ratio=np.exp(b), ci95_low=np.exp(b - 1.96 * s),
                         ci95_high=np.exp(b + 1.96 * s), log_rr_se=s))
    return pd.DataFrame(rows)


# ------------------------------------------------------------------ main
def main():
    t0 = time.time()
    p, B, audit = load_first_marriages()
    p = p.copy()
    p['age_band'] = band(p.age_at_marriage, AGE_EDGES, AGE_LABELS)
    p['wedding_period'] = band(p.wedding_year, WED_EDGES, WED_LABELS)
    p['gap_band'] = gap_band(p.partner_age_gap)
    print('loaded', len(p), f'{time.time() - t0:.0f}s', flush=True)

    # Missingness of each input among dissolved vs intact marriages, per cycle.
    miss = []
    for c in ['cohabited_first', 'prior_union', 'intact_family_15', 'born_outside_canada', 'first_language',
              'education_at_interview', 'religion_at_interview', 'attendance_at_interview', 'gap_band', 'partner_prev_married']:
        for cy in H.CYCLES:
            q = p[p.cycle == cy]
            unk = q[c].isin(['Unknown'])
            if (q[c] == 'Not asked').all():
                continue
            miss.append(dict(input=c, cycle=cy, unknown_share_dissolved=float(unk[q.event == 1].mean()),
                             unknown_share_not_dissolved=float(unk[q.event == 0].mean())))
    pd.DataFrame(miss).to_csv(HERE / 'missingness_by_outcome.csv', index=False, float_format='%.4f')

    surv = survival_rows(p, B, first_marriage_groups(p), extra_event='divorced_only')
    surv.to_csv(HERE / 'weighted_survival.csv', index=False, float_format='%.4f')
    print(surv[['group', 'marriages', 'dissolutions', 'still_married_5y', 'still_married_10y', 'still_married_20y']]
          .round(3).to_string(index=False), flush=True)
    print(f'km done {time.time() - t0:.0f}s', flush=True)

    # Canada vs U.S. (NSFG 2002 bundle, women 15-44 in 2002-03, first marriages, separation counted).
    us = {r['group']: r for r in json.loads(NSFG.read_text())['weighted_survival']}
    fem = p.respondent_sex == 'Female'
    w7002 = fem & p.wedding_year.between(1970, 2002.99)
    young = p.age_interview < 45
    comp_groups = [
        ('All first marriages', 'Women, weddings 1970-2002', w7002),
        ('All first marriages', 'Women aged 15-44 at interview (GSS 1995 and 2006), weddings 1970-2002',
         w7002 & young & p.cycle.isin(['1995', '2006'])),
        ('Wedding 1970-1984', 'Women, weddings 1970-1984', fem & p.wedding_year.between(1970, 1984.99)),
        ('Wedding 1985-1994', 'Women, weddings 1985-1994', fem & p.wedding_year.between(1985, 1994.99)),
        ('Wedding 1995-2002', 'Women, weddings 1995-2002', fem & p.wedding_year.between(1995, 2002.99)),
        ('Wife married under 20', 'Women married under 20, weddings 1970-2002', w7002 & (p.age_at_marriage < 20)),
        ('Wife married 20-24', 'Women married 20-24, weddings 1970-2002', w7002 & p.age_at_marriage.between(20, 24.999)),
        ('Wife married 25-29', 'Women married 25-29, weddings 1970-2002', w7002 & p.age_at_marriage.between(25, 29.999)),
        ('Wife married 30+', 'Women married 30+, weddings 1970-2002', w7002 & (p.age_at_marriage >= 30)),
        ('Cohabited first: Yes', 'Women who lived together first, weddings 1970-2002', w7002 & (p.cohabited_first == 'Yes')),
        ('Cohabited first: No', 'Women who did not live together first, weddings 1970-2002', w7002 & (p.cohabited_first == 'No')),
    ]
    rows = []
    for us_group, ca_label, sel in comp_groups:
        est, se = km_with_ci(p, B, sel.to_numpy())
        u = us[us_group]
        r = dict(comparison=us_group, canada_group=ca_label, canada_marriages=int(sel.sum()),
                 canada_dissolutions=int(p.event[sel].sum()), us_group=f'NSFG 2002 women: {us_group}',
                 us_marriages=u['marriages'], us_dissolutions=u['dissolutions'])
        for yr in (5, 10, 20):
            i = YEARS.index(yr)
            r[f'canada_still_married_{yr}y'] = est[i]
            r[f'canada_{yr}y_ci95'] = f'{max(0, est[i] - 1.96 * se[i]):.4f}-{min(1, est[i] + 1.96 * se[i]):.4f}'
            r[f'us_still_married_{yr}y'] = u.get(f'still_married_{yr}y')
            r[f'difference_{yr}y_points'] = None if u.get(f'still_married_{yr}y') is None else 100 * (est[i] - u[f'still_married_{yr}y'])
        rows.append(r)
    cmp_df = pd.DataFrame(rows)
    cmp_df.to_csv(HERE / 'canada_vs_us_survival.csv', index=False, float_format='%.4f')
    print(cmp_df[['comparison', 'canada_still_married_10y', 'us_still_married_10y', 'canada_still_married_20y',
                  'us_still_married_20y']].round(3).to_string(index=False), flush=True)

    # Common-law unions (descriptive, different target).
    f, FB, caudit = cohab.first_cohabitations()
    f = f.copy()
    f['start_period'] = band(f.start_year, [1950, 1980, 1990, 2000, 2010, 2030], ['before 1980', '1980-89', '1990-99', '2000-09', '2010-17'])
    f['start_age_band'] = band(f.start, AGE_EDGES, AGE_LABELS)
    cg = [('All first common-law unions', np.ones(len(f), bool))]
    cg += [(f'GSS {c}', f.cycle == c) for c in H.CYCLES]
    cg += [(f'Respondent: {v.lower()}', f.respondent_sex == v) for v in ['Female', 'Male']]
    cg += [(f'Began living together {v}', f.start_period == v) for v in ['before 1980', '1980-89', '1990-99', '2000-09', '2010-17']]
    cg += [(f'Age at start {v}', f.start_age_band == v) for v in AGE_LABELS]
    cg += [('Region (at interview): Quebec', f.region == 'Quebec'), ('Region (at interview): outside Quebec', f.region != 'Quebec')]
    cg += [('Later married this partner (conditions on the future; descriptive only)', f.married),
           ('Never married this partner by end of follow-up (descriptive only)', ~f.married)]
    crow = survival_rows(f, FB, cg, label_n='unions', label_ev='separations', prefix='still_together')
    share_married = [float(np.average(f.married[np.asarray(s)], weights=f.weight[np.asarray(s)])) for _, s in cg
                     if np.asarray(s).sum() >= 30]
    crow['weighted_share_later_married_partner'] = share_married
    crow.to_csv(HERE / 'cohabitation_survival.csv', index=False, float_format='%.4f')
    print(crow[['group', 'unions', 'separations', 'still_together_1y', 'still_together_5y', 'still_together_10y']]
          .round(3).to_string(index=False), flush=True)
    (HERE / 'work' / 'cohab_audit.json').write_text(json.dumps(caudit, indent=1))
    print(f'cohab done {time.time() - t0:.0f}s', flush=True)

    # Rate ratios.
    base = ['age_band', 'wedding_period', 'respondent_sex', 'cohabited_first', 'prior_union', 'premarital_birth',
            'intact_family_15', 'born_outside_canada', 'first_language', 'region', 'survey_cycle']
    tabs = [rate_ratio_table(p, B, base, 'fixed_at_marriage')]
    print(f'rr main done {time.time() - t0:.0f}s', flush=True)
    tabs.append(rate_ratio_table(p, B, base + ['education_at_interview', 'religion_at_interview', 'attendance_at_interview'],
                                 'sensitivity_interview_time_education_religion'))
    tabs.append(rate_ratio_table(p, B, base + ['gap_band'], 'sensitivity_partner_age_gap_1995_2011_2017',
                                 sel=p.cycle.isin(['1995', '2011', '2017']).to_numpy()))
    b95 = [c for c in base if c != 'survey_cycle']
    tabs.append(rate_ratio_table(p, B, b95 + ['partner_prev_married', 'parents_ever_separated'],
                                 'sensitivity_1995_partner_prev_married_parents_separated',
                                 sel=((p.cycle == '1995') & (p.partner_prev_married != 'Unknown')).to_numpy()))
    rr = pd.concat(tabs, ignore_index=True)
    rr.to_csv(HERE / 'rate_ratios.csv', index=False, float_format='%.4f')
    print(rr.round(3).to_string(index=False))
    print(f'total {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
