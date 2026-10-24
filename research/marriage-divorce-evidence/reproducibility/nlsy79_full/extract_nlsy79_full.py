"""Stream the columns this folder needs out of the official NLSY79 public release, in one pass.

The archive (nlsy79_all_1979-2022.zip, 450 MB; its CSV is 6.7 GB with 178,014 columns) is
never unzipped: the CSV member is read row by row and only selected columns are written.
Three extracts come out of the single pass, each with a codebook JSON in the format the
existing pipelines read ({refnum: {ref, name, year, block}}):

- annual_nlsy_extract.csv  — exactly the selection rule of ../annual_nlsy/extract_annual_nlsy.py
- pairing_nlsy_extract.csv — exactly the selection rule of ../pairing_nlsy/extract_pairing_nlsy.py
- lens_extract.csv         — what the first-marriage-from-the-wedding lens needs (all rounds
                             1979-2022: interview dates, marital status, weights, schooling,
                             enrolment, income, poverty, region, household roster; the 1979-82
                             background, attitude and test scores; the cross-round marital and
                             fertility history).

All three are person-level and stay out of git (see .gitignore). Standard library only.
Usage: python3 extract_nlsy79_full.py ZIP OUTDIR
"""
import csv, io, json, re, sys, zipfile
from pathlib import Path

ZIP = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / 'raw' / 'nlsy79_all_1979-2022.zip'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent / 'work'
OUT.mkdir(parents=True, exist_ok=True)


def annual_rule(k, n, y):
    # Copied from ../annual_nlsy/extract_annual_nlsy.py (unchanged).
    return (k in ['R0000100', 'R0214800', 'R0214700', 'R0000500', 'R9908600', 'R6533600', 'T3201400']
            or (y != 'XRND' and n in ['Q3-10B', 'Q3-10D'])
            or (y.isdigit() and int(y) >= 2000 and (n in ['MARSTAT-KEY', 'SAMPWEIGHT', 'CURDATE~M', 'CURDATE~Y', 'TNFI_TRUNC', 'HRSWK-PCY', 'AGEATINT', 'DOI_EMPLOYED', 'Q3-4', 'Q13-5_TRUNC', 'Q13-18_TRUNC'] or n.startswith('MARST-CHNG') or n.startswith('HGCREV'))))


def pairing_rule(k, n, y):
    # Copied from ../pairing_nlsy/extract_pairing_nlsy.py (unchanged).
    return (k in ['R0000100', 'R6533500', 'R6533600', 'R6538600', 'R6538700']
            or (y == 'XRND' and re.fullmatch(r'(MO|YR)BG[1-7]M', n))
            or (y.isdigit() and 2000 <= int(y) <= 2020 and (any(n.startswith(q) for q in ['HHI_FINAL_RELCODE.', 'HHI_FINAL_GENCODE.', 'HHI_FINAL_GRADECODE.', 'HHI_FINAL_STATCODE.']) or n in ['Q13-5', 'Q13-5_TRUNC', 'Q13-5_TRUNC_REVISED', 'Q13-18', 'Q13-18_TRUNC', 'Q13-18_TRUNC_REVISED', 'HGCREV' + y[2:], 'Q3-4'])))


LENS_FIXED = {'R0000100', 'R0000300', 'R0000500', 'R0173600', 'R0214700', 'R0214800'}
LENS_1979 = {'FAM-6', 'FAM-7', 'FAM-POB', 'HGC-MOTHER', 'HGC-FATHER', 'R_REL-1_COL', 'R_REL-3', 'ROTTER_SCORE'}
LENS_ROUND = {'CURDATE~M', 'CURDATE~Y', 'MARSTAT-KEY', 'SAMPWEIGHT', 'AGEATINT', 'TNFI_TRUNC', 'POVSTATUS',
              'REGION', 'URBAN-RURAL', 'SMSARES', 'Q3-4'}
ROSTER = ('HHI_FINAL_RELCODE.', 'HHI_FINAL_GENCODE.', 'HHI_FINAL_GRADECODE.', 'HHI_FINAL_AGE.', 'HHI_FINAL_WORK.', 'HHI_FINAL_STATCODE.')


def lens_rule(k, n, y):
    if k in LENS_FIXED:
        return True
    if y == 'XRND':
        return bool(re.fullmatch(r'(MO|YR)(BG|EN)[1-7]M|AGE1M|AGE1B|NUMKID|LASTINT|FL1M1B|MO1M1B|C\d+DOB~[MY]', n))
    if y == '1979' and n in LENS_1979:
        return True
    if y == '1980' and (n == 'ROSENBERG_ESTEEM_SCORE' or re.fullmatch(r'DELIN-(\d+|AGE)', n)):
        return True
    if y == '1981' and n == 'AFQT-3':
        return True
    if y == '1982' and n == 'R_REL-3':
        return True
    if y.isdigit():
        return (n in LENS_ROUND or n.startswith(ROSTER) or n.startswith('MARST-CHNG')
                or n in ('HGCREV' + y[2:], 'ENROLLMTREV' + y[2:]))
    return False


RULES = dict(annual_nlsy=annual_rule, pairing_nlsy=pairing_rule, lens=lens_rule)

with zipfile.ZipFile(ZIP) as z:
    text = z.read('nlsy79_all_1979-2022.cdb').decode()
    D = {}
    for b in re.split(r'\n-{30,}\n', text):
        m = re.match(r'([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)', b)
        if m:
            D[m[1].replace('.', '')] = {'ref': m[1], 'name': m[2], 'year': m[3], 'block': b}
    keep = {r: {k for k, v in D.items() if rule(k, v['name'], v['year'])} for r, rule in RULES.items()}
    with z.open('nlsy79_all_1979-2022.csv') as raw:
        rd = csv.reader(io.TextIOWrapper(raw))
        h = next(rd)
        ix = {r: [i for i, k in enumerate(h) if k in keep[r]] for r in RULES}
        files = {r: open(OUT / f'{r}_extract.csv', 'w', newline='') for r in RULES}
        writers = {r: csv.writer(files[r]) for r in RULES}
        for r in RULES:
            writers[r].writerow([h[i] for i in ix[r]])
        n = 0
        for row in rd:
            for r in RULES:
                writers[r].writerow([row[i] for i in ix[r]])
            n += 1
        for f in files.values():
            f.close()
for r in RULES:
    cols = [h[i] for i in ix[r]]
    json.dump({k: D[k] for k in cols}, open(OUT / f'{r}_codebook.json', 'w'), indent=2)
    print(r, len(cols), 'columns', n, 'rows')
