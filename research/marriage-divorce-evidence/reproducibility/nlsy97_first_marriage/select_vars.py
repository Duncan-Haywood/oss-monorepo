"""List the NLSY97 columns this lens uses, by streaming the codebook (.cdb) inside the official zip.

Writes two files of "<reference number> <name>@<survey year>" lines: vars.txt (respondent, marital,
schooling, partner-section items) and vars_hhi.txt (household roster, used for the spouse).
Usage: python3 select_vars.py nlsy97_all_1997-2023.zip OUTDIR
"""
import io, re, sys, zipfile

zp, outdir = sys.argv[1:3]
z = zipfile.ZipFile(zp)
f = io.TextIOWrapper(z.open('nlsy97_all_1997-2023.cdb'), encoding='latin-1')
hdr = re.compile(r'^(\S+)\s+\[(\S+)\]\s+Survey Year: (\S+)')
rows = [m.groups() for line in f if (m := hdr.match(line))]
assert len(rows) == 305325, len(rows)

MAIN = [
    (r'PUBID', r'1997'), (r'KEY!(SEX|BDATE_M|BDATE_Y|RACE_ETHNICITY)', r'1997'),
    (r'CV_SAMPLE_TYPE', r'1997'), (r'SAMPLING_WEIGHT_CC', r'1997'), (r'SAMPLING_PANEL_WEIGHT', r'1997'),
    (r'VSTRAT|VPSU', r'.*'), (r'ASVAB_MATH_VERBAL_SCORE_PCT', r'.*'),
    (r'CV_HGC_(BIO|RES)_(MOM|DAD)', r'1997'), (r'CV_YTH_REL_HH_AGE_12', r'1997'),
    (r'CV_INCOME_GROSS_YR', r'1997'), (r'CV_HH_NET_WORTH_P', r'1997'), (r'CV_HH_SIZE', r'1997'),
    (r'FP_(YYCRIMI|YYSUBSI|ADHRISKI|PPRELIG|SEXAGE|SEXEVER|YMNTHLTH)', r'.*'),
    (r'YINF-3600', r'1997'), (r'P2-01[345]', r'1997'), (r'YSAQ-010', r'1997'), (r'YSAQ-300', r'.*'),
    (r'YHEA-3021A?|YHEA-3020~000001', r'.*'),
    (r'CVC_(FIRST_\S+|MARRIAGES_TTL|COHAB_TTL|RND|HS_DIPLOMA|GED|AA_DEGREE|BA_DEGREE|MA_DEGREE|PHD_DEGREE|PROF_DEGREE|'
     r'HH_NET_WORTH_(20|25)|ASSETS_RND_(20|25)|HOURS_WK_YR_ALL\.\d+|TTL_BIO_CHILD|HIGHEST_DEGREE_EVER)', r'.*'),
    (r'CV_INTERVIEW_CMONTH', r'.*'),
    (r'CV_(HH_POV_RATIO|CENSUS_REGION|URBAN-RURAL|ENROLLSTAT|HGC_EVER_EDT|HIGHEST_DEGREE_EVER_EDT)', r'(19|20)\d\d'),
    (r'YINC-1700', r'.*'), (r'YSAQ-282[A-G]', r'.*'),
    (r'(MAR_STATUS|MAR_PARTNER_LINK|MAR_COHABITATION|SCH_COLLEGE_STATUS)_\d{4}\.\d\d', r'.*'),
    (r'CV_CHILD_BIRTH_DATE\.\d\d[~_][MY]', r'.*'),
    (r'YMAR-(3100|3100A|3100C|3200|3200A|3500|3500A|3700|3700A|3800|3800A|3900|3900A|4250|4250A|4310|4310A|4315|4315A|'
     r'4100|4100-REV|4100A|4100A-REV)(\.\d\d)?([~_][MY])?', r'.*'),
    (r'YMAR-4300A?(\.\d\d)?(~\d+)?', r'.*'), (r'PARTNERS_ID\.\d\d', r'.*'),
]
HHI = [(r'PUBID', r'1997'),
       (r'HHI_(RELY|UID|HIGHGRADE|ETHNICITY|AGE|SEX)\.\d+|HHI_BDATE\.\d+~[MY]|HHI_RACE\.\d+~\d+|PARTNERS_UID\.\d+', r'(19|20)\d\d')]

for name, pats in (('vars.txt', MAIN), ('vars_hhi.txt', HHI)):
    pats = [(re.compile(a), re.compile(b)) for a, b in pats]
    seen, out = set(), []
    for ref, var, yr in rows:
        key = f'{var}@{yr}'
        if key not in seen and any(a.fullmatch(var) and b.fullmatch(yr) for a, b in pats):
            seen.add(key)
            out.append(f'{ref} {key}')
    open(f'{outdir}/{name}', 'w').write('\n'.join(out) + '\n')
    print(name, len(out))
