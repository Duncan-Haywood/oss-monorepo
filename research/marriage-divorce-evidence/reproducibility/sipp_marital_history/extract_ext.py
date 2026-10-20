"""Second pass over the SIPP 2018-2025 public-use files for the 2026-10-20 extension: each
person's job-1 occupation and industry and the household's wealth components (home equity,
bank accounts, retirement accounts, stocks and mutual funds, business equity, vehicles), all from
the person's last month in the file (December for the baseline couples). One row per person per
file: WORK/sipp_ext{Y}.parquet, joined to sipp_pu{Y}.parquet by SSUID + PNUM. The zip is hashed
(appended to WORK/manifest_ext.jsonl) and deleted.

Usage: python3 -I extract_ext.py WORK_DIR YEAR [YEAR ...]
"""
import hashlib, json, os, subprocess, sys, time, zipfile
import pandas as pd

BASE = 'https://www2.census.gov/programs-surveys/sipp/data/datasets/{y}/'
COLS = ['SSUID', 'PNUM', 'MONTHCODE', 'TJB1_OCC', 'TJB1_IND', 'THEQ_HOME', 'THVAL_HOME', 'THVAL_BANK', 'THVAL_RET',
        'THVAL_STMF', 'THEQ_BUS', 'THEQ_VEH', 'THEQ_RE', 'ERACE', 'EORIGIN']


def one_year(work, y):
    z = os.path.join(work, f'pu{y}_csv.zip')
    url = BASE.format(y=y) + f'pu{y}_csv.zip'
    subprocess.run(['curl', '--fail', '-sS', '-L', '--retry', '3', '-o', z, url], check=True)
    h = hashlib.sha256()
    with open(z, 'rb') as f:
        for b in iter(lambda: f.read(1 << 22), b''):
            h.update(b)
    with zipfile.ZipFile(z) as zf:
        member = [n for n in zf.namelist() if n.lower().endswith('.csv')][0]
        with zf.open(member) as fh:
            header = fh.readline().decode().strip().split('|')
        cols = [c for c in COLS if c in header]
        parts = []
        with zf.open(member) as fh:
            for ch in pd.read_csv(fh, sep='|', usecols=cols, dtype=str, chunksize=200_000):
                parts.append(ch)
    size = os.path.getsize(z)
    os.remove(z)
    m = pd.concat(parts, ignore_index=True)
    for c in cols:
        if c != 'SSUID':
            m[c] = pd.to_numeric(m[c], errors='coerce')
    last = m.sort_values(['SSUID', 'PNUM', 'MONTHCODE']).groupby(['SSUID', 'PNUM'], sort=False).tail(1)
    last.insert(0, 'FILEYEAR', y)
    last.drop(columns=['MONTHCODE']).to_parquet(os.path.join(work, f'sipp_ext{y}.parquet'), index=False)
    rec = dict(file=f'pu{y}_csv.zip', url=url, sha256=h.hexdigest(), bytes=size, persons=len(last),
               columns=cols, missing=sorted(set(COLS) - set(cols)), retrieved=time.strftime('%Y-%m-%d'))
    with open(os.path.join(work, 'manifest_ext.jsonl'), 'a') as f:
        f.write(json.dumps(rec) + '\n')
    print(json.dumps(rec), flush=True)


if __name__ == '__main__':
    work = sys.argv[1]
    for y in map(int, sys.argv[2:]):
        if not os.path.exists(os.path.join(work, f'sipp_ext{y}.parquet')):
            one_year(work, y)
