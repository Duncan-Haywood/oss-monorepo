"""Check the public file against the numbers Smith, Block & Karney publish in their supplement.

The authors fit Bayesian models in Blimp (rblimp) with a latent couple-behaviour factor and
multiple imputation (40 imputations). Blimp is not available here, so the model-based checks
are frequentist approximations (maximum likelihood, observed-score composite for the latent
factor, mean imputation or complete cases); they are reported as approximate, and the
descriptive checks are exact. Writes reproduction_checks.csv and reproduction_models.csv.

Run from this folder after `sh download.sh`:  python3 reproduce_published.py
"""
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import optimize, stats

import nl_data as N

HERE = Path(__file__).resolve().parent


def logit_fit(X, y):
    """Unpenalised logistic regression by Newton; returns coef, covariance."""
    b = np.zeros(X.shape[1])
    for _ in range(100):
        p = 1 / (1 + np.exp(-X @ b))
        g = X.T @ (y - p)
        H = X.T @ (X * (p * (1 - p))[:, None])
        step = np.linalg.solve(H, g)
        b += step
        if np.max(np.abs(step)) < 1e-10:
            break
    p = 1 / (1 + np.exp(-X @ b))
    return b, np.linalg.inv(X.T @ (X * (p * (1 - p))[:, None]))


def probit_fit(X, y):
    def nll(b):
        z = X @ b
        return -np.sum(y * stats.norm.logcdf(z) + (1 - y) * stats.norm.logcdf(-z))
    r = optimize.minimize(nll, np.zeros(X.shape[1]), method='BFGS', options=dict(gtol=1e-8))
    return r.x, r.hess_inv


def composites(d):
    """The R script's sum scores (NA if any component is missing) and reversed codes."""
    c = pd.DataFrame(index=d.index)
    c['SER'] = d[['H_educ_D', 'W_educ_D', 'Low_income_D', 'Couple_unemployment_D', 'Couple_fin_strain_D',
                  'Neighborhood_unemploy_D', 'Neighborhood_income_D']].sum(axis=1, min_count=7)
    for s in 'HW':
        c[f'{s}_vul'] = d[[f'{s}_{v}' for v in ['substance_D', 'ACE_D', 'abuse_D', 'neg_affect_D', 'parent_marriage_D']]].sum(axis=1, min_count=5)
    c['Husband_satT'] = d.H_sat_sum
    c['Wife_satT'] = d.W_sat_sum
    # Couple adaptive behaviour (a latent factor in the paper): mean of the eight standardised
    # indicators with negativity and hostility reversed, restandardised. Observed-score proxy.
    ind = []
    for s in 'HW':
        for v, sign in [('Positivity', 1), ('Negativity', -1), ('Effective', 1), ('Hostility', -1)]:
            x = d[f'{s}_{v}']
            ind.append(sign * (x - x.mean()) / x.std())
    hob = pd.concat(ind, axis=1).mean(axis=1)          # mean of available indicators
    c['HOB'] = (hob - hob.mean()) / hob.std()
    return c


