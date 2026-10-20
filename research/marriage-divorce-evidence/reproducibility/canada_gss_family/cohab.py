"""First common-law (cohabiting) union of each respondent, from the same four GSS Family cycles.

DESCRIPTIVE ONLY, and a different target from the first-marriage lens: the couple's first
co-residential union that began as common-law (with or without a later marriage to the same
partner), followed from the start of living together to the couple's separation. Marrying that
partner is NOT an end; the partner's death and the interview censor. Unions are rebuilt from the
PUMF blocks for marriages preceded by common-law (start = start of common-law) and for common-law
unions not followed by marriage; the earliest start is the respondent's first common-law union.
"""
import numpy as np, pandas as pd
from harmonise import RAW, SURVEY_TIME, REGIONS, PROV_REGION, BOOT_GROUPS, age, cat, read


def _cand(start, sep=None, div=None, dth=None, ongoing=None, death_untimed=None, married=False, index=None):
    n = len(index)
    nan = pd.Series(np.nan, index=index)
    sep = nan if sep is None else sep
    div = nan if div is None else div
    dth = nan if dth is None else dth
    ongoing = pd.Series(False, index=index) if ongoing is None else ongoing.fillna(False).astype(bool)
    death_untimed = pd.Series(False, index=index) if death_untimed is None else death_untimed.fillna(False).astype(bool)
    ev = pd.concat([sep, div], axis=1).min(axis=1)
    status = np.select([ev.notna(), dth.notna(), ongoing, death_untimed], ['event', 'death', 'ongoing', 'unknown'], 'unknown')
    end = np.where(ev.notna(), ev, np.where(dth.notna(), dth, np.nan))
    return pd.DataFrame(dict(start=start, end=end, status=status, married=married), index=index)


def _first(cands):
    """Earliest-starting candidate per respondent (ties: the first listed)."""
    stack = pd.concat([c.assign(order=i) for i, c in enumerate(cands)])
    stack = stack[stack.start.notna()]
    stack = stack.reset_index().sort_values(['index', 'start', 'order'])
    return stack.groupby('index').first()


def cycle_1995():
    u = pd.read_csv(RAW / 'gss1995_union.csv')
    main = read('gss1995_main.csv', ['RECID', 'WGHTFNL', 'PROV', 'DVSEX'])
    cl = u[u.UNIONTYP.isin([2, 3])].copy()
    cl['start'] = age(cl.DVUNAGE)
    cl = cl[cl.start.notna()].sort_values(['RECID', 'start']).groupby('RECID').first()
    sep, div, dth = age(cl.DVAGESEP), age(cl.DVAGEDIV), age(cl.DVAGDTHC)
    end_ev = np.where(cl.DVENDUNN.isin([1, 2, 7]), sep, np.where(cl.DVENDUNN == 4, div, np.nan))
    status = np.select([cl.DVENDUNN.isin([1, 2, 4, 7]) & ~np.isnan(end_ev), (cl.DVENDUNN == 3) & dth.notna(),
                        cl.DVENDUNN.isin([6, 8])], ['event', 'death', 'ongoing'], 'unknown')
    end = np.where(status == 'event', end_ev, np.where(status == 'death', dth, np.nan))
    f = pd.DataFrame(dict(start=cl.start, end=end, status=status, married=cl.UNIONTYP == 2), index=cl.index)
    m = main.set_index('RECID').loc[f.index]
    ai = age(cl.DVAGEDCC)
    return f.assign(cycle='1995', recid=f.index, weight_raw=m.WGHTFNL.to_numpy(), age_interview=ai.where(ai < 80),
                    respondent_sex=cat(m.DVSEX, {1: 'Male', 2: 'Female'}).to_numpy(),
                    region=m.PROV.map(PROV_REGION).map(REGIONS).fillna('Unknown').to_numpy()).reset_index(drop=True), None


