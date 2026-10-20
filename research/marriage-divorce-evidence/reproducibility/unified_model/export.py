"""Final fit on every unit, posterior summaries and checks, and the browser bundle.

  python3 -I export.py WORK

Writes (next to this file): coefficients.csv, survey_deviations.csv, posterior_predictive_check.csv,
outcome_layer.csv, missing_input_check.json, fit_summary.json; and app/models/unified_multisurvey.json
with app/models/unified_multisurvey_testvectors.json (synthetic profiles only).
"""
import json, os, sys, time
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path[:0] = [str(HERE), str(ROOT / 'app' / 'tools'), str(ROOT / 'reproducibility' / 'sipp_marital_history')]
import common, glm, mice, score  # noqa: E402
from design import NB, BANDS, BAND_LABELS, SURVEY_KEYS, SPLINE_TF, ONEHOT, LINEAR, BINARY, followup  # noqa: E402
from harmonize import VARS, SURVEYS, UNION_TYPES  # noqa: E402
import ood as ood_tool  # noqa: E402
import survival_utils as su  # noqa: E402
import report  # noqa: E402

SEED = 20261020
M_FINAL = int(os.environ.get('UM_M_FINAL', 10))
ITERS = int(os.environ.get('UM_ITERS', 6))
S_EXPORT = 200
OUT = ROOT / 'app' / 'models'


def sig(x, k=7):
    return float(f'{x:.{k}g}')


def per_unit_scale(design, j):
    """Divide a standardised coefficient by this to get the log rate ratio per unit of the input."""
    return design.scale[j]


def coefficient_table(F, meas, rng):
    L, ds = F.layout, F.design
    Th, _ = F.draws(1000, rng)
    modes = np.array([th for th, _, _ in F.fits])
    W = np.mean([np.diag(np.linalg.inv(H)) for _, H, _ in F.fits], axis=0)
    Bv = modes.var(axis=0, ddof=1) if len(modes) > 1 else np.zeros(L.k)
    M = len(modes)
    fmi = (1 + 1 / M) * Bv / (W + (1 + 1 / M) * Bv)
    rows = []
    for j, (col, grp) in enumerate(zip(ds.columns, ds.groups)):
        i = L.ib[j]
        b = Th[:, i] / ds.scale[j]
        spline = grp in SPLINE_TF
        rows.append(dict(column=col, input=grp, log_rr_per_unit=None if spline else sig(np.mean(b), 5),
                         rr=None if spline else sig(np.exp(np.mean(b)), 4),
                         rr_lo=None if spline else sig(np.exp(np.percentile(b, 2.5)), 4),
                         rr_hi=None if spline else sig(np.exp(np.percentile(b, 97.5)), 4),
                         std_coef=sig(np.mean(Th[:, i]), 5), std_sd=sig(np.std(Th[:, i]), 4),
                         fraction_missing_info=round(float(fmi[i]), 3),
                         measured_in=' '.join(meas.get(grp, SURVEY_KEYS if grp in ('female', 'union_type', 'same_sex') else []))))
    dev = []
    for j, (name, s) in enumerate(ds.dev):
        i = L.id[j]
        b = Th[:, i] / ds.dev_scale[j]
        dev.append(dict(input=name, survey=s, deviation_log_rr_per_unit=sig(np.mean(b), 4),
                        lo=sig(np.percentile(b, 2.5), 4), hi=sig(np.percentile(b, 97.5), 4)))
    return pd.DataFrame(rows), pd.DataFrame(dev), fmi


def outcome_layer(comp):
    """Legal divorce vs any separation or divorce: log ratio of the two event counts by duration
    band, among surveys that record both on the same follow-up (NSFG, NLSY97, Canada, GSS)."""
    d, sp = comp[0]
    A = np.zeros(NB)
    Dv = np.zeros(NB)
    by = []
    for s in ['nsfg', 'nlsy97', 'canada_gss', 'gss_panel']:
        x = sp[sp.uid.isin(d.uid[d.survey == s]) & (sp.event == 1) & sp.divorce_event.notna()]
        b = np.clip(np.searchsorted(BANDS, np.where(x.kind == 'exact', x.t1 - 1e-9, (x.t0 + x.t1) / 2), side='right') - 1, 0, NB - 1)
        a = np.bincount(b, minlength=NB)
        dv = np.bincount(b, weights=x.divorce_event.to_numpy(float), minlength=NB)
        A += a
        Dv += dv
        for k in range(NB):
            by.append(dict(survey=s, band=BAND_LABELS[k], dissolutions=int(a[k]), legal_divorces=int(dv[k])))
    gam = np.log((Dv + 0.5) / (A + 0.5))
    tab = pd.DataFrame(by)
    return gam, tab, A, Dv


