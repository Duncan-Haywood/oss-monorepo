"""Columns for the 2026-10-20 extension (extended_predictors.py): detailed race, family of origin,
religion detail, political interest, occupation before the wedding and wealth components.

Streams the codebook inside the official zip like select_vars.py and writes WORK/vars_ext.txt
("<reference number> <name>@<survey year>" lines); extract.py then streams those columns into
WORK/extract_ext.csv.
Usage: python3 -I select_vars_ext.py nlsy97_all_1997-2023.zip OUTDIR
"""
import io, re, sys, zipfile

zp, outdir = sys.argv[1:3]
z = zipfile.ZipFile(zp)
f = io.TextIOWrapper(z.open('nlsy97_all_1997-2023.cdb'), encoding='latin-1')
hdr = re.compile(r'^(\S+)\s+\[(\S+)\]\s+Survey Year: (\S+)')
rows = [m.groups() for line in f if (m := hdr.match(line))]
assert len(rows) == 305325, len(rows)
PATS = [
    (r'PUBID', r'1997'), (r'KEY!(RACE|ETHNICITY)', r'1997'),
    (r'YSAQ-(057|146|010)', r'1997'),                       # bio mother / father living or deceased; family religious days
    (r'CV_YTH_REL_HH_AGE_(2|6|12)', r'1997'),               # parent figures at ages 2, 6 and 12
    (r'YSAQ-282A[2-7]', r'.*'), (r'YHHI-55709|YINF-3600', r'.*'),   # religious beliefs, importance; current religion
    (r'YPOL-105', r'.*'),                                   # interest in government and public affairs
    (r'YEMP_OCCODE-2002\.01', r'.*'),                       # occupation, employer 01 of each round (2002 Census codes)
    (r'CVC_(ASSETS_FINANCIAL|ASSETS_NONFINANCIAL|ASSETS_DEBTS|HOUSE_TYPE|HOUSE_VALUE|HOUSE_DEBT)_(20|25)', r'XRND'),
    (r'YHEA-3021A?', r'.*'),
]
pats = [(re.compile(a), re.compile(b)) for a, b in PATS]
seen, out = set(), []
for ref, var, yr in rows:
    key = f'{var}@{yr}'
    if key not in seen and any(a.fullmatch(var) and b.fullmatch(yr) for a, b in pats):
        seen.add(key)
        out.append(f'{ref} {key}')
open(f'{outdir}/vars_ext.txt', 'w').write('\n'.join(out) + '\n')
print('vars_ext.txt', len(out))