def cycle_2006():
    ma = [c for k in range(1, 5) for c in (f'AGE_CL_MA{k}', f'AGE_SEP_MA{k}', f'AGE_DIV_MA{k}')]
    dth = ['AGE_DTH_MA1C', 'AGE_DTH_MA2C', 'AGE_DTH_MA3C', 'AGE_DTH_MA4']
    cu = [c for k in range(1, 5) for c in (f'AGE_CU{k}', f'AGE_SEP_CU{k}')] + ['AGE_DTH_CU1C', 'AGE_DTH_CU2', 'AGE_DTH_CU3', 'AGE_DTH_CU4']
    d = read('gss2006.csv', ['RECID', 'WGHT_PER', 'AGEC', 'SEX', 'REGION', 'LEG_MARSTAT', 'AGE_CL_MA0', 'AGE_SEP_MA0C',
                             'AGE_CU0C', 'PR_CL'] + ma + dth + cu + [f'WTBS_{i:03d}' for i in range(1, 501)])
    ix = d.index
    cands = [_cand(age(d.AGE_CL_MA0), sep=age(d.AGE_SEP_MA0C).where(d.LEG_MARSTAT == 2),
                   ongoing=pd.Series(True, index=ix), married=True, index=ix)]
    for k in range(1, 5):
        cands.append(_cand(age(d[f'AGE_CL_MA{k}']), sep=age(d[f'AGE_SEP_MA{k}']), div=age(d[f'AGE_DIV_MA{k}']),
                           dth=age(d[dth[k - 1]]), married=True, index=ix))
    cands.append(_cand(age(d.AGE_CU0C), ongoing=pd.Series(True, index=ix), index=ix))
    cu_dth = ['AGE_DTH_CU1C', 'AGE_DTH_CU2', 'AGE_DTH_CU3', 'AGE_DTH_CU4']
    for k in range(1, 5):
        cands.append(_cand(age(d[f'AGE_CU{k}']), sep=age(d[f'AGE_SEP_CU{k}']), dth=age(d[cu_dth[k - 1]]), index=ix))
    ai = pd.to_numeric(d.AGEC, errors='coerce').astype(float)
    return _finish(d, cands, '2006', (ai + 0.5).where(ai < 80))


def cycle_2011():
    d = read('gss2011.csv', ['RECID', 'WGHT_PER', 'AGEDC', 'SEX', 'REGION', 'MARSTAT', 'AGE_CL_MA0C', 'AGE_SEP_MA0C',
                             'AGE_CU0C'] +
             [c for k in range(1, 4) for c in (f'AGE_CL_MA{k}C', f'AGE_SEP_MA{k}C', f'AGE_DIV_MA{k}C')] +
             ['MA1_Q170', 'MA2_Q170', 'MA3_Q170C'] +
             [c for k in range(1, 4) for c in (f'AGE_CU{k}C', f'CU{k}_Q170', f'AGE_SEP_CU{k}C')] +
             [f'WTBS_{i:03d}' for i in range(1, 501)])
    ix = d.index
    cands = [_cand(age(d.AGE_CL_MA0C), sep=age(d.AGE_SEP_MA0C).where(d.MARSTAT == 4),
                   ongoing=pd.Series(True, index=ix), married=True, index=ix)]
    for k, tcol in zip(range(1, 4), ['MA1_Q170', 'MA2_Q170', 'MA3_Q170C']):
        typ = d[tcol]
        cands.append(_cand(age(d[f'AGE_CL_MA{k}C']), sep=age(d[f'AGE_SEP_MA{k}C']).where(typ.isin([1, 2])),
                           div=age(d[f'AGE_DIV_MA{k}C']).where(typ.isin([1, 4])), death_untimed=typ == 3,
                           married=True, index=ix))
    cands.append(_cand(age(d.AGE_CU0C), ongoing=pd.Series(True, index=ix), index=ix))
    for k in range(1, 4):
        typ = d[f'CU{k}_Q170']
        cands.append(_cand(age(d[f'AGE_CU{k}C']), sep=age(d[f'AGE_SEP_CU{k}C']).where(typ == 1),
                           death_untimed=typ == 2, index=ix))
    ai = age(d.AGEDC)
    return _finish(d, cands, '2011', ai.where(ai < 80))


