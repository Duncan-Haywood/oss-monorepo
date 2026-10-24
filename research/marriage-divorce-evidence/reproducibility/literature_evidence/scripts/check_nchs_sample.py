#!/usr/bin/env python3
"""Cross-check NCHS table rows with a second, independent PDF text extractor (pypdf).

parse_nchs_tables.py reads `pdftotext -layout` output. This script draws 30 random rows
(seed 20261020) from app/data/nchs_disruption_tables.json and looks for each row's label
followed by its values, in order, in pypdf's text of the same PDF (whitespace removed,
because pypdf spaces out the digits of these PDFs). Rows pypdf prints in a different
order (two rows interleaved column by column) are reported as MISS and were then read
by hand; the notes are in ../nchs_sample30_check.json.

    pip install pypdf
    python3 scripts/check_nchs_sample.py sr23_022.pdf nhsr049.pdf
"""
import json, logging, os, random, re, sys

import pypdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, '..', '..', 'app', 'data', 'nchs_disruption_tables.json')


def main(bm_pdf, cp_pdf):
    logging.disable(logging.WARNING)
    d = json.load(open(DATA, encoding='utf-8'))
    pdfs = {'bramlett_mosher_2002': bm_pdf, 'copen_2012': cp_pdf}
    txt = {k: [re.sub(r'\s+', '', pg.extract_text()).replace('’', "'") for pg in pypdf.PdfReader(p).pages] for k, p in pdfs.items()}
    rows = [(t, r) for t in d['tables'] for r in t['rows'] if not (t['table'] == 'Table 41' and r['label'] != 'Total')]
    random.seed(20261020)
    ok = 0
    for t, r in random.sample(rows, 30):
        if t['source'] == 'bramlett_mosher_2002':
            vals = [f"{v['p']:.2f}({v['se']:.3f})" if v else '*' for v in r['p_disrupt'].values()]
        else:
            vals = [f"{r['n_thousands']:,}"] + sum([[f"{v['survival']:.2f}", f"{v['se']:.3f}"] if v else ['*', '*'] for v in r['survival'].values()], [])
        pat = re.escape(re.sub(r'\s+', '', r['label']).replace('’', "'")) + r'\d?\.{2,}' + re.escape(''.join(vals)) + r'(?![\d(])'
        hit = next((i + 1 for i, pg in enumerate(txt[t['source']]) if t['table'].replace(' ', '') + '.' in pg and re.search(pat, pg)), None)
        ok += bool(hit)
        print('OK  ' if hit else 'MISS', t['table'], r.get('sex', ''), '|', r['section'], '|', r['label'], '|', ' '.join(vals), '| pypdf page', hit)
    print(ok, 'of 30 matched mechanically; read any MISS rows by hand')


if __name__ == '__main__':
    main(*sys.argv[1:3])
