"""HCMST 2009-2017: do unmarried couples marry or break up? A before-the-wedding lens.

Takes the 1,081 couples who were partnered but NOT married at HCMST wave 1 (Feb-Apr 2009),
dating or cohabiting, different-sex or same-sex, and follows them through 2017. In each
follow-up period a couple still together and unmarried can marry, break up, or neither.
Two cause-specific discrete-time logistic models (marriage, break-up) are fitted on those
couple-periods with wave-1 inputs only, evaluated held out by couple (5-fold), and exported to
../../app/models/hcmst_dating_{marriage,breakup}.json with Python test vectors.

Inputs and break-up timing reuse ../hcmst/hcmst_data.py, so codings match the HCMST couples
lens; marriage timing comes from w{2..5}_q7 / w6_got_married and the reported wedding month.

Run from this folder after `sh download.sh`:  python3 train_models.py
"""
from pathlib import Path
import json, os, sys, warnings
import numpy as np, pandas as pd, pyreadstat, sklearn

HERE = Path(__file__).resolve().parent
os.environ.setdefault('HCMST_RAW', str(HERE / 'raw'))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / 'hcmst'))
import hcmst_data as H  # noqa: E402
from bundle_export import export  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, StandardScaler  # noqa: E402
from sklearn.tree import DecisionTreeRegressor, export_text  # noqa: E402

warnings.simplefilter('ignore')
SEED = 20261020
OUT = HERE.parent.parent / 'app' / 'models'
NP = 5
OFFSET = {str(p + 1): (H.CUT[p] - H.CUT[0]) / 12 for p in range(NP)}
NUMERIC = ['relationship_years', 'mean_age', 'age_gap', 'edu_years_mean', 'edu_gap', 'hh_income_k', 'children_in_hh']
CATEGORICAL = ['period', 'relationship_quality', 'cohabiting', 'couple_type', 'couple_race', 'prior_marriage',
               'parental_approval', 'religion_pair', 'how_met']
# HCMST 2017 did not ask about parents' approval or the partner's religion, so the external check
# uses an additive model without those two inputs (also usable when a person skips them).
HARMONIZED = [c for c in CATEGORICAL if c not in ('parental_approval', 'religion_pair')]
TIME_VARYING = ['relationship_years', 'mean_age']


def marriage_timing(ids):
    """For each wave-1 couple: the first follow-up wave reporting a wedding to the same partner,
    and the period it falls in (from the reported year and month where asked, waves 4-6)."""
    a, _ = pyreadstat.read_dta(str(Path(os.environ['HCMST_RAW']) / 'HCMST_ver_3.04.dta'), usecols=['caseid_new', 'w2_q7', 'w3_q7'])
    b, _ = pyreadstat.read_dta(str(Path(os.environ['HCMST_RAW']) / 'wave_4_supplement_v1_2.dta'), usecols=['caseid_new', 'w4_q7', 'w4_mar_year', 'w4_mar_month'])
    c, _ = pyreadstat.read_dta(str(Path(os.environ['HCMST_RAW']) / 'HCMST_wave_5_supplement_ver_1.dta'), usecols=['caseid_new', 'w5_q7', 'w5_mar_year', 'w5_mar_month'])
    d, md = pyreadstat.read_dta(str(Path(os.environ['HCMST_RAW']) / 'HCMST_wave_6_public_v1.dta'), usecols=['caseid_new', 'w6_got_married', 'w6_martiming_Year', 'w6_martiming_Month'])
    ylab = md.variable_value_labels['w6_martiming_Year']
    d['w6_mar_year'] = d.w6_martiming_Year.map(lambda v: float(ylab[v]) if v in ylab and str(ylab[v]).isdigit() else np.nan)
    m = a.merge(b, on='caseid_new').merge(c, on='caseid_new').merge(d, on='caseid_new', how='left').set_index('caseid_new')
    q7 = {2: 'w2_q7', 3: 'w3_q7', 4: 'w4_q7', 5: 'w5_q7', 6: 'w6_got_married'}
    date = {4: ('w4_mar_year', 'w4_mar_month'), 5: ('w5_mar_year', 'w5_mar_month'), 6: ('w6_mar_year', 'w6_martiming_Month')}
    out = {}
    for cid in ids:
        r = m.loc[cid]
        wave = next((k for k in range(2, 7) if r[q7[k]] == 1), None)
        if wave is None:
            continue
        period, dated = wave - 1, False
        if wave in date:
            y, mo = r[date[wave][0]], r[date[wave][1]]
            if y == y and 2008 < y < 2020:
                month = y * 12 + ((mo - 1) if mo == mo and 1 <= mo <= 12 else 6)
                period, dated = min(next((q for q in range(1, 6) if month <= H.CUT[q]), 5), wave - 1), True
        out[cid] = dict(marriage_wave=wave, marriage_period=period, marriage_dated=dated)
    return out


