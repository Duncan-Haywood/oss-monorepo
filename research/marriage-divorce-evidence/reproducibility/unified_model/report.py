"""Held-out metrics for every survey and model from the validation tasks (validate.py).

Loss: Poisson deviance of each held-out unit's events in each duration band (exact-time
follow-up) plus Bernoulli deviance of each interval spell; units weighted by their survey
weight (mean 1 within survey). Gain = 1 - deviance(model) / deviance(duration-only), where
duration-only is the survey's own band rates from its training units (the same baseline every
model is compared against, so gains are comparable across models within a survey).
Discrimination: Harrell's C of the predicted cumulative hazard over the 10 years after entry;
AUC of the 5-year risk for from-the-wedding surveys. Calibration: observed / expected events,
the calibration slope (Poisson regression of observed on log expected), and deciles.
Confidence intervals: 200 cluster (person / household) bootstrap resamples of held-out units,
recomputing the metric on fixed predictions (C-index: 100 resamples of at most 6,000 units).
Coverage: for each survey x tenth of predicted risk in each fold, the posterior predictive
90% (and 50%) interval of the event count (posterior draws, then Poisson noise) is compared
with the observed count.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from design import NB, BANDS, SURVEY_KEYS, followup  # noqa: E402
from harmonize import SURVEYS  # noqa: E402

B = 200
SEED = 20261020
MODELS = ['duration_only', 'single_glm', 'single_hgb', 'pooled_glm', 'pooled_hgb']
LABEL = dict(duration_only='Duration only (survey baseline)', single_glm='Single-survey Bayesian GLM (lens analogue)',
             single_hgb='Single-survey gradient boosting', pooled_glm='Pooled Bayesian GLM (this model)',
             pooled_hgb='Pooled gradient boosting', pooled_glm_mean_base='Pooled GLM, survey left out, average baseline',
             pooled_glm_recal='Pooled GLM, survey left out, baseline re-estimated on its own other folds',
             pooled_hgb_loso='Pooled boosting, survey left out')


def load_task(vd, name):
    z = np.load(vd / f'{name}.npz', allow_pickle=True)
    sp = pd.read_parquet(vd / f'{name}_spells.parquet')
    d = pd.DataFrame(dict(uid=z['uid'], survey=z['survey'], cluster=z['cluster'], weight=z['weight']))
    E, Y, iv = followup(d, sp)
    # Entry duration and exit per unit.
    ui = pd.Index(d.uid).get_indexer(sp.uid)
    t0 = np.full(len(d), np.inf)
    np.minimum.at(t0, ui, sp.t0.to_numpy(float))
    t1 = np.zeros(len(d))
    np.maximum.at(t1, ui, sp.t1.to_numpy(float))
    ev = np.bincount(ui, weights=sp.event.to_numpy(float), minlength=len(d))
    return z, d, E, Y, iv, t0, t1, ev


def unit_dev(R, E, Y, iv, n):
    mu = E * R
    t = np.where(Y > 0, Y * np.log(np.where(Y > 0, Y, 1) / np.maximum(mu, 1e-300)), 0.0)
    dev = 2 * (t - Y + mu).sum(1)
    expct = mu.sum(1)
    if len(iv['unit']):
        p = -np.expm1(-iv['length'] * R[iv['unit'], iv['band']])
        p = np.clip(p, 1e-12, 1 - 1e-12)
        y = iv['y']
        dev += np.bincount(iv['unit'], weights=-2 * (y * np.log(p) + (1 - y) * np.log1p(-p)), minlength=n)
        expct += np.bincount(iv['unit'], weights=p, minlength=n)
    return dev, expct


def window_hazard(R, t0, h):
    lo, hi = BANDS[:-1][None, :], BANDS[1:][None, :]
    ov = np.clip(np.minimum((t0 + h)[:, None], hi) - np.maximum(t0[:, None], lo), 0, None)
    return (R * ov).sum(1)


def harrell(t, e, score, w):
    """Weighted Harrell's C, O(n log n): pairs (i, j) with an event for i at t_i < t_j."""
    order = np.argsort(-t, kind='stable')
    t, e, s, w = t[order], e[order], score[order], w[order]
    ranks = np.searchsorted(np.unique(s), s)
    K = ranks.max() + 1
    tree = np.zeros(K + 1)

    def add(i, v):
        i += 1
        while i <= K:
            tree[i] += v
            i += i & -i

    def pref(i):          # sum of weights with rank < i
        out = 0.0
        while i > 0:
            out += tree[i]
            i -= i & -i
        return out
    num = den = total = 0.0
    i = 0
    n = len(t)
    while i < n:
        j = i
        while j < n and t[j] == t[i]:
            j += 1
        for k in range(i, j):          # units at this time: compare with strictly later ones
            if e[k] > 0 and total > 0:
                lo, le = pref(ranks[k]), pref(ranks[k] + 1)
                num += w[k] * (lo + 0.5 * (le - lo))
                den += w[k] * total
        for k in range(i, j):
            add(ranks[k], w[k])
            total += w[k]
        i = j
    return num / den if den > 0 else np.nan


