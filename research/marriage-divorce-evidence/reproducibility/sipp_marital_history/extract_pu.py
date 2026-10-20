"""Stream SIPP 2018-2025 public-use person-month files into one row per person per file.

For each file year Y: download pu{Y}_csv.zip (and the two-year longitudinal weights
lgtwgt{Y}yr2_csv.zip when it exists), record SHA-256s, read only the columns below from the
pipe-delimited CSV inside, and collapse the 12 reference months to one row per person:
person-level items (marital history, demographics, wealth as of December) from the last month
the person is present, plus monthly marital-status flags and annual income sums. Writes
WORK/sipp_pu{Y}.parquet and deletes the zip.

Usage: python3 -I extract_pu.py WORK_DIR YEAR [YEAR ...]
"""
import hashlib, io, json, os, subprocess, sys, time, zipfile
import numpy as np, pandas as pd

BASE = 'https://www2.census.gov/programs-surveys/sipp/data/datasets/{y}/'
PERSON = '''SSUID PNUM SPANEL SWAVE WPFINWGT TAGE ESEX ERACE EORIGIN EBORNUS EEDUC EMS EXMAR EWIDIV1 EWIDIV2 EVERDIV
TMAR1_YR TMAR2_YR TMAR3_YR TSEP1_YR TSEP2_YR TSEP3_YR TEND1_YR TEND2_YR TEND3_YR EPNSPOUSE RSSMC THHLDSTATUS
TNETWORTH THNETWORTH TDEBT_AST THDEBT_AST TDEBT_USEC THDEBT_USEC TDEBT_ED TVAL_HOME TDEBT_HOME TCEB TYEAR_FB ETENURE
TYRENTRY ERELRPE TYRFIRSTMARR'''.split()
MONTHLY = 'MONTHCODE EMS_EHC EPNSPOUS_EHC TAGE_EHC TPTOTINC TPEARN THTOTINC RHNUMU18 RMESR'.split()
NUMS = [c for c in PERSON + MONTHLY if c != 'SSUID']


def fetch(url, path):
    subprocess.run(['curl', '--fail', '-sS', '-L', '--retry', '3', '-o', path, url], check=True)
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 22), b''):
            h.update(b)
    return h.hexdigest(), os.path.getsize(path)