def build():
    couples, _, audit = H.couples_2009()
    un = couples[couples.married == 'No'].copy()
    assert len(un) == 1081, len(un)
    mt = marriage_timing(un.id)
    rows, fates = [], []
    for r in un.itertuples(index=False):
        mar = mt.get(r.id)
        b_last = r.last_period if r.outcome == 'breakup' else None
        if mar and (b_last is None or mar['marriage_period'] <= b_last):
            # Married first (a later break-up is a post-marriage dissolution, counted separately).
            fate, last = 'married', mar['marriage_period']
            post = 'broke up after marrying' if r.outcome == 'breakup' else 'together at last report'
        elif r.outcome == 'breakup':
            fate, last, post = 'broke_up', b_last, ''
        else:
            fate, last, post = ('partner_died' if r.outcome == 'partner_died' else 'censored'), r.last_period, ''
        for p in range(1, last + 1):
            ev = p == last
            rows.append(dict(id=r.id, period=str(p), marriage=int(ev and fate == 'married'), breakup=int(ev and fate == 'broke_up')))
        fates.append(dict(id=r.id, fate=fate, last_period=last, after_marriage=post,
                          marriage_dated=bool(mar and mar['marriage_dated'])))
    fates = pd.DataFrame(fates)
    pp = pd.DataFrame(rows).merge(un.drop(columns=['outcome', 'last_period']), on='id')
    for c in TIME_VARYING:
        pp[c] = pp[c] + pp.period.map(OFFSET)
    return un.merge(fates, on='id'), pp, audit


def pipeline(kind):
    cat = OneHotEncoder(drop='first', handle_unknown='ignore', sparse_output=False)
    if kind == 'period_only':
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), []),
                                  ('cat', cat, ['period'])])
        est = LogisticRegression(C=1e4, max_iter=5000)
    elif kind in ('additive', 'additive_harmonized'):
        num = Pipeline([('impute', SimpleImputer(strategy='median')), ('scale', StandardScaler())])
        prep = ColumnTransformer([('num', num, NUMERIC), ('cat', cat, CATEGORICAL if kind == 'additive' else HARMONIZED)])
        est = LogisticRegression(C=0.5, max_iter=5000)
    else:
        prep = ColumnTransformer([('num', Pipeline([('impute', SimpleImputer(strategy='median'))]), NUMERIC),
                                  ('cat', cat, CATEGORICAL)])
        est = DecisionTreeRegressor(max_depth=2, min_samples_leaf=150, random_state=SEED)
    return Pipeline([('prep', prep), ('fit', est)])


MODELS = [('period_only', 'Follow-up period only (baseline)'), ('additive', 'Additive logistic, wave-1 inputs'),
          ('additive_harmonized', 'Additive logistic without parental approval and religion (validated on HCMST 2017)'),
          ('tree_depth2', 'Decision tree, depth 2')]


def proba(pipe, X):
    return pipe.predict_proba(X)[:, 1] if hasattr(pipe.named_steps['fit'], 'predict_proba') else np.clip(pipe.predict(X), 1e-6, 1 - 1e-6)


def wlogloss(y, p, w):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return float(-np.sum(w * (y * np.log(p) + (1 - y) * np.log(1 - p))) / np.sum(w))


def evaluate(pp, target):
    rng = np.random.default_rng(SEED)
    ids = pp.id.unique().copy()
    rng.shuffle(ids)
    fold = pp.id.map({c: k % 5 for k, c in enumerate(ids)}).to_numpy()
    y, w = pp[target].to_numpy(), pp.weight.to_numpy()
    X = pp[NUMERIC + CATEGORICAL]
    preds = {'constant': np.zeros(len(pp))} | {k: np.zeros(len(pp)) for k, _ in MODELS}
    for f in range(5):
        tr, te = fold != f, fold == f
        preds['constant'][te] = np.average(y[tr], weights=w[tr])
        for k, _ in MODELS:
            preds[k][te] = proba(pipeline(k).fit(X[tr], y[tr], fit__sample_weight=w[tr]), X[te])
    base = wlogloss(y, preds['constant'], w)
    comp = []
    for k, p in preds.items():
        fs = [100 * (1 - wlogloss(y[fold == f], p[fold == f], w[fold == f]) / wlogloss(y[fold == f], preds['constant'][fold == f], w[fold == f])) for f in range(5)]
        comp.append(dict(target=target, model=k, logloss_improvement_percent=100 * (1 - wlogloss(y, p, w) / base),
                         fold_min=min(fs), fold_max=max(fs),
                         auc=roc_auc_score(y, p, sample_weight=w) if k != 'constant' else 0.5,
                         observed_expected=float(np.dot(w, y) / np.dot(w, p))))
    return pd.DataFrame(comp)


