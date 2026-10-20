"""Second pass over the pooled ACS years for the detail tables (race detail, occupation, wealth).

The first extract (extract.py) kept broad race (RAC1P, HISP) and occupation (OCCP). This pass
re-reads the person archives of the pooled years for detailed race (RAC2P, RAC3P), industry
(INDP) and SOC occupation (SOCP), and the housing archives for tenure (TEN), household income
(HINCP), household size (NP) and the income adjustment (ADJINC). It keeps the same people as
extract.py (married at some point in the past 12 months) and the households they live in, and
writes WORK/acs_detail_{YYYY}.parquet keyed by SERIALNO and SPORDER, which detail_tables.py joins
to acs_{YYYY}.parquet. Every archive is hashed, recorded in WORK/manifest_detail.jsonl and deleted.

Usage: python3 -I extract_detail.py WORK_DIR YEAR [YEAR ...]
"""
import hashlib, json, os, subprocess, sys, time, zipfile
import pandas as pd
import pyarrow as pa, pyarrow.compute as pc, pyarrow.csv as pacsv

BASE = 'https://www2.census.gov/programs-surveys/acs/data/pums/{y}/1-Year/csv_{k}.zip'
PERSON = ['SERIALNO', 'SPORDER', 'MAR', 'MARHD', 'MARHW', 'RAC2P', 'RAC3P', 'HISP', 'INDP', 'OCCP', 'SOCP']
HOUSING = ['SERIALNO', 'TEN', 'HINCP', 'NP', 'ADJINC']


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 22), b''):
            h.update(b)
    return h.hexdigest()


def read_members(z, cols):
    """Every CSV in the archive, only `cols`, all read as text (codes keep leading zeros)."""
    parts, members, rows = [], [], 0
    with zipfile.ZipFile(z) as zf:
        for name in zf.namelist():
            if not name.lower().endswith('.csv'):
                continue
            members.append(name)
            with zf.open(name) as fh:
                header = fh.readline().decode().strip().split(',')
            upper = {h.upper(): h for h in header}
            missing = [c for c in cols if c not in upper]
            if missing:
                raise SystemExit(f'{z} {name}: missing {missing}')
            with zf.open(name) as fh:
                tbl = pacsv.read_csv(fh, convert_options=pacsv.ConvertOptions(
                    include_columns=[upper[c] for c in cols], column_types={upper[c]: pa.string() for c in cols}))
            tbl = tbl.select([upper[c] for c in cols]).rename_columns(cols)
            rows += tbl.num_rows
            parts.append(tbl)
    return pa.concat_tables(parts), members, rows


def fetch(work, y, kind):
    z = os.path.join(work, f'csv_{kind}_{y}.zip')
    url = BASE.format(y=y, k=kind)
    if not os.path.exists(z):
        subprocess.run(['curl', '--fail', '-sS', '-L', '--retry', '3', '-o', z, url], check=True)
    return z, url, sha256(z), os.path.getsize(z)


def num(tbl, c):
    return pa.array(pd.to_numeric(tbl[c].to_pandas(), errors='coerce').fillna(0).astype('int32'))


def one_year(work, y):
    z, url, dig, size = fetch(work, y, 'pus')
    tbl, members, rows = read_members(z, PERSON)
    # Same population as extract.py: married at some point in the past 12 months.
    keep = pc.or_(pc.or_(pc.is_in(num(tbl, 'MAR'), pa.array([1, 4], pa.int32())), pc.equal(num(tbl, 'MARHD'), 1)),
                  pc.equal(num(tbl, 'MARHW'), 1))
    p = tbl.filter(keep).to_pandas()
    del tbl
    os.remove(z)
    recs = [dict(year=y, kind='person', url=url, sha256=dig, bytes=size, members=members, rows_read=rows,
                 rows_kept=len(p), retrieved=time.strftime('%Y-%m-%d'))]
    z, url, dig, size = fetch(work, y, 'hus')
    h, members, rows = read_members(z, HOUSING)
    h = h.to_pandas()
    os.remove(z)
    h = h[h.SERIALNO.isin(set(p.SERIALNO))]
    recs.append(dict(year=y, kind='housing', url=url, sha256=dig, bytes=size, members=members, rows_read=rows,
                     rows_kept=len(h), retrieved=time.strftime('%Y-%m-%d')))
    for c in ['SPORDER', 'RAC2P', 'RAC3P', 'HISP', 'INDP', 'OCCP']:
        p[c] = pd.to_numeric(p[c], errors='coerce').astype('Int32')
    for c in ['TEN', 'NP']:
        h[c] = pd.to_numeric(h[c], errors='coerce').astype('Int32')
    for c in ['HINCP', 'ADJINC']:
        h[c] = pd.to_numeric(h[c], errors='coerce')
    p['SOCP'] = p.SOCP.str.strip()
    d = p.drop(columns=['MAR', 'MARHD', 'MARHW']).merge(h, on='SERIALNO', how='left', validate='many_to_one')
    d.insert(0, 'YEAR', y)
    d.to_parquet(os.path.join(work, f'acs_detail_{y}.parquet'), compression='zstd', index=False)
    with open(os.path.join(work, 'manifest_detail.jsonl'), 'a') as f:
        for r in recs:
            f.write(json.dumps(r) + '\n')
    print(json.dumps(recs), flush=True)


if __name__ == '__main__':
    work = sys.argv[1]
    for y in map(int, sys.argv[2:]):
        if os.path.exists(os.path.join(work, f'acs_detail_{y}.parquet')):
            print(y, 'already extracted', flush=True)
            continue
        one_year(work, y)
