#!/usr/bin/env python3
"""Parse the NCHS first-marriage disruption/survival tables (public domain) from
`pdftotext -layout` text into app/data/nchs_disruption_tables.json.

Sources (U.S. federal government works, public domain):
  * Bramlett, M. D., & Mosher, W. D. (2002). Cohabitation, marriage, divorce, and remarriage in
    the United States. Vital Health Stat 23(22). Tables 21, 22 (first marriage) and 41 (second
    marriage): probability of disruption (separation or divorce) after 1, 3, 5, 10, 15 years, SE
    in parentheses. Women 15-44, NSFG 1995.
    https://www.cdc.gov/nchs/data/series/sr_23/sr23_022.pdf  (sha256 prefix 24ffa48c4f205b16)
  * Copen, C. E., Daniels, K., Vespa, J., & Mosher, W. D. (2012). First marriages in the United
    States: Data from the 2006-2010 NSFG. National Health Statistics Reports 49. Tables 5 (women),
    6 (men), 7 (women and men by premarital cohabitation): probability a first marriage survives
    5, 10, 15, 20 years, with SE. "*" = does not meet NCHS reliability standards.
    https://www.cdc.gov/nchs/data/nhsr/nhsr049.pdf  (sha256 prefix 5b424c20b90c01c0)

Usage:
  pdftotext -layout sr23_022.pdf sr23_022.layout.txt
  pdftotext -layout nhsr049.pdf nhsr049.layout.txt
  python3 parse_nchs_tables.py sr23_022.layout.txt nhsr049.layout.txt OUT.json
"""
import json, re, sys

LEAD = r'\s*(?:\.\s?)+\s*'
FOOT = re.compile(r'(?<=[A-Za-z’\)])\d$')  # trailing footnote marker on a label ("Education2")
SMSA = re.compile(r'(?<=SMSA)\d')        # "SMSA1, other": footnote marker inside the label


def clean_label(s):
    return SMSA.sub('', FOOT.sub('', s.strip().rstrip('.').strip())).replace('SMSA ,', 'SMSA,')


def blocks(lines, table):
    """Yield the line ranges belonging to `table` (it can continue over pages: "—Con.")."""
    out, on = [], False
    for ln in lines:
        m = re.match(r'^\s*Table (\d+)\. ', ln)
        if m:
            on = m.group(1) == table
            continue
        if on and re.match(r'^\s*(NOTE:|SOURCE:|See footnotes)', ln):
            on = False
        if on:
            out.append(ln)
    return out


def parse_bm(lines, table):
    rows, section, group = [], None, None
    pat = re.compile(r'^(\s*)(\S.*?)' + LEAD + r'((?:(?:\d\.\d\d\(\d\.\d{3}\)|\*)\s*){4,5})\s*$')
    for ln in blocks(lines, table):
        m = pat.match(ln)
        if m:
            indent, label = len(m.group(1)), clean_label(m.group(2))
            vals = [(None, None) if v == '*' else re.match(r'(\d\.\d\d)\((\d\.\d{3})\)', v).groups()
                    for v in re.findall(r'\d\.\d\d\(\d\.\d{3}\)|\*', m.group(3))]
            if indent == 0:
                group = label
            parent = group if indent > 0 and group != label else None
            rows.append({'section': 'Total' if label == 'Total' else section, 'label': label,
                         'parent_row': parent,
                         'p_disrupt': {d: (None if v is None else {'p': float(v), 'se': float(s)}) for d, (v, s) in zip(['1y', '3y', '5y', '10y', '15y'], vals)},
                         'printed': ln.strip()})
            continue
        s = ln.strip()
        if s and not re.search(r'\d\.\d\d|Probability|Characteristic|^\d+$|Page|Series|United States', s):
            section, group = clean_label(s), None
    return rows