def cumulative(un_fates, pp, by=None):
    """Weighted cumulative incidence of marriage and of break-up (whichever comes first) by the
    end of each period: discrete-time Aalen-Johansen over the couple-periods."""
    groups = [('All unmarried couples', pp)] if by is None else [(f'{by}: {v}', g) for v, g in pp.groupby(by)]
    out = []
    for name, g in groups:
        s, cm, cb = 1.0, 0.0, 0.0
        rec = dict(group=name, couples=int(g.id.nunique()), marriages=int(g.marriage.sum()), breakups=int(g.breakup.sum()))
        for p in range(1, NP + 1):
            at = g[g.period == str(p)]
            if at.weight.sum() == 0:
                break
            hm = np.average(at.marriage, weights=at.weight)
            hb = np.average(at.breakup, weights=at.weight)
            cm += s * hm
            cb += s * hb
            s *= 1 - hm - hb
            yrs = round(H.PERIODS[p - 1]['years_since_start_at_end'], 1)
            rec[f'married_by_{yrs}y'] = round(cm, 4)
            rec[f'broke_up_by_{yrs}y'] = round(cb, 4)
        out.append(rec)
    return out


def outcomes_2017():
    """HCMST 2017 couples unmarried in July 2017, wave-1 inputs coded as for 2009 (via
    ../hcmst/hcmst_data.py), and whichever came first by the 2020 and 2022 waves: marrying the
    2017 partner, or breaking up with them. Partner deaths and couples not seen at the end of a
    window without an earlier event are left out of that window."""
    c, audit = H.couples_2017()
    raw, _ = pyreadstat.read_dta(str(Path(os.environ['HCMST_RAW']) / 'hcmst2017_2022_v2.2.dta'), encoding='cp1252',
                                 usecols=['caseid_new', 'w1_partnership_status', 'w2_married', 'w3_married', 'w2_relationship_end',
                                          'w3_relationship_end_combo', 'w3_breakup_source', 'w2_surveyed', 'w3_surveyed',
                                          'w3_partner_source', 'w3_when_married_yr'])
    raw = raw.rename(columns={'caseid_new': 'id'})
    raw['id'] = raw.id.astype(int)
    d = c[c.married == 'No'].merge(raw, on='id')
    assert (d.w1_partnership_status == 2).all() and len(d) == 777, len(d)
    e2, e3 = d.w2_relationship_end, d.w3_relationship_end_combo
    # By 2020: "Divorce" for a couple unmarried in 2017 means they married first.
    mar20 = (d.w2_surveyed == 1) & (((d.w2_married == 1) & (e2 == 0)) | (e2 == 1))
    brk20 = (d.w2_surveyed == 1) & (e2 == 2)
    died20 = (d.w2_surveyed == 1) & (e2 == 3)
    first3 = d.w3_breakup_source == 1
    # A wedding newly reported in 2022 is dated in w3_when_married_yr; w3_partner_type (and so
    # w3_married) was not updated for these 13 respondents, so the date plus w3_partner_source == 1
    # (the current partner is the 2017 partner) is what marks marrying the 2017 partner.
    same3 = d.w3_partner_source == 1
    new_mar3 = (d.w3_surveyed == 1) & same3 & ((d.w3_married == 1) | d.w3_when_married_yr.notna())
    mar22 = mar20 | (~brk20 & (new_mar3 | ((d.w3_surveyed == 1) & first3 & (e3 == 1))))
    brk22 = brk20 | ((d.w3_surveyed == 1) & ~mar20 & first3 & (e3 == 2))
    died22 = died20 | ((d.w3_surveyed == 1) & first3 & (e3 == 3) & ~mar20 & ~brk20)
    for yr, mar, brk, died, seen in [(2020, mar20, brk20, died20, d.w2_surveyed == 1),
                                     (2022, mar22, brk22, died22, (d.w3_surveyed == 1) | mar20 | brk20)]:
        known = (mar | brk | seen) & ~died
        d[f'married_by_{yr}'] = np.where(known, mar.astype(float), np.nan)
        d[f'broke_up_by_{yr}'] = np.where(known, (brk & ~mar).astype(float), np.nan)
    return d, audit


