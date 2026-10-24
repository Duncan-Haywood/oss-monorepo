"""Retrospective first-marriage histories from SIPP, one row per ever-married person.

Sources (download.sh fetches them; SHA256SUMS records them):
- 2001, 2004 and 2008 panels, wave-2 topical module (marital, education and migration
  history), fixed-width files read with Census's own SAS input layouts (p0Xputm2.sas);
- 2021-2025 annual public-use files, collapsed to one row per person by extract_pu.py.

A first marriage starts in its marriage year and ends in the year of separation when it
ended in divorce or separation (else the divorce year), is censored at the end year when it
ended in widowhood, and is censored at the interview year when intact. Years only: the
public files suppress months. See METHODS.md for the exact rules and the checks.

Usage: python3 -I build_retro.py RAW_DIR PU_DIR OUT_PARQUET
"""
import gzip, re, sys, zipfile
import numpy as np, pandas as pd

TM2 = {2001: dict(zip='p01putm2.zip', sas='p01putm2.sas', interview_year=2001),
       2004: dict(zip='p04putm2.zip', sas='p04putm2.sas', interview_year=2004),
       2008: dict(zip='p08putm2.zip', sas='p08putm2.sas', interview_year=2009)}
TM2_VARS = '''SSUID EPPPNUM SPANEL SWAVE ESEX ERACE EORIGIN WPFINWGT TAGE EMS EEDUCATE THSYR TCOLLSTR TBACHYR
EXMAR EWIDIV1 TFMYEAR TFSYEAR TFTYEAR TLMYEAR TLSYEAR TLTYEAR TBRSTATE'''.split()


def sas_layout(path):
    spec = {}
    for line in open(path, encoding='latin-1'):
        m = re.match(r'\s*([A-Z][A-Z0-9_]*)\s+(\$)?\s*(\d+)\s*-\s*(\d+)', line)
        if m:
            spec[m.group(1)] = (int(m.group(3)) - 1, int(m.group(4)), bool(m.group(2)))
    return spec


def read_tm2(raw, panel):
    cfg = TM2[panel]
    lay = sas_layout(f'{raw}/{cfg["sas"]}')
    names = [v for v in TM2_VARS if v in lay]
    colspecs = [lay[v][:2] for v in names]
    with zipfile.ZipFile(f'{raw}/{cfg["zip"]}') as zf:
        member = [n for n in zf.namelist() if n.lower().endswith('.dat')][0]
        with zf.open(member) as fh:
            d = pd.read_fwf(fh, colspecs=colspecs, names=names, dtype=str, header=None)
    for v in names:
        if v != 'SSUID':
            d[v] = pd.to_numeric(d[v], errors='coerce')
    d['WPFINWGT'] = d.WPFINWGT / 1e4  # four implied decimals
    return d, cfg['interview_year']


def race_eth(race, hisp, panel):
    """Hispanic, then non-Hispanic White / Black / Asian / Other. 2001 codes Asian or Pacific
    Islander as one group (ERACE 4) and Hispanic origin as detailed ancestry 20-28."""
    if hisp:
        return 'Hispanic'
    if panel == 2001:
        return {1: 'White', 2: 'Black', 3: 'Other', 4: 'Asian'}.get(race, 'Other')
    return {1: 'White', 2: 'Black', 3: 'Asian', 4: 'Other'}.get(race, 'Other')


def edu_at_wedding(e, hsyr, collyr, bayr, wed):
    """Education by the end of the wedding year from the year-of-completion items (2001-2008).
    THSYR/TCOLLSTR/TBACHYR are asked only of people who reached that level by the interview."""
    if e is None or np.isnan(e) or e < 31:
        return 'Unknown'
    # A level reached by the interview but with no recorded year cannot be placed: Unknown.
    if e >= 44:
        if not bayr > 0:
            return 'Unknown'
        if bayr <= wed:
            return 'Bachelor or higher'
    if e >= 40:
        if not collyr > 0:
            return 'Unknown'
        if collyr <= wed:
            return 'Some college'
    if e >= 39:
        if not hsyr > 0:
            return 'Unknown'
        return 'High school' if hsyr <= wed else 'Less than high school'
    if e <= 38:
        return 'Less than high school'
    return 'Unknown'


def edu_now(e):
    if e is None or np.isnan(e) or e < 31:
        return 'Unknown'
    if e <= 38:
        return 'Less than high school'
    if e == 39:
        return 'High school'
    if e <= 43:
        return 'Some college'
    return 'Bachelor or higher'