def conditional_stats(F, comp):
    """Per-population means and pooled within-survey covariance of the standardised main design."""
    P = F.design.n_main
    sums, cnt, cov = {}, {}, np.zeros((P, P))
    N = 0
    for d, _ in comp:
        X = F.X(d)[:, :P]
        s = d.survey.to_numpy()
        for sv in SURVEY_KEYS:
            m = s == sv
            Xm = X[m]
            mu = Xm.mean(0)
            sums[sv] = sums.get(sv, 0) + mu
            cnt[sv] = cnt.get(sv, 0) + 1
            Z = Xm - mu
            cov += Z.T @ Z
            N += m.sum() - 1
    cov /= N
    cov[np.diag_indices_from(cov)] += 1e-3
    means = {sv: (sums[sv] / cnt[sv]) for sv in SURVEY_KEYS}
    means['new'] = np.mean([means[s] for s in SURVEY_KEYS], axis=0)
    return means, cov


def observed_design(F, U):
    """Main design of the units' OWN answers (exact values only; NaN where not given)."""
    ds = F.design
    cols = []
    for v in SPLINE_TF:
        x = U[v].to_numpy(float)
        f = SPLINE_TF[v].transform(np.nan_to_num(x, nan=30.0 if v == 'age_at_marriage' else 1990.0)[:, None])
        f[np.isnan(x)] = np.nan
        cols.append(f)
    for v, levels in ONEHOT.items():
        x = U[v].to_numpy(object)
        miss = pd.isna(U[v]).to_numpy()
        f = np.column_stack([(x == lv) for lv in levels[1:]]).astype(float)
        f[miss] = np.nan
        cols.append(f)
    for v in LINEAR + BINARY:
        cols.append(U[v].to_numpy(float)[:, None])
    ut = U.union_type.to_numpy()
    cols.append(np.column_stack([(ut == u) for u in UNION_TYPES[1:]]).astype(float))
    cols.append(U[['female', 'same_sex']].to_numpy(float))
    X = (np.hstack(cols) - ds.mean) / ds.scale
    return X


def gaussian_vs_mi(F, comp, U, means, cov, rng, n=4000):
    """Rate under the posterior mode: multiple imputation (mean over completed data sets) against
    the browser's treatment (Gaussian conditional of the design columns, integrated in closed
    form), for units that have some inputs missing."""
    L = F.layout
    th = np.mean([t for t, _, _ in F.fits], axis=0)
    beta = th[L.ib]
    idx = rng.choice(len(U), n, replace=False)
    Xo = observed_design(F, U.iloc[idx])
    mi = np.zeros(n)
    for d, _ in comp:
        X = F.X(d.iloc[idx])[:, :F.design.n_main]
        mi += np.exp(X @ beta)
    mi /= len(comp)
    ga = np.zeros(n)
    surveys = U.survey.iloc[idx].to_numpy()
    for i in range(n):
        x = Xo[i]
        mu = means[surveys[i]]
        o = ~np.isnan(x)
        m = ~o
        if m.any():
            Soo = cov[np.ix_(o, o)]
            r = np.linalg.solve(Soo, x[o] - mu[o])
            cm = mu[m] + cov[np.ix_(m, o)] @ r
            cc = cov[np.ix_(m, m)] - cov[np.ix_(m, o)] @ np.linalg.solve(Soo, cov[np.ix_(o, m)])
            lp = x[o] @ beta[o] + cm @ beta[m] + 0.5 * beta[m] @ cc @ beta[m]
        else:
            lp = x @ beta
        ga[i] = np.exp(lp)
    lr = np.log(ga / mi)
    out = dict(units=n, corr_log_rate=round(float(np.corrcoef(np.log(ga), np.log(mi))[0, 1]), 4),
               median_abs_log_ratio=round(float(np.median(np.abs(lr))), 4),
               p90_abs_log_ratio=round(float(np.percentile(np.abs(lr), 90)), 4),
               mean_log_ratio=round(float(lr.mean()), 4),
               by_survey={s: dict(n=int((surveys == s).sum()), median_abs_log_ratio=round(float(np.median(np.abs(lr[surveys == s]))), 4),
                                  corr=round(float(np.corrcoef(np.log(ga[surveys == s]), np.log(mi[surveys == s]))[0, 1]), 4)
                                  if (surveys == s).sum() > 5 else None)
                          for s in SURVEY_KEYS})
    return out