def auc(score, y, w):
    u, inv = np.unique(score, return_inverse=True)
    pos = np.bincount(inv, weights=w * y, minlength=len(u))
    neg = np.bincount(inv, weights=w * (1 - y), minlength=len(u))
    below = np.cumsum(neg) - neg
    return float((pos * (below + 0.5 * neg)).sum() / (pos.sum() * neg.sum()))


def cal_slope(R, E, Y, iv, w):
    """Calibration slope b in y ~ Poisson(exposure * exp(a + b log predicted hazard)) over every
    unit-band (exact follow-up) and spell (interval follow-up; Poisson approximation), weighted.
    1 = predictions spread exactly right; below 1 = too extreme."""
    ui, bi = np.nonzero(E > 0)
    y = np.r_[Y[ui, bi], iv['y']]
    off = np.log(np.r_[E[ui, bi], iv['length']])
    x = np.log(np.maximum(np.r_[R[ui, bi], R[iv['unit'], iv['band']]], 1e-12))
    ww = np.r_[w[ui], w[iv['unit']]]
    a, b = np.log(y @ ww / ((np.exp(off + x)) @ ww)), 1.0
    for _ in range(50):
        mu = np.exp(a + b * x + off)
        g = np.array([(ww * (y - mu)).sum(), (ww * (y - mu) * x).sum()])
        H = np.array([[(ww * mu).sum(), (ww * mu * x).sum()], [(ww * mu * x).sum(), (ww * mu * x * x).sum()]])
        st = np.linalg.solve(H, g)
        a, b = a + st[0], b + st[1]
        if np.abs(st).max() < 1e-9:
            break
    return b


def boot_counts(cluster, seed, reps=B):
    codes, uni = pd.factorize(cluster)
    rng = np.random.default_rng(seed)
    C = np.stack([np.bincount(rng.integers(0, len(uni), len(uni)), minlength=len(uni)) for _ in range(reps)]).astype(np.float32)
    return codes, C


def ci(x):
    return [float(np.percentile(x, 2.5)), float(np.percentile(x, 97.5))]


def collect(work):
    vd = Path(work) / 'val'
    cv = {}
    for k in range(5):
        if (vd / f'cv_{k}.npz').exists():
            cv[k] = load_task(vd, f'cv_{k}')
    loso = {}
    for s in SURVEY_KEYS:
        if (vd / f'loso_{s}.npz').exists():
            loso[s] = load_task(vd, f'loso_{s}')
    return cv, loso


def stack_cv(cv):
    """Out-of-fold predictions for every unit, all folds stacked."""
    parts = []
    for k, (z, d, E, Y, iv, t0, t1, ev) in cv.items():
        n = len(d)
        rec = dict(d=d.assign(fold=k), E=E, Y=Y, iv=iv, t0=t0, t1=t1, ev=ev, R={m: z[m] for m in MODELS if m in z},
                   EV=z['draw_expected'])
        parts.append(rec)
    return parts