def cycle_2017():
    d = read('gss2017.csv', ['PUMFID', 'WGHT_PER', 'AGEDC', 'SEX', 'REGION', 'MARSTAT', 'ACLMA0C', 'ASEPMA0C', 'ACU0C',
                             'ACLMA1C', 'MA1_170', 'ASEPMA1C', 'ADIVMA1C', 'ADTHMA1C', 'ACLMA2C', 'MA2_170C', 'ASEPMA2C',
                             'ADIVMA2C', 'ADTHMA2C', 'ACU1C', 'CU1_170', 'ASEPCU1C', 'ADTHCU1C', 'ACU2C', 'CU2_170',
                             'ASEPCU2C', 'ACU3C', 'ASEPCU3C'] + [f'WTBS_{i:03d}' for i in range(1, 501)])
    d = d.rename(columns={'PUMFID': 'RECID'})
    ix = d.index
    cands = [_cand(age(d.ACLMA0C), sep=age(d.ASEPMA0C).where(d.MARSTAT == 4), ongoing=pd.Series(True, index=ix),
                   married=True, index=ix)]
    for k, tcol in [(1, 'MA1_170'), (2, 'MA2_170C')]:
        typ = d[tcol]
        cands.append(_cand(age(d[f'ACLMA{k}C']), sep=age(d[f'ASEPMA{k}C']).where(typ.isin([1, 2])),
                           div=age(d[f'ADIVMA{k}C']).where(typ.isin([1, 4])),
                           dth=age(d[f'ADTHMA{k}C']).where(typ == 3), married=True, index=ix))
    cands.append(_cand(age(d.ACU0C), ongoing=pd.Series(True, index=ix), index=ix))
    cands.append(_cand(age(d.ACU1C), sep=age(d.ASEPCU1C).where(d.CU1_170 == 1), dth=age(d.ADTHCU1C).where(d.CU1_170 == 2), index=ix))
    cands.append(_cand(age(d.ACU2C), sep=age(d.ASEPCU2C).where(d.CU2_170 == 1), death_untimed=d.CU2_170 == 2, index=ix))
    cands.append(_cand(age(d.ACU3C), sep=age(d.ASEPCU3C), index=ix))
    ai = age(d.AGEDC)
    return _finish(d, cands, '2017', ai.where(ai < 80))


def _finish(d, cands, cycle, age_interview):
    f = _first(cands)
    rows = d.loc[f.index]
    out = pd.DataFrame(dict(start=f.start, end=f.end, status=f.status, married=f.married.astype(bool),
                            cycle=cycle, recid=rows.RECID, weight_raw=rows.WGHT_PER,
                            age_interview=age_interview.loc[f.index],
                            respondent_sex=cat(rows.SEX, {1: 'Male', 2: 'Female'}), region=cat(rows.REGION, REGIONS)))
    return out.reset_index(drop=True), rows[[f'WTBS_{i:03d}' for i in range(1, 501)]].to_numpy(np.float64)


def first_cohabitations(seed=20261021, n_boot=500):
    rng = np.random.default_rng(seed)
    parts, boots, audit = [], [], {}
    for c, fn in [('1995', cycle_1995), ('2006', cycle_2006), ('2011', cycle_2011), ('2017', cycle_2017)]:
        f, bw = fn()
        a = dict(first_common_law_unions=len(f), by_status={k: int(v) for k, v in f.status.value_counts().items()})
        ongoing = f.status == 'ongoing'
        f['t'] = np.where(ongoing, f.age_interview - f.start, f.end - f.start)
        f['event'] = (f.status == 'event').astype(int)
        f['start_year'] = SURVEY_TIME[c] - f.age_interview + f.start
        ok = f.age_interview.notna() & (f.status != 'unknown') & f.t.notna() & (f.t > -0.15) & (f.start_year >= 1950)
        a['analysed'] = int(ok.sum())
        a['events'] = int(f.event[ok].sum())
        f = f[ok].copy()
        f['t'] = f.t.clip(lower=0.05)
        w = f.weight_raw.to_numpy(float)
        b = w[:, None] * rng.poisson(1.0, size=(len(f), n_boot)) if bw is None else bw[ok.to_numpy()][:, :n_boot]
        f['weight'] = w / w.mean()
        f['boot_group'] = BOOT_GROUPS[c]
        parts.append(f)
        boots.append((b / w.mean()).astype(np.float32))
        audit[c] = a
    return pd.concat(parts, ignore_index=True), np.vstack(boots), audit


if __name__ == '__main__':
    import json
    f, B, audit = first_cohabitations()
    print(json.dumps(audit, indent=1))
    print(f.groupby(['cycle', 'married']).agg(n=('t', 'size'), events=('event', 'sum'), t=('t', 'mean')))