def ppc(F, comp, rng, per=20):
    """Posterior predictive check of event counts by survey and duration band."""
    obs = None
    sims = []
    for (th0, H, _), (d, sp) in zip(F.fits, comp):
        pp = common.Prepared(F, d, sp)
        s = d.survey.map(F.sidx).to_numpy()
        if obs is None:
            obs = np.zeros((F.layout.S, NB))
            np.add.at(obs, s, pp.Y)
            if len(pp.iv['unit']):
                np.add.at(obs, (s[pp.iv['unit']], pp.iv['band']), pp.iv['y'])
        for th in glm.draws(th0, H, per, rng):
            base, lp = pp.base_lp(th)
            ex = np.zeros((F.layout.S, NB))
            np.add.at(ex, s, pp.E * np.exp(base + lp[:, None]))
            if len(pp.iv['unit']):
                m = pp.iv['length'] * np.exp(base[pp.iv['unit'], pp.iv['band']] + lp[pp.iv['unit']])
                np.add.at(ex, (s[pp.iv['unit']], pp.iv['band']), -np.expm1(-m))
            sims.append(rng.poisson(ex))
    sims = np.array(sims)
    rows = []
    for i, sv in enumerate(F.train_surveys):
        for b in range(NB):
            x = sims[:, i, b]
            if obs[i, b] == 0 and x.max() == 0:
                continue
            lo, hi = np.percentile(x, [5, 95])
            rows.append(dict(survey=sv, band=BAND_LABELS[b], observed=int(obs[i, b]), predicted_mean=round(float(x.mean()), 1),
                             pi90_lo=float(lo), pi90_hi=float(hi), inside=bool(lo <= obs[i, b] <= hi),
                             p_value=round(float(min((x >= obs[i, b]).mean(), (x <= obs[i, b]).mean()) * 2), 3)))
    return pd.DataFrame(rows)


def population_references(work, U):
    """Standard-shape references from held-out (out-of-fold) predictions of the pooled model."""
    vd = Path(work) / 'val'
    refs = {}
    parts = []
    for k in range(5):
        p = vd / f'cv_{k}.npz'
        if p.exists():
            z = np.load(p, allow_pickle=True)
            parts.append(pd.DataFrame(dict(uid=z['uid'], survey=z['survey'], weight=z['weight'])).assign(_k=k, _i=np.arange(len(z['uid']))))
            parts[-1]['R'] = list(z['pooled_glm'])
    if not parts:
        return refs
    D = pd.concat(parts, ignore_index=True)
    attrs = U.set_index('uid').loc[D.uid]
    H = [5, 10, 20]
    for s in ['nsfg', 'nlsy79', 'nlsy97', 'sipp_retro', 'canada_gss']:
        m = (D.survey == s).to_numpy()
        R = np.vstack(D.R[m].to_numpy())
        risks = {h: -np.expm1(-report.window_hazard(R, np.zeros(len(R)), float(h))) for h in H}
        w = D.weight[m].to_numpy(float)
        qs = np.arange(1, 100) / 100
        overall = (int(m.sum()), [su.wquantiles(risks[h], w, qs) for h in H])
        subs = []
        a = attrs[m]
        for var, col, mapper in [('female', 'female', lambda x: {1.0: 'Woman', 0.0: 'Man'}.get(x)),
                                 ('race', 'race', lambda x: x if isinstance(x, str) else None)]:
            lv = a[col].map(mapper).to_numpy()
            for level in pd.unique(lv[pd.notna(lv)]):
                mm = lv == level
                if mm.sum() >= 100:
                    subs.append((var, level, int(mm.sum()), [su.wquantiles(risks[h][mm], w[mm], qs) for h in H]))
        refs[s] = su.standard_reference(H, overall, subs, source=f'{SURVEYS[s]["label"]}: held-out (out-of-fold) predictions of the pooled model with this survey\'s baseline',
                                        quantity='Chance the first marriage has dissolved by each horizon from the wedding (survey\'s own outcome definition)',
                                        model='pooled_glm', subgroup_defs={'female': dict(label='Sex', column='female_label'),
                                                                           'race': dict(label='Race and ethnicity', column='race')})
    return refs