def metrics_for(d, E, Y, iv, t0, t1, ev, R, models, base_model, seed):
    """Per-model metrics for one survey's held-out units (fixed predictions)."""
    n = len(d)
    w = d.weight.to_numpy(float)
    codes, C = boot_counts(d.cluster.to_numpy(), seed)
    devs, exps = {}, {}
    for m in models:
        devs[m], exps[m] = unit_dev(R[m], E, Y, iv, n)
    def wsum_boot(x):
        return np.bincount(codes, weights=w * x, minlength=C.shape[1]) @ C.T
    base_tot = (w * devs[base_model]).sum()
    base_b = wsum_boot(devs[base_model])
    O_b = wsum_boot(ev)
    out = {}
    exact_from_wedding = SURVEYS[d.survey.iat[0]]['timing'] != 'interval' and np.all(t0 < 1e-9)
    rng = np.random.default_rng(seed + 1)
    sub = rng.choice(n, min(n, 6000), replace=False)
    for m in models:
        tot = (w * devs[m]).sum()
        gb = 100 * (1 - wsum_boot(devs[m]) / base_b)
        score = window_hazard(R[m], t0, 10.0)
        c = harrell(t1, ev, score, w)
        cb = []
        for r in range(100):
            ii = sub[rng.integers(0, len(sub), len(sub))]
            cb.append(harrell(t1[ii], ev[ii], score[ii], w[ii]))
        Pb = wsum_boot(exps[m])
        res = dict(units=int(n), events=int(ev.sum()), gain=100 * (1 - tot / base_tot), gain_ci=ci(gb),
                   c_index=c, c_ci=ci(np.array(cb)), oe=float((w * ev).sum() / (w * exps[m]).sum()), oe_ci=ci(O_b / Pb),
                   slope=float(cal_slope(R[m], E, Y, iv, w)))
        if exact_from_wedding:
            h5 = window_hazard(R[m], t0, 5.0)
            known = (ev > 0) & (t1 <= 5) | (t1 >= 5)
            y5 = ((ev > 0) & (t1 <= 5)).astype(float)
            res['auc5'] = auc(h5[known], y5[known], w[known])
        res['_dev_boot'] = wsum_boot(devs[m])
        res['_score'] = score
        out[m] = res
    out['_base_boot'] = base_b
    return out


def deciles(d, ev, expct, score, w):
    q = pd.qcut(pd.Series(score).rank(method='first'), 10, labels=False)
    g = pd.DataFrame(dict(q=q, O=w * ev, E=w * expct)).groupby('q').sum()
    return g