def first_marriage(r, iy, era):
    """(start, end_year, event, widowed) for the first marriage, or None when undatable."""
    if era == 'tm2':
        once = r.EXMAR == 1
        start = r.TLMYEAR if once else r.TFMYEAR
        sep, end = (r.TLSYEAR, r.TLTYEAR) if once else (r.TFSYEAR, r.TFTYEAR)
        how = None if once else r.EWIDIV1
    else:
        once = r.EXMAR == 1
        start, sep, end = r.TMAR1_YR, r.TSEP1_YR, r.TEND1_YR
        how = None if once else r.EWIDIV1
    if not (start and start > 0):
        return None
    if once:
        if r.EMS in (1, 2):
            return start, iy, 0, 0
        if r.EMS == 3:
            return start, end, 0, 1
        if r.EMS in (4, 5):
            yr = sep if sep and sep > 0 else end
            return start, yr, 1, 0
        return None
    if how == 1:
        return start, end, 0, 1
    if how == 2:
        yr = sep if sep and sep > 0 else end
        return start, yr, 1, 0
    return None


def build(raw, pu_dir, pu_files):
    out = []
    for panel in TM2:
        d, iy = read_tm2(raw, panel)
        d = d[(d.TAGE >= 15) & (d.EMS.between(1, 5)) & (d.EXMAR >= 1)]
        for r in d.itertuples(index=False):
            fm = first_marriage(r, iy, 'tm2')
            if fm is None:
                continue
            start, end, ev, wid = fm
            hisp = (r.EORIGIN == 1) if panel != 2001 else (20 <= r.EORIGIN <= 28)
            bs = r.TBRSTATE
            nat = 'Unknown' if not bs or bs < 0 else ('US-born' if bs <= 78 else 'Foreign-born')
            out.append(dict(source=f'SIPP {panel} panel wave 2', panel=panel, interview_year=iy,
                            hh=f'{panel}-{r.SSUID}', pid=f'{panel}-{r.SSUID}-{int(r.EPPPNUM)}',
                            weight=r.WPFINWGT, sex='Woman' if r.ESEX == 2 else 'Man',
                            race_ethnicity=race_eth(r.ERACE, hisp, panel), nativity=nat,
                            times_married=min(int(r.EXMAR), 3), age_now=r.TAGE,
                            age_at_marriage=r.TAGE - (iy - start), marriage_year=start,
                            end_year=end, event=ev, widowed=wid,
                            education_at_wedding=edu_at_wedding(r.EEDUCATE, r.THSYR, r.TCOLLSTR, r.TBACHYR, start),
                            education_now=edu_now(r.EEDUCATE)))
    for y in pu_files:
        p = pd.read_parquet(f'{pu_dir}/sipp_pu{y}.parquet')
        p = p[(p.TAGE >= 15) & p.THHLDSTATUS.isin([1, 2]) & (p.EXMAR >= 1) & p.EMS.between(1, 5)]
        iy = y  # interviews run February-June of the file year
        for r in p.itertuples(index=False):
            fm = first_marriage(r, iy, 'pu')
            if fm is None:
                continue
            start, end, ev, wid = fm
            out.append(dict(source=f'SIPP {y} public-use file', panel=int(r.SPANEL), interview_year=iy,
                            hh=f'{int(r.SPANEL)}-{r.SSUID}', pid=f'{int(r.SPANEL)}-{r.SSUID}-{int(r.PNUM)}',
                            weight=r.WPFINWGT, sex='Woman' if r.ESEX == 2 else 'Man',
                            race_ethnicity=race_eth(r.ERACE, r.EORIGIN == 1, y),
                            nativity={1: 'US-born', 2: 'Foreign-born'}.get(r.EBORNUS, 'Unknown'),
                            times_married=min(int(r.EXMAR), 3), age_now=r.TAGE,
                            age_at_marriage=r.TAGE - (iy - start), marriage_year=start,
                            end_year=end, event=ev, widowed=wid,
                            education_at_wedding='Not timed', education_now=edu_now(r.EEDUC),
                            same_sex=int(r.RSSMC == 1) if r.RSSMC == r.RSSMC else 0))
    m = pd.DataFrame(out)
    m['same_sex'] = m.get('same_sex', 0)
    m['same_sex'] = m.same_sex.fillna(0).astype(int)
    m['file_year'] = m.interview_year.where(m.source.str.contains('public-use'), m.panel)
    return m


if __name__ == '__main__':
    raw, pu_dir, outp = sys.argv[1:4]
    pu_files = [int(v) for v in sys.argv[4:]] or [2021, 2025]
    m = build(raw, pu_dir, pu_files)
    m.to_parquet(outp, index=False)
    print(m.groupby('source').agg(n=('pid', 'size'), events=('event', 'sum'), widowed=('widowed', 'sum')))