def inputs_block(meas):
    out = []
    for v, spec in VARS.items():
        e = dict(name=v, label=spec['label'], kind=spec['kind'], measured_in=meas[v])
        if spec['kind'] == 'ord':
            e['levels'] = [dict(code=i, label=l) for i, l in enumerate(spec['levels'])]
        elif spec['kind'] == 'nom':
            e['levels'] = list(spec['levels'])
        elif spec['kind'] == 'bin':
            e['levels'] = [dict(code=0, label='No'), dict(code=1, label='Yes')]
        else:
            e['range'] = [float(spec['lo']), float(spec['hi'])]
        out.append(e)
    out.append(dict(name='female', label='Sex of the person described (1 = woman)', kind='bin', measured_in=list(SURVEY_KEYS),
                    levels=[dict(code=0, label='Man'), dict(code=1, label='Woman')]))
    out.append(dict(name='union_type', label='Kind of union', kind='nom', levels=list(UNION_TYPES), measured_in=['hcmst'],
                    note='Unmarried unions come from HCMST only; every other survey follows marriages.'))
    out.append(dict(name='same_sex', label='Same-sex couple', kind='bin', measured_in=['hcmst'],
                    levels=[dict(code=0, label='No'), dict(code=1, label='Yes')]))
    return out


def synthetic_profiles(bundle, rng, n=14):
    """Random synthetic profiles (never real rows): random subsets of inputs, random values."""
    out = []
    pops = list(bundle['populations'])
    for i in range(n):
        p = {}
        share = [0.0, 0.2, 0.5, 0.9, 1.0][i % 5]
        for inp in bundle['inputs']:
            if rng.random() > share:
                continue
            k = inp['kind']
            if k == 'num':
                lo, hi = inp['range']
                p[inp['name']] = round(float(rng.uniform(lo, hi)), 3)
            elif k in ('ord', 'bin'):
                p[inp['name']] = int(rng.choice([lv['code'] for lv in inp['levels']]))
            else:
                p[inp['name']] = str(rng.choice(inp['levels']))
        if 'age_at_marriage' in p:
            p['age_at_marriage'] = round(float(rng.uniform(15, 50)), 2)
        if 'wedding_year' in p:
            p['wedding_year'] = round(float(rng.uniform(1960, 2030)), 1)
        opts = dict(population=pops[i % len(pops)], outcome=['native', 'separation_or_divorce', 'legal_divorce'][i % 3],
                    start=[0, 0, 3.5, 12, 0.5][i % 5], horizons=[[5, 10, 20], [1, 2, 5], [2, 8.4], [10, 25, 40], [0.5, 3]][i % 5])
        out.append(dict(profile=p, opts=opts))
    return out


