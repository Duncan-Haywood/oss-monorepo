"""Stream ACS 1-year person PUMS archives into compact per-year extracts (not committed).

For each year: download https://www2.census.gov/programs-surveys/acs/data/pums/{YYYY}/1-Year/csv_pus.zip,
record its SHA-256 and size, read every person CSV inside it with only the columns below,
keep people who were married at some point in the past 12 months (the denominator of the
one-year divorce incidence, see METHODS.md), write WORK/acs_{YYYY}.parquet (zstd), and delete
the zip. Disk use stays at one archive (~0.6 GB) plus the extracts.

Usage: python3 -I extract.py WORK_DIR YEAR [YEAR ...]
Appends one JSON line per year to WORK_DIR/manifest.jsonl (url, sha256, bytes, members,
rows read, rows kept). Copy that file's lines into downloads.json in this folder.
"""
import hashlib, json, os, subprocess, sys, time, zipfile
import numpy as np, pandas as pd
import pyarrow as pa, pyarrow.compute as pc, pyarrow.csv as pacsv

URL = 'https://www2.census.gov/programs-surveys/acs/data/pums/{y}/1-Year/csv_pus.zip'
# 2020 1-year data were released only as experimental estimates, under a separate path.
URL_2020 = 'https://www2.census.gov/programs-surveys/acs/experimental/2020/data/pums/1-Year/csv_pus.zip'
# Upper-case canonical names; older files spell replicate weights in lower case.
BASE = ['SERIALNO', 'SPORDER', 'ST', 'AGEP', 'SEX', 'MAR', 'MARHD', 'MARHM', 'MARHT', 'MARHW', 'MARHYP',
        'MSP', 'SCHL', 'RAC1P', 'HISP', 'NATIVITY', 'PINCP', 'ADJINC', 'ESR', 'WKHP', 'DIS', 'MIL',
        'FMARHDP', 'FMARHYP', 'FMARHTP', 'PWGTP']
OPTIONAL = ['OCCP', 'RELSHIPP', 'RELP', 'FER', 'PAOC']
REPS = [f'PWGTP{i}' for i in range(1, 81)]
# Renamed columns (2024 calls the state code STATE).
ALIASES = {'ST': ['STATE']}
INT = 'Int32'


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 22), b''):
            h.update(b)
    return h.hexdigest()


def one_year(work, y):
    z = os.path.join(work, f'csv_pus_{y}.zip')
    url = URL_2020 if y == 2020 else URL.format(y=y)
    if not os.path.exists(z):
        subprocess.run(['curl', '--fail', '-sS', '-L', '--retry', '3', '-o', z, url], check=True)
    digest, size = sha256(z), os.path.getsize(z)
    parts, read, members = [], 0, []
    with zipfile.ZipFile(z) as zf:
        for name in zf.namelist():
            if not name.lower().endswith('.csv'):
                continue
            members.append(name)
            with zf.open(name) as fh:
                header = fh.readline().decode().strip().split(',')
            upper = {h.upper(): h for h in header}
            for canon, alts in ALIASES.items():
                for a in alts:
                    if canon not in upper and a in upper:
                        upper[canon] = upper[a]
            rename = {upper[c]: c for c in upper}
            missing = [c for c in BASE + REPS if c not in upper]
            if missing:
                raise SystemExit(f'{y} {name}: missing columns {missing[:8]}')
            want = BASE + [c for c in OPTIONAL if c in upper] + REPS
            with zf.open(name) as fh:
                # pyarrow's multithreaded reader with typed columns (blank = null).
                types = {upper[c]: (pa.string() if c == 'SERIALNO' else pa.float64() if c in ('ADJINC', 'PINCP')
                                    else pa.int32()) for c in want}
                try:
                    tbl = pacsv.read_csv(fh, convert_options=pacsv.ConvertOptions(
                        include_columns=[upper[c] for c in want], column_types=types))
                except pa.ArrowInvalid:
                    # A file with values the typed reader rejects (2014 has some): read as text,
                    # then convert with the same rule as pandas (non-numeric -> missing).
                    with zf.open(name) as fh2:
                        raw = pacsv.read_csv(fh2, convert_options=pacsv.ConvertOptions(
                            include_columns=[upper[c] for c in want],
                            column_types={upper[c]: pa.string() for c in want}))
                    arrays = []
                    for c in want:
                        v = raw[upper[c]]
                        if c != 'SERIALNO':
                            num = pd.to_numeric(pd.Series(v.to_pandas()).str.strip(), errors='coerce')
                            v = pa.chunked_array([pa.array(num, type=types[upper[c]], from_pandas=True)]) \
                                if types[upper[c]] == pa.float64() else \
                                pa.chunked_array([pa.array(num.round().astype('Int32'), type=pa.int32(), from_pandas=True)])
                        arrays.append(v)
                    tbl = pa.table(dict(zip([upper[c] for c in want], arrays)))
                    del raw
            read += tbl.num_rows
            col = lambda c: pc.fill_null(tbl[upper[c]], 0)
            # Married at some point in the past 12 months: now married or separated, or
            # divorced / widowed within the past 12 months.
            keep = pc.or_(pc.or_(pc.is_in(col('MAR'), pa.array([1, 4], pa.int32())), pc.equal(col('MARHD'), 1)),
                          pc.equal(col('MARHW'), 1))
            out = tbl.filter(keep).to_pandas(types_mapper={pa.int32(): pd.Int32Dtype()}.get)
            del tbl
            out.columns = [rename[c] if rename[c] in BASE + OPTIONAL + REPS else c.upper() for c in out.columns]
            out = out[want]
            parts.append(out)
    d = pd.concat(parts, ignore_index=True)
    d.insert(0, 'YEAR', np.int16(y))
    d.to_parquet(os.path.join(work, f'acs_{y}.parquet'), compression='zstd', index=False)
    rec = dict(year=y, url=url, sha256=digest, bytes=size, members=members, person_rows=read,
               kept_married_past_year=len(d), retrieved=time.strftime('%Y-%m-%d'))
    with open(os.path.join(work, 'manifest.jsonl'), 'a') as f:
        f.write(json.dumps(rec) + '\n')
    os.remove(z)
    print(json.dumps(rec), flush=True)


if __name__ == '__main__':
    work = sys.argv[1]
    os.makedirs(work, exist_ok=True)
    for y in map(int, sys.argv[2:]):
        if os.path.exists(os.path.join(work, f'acs_{y}.parquet')):
            print(y, 'already extracted', flush=True)
            continue
        try:
            one_year(work, y)
        except (SystemExit, Exception) as e:  # keep going; the year is reported as failed
            print(y, 'FAILED', e, flush=True)