def predicted_cumulative(pipes_m, pipes_b, d, n_periods):
    """Cumulative P(married) and P(broke up first) over the first n periods, from today's inputs."""
    s, cm, cb = np.ones(len(d)), np.zeros(len(d)), np.zeros(len(d))
    for p in range(1, n_periods + 1):
        x = d.copy()
        x['period'] = str(p)
        for c in TIME_VARYING:
            x[c] = x[c] + OFFSET[str(p)]
        m = proba(pipes_m, x[NUMERIC + CATEGORICAL])
        b = proba(pipes_b, x[NUMERIC + CATEGORICAL])
        cm += s * m
        cb += s * b
        s *= np.clip(1 - m - b, 0, 1)
    return cm, cb


def external(fitted, ext):
    rows = []
    for yr, n in [(2020, 2), (2022, 3)]:
        for k in ('additive_harmonized', 'period_only', 'tree_depth2'):
            cm, cb = predicted_cumulative(fitted['marriage'][k], fitted['breakup'][k], ext, n)
            for target, pred in [('married', cm), ('broke_up', cb)]:
                y = ext[f'{target}_by_{yr}']
                ok = y.notna().to_numpy()
                yy, pp_, ww = y[ok].to_numpy(), pred[ok], ext.weight.to_numpy()[ok]
                rows.append(dict(window=f'2017 to {yr}', model_horizon_years=round(H.PERIODS[n - 1]['years_since_start_at_end'], 1),
                                 outcome=target, model=k, couples=int(ok.sum()), events=int(yy.sum()),
                                 observed_share_weighted=round(float(np.average(yy, weights=ww)), 4),
                                 predicted_share_weighted=round(float(np.average(pp_, weights=ww)), 4),
                                 auc=round(float(roc_auc_score(yy, pp_, sample_weight=ww)), 4) if 0 < yy.sum() < len(yy) else None))
    return pd.DataFrame(rows)