def main(work):
    cv, loso = collect(work)
    parts = stack_cv(cv)
    allD = pd.concat([p['d'] for p in parts], ignore_index=True)
    rows, h2h, cal_rows, cov_rows, loso_rows = [], [], [], [], []
    summary = {}
    for s in SURVEY_KEYS:
        sel = [(p, (p['d'].survey == s).to_numpy()) for p in parts]
        if not any(m.any() for _, m in sel):
            continue
        # stack this survey's held-out units across folds
        d = pd.concat([p['d'][m] for p, m in sel], ignore_index=True)
        n_off = 0
        Es, Ys, ivs, t0s, t1s, evs = [], [], dict(unit=[], band=[], length=[], y=[]), [], [], []
        Rs = {mm: [] for mm in MODELS}
        for p, m in sel:
            idx = np.where(m)[0]
            remap = -np.ones(len(m), int)
            remap[idx] = np.arange(len(idx)) + n_off
            Es.append(p['E'][idx]); Ys.append(p['Y'][idx]); t0s.append(p['t0'][idx]); t1s.append(p['t1'][idx]); evs.append(p['ev'][idx])
            keep = np.isin(p['iv']['unit'], idx)
            ivs['unit'].append(remap[p['iv']['unit'][keep]]); ivs['band'].append(p['iv']['band'][keep])
            ivs['length'].append(p['iv']['length'][keep]); ivs['y'].append(p['iv']['y'][keep])
            for mm in MODELS:
                Rs[mm].append(p['R'][mm][idx])
            n_off += len(idx)
        E, Y, t0, t1, ev = map(np.concatenate, (Es, Ys, t0s, t1s, evs))
        iv = {k: np.concatenate(v) for k, v in ivs.items()}
        R = {mm: np.concatenate(v) for mm, v in Rs.items()}
        res = metrics_for(d, E, Y, iv, t0, t1, ev, R, MODELS, 'duration_only', SEED + SURVEY_KEYS.index(s))
        for mm in MODELS:
            r = res[mm]
            rows.append(dict(survey=s, model=mm, units=r['units'], events=r['events'], gain_pct=round(r['gain'], 3),
                             gain_lo=round(r['gain_ci'][0], 3), gain_hi=round(r['gain_ci'][1], 3), c_index=round(r['c_index'], 4),
                             c_lo=round(r['c_ci'][0], 4), c_hi=round(r['c_ci'][1], 4), auc5=round(r.get('auc5', np.nan), 4),
                             obs_exp=round(r['oe'], 4), oe_lo=round(r['oe_ci'][0], 4), oe_hi=round(r['oe_ci'][1], 4),
                             cal_slope=round(r['slope'], 3)))
        base_b = res['_base_boot']
        for other in ('single_glm', 'single_hgb', 'pooled_hgb'):
            diff = 100 * (res[other]['_dev_boot'] - res['pooled_glm']['_dev_boot']) / base_b
            point = res['pooled_glm']['gain'] - res[other]['gain']
            h2h.append(dict(survey=s, comparison=f'pooled_glm minus {other}', gain_diff_points=round(point, 3),
                            lo=round(ci(diff)[0], 3), hi=round(ci(diff)[1], 3),
                            c_diff=round(res['pooled_glm']['c_index'] - res[other]['c_index'], 4),
                            verdict='pooled better' if ci(diff)[0] > 0 else ('pooled worse' if ci(diff)[1] < 0 else 'tie')))
        # calibration deciles (pooled GLM and single GLM)
        w = d.weight.to_numpy(float)
        for mm in ('pooled_glm', 'single_glm', 'pooled_hgb'):
            _, ex = unit_dev(R[mm], E, Y, iv, len(d))
            g = deciles(d, ev, ex, res[mm]['_score'], w)
            for q, r in g.iterrows():
                cal_rows.append(dict(survey=s, model=mm, decile=int(q) + 1, observed=round(r.O, 2), expected=round(r.E, 2),
                                     obs_over_exp=round(r.O / r.E, 3) if r.E > 0 else np.nan))
        # Coverage of posterior predictive intervals: survey x tenth of predicted risk, per fold.
        rng = np.random.default_rng(SEED + 99)
        for p, m in sel:
            idx = np.where(m)[0]
            if len(idx) < 50:
                continue
            sc = window_hazard(p['R']['pooled_glm'][idx], p['t0'][idx], 10.0)
            q = pd.qcut(pd.Series(sc).rank(method='first'), 10, labels=False).to_numpy()
            EVs = p['EV'][idx]
            for g in range(10):
                gg = q == g
                lam = EVs[gg].sum(0).astype(float)
                sims = rng.poisson(np.repeat(lam, 20))
                obs = p['ev'][idx][gg].sum()
                lo90, hi90 = np.percentile(sims, [5, 95])
                lo50, hi50 = np.percentile(sims, [25, 75])
                cov_rows.append(dict(survey=s, fold=int(p['d'].fold.iat[0]), tenth=g + 1, observed=int(obs),
                                     expected_mean=round(float(lam.mean()), 2), pi90=[float(lo90), float(hi90)],
                                     in90=bool(lo90 <= obs <= hi90), in50=bool(lo50 <= obs <= hi50)))
        # Leave-one-survey-out on the same units.
        if s in loso:
            z, dl, El, Yl, ivl, t0l, t1l, evl = loso[s]
            order = pd.Index(dl.uid).get_indexer(d.uid)
            assert (order >= 0).all()
            Rl = {}
            Rl['pooled_glm_mean_base'] = z['pooled_glm'][order]
            Rl['pooled_hgb_loso'] = z['pooled_hgb'][order]
            # Re-estimated baseline: band rates from the survey's OTHER folds, pooled offset kept.
            off = z['pooled_offset'][order]
            folds_ = d.fold.to_numpy()
            rec = np.zeros((len(d), NB))
            prior = np.exp(z['pooled_base_mean'])
            for k in np.unique(folds_):
                tr = folds_ != k
                num = Y[tr].sum(0) + 0.5
                den = (E[tr] * np.exp(off[tr])[:, None]).sum(0)
                if len(iv['unit']):
                    ti = tr[iv['unit']]
                    np.add.at(num, iv['band'][ti], iv['y'][ti])
                    np.add.at(den, iv['band'][ti], iv['length'][ti] * np.exp(off[iv['unit'][ti]]))
                rate = num / (den + 0.5 / prior)
                rec[folds_ == k] = rate[None, :] * np.exp(off[folds_ == k])[:, None]
            Rl['pooled_glm_recal'] = rec
            for mm in ('duration_only', 'single_glm', 'pooled_glm'):
                Rl[mm] = R[mm]
            resl = metrics_for(d, E, Y, iv, t0, t1, ev, Rl, list(Rl), 'duration_only', SEED + 500 + SURVEY_KEYS.index(s))
            for mm in ['pooled_glm_mean_base', 'pooled_glm_recal', 'pooled_hgb_loso', 'single_glm', 'pooled_glm']:
                r = resl[mm]
                loso_rows.append(dict(survey=s, model=mm, gain_pct=round(r['gain'], 3), gain_lo=round(r['gain_ci'][0], 3),
                                      gain_hi=round(r['gain_ci'][1], 3), c_index=round(r['c_index'], 4), c_lo=round(r['c_ci'][0], 4),
                                      c_hi=round(r['c_ci'][1], 4), obs_exp=round(r['oe'], 4), oe_lo=round(r['oe_ci'][0], 4),
                                      oe_hi=round(r['oe_ci'][1], 4), cal_slope=round(r['slope'], 3)))
            for other in ('single_glm',):
                for mm in ('pooled_glm_recal', 'pooled_glm_mean_base'):
                    diff = 100 * (resl[other]['_dev_boot'] - resl[mm]['_dev_boot']) / resl['_base_boot']
                    h2h.append(dict(survey=s, comparison=f'{mm} minus {other}', gain_diff_points=round(resl[mm]['gain'] - resl[other]['gain'], 3),
                                    lo=round(ci(diff)[0], 3), hi=round(ci(diff)[1], 3),
                                    c_diff=round(resl[mm]['c_index'] - resl[other]['c_index'], 4),
                                    verdict='pooled better' if ci(diff)[0] > 0 else ('pooled worse' if ci(diff)[1] < 0 else 'tie')))
        print(f'{s}: done', flush=True)
    out = HERE
    pd.DataFrame(rows).to_csv(out / 'heldout_by_survey.csv', index=False)
    pd.DataFrame(h2h).to_csv(out / 'head_to_head.csv', index=False)
    pd.DataFrame(cal_rows).to_csv(out / 'heldout_calibration_deciles.csv', index=False)
    pd.DataFrame(loso_rows).to_csv(out / 'leave_one_survey_out.csv', index=False)
    cov = pd.DataFrame(cov_rows)
    cov.drop(columns=['pi90']).to_csv(out / 'coverage_by_group.csv', index=False)
    summary['coverage'] = dict(groups=int(len(cov)), share_in_90=round(float(cov.in90.mean()), 4),
                               share_in_50=round(float(cov.in50.mean()), 4),
                               by_survey={s: dict(groups=int(len(g)), in90=round(float(g.in90.mean()), 3), in50=round(float(g.in50.mean()), 3))
                                          for s, g in cov.groupby('survey')})
    (out / 'validation_summary.json').write_text(json.dumps(summary, indent=1) + '\n')
    pd.set_option('display.width', 250)
    print(pd.DataFrame(rows).to_string())
    print(pd.DataFrame(h2h).to_string())
    print(pd.DataFrame(loso_rows).to_string())
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main(sys.argv[1])