def main(work):
    t0 = time.time()
    work = Path(work)
    U = pd.read_parquet(work / 'units.parquet')
    S = pd.read_parquet(work / 'spells.parquet')
    tau = json.loads((work / 'tau.json').read_text())['tau']
    meas = common.measured(U)
    rng = np.random.default_rng(SEED)
    print(f'imputing {M_FINAL} chains', flush=True)
    comp = mice.impute(U, S, np.ones(len(U), bool), M_FINAL, SEED + 3, iters=ITERS)
    print(f'imputed {time.time() - t0:.0f}s; fitting', flush=True)
    F = common.Fitted(comp, SURVEY_KEYS, meas, tau)
    L, ds = F.layout, F.design
    print(f'fitted {time.time() - t0:.0f}s', flush=True)
    coefs, devs, fmi = coefficient_table(F, meas, rng)
    coefs.to_csv(HERE / 'coefficients.csv', index=False)
    devs.to_csv(HERE / 'survey_deviations.csv', index=False)
    gam, gtab, A, Dv = outcome_layer(comp)
    gtab.to_csv(HERE / 'outcome_layer.csv', index=False)
    pc = ppc(F, comp, rng)
    pc.to_csv(HERE / 'posterior_predictive_check.csv', index=False)
    means, cov = conditional_stats(F, comp)
    check = gaussian_vs_mi(F, comp, U, means, cov, rng)
    (HERE / 'missing_input_check.json').write_text(json.dumps(check, indent=1) + '\n')
    print('ppc inside 90%:', round(float(pc.inside.mean()), 3), 'gaussian vs MI:', check['median_abs_log_ratio'], flush=True)
    # Survey summaries.
    d0, sp0 = comp[0]
    pops = {}
    for i, s in enumerate(SURVEY_KEYS):
        g = d0[d0.survey == s]
        ev = sp0[sp0.uid.isin(g.uid)].event.sum()
        pops[s] = dict(label=SURVEYS[s]['label'], outcome='legal_divorce' if SURVEYS[s]['outcome'] == 'legal_divorce' else 'separation_or_divorce',
                       outcome_as_recorded=SURVEYS[s]['outcome'], timing=SURVEYS[s]['timing'], country=SURVEYS[s]['country'],
                       fitted=True, index=i, units=int(len(g)), events=int(ev),
                       mean_wedding_year=round(float(np.average(g.wedding_year, weights=g.weight)), 2))
    pops['new'] = dict(label='A population none of the surveys sampled: average baseline, no survey-specific terms',
                       outcome='separation_or_divorce', fitted=False, mean_wedding_year=1990.0)
    Th, per = F.draws(S_EXPORT, rng)
    lay = dict(g=[int(L.ig[0]), int(L.ig[-1]) + 1], a=[int(L.ia[0]), int(L.ia[-1]) + 1], r=[int(L.ir[0]), int(L.ir[-1]) + 1],
               c=[int(L.ic[0]), int(L.ic[-1]) + 1], beta=[int(L.ib[0]), int(L.ib[-1]) + 1],
               delta=[int(L.id[0]) if L.D else L.k, int(L.id[-1]) + 1 if L.D else L.k])
    splines = {}
    for v, st in SPLINE_TF.items():
        splines[v] = dict(degree=int(st.degree), knots=st.bsplines_[0].t.tolist(), include_bias=bool(st.include_bias), extrapolation='linear')
    deviation = []
    for j, (name, s) in enumerate(ds.dev):
        kind, lv = common.DEVIATION[name]
        deviation.append(dict(name=name, input=name.split(':')[0], kind=kind, level=lv, survey=s,
                              mean=sig(ds.dev_mean[j], 10), scale=sig(ds.dev_scale[j], 10)))
    # OOD on the inputs (imputed first chain), held-out percentiles by person folds.
    num = [v for v, sp in VARS.items() if sp['kind'] != 'nom'] + ['female', 'same_sex']
    cat = [v for v, sp in VARS.items() if sp['kind'] == 'nom'] + ['union_type']
    people = d0[num + cat].copy()
    for c in cat:
        people[c] = people[c].astype(str)
    levels = {c: [VARS[c]['levels'][0]] + [l for l in VARS[c]['levels'][1:]] if c in VARS else list(UNION_TYPES) for c in cat}
    fold = pd.factorize(d0.cluster)[0] % 5
    ood_spec, held, _ = ood_tool.build(people, fold, num, cat, levels)
    ood_spec['note'] = 'Distance from the stacked surveys\' units (imputed inputs, first chain); blank inputs count as the median.'
    refs = population_references(work, U)
    vs = {}
    for f in ['validation_summary.json']:
        if (HERE / f).exists():
            vs = json.loads((HERE / f).read_text())
    def table(name):
        try:
            return pd.read_csv(HERE / name).to_dict('records')
        except (FileNotFoundError, pd.errors.EmptyDataError):
            return []
    heldout, loso = table('heldout_by_survey.csv'), table('leave_one_survey_out.csv')
    bundle = dict(
        id='unified_multisurvey', kind='pooled_hazard', version='2026-10-20',
        title='Pooled multi-survey model (all surveys, partial pooling)',
        label='Pooled multi-survey model: nine surveys in one Bayesian hazard (U.S. and Canada, 1955–2025)',
        source=('NSFG 1995–2023, NLSY79, NLSY97, SIPP histories and couples, Statistics Canada GSS, GSS panels, HCMST 2009 '
                'and the Los Angeles newlyweds, stacked; the population is the survey whose baseline you choose'),
        target='Chance a union ends (separation or divorce; legal divorce via the outcome layer; any break-up for unmarried HCMST couples) within each horizon',
        training=dict(units=int(len(U)), events=int(sum(p['events'] for p in pops.values() if 'events' in p))),
        scorer='app/unified.js scoreUnified',
        description=('A Bayesian piecewise-exponential hazard of union dissolution fitted jointly on nine surveys with '
                     'person-level records. Effects are shared across surveys with survey-specific deviations; each survey keeps '
                     'its own baseline; inputs a survey did not ask are multiply imputed, so a survey that lacks an input neither '
                     'informs nor biases its effect. Blank inputs are integrated over.'),
        bands=BANDS[:-1].tolist() + [200.0], band_labels=BAND_LABELS,
        populations=pops, default_population='nsfg',
        outcome_layer=dict(legal_divorce=dict(log_ratio=[sig(x, 8) for x in gam],
                           note='Log ratio, by years married, of dissolutions recorded as legal divorces to all separations or divorces, '
                                'pooled over NSFG, NLSY97, Statistics Canada and GSS panels (same people, same follow-up). Applied to the '
                                'baseline when the chosen outcome differs from the population\'s own; covariate effects are assumed the same.',
                           dissolutions=A.astype(int).tolist(), legal_divorces=Dv.astype(int).tolist())),
        inputs=inputs_block(meas),
        design=dict(columns=ds.columns, groups=ds.groups, mean=[sig(x, 12) for x in ds.mean], scale=[sig(x, 12) for x in ds.scale],
                    splines=splines, onehot={k: [str(x) if not isinstance(x, str) else x for x in v] for k, v in ONEHOT.items()},
                    linear=LINEAR, binary=BINARY, union_types=list(UNION_TYPES), deviation=deviation,
                    unmeasured={s: sorted({ds.groups[j] for j in v}) for s, v in F.unmeasured.items()}),
        posterior=dict(method=f'Laplace approximation per imputation, {M_FINAL} imputations, equal mixture; {S_EXPORT} draws',
                       tau=tau, layout=lay, surveys=list(SURVEY_KEYS),
                       draws=[[sig(x) for x in row] for row in Th]),
        conditional=dict(method='Gaussian on the standardised design columns: per-population means, pooled within-survey covariance '
                                '(+0.001 ridge), from the completed (imputed) data',
                         mean={k: [sig(x, 9) for x in v] for k, v in means.items()},
                         cov=[[sig(x, 9) for x in row] for row in cov]),
        prng_seed=SEED,
        population_reference=refs.get('nsfg'),
        population_references=refs,
        ood=ood_spec,
        validation=dict(summary=vs, heldout_by_survey=heldout, leave_one_survey_out=loso,
                        missing_input_check=check, ppc_inside_90=round(float(pc.inside.mean()), 3)),
        how_to_combine='risk(h) = 1 - exp(-sum over bands of exp(baseline_band + lp + outcome shift) x years in band within (start, start + h])',
    )
    # Synthetic parity vectors scored with the rounded draws exactly as stored.
    bundle = json.loads(json.dumps(bundle))
    vecs = []
    for case in synthetic_profiles(bundle, np.random.default_rng(SEED + 5)):
        res = score.score(bundle, case['profile'], case['opts'])
        vecs.append(dict(case, expected=res))
    OUT.mkdir(exist_ok=True)
    (OUT / 'unified_multisurvey.json').write_text(json.dumps(bundle, separators=(',', ':')) + '\n')
    (OUT / 'unified_multisurvey_testvectors.json').write_text(json.dumps(dict(note='Synthetic profiles only (random values), never real rows.',
                                                                              cases=vecs), indent=0) + '\n')
    summary = dict(units=int(len(U)), surveys=len(SURVEY_KEYS), tau=tau, imputations=M_FINAL, parameters=int(L.k),
                   main_columns=int(ds.n_main), deviation_columns=int(len(ds.dev)), ppc_inside_90=round(float(pc.inside.mean()), 3),
                   events=int(sum(p['events'] for k, p in pops.items() if k != 'new')), seconds=round(time.time() - t0))
    (HERE / 'fit_summary.json').write_text(json.dumps(summary, indent=1) + '\n')
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main(sys.argv[1])