def parse_copen(lines, table, sex_default):
    rows, section, sex, prefix, last_was_section = [], None, sex_default, None, False
    num = r'(\d\.\d\d|\*)\s+(\d\.\d{3}|\*)'
    pat = re.compile(r'^(\s*)(\S.*?)' + LEAD + r'([\d,]+)\s+' + r'\s+'.join([num] * 4) + r'\s*$')
    for ln in blocks(lines, table):
        m = pat.match(ln)
        if m:
            indent, label = len(m.group(1)), clean_label(m.group(2))
            g = m.groups()[3:]
            curve = {}
            for d, (v, s) in zip(['5y', '10y', '15y', '20y'], [(g[i], g[i + 1]) for i in range(0, 8, 2)]):
                curve[d] = None if v == '*' else {'survival': float(v), 'se': float(s)}
            if indent == 0 and not label.endswith(':') and 'single race' not in label:
                prefix = None   # "Asian, single race" is printed flush left but sits under "Not Hispanic"
            rows.append({'sex': sex, 'section': 'Total' if label.startswith('Total') else section, 'label': label,
                         'parent_row': prefix if (indent > 0 or 'single race' in label) else None,
                         'n_thousands': int(m.group(3).replace(',', '')),
                         'survival': curve, 'printed': ln.strip()})
            continue
        s = ln.strip()
        if s in ('Women', 'Men'):
            sex, section, last_was_section = s, None, False
            continue
        if s.endswith(':') and len(s) < 60:
            prefix = s.rstrip(':')
            continue
        if s and not re.search(r'\d\.\d\d|Probability|Characteristic|thousands|Number in|years\s+SE|^\d+$|^SE$|characteristics:|Page', s):
            if s[0].islower() and last_was_section:   # header wrapped onto a second line
                section = section + ' ' + clean_label(s)
            elif re.match(r'^(All (women|men)|Total)', s):
                section = clean_label(s)
            else:
                section, prefix = clean_label(s), None
            last_was_section = True
            continue
        if s:
            last_was_section = False
    return rows


def main(bm_txt, cp_txt, out):
    bm = open(bm_txt, encoding='utf-8').read().split('\n')
    cp = open(cp_txt, encoding='utf-8').read().split('\n')
    title = lambda lines, t: next(re.sub(r'\s+', ' ', l.strip()) for l in lines if re.match(r'^\s*Table %s\. ' % t, l))
    tables = []
    for t in ('21', '22', '41'):
        tables.append({'source': 'bramlett_mosher_2002', 'table': 'Table ' + t, 'title': title(bm, t),
                       'population': 'U.S. women 15-44, NSFG 1995' + (' (second marriages)' if t == '41' else ' (first marriages)'),
                       'measure': 'p_disrupt: life-table probability of disruption (separation or divorce) after each duration; se: standard error (printed in parentheses)',
                       'durations': ['1y', '3y', '5y', '10y', '15y'], 'rows': parse_bm(bm, t)})
    for t, sex in (('5', 'Women'), ('6', 'Men'), ('7', 'Women')):
        tables.append({'source': 'copen_2012', 'table': 'Table ' + t, 'title': title(cp, t),
                       'population': 'U.S. ' + ('women' if t == '5' else 'men' if t == '6' else 'women and men') + ' 15-44, NSFG 2006-2010 (trend rows 1995/2002 where printed)',
                       'measure': 'survival: life-table probability the first marriage is intact (not disrupted by separation or divorce) after each duration; se: standard error; null = printed "*" (does not meet NCHS reliability standards). Disruption = 1 - survival.',
                       'durations': ['5y', '10y', '15y', '20y'], 'rows': parse_copen(cp, t, sex)})
    doc = {
        'about': 'Public-domain NCHS life-table curves of first-marriage disruption (separation or divorce) by characteristic, for population baselines. Values are exactly as printed; `printed` is the table line as extracted by pdftotext -layout (dot leaders kept). Unadjusted, bivariate tables: groups overlap and are confounded with each other; do not multiply rows together. Built by reproducibility/literature_evidence/scripts/parse_nchs_tables.py.',
        'sources': {
            'bramlett_mosher_2002': {'citation': 'Bramlett, M. D., & Mosher, W. D. (2002). Cohabitation, marriage, divorce, and remarriage in the United States. Vital and Health Statistics, Series 23, No. 22. Hyattsville, MD: National Center for Health Statistics.',
                                     'url': 'https://www.cdc.gov/nchs/data/series/sr_23/sr23_022.pdf', 'pdf_sha256_prefix': '24ffa48c4f205b16', 'license': 'U.S. federal government work (public domain)'},
            'copen_2012': {'citation': 'Copen, C. E., Daniels, K., Vespa, J., & Mosher, W. D. (2012). First marriages in the United States: Data from the 2006-2010 National Survey of Family Growth. National Health Statistics Reports, No. 49. Hyattsville, MD: National Center for Health Statistics.',
                           'url': 'https://www.cdc.gov/nchs/data/nhsr/nhsr049.pdf', 'pdf_sha256_prefix': '5b424c20b90c01c0', 'license': 'U.S. federal government work (public domain)'}},
        'tables': tables}
    json.dump(doc, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    for t in tables:
        print(t['source'], t['table'], len(t['rows']), 'rows')


if __name__ == '__main__':
    main(*sys.argv[1:4])