def main():
    d = N.load()
    checks = []

    def chk(item, published, reproduced, tol, note=''):
        ok = (abs(float(reproduced) - float(published)) <= tol) if published is not None else None
        checks.append(dict(item=item, published=published, reproduced=round(float(reproduced), 4), tolerance=tol,
                           match=ok, note=note))

    # Sample and outcome.
    chk('couples with known final outcome', 368, len(d), 0)
    chk('couples divorced by the final follow-up (any status 1, T2-T10)', 145, d.divorced.sum(), 0, 'README/brief: 145 of 368')

    # Table S1 (included couples): means and SDs. Satisfaction is published on the 0-29 rescale (sum - 8).
    s1 = [('Husband relationship satisfaction', d.H_sat_sum - 8, 25.9, 3.1), ('Wife relationship satisfaction', d.W_sat_sum - 8, 25.1, 3.5),
          ('Husband positivity', d.H_Positivity, 2.4, .77), ('Wife positivity', d.W_Positivity, 2.3, .75),
          ('Husband negativity', d.H_Negativity, 1.9, .59), ('Wife negativity', d.W_Negativity, 2.0, .58),
          ('Husband effective communication', d.H_Effective, 4.2, .89), ('Wife effective communication', d.W_Effective, 4.3, .86),
          ('Husband hostility', d.H_Hostility, 3.2, 3.5), ('Wife hostility', d.W_Hostility, 3.1, 3.6),
          ('Annual household income ($)', d.income_avg, 50570, 28037)]
    for name, x, m, sd in s1:
        tol_m = 1 if m > 1000 else 0.05
        chk(f'Table S1 mean: {name}', m, x.mean(), tol_m + (0.01 if tol_m < 1 else 0), 'tolerance = rounding of the published value + 0.01')
        chk(f'Table S1 SD: {name}', sd, x.std(), 1 if sd > 1000 else 0.05)

    # Table S2.1: % at risk. The published table has two columns, headed Included and Excluded.
    # The public file (the included couples) matches the column headed Excluded in 16 of 17
    # rows, and Table S8 (same couples) exactly, so the headers look swapped; both are recorded.
    s2 = [('Husband parents’ marriage', 'H_parent_marriage_D', 51.6, 50.7), ('Wife parents’ marriage', 'W_parent_marriage_D', 55.6, 46.7),
          ('Husband neg. affect.', 'H_neg_affect_D', 19.0, 19.0), ('Wife neg. affect.', 'W_neg_affect_D', 22.2, 24.5),
          ('Husband abuse history', 'H_abuse_D', 23.8, 33.9), ('Wife abuse history', 'W_abuse_D', 36.5, 40.8),
          ('Husband ACE', 'H_ACE_D', 42.0, 45.8), ('Wife ACE', 'W_ACE_D', 38.0, 41.1),
          ('Husband substance use', 'H_substance_D', 42.6, 29.9), ('Wife substance use', 'W_substance_D', 9.7, 14.5),
          ('Husband education', 'H_educ_D', 82.5, 80.1), ('Wife education', 'W_educ_D', 69.8, 72.2),
          ('Couple low-income status', 'Low_income_D', 37.1, 47.0), ('Couple unemployment', 'Couple_unemployment_D', 25.4, 17.7),
          ('Couple financial strain', 'Couple_fin_strain_D', 23.8, 19.0), ('Neighborhood unemployment', 'Neighborhood_unemploy_D', 28.6, 24.7),
          ('Neighborhood median income', 'Neighborhood_income_D', 30.2, 24.2)]
    for name, col, pub_inc, pub_exc in s2:
        chk(f'Table S2.1 % at risk, column headed Included: {name}', pub_inc, 100 * d[col].mean(), 0.5)
        chk(f'Table S2.1 % at risk, column headed Excluded: {name}', pub_exc, 100 * d[col].mean(), 0.5, 'headers appear swapped')
    # Table S8 (McNemar): % at risk, husbands vs wives.
    s8 = [('parents’ marriage', 'parent_marriage_D', 51.6, 46.7), ('abuse history', 'abuse_D', 33.9, 40.8),
          ('ACE', 'ACE_D', 45.8, 41.1), ('substance use', 'substance_D', 29.9, 14.5)]
    for name, v, ph, pw in s8:
        chk(f'Table S8 % at risk, husbands: {name}', ph, 100 * d[f'H_{v}'].mean(), 0.5)
        chk(f'Table S8 % at risk, wives: {name}', pw, 100 * d[f'W_{v}'].mean(), 0.5)

    # Table S11: empty discrete-time model hazards, using the R script's long-format rule
    # (missed waves before a couple's first divorce report count as 'together'; missed waves of
    # never-divorced couples are dropped; rows after the first report are dropped).
    s = d[N.STATUS].to_numpy(float)
    pub_h = [.031, .037, .036, .055, .182, .075, .023, .023, .024]
    for k, w in enumerate(N.WAVES):
        risk = ev = 0
        for i in range(len(d)):
            fe = d.event_wave.iat[i]
            if np.isnan(fe):
                if not np.isnan(s[i, k]):
                    risk += 1
            elif w <= fe:
                risk += 1
                ev += int(w == fe)
        chk(f'Table S11 empty-model hazard h({w}), maximum likelihood', pub_h[k], ev / risk, 0.0015, f'{ev}/{risk}')
        # Blimp reports a posterior summary; with a Jeffreys Beta(0.5, 0.5) prior the posterior mean is (e+0.5)/(n+1).
        chk(f'Table S11 empty-model hazard h({w}), Jeffreys posterior mean', pub_h[k], (ev + 0.5) / (risk + 1), 0.0015, 'approximates the Bayesian summary')

    # Table S12 (approximate): discrete-time logit hazard with the six predictors.
    c = composites(d)
    z = pd.DataFrame(index=d.index)
    for v in ['SER', 'H_vul', 'W_vul', 'Husband_satT', 'Wife_satT']:
        z[v] = (c[v] - c[v].mean()) / c[v].std() * 0.5      # R: scale(x) * 0.5, so a unit is 2 SD
    z['HOB'] = c.HOB                                          # latent variance fixed at 1: a unit is 1 SD
    models = []
    pub12 = dict(Husband_satT=0.86, Wife_satT=0.97, HOB=0.77, H_vul=1.29, W_vul=2.18, SER=1.30)
    for variant in ['mean-imputed (368 couples)', 'complete cases']:
        zz = z.fillna(0.0) if variant.startswith('mean') else z.dropna()
        keep = zz.index
        rr = []
        for i in keep:
            fe = d.event_wave.at[i]
            for k, w in enumerate(N.WAVES):
                if np.isnan(fe):
                    if np.isnan(s[i, k]):
                        continue
                    y = 0
                elif w > fe:
                    break
                else:
                    y = int(w == fe)
                rr.append((i, k, y))
        ii, kk, yy = map(np.array, zip(*rr))
        T = np.eye(9)[kk]
        X = np.column_stack([T, zz.loc[ii, list(pub12)].to_numpy()])
        b, V = logit_fit(X, yy.astype(float))
        se = np.sqrt(np.diag(V))
        for j, v in enumerate(pub12):
            jj = 9 + j
            models.append(dict(model='Table S12 discrete-time survival', variant=variant, couples=len(keep), term=v,
                               unit='1 SD (latent factor)' if v == 'HOB' else '2 SD (scale(x)*0.5)',
                               published_odds_ratio=pub12[v], reproduced_odds_ratio=np.exp(b[jj]),
                               ci_lo=np.exp(b[jj] - 1.96 * se[jj]), ci_hi=np.exp(b[jj] + 1.96 * se[jj])))
        pubh = [0.03, 0.03, 0.03, 0.05, 0.20, 0.08, 0.02, 0.02, 0.03]
        for k in range(9):
            models.append(dict(model='Table S12 discrete-time survival', variant=variant, couples=len(keep), term=f'h({N.WAVES[k]}) at predictor means',
                               unit='hazard', published_odds_ratio=pubh[k], reproduced_odds_ratio=1 / (1 + np.exp(-b[k])), ci_lo=np.nan, ci_hi=np.nan))

    # Table S6 (approximate): divorce by year 12 on satisfaction, behaviour, husband vulnerability
    # and SER (wife vulnerability excluded); probit (Blimp's ordinal link), fully standardised beta.
    pub6 = dict(Husband_satT=-0.06, Wife_satT=-0.09, HOB=-0.18, H_vul=0.14, SER=0.08)
    for variant in ['mean-imputed (368 couples)', 'complete cases']:
        zz = z[list(pub6)]
        zz = zz.fillna(0.0) if variant.startswith('mean') else zz.dropna()
        y = d.loc[zz.index, 'divorced'].to_numpy(float)
        X = np.column_stack([np.ones(len(zz)), zz.to_numpy()])
        b, _ = probit_fit(X, y)
        Sx = np.cov(zz.to_numpy(), rowvar=False)
        sd_ystar = np.sqrt(b[1:] @ Sx @ b[1:] + 1)
        for j, v in enumerate(pub6):
            models.append(dict(model='Table S6 SEM, divorce by year 12 (probit)', variant=variant, couples=len(zz), term=v,
                               unit='standardised beta', published_odds_ratio=pub6[v],
                               reproduced_odds_ratio=b[j + 1] * zz[v].std() / sd_ystar, ci_lo=np.nan, ci_hi=np.nan))

    checks = pd.DataFrame(checks)
    checks.to_csv(HERE / 'reproduction_checks.csv', index=False)
    m = pd.DataFrame(models).rename(columns=dict(published_odds_ratio='published', reproduced_odds_ratio='reproduced'))
    m.to_csv(HERE / 'reproduction_models.csv', index=False, float_format='%.4f')
    pd.set_option('display.width', 220)
    print(checks.to_string(index=False))
    print(m.round(3).to_string(index=False))
    print('exact/within-tolerance descriptive checks:', int(checks.match.sum()), 'of', len(checks))


if __name__ == '__main__':
    main()
