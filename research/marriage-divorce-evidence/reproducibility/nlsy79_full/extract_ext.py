"""Stream the columns of the 2026-10-20 extension (extended_predictors.py) out of the official
NLSY79 zip (never unzipped): racial/ethnic origin, siblings, current religion, family net wealth,
occupation, and the identifiers the lens extract already has.

Usage: python3 -I extract_ext.py nlsy79_all_1979-2022.zip WORK
Writes WORK/ext_extract.csv and WORK/ext_codebook.json (person-level; keep out of git).
"""
import csv, io, json, re, sys, zipfile
from pathlib import Path

ZIP, OUT = Path(sys.argv[1]), Path(sys.argv[2])
WANT_1979 = {'FAM-28A', 'FAM-30_1', 'FAM-30_2', 'FAM-31', 'R_REL-2_COL', 'FAM-5', 'FAM-8', 'FAM-10'}
WANT_ROUND = {'TNFW_TRUNC', 'CPSOCC70', 'CPSOCC80', 'R_REL-2', 'R_REL-3'}


def rule(name, year):
    if name == 'CASEID' or (year == '1979' and name in WANT_1979):
        return True
    return year.isdigit() and name in WANT_ROUND


with zipfile.ZipFile(ZIP) as z:
    text = z.read('nlsy79_all_1979-2022.cdb').decode()
    D = {}
    for b in re.split(r'\n-{30,}\n', text):
        m = re.match(r'([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)', b)
        if m:
            D[m[1].replace('.', '')] = {'ref': m[1], 'name': m[2], 'year': m[3], 'block': b[:3000]}
    keep = {k for k, v in D.items() if rule(v['name'], v['year'])} | {'R0000100'}
    with z.open('nlsy79_all_1979-2022.csv') as raw:
        rd = csv.reader(io.TextIOWrapper(raw))
        h = next(rd)
        ix = [i for i, k in enumerate(h) if k in keep]
        n = 0
        with open(OUT / 'ext_extract.csv', 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow([h[i] for i in ix])
            for row in rd:
                w.writerow([row[i] for i in ix])
                n += 1
cols = [h[i] for i in ix]
json.dump({k: D[k] for k in cols if k in D}, open(OUT / 'ext_codebook.json', 'w'), indent=1)
print(len(cols), 'columns', n, 'rows')