def main():
    un, pp, audit = build()
    fates = un.fate.value_counts().to_dict()
    post = un[un.fate == 'married'].after_marriage.value_counts().to_dict()
    events = pp.groupby('period')[['marriage', 'breakup']].sum().reset_index()
    events['at_risk'] = pp.groupby('period').size().to_numpy()
    events.to_csv(HERE / 'events_by_period.csv', index=False)

    comp = pd.concat([evaluate(pp, t) for t in ('marriage', 'breakup')])
    comp.to_csv(HERE / 'heldout_model_comparison.csv', index=False, float_format='%.5g')

    ci = cumulative(un, pp)
    for by in ['couple_type', 'relationship_quality', 'cohabiting', 'parental_approval']:
        ci += cumulative(un, pp, by)
    pd.DataFrame(ci).to_csv(HERE / 'cumulative_incidence.csv', index=False)

    X, w = pp[NUMERIC + CATEGORICAL], pp.weight.to_numpy()
    held = comp.set_index(['target', 'model'])
    support = {c: [float(pp[c].quantile(0.005)), float(pp[c].quantile(0.995))] for c in NUMERIC}
    labels = dict(marriage='marries the partner', breakup='breaks up (before any wedding)')
    fitted = {t: {k: pipeline(k).fit(X, pp[t].to_numpy(), fit__sample_weight=w) for k, _ in MODELS} for t in ('marriage', 'breakup')}
    ext, ext_audit = outcomes_2017()
    for c in ('parental_approval', 'religion_pair'):
        ext[c] = 'Unknown'  # not asked in 2017; only the harmonized model is scored on these couples
    extv = external(fitted, ext)
    extv.to_csv(HERE / 'external_validation_hcmst2017.csv', index=False)
    for target in ('marriage', 'breakup'):
        y = pp[target].to_numpy()
        pipes = fitted[target]
        lr = pipes['additive']
        names = lr.named_steps['prep'].get_feature_names_out()
        coef = lr.named_steps['fit'].coef_[0]
        sc = lr.named_steps['prep'].named_transformers_['num'].named_steps['scale'].scale_
        pd.DataFrame(dict(feature=names, coef=coef, odds_ratio_per_unit_or_vs_reference=np.exp(np.r_[coef[:len(sc)] / sc, coef[len(sc):]]))).to_csv(
            HERE / f'{target}_odds_ratios.csv', index=False, float_format='%.4f')
        (HERE / f'{target}_tree_depth2.txt').write_text(export_text(
            pipes['tree_depth2'].named_steps['fit'], feature_names=pipes['tree_depth2'].named_steps['prep'].get_feature_names_out().tolist(), decimals=3))
        key = f'hcmst_dating_{target}'
        bundle = dict(
            id=key, version=1,
            source='How Couples Meet and Stay Together (HCMST) 2009-2017, Stanford University (Rosenfeld, Thomas & Falcon 2018); public version 3.04 plus wave 4-6 supplements',
            population='U.S. adults in an unmarried couple (dating or cohabiting, different-sex or same-sex) in Feb-Apr 2009; one partner reports for both',
            target=f'Probability that a couple still together and unmarried at the start of a follow-up period {labels[target]} during that period (cause-specific; periods of about 1.1, 1.1, 1.9, 1.75 and 2.6 years)',
            outcome='probability', stage='before',  # matches couple.js STAGES (#8713)
            training=dict(couples=int(pp.id.nunique()), couple_periods=len(pp), events=int(y.sum())),
            constant_probability=float(np.average(y, weights=w)),
            periods=H.PERIODS, time_offsets=OFFSET,
            how_to_combine=('With m_k and b_k the marriage and break-up models for period k (relationship_years and mean_age advanced by time_offsets), '
                            'still-dating S_k = S_{k-1} (1 - m_k - b_k); P(married by period k) = sum_j S_{j-1} m_j and P(broke up first) = sum_j S_{j-1} b_j. '
                            'The two models are fitted separately, so m_k + b_k can exceed what a joint model would give; treat sums as approximate. '
                            'After a wedding, hand over to a marriage lens (e.g. NSFG) for divorce.'),
            support=support,
            inputs={c: c for c in NUMERIC + CATEGORICAL} | dict(period='follow-up period 1-5 (see periods)',
                                                               relationship_years='years since the romance began, at the start of the period',
                                                               mean_age='mean of the two ages at the start of the period'),
            abstain=['couples already married', 'inputs outside support', 'horizons beyond period 5 (about 8.4 years)'],
            models=[dict(key=k, label=lbl, heldout=dict(
                logloss_improvement_percent=round(float(held.loc[(target, k), 'logloss_improvement_percent']), 3),
                deviance_improvement_percent=round(float(held.loc[(target, k), 'logloss_improvement_percent']), 3),
                auc=round(float(held.loc[(target, k), 'auc']), 4)), **export(pipes[k])) for k, lbl in MODELS],
            cumulative_incidence=ci[:1],
            external_validation=json.loads(extv[extv.outcome == ('married' if target == 'marriage' else 'broke_up')].to_json(orient='records')),
            sklearn=sklearn.__version__)
        (OUT / f'{key}.json').write_text(json.dumps(bundle, separators=(',', ':')))
        rng = np.random.default_rng(SEED)
        lev = {c: sorted(pp[c].astype(str).unique()) for c in CATEGORICAL}
        rows = []
        for i in range(40):
            rr = {c: str(rng.choice(lev[c])) for c in CATEGORICAL}
            for c in NUMERIC:
                lo, hi = support[c]
                rr[c] = None if (i % 9 == 0 and c == 'hh_income_k') else float(rng.uniform(lo, hi))
            rows.append(rr)
        t = pd.DataFrame(rows)
        (OUT / f'{key}_testvectors.json').write_text(json.dumps(dict(
            rows=json.loads(t.replace({np.nan: None}).to_json(orient='records')),
            predictions={k: [float(v) for v in proba(pipes[k], t)] for k in pipes})))

    summary = dict(couples_unmarried_2009=len(un), fates=fates, after_marriage=post,
                   couple_periods=len(pp), marriages=int(pp.marriage.sum()), breakups_before_marriage=int(pp.breakup.sum()),
                   marriages_dated=int(un.marriage_dated.sum()), hcmst_counts=audit,
                   hcmst2017=dict(unmarried_couples=len(ext), counts=ext_audit,
                                  known_2020=int(ext.married_by_2020.notna().sum()), married_by_2020=int(ext.married_by_2020.sum()),
                                  broke_up_by_2020=int(ext.broke_up_by_2020.sum()), known_2022=int(ext.married_by_2022.notna().sum()),
                                  married_by_2022=int(ext.married_by_2022.sum()), broke_up_by_2022=int(ext.broke_up_by_2022.sum())),
                   python_sklearn=sklearn.__version__)
    (HERE / 'sample_audit.json').write_text(json.dumps(summary, indent=1, default=int) + '\n')
    print(json.dumps(summary, indent=1, default=int))
    print(events.to_string(index=False))
    print(comp.round(4).to_string(index=False))
    print(pd.DataFrame(ci).to_string(index=False))
    print(extv.to_string(index=False))


if __name__ == '__main__':
    main()