def one_year(work, y):
    z = os.path.join(work, f'pu{y}_csv.zip')
    url = BASE.format(y=y) + f'pu{y}_csv.zip'
    digest, size = fetch(url, z)
    with zipfile.ZipFile(z) as zf:
        member = [n for n in zf.namelist() if n.lower().endswith('.csv')]
        assert len(member) == 1, member
        with zf.open(member[0]) as fh:
            header = fh.readline().decode().strip().split('|')
        cols = [c for c in PERSON + MONTHLY if c in header]
        missing = sorted(set(PERSON + MONTHLY) - set(cols))
        parts, rows = [], 0
        with zf.open(member[0]) as fh:
            for ch in pd.read_csv(fh, sep='|', usecols=cols, dtype=str, chunksize=200_000):
                rows += len(ch)
                parts.append(ch)
    os.remove(z)
    m = pd.concat(parts, ignore_index=True)
    for c in NUMS:
        if c in m:
            m[c] = pd.to_numeric(m[c], errors='coerce')
    m = m.sort_values(['SSUID', 'PNUM', 'MONTHCODE'])
    g = m.groupby(['SSUID', 'PNUM'], sort=False)
    last = g.tail(1).set_index(['SSUID', 'PNUM'])
    person = last[[c for c in PERSON if c in last and c not in ('SSUID', 'PNUM')]].copy()
    person['last_month'] = last.MONTHCODE
    person['months_present'] = g.size()
    ms = m.EMS_EHC
    flags = pd.DataFrame(dict(
        SSUID=m.SSUID, PNUM=m.PNUM,
        married_m1=((m.MONTHCODE == 1) & ms.isin([1, 2])).astype(int),
        married_m12=((m.MONTHCODE == 12) & ms.isin([1, 2])).astype(int),
        spouse_present_m12=((m.MONTHCODE == 12) & (ms == 1)).astype(int),
        any_sepdiv=ms.isin([4, 5]).astype(int),
        any_divorced=(ms == 4).astype(int),
        any_widowed=(ms == 3).astype(int),
        months_married=ms.isin([1, 2]).astype(int),
        spouse_m12=np.where(m.MONTHCODE == 12, m.EPNSPOUS_EHC, np.nan),
        own_income=m.TPTOTINC, own_earnings=m.TPEARN,
        hh_income=m.THTOTINC, kids_u18_m12=np.where(m.MONTHCODE == 12, m.RHNUMU18, np.nan),
        employed_months=m.RMESR.isin([1, 2, 3, 4, 5]).astype(int)))
    agg = flags.groupby(['SSUID', 'PNUM'], sort=False).agg(
        married_m1=('married_m1', 'max'), married_m12=('married_m12', 'max'),
        spouse_present_m12=('spouse_present_m12', 'max'), any_sepdiv=('any_sepdiv', 'max'),
        any_divorced=('any_divorced', 'max'), any_widowed=('any_widowed', 'max'),
        months_married=('months_married', 'sum'), spouse_m12=('spouse_m12', 'max'),
        own_income=('own_income', 'sum'), own_earnings=('own_earnings', 'sum'), hh_income=('hh_income', 'sum'),
        kids_u18_m12=('kids_u18_m12', 'max'), employed_months=('employed_months', 'sum'))
    # First month in the reference year with a separated/divorced status.
    first_sd = m[ms.isin([4, 5])].groupby(['SSUID', 'PNUM']).MONTHCODE.min().rename('first_sepdiv_month')
    person = person.join(agg).join(first_sd)
    person = person.reset_index()
    person.insert(0, 'FILEYEAR', np.int16(y))
    rec = dict(file=f'pu{y}_csv.zip', url=url, sha256=digest, bytes=size, person_month_rows=rows,
               persons=len(person), missing_columns=missing, retrieved=time.strftime('%Y-%m-%d'))
    # Two-year longitudinal weights (persons in both this file and the previous one).
    lw = 'lgtwgt2019_csv.zip' if y == 2019 else f'lgtwgt{y}yr2_csv.zip'  # 2019 drops the yr2 suffix
    try:
        lz = os.path.join(work, lw)
        ld, ls = fetch(BASE.format(y=y) + lw, lz)
        with zipfile.ZipFile(lz) as zf:
            name = [n for n in zf.namelist() if n.lower().endswith('.csv')][0]
            with zf.open(name) as fh:
                raw = fh.read().decode()
        os.remove(lz)
        sep = '|' if raw.split('\n', 1)[0].count('|') else ','
        w = pd.read_csv(io.StringIO(raw), sep=sep, dtype=str)
        w.columns = [c.upper() for c in w.columns]
        w = w[['SSUID', 'PNUM', 'FINYR2']].copy()
        w['PNUM'] = pd.to_numeric(w.PNUM)
        w['FINYR2'] = pd.to_numeric(w.FINYR2)
        person = person.merge(w, on=['SSUID', 'PNUM'], how='left')
        rec.update(longitudinal_weights=dict(file=lw, url=BASE.format(y=y) + lw, sha256=ld, bytes=ls,
                                             rows=len(w), positive=int((w.FINYR2 > 0).sum())))
    except subprocess.CalledProcessError:
        person['FINYR2'] = np.nan
        rec.update(longitudinal_weights=None)
    person.to_parquet(os.path.join(work, f'sipp_pu{y}.parquet'), compression='zstd', index=False)
    with open(os.path.join(work, 'manifest.jsonl'), 'a') as f:
        f.write(json.dumps(rec) + '\n')
    print(json.dumps(rec), flush=True)


if __name__ == '__main__':
    work = sys.argv[1]
    os.makedirs(work, exist_ok=True)
    for y in map(int, sys.argv[2:]):
        if os.path.exists(os.path.join(work, f'sipp_pu{y}.parquet')):
            print(y, 'already extracted', flush=True)
            continue
        try:
            one_year(work, y)
        except Exception as e:
            print(y, 'FAILED', repr(e), flush=True)
