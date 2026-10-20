#!/usr/bin/env python3
"""Rebuild source_cache/ texts that verify_quotes.py checks quotes against.

    python3 scripts/fetch_sources.py pmc PMC3777640 [PMC... ]   # NCBI E-utilities full-text XML -> text
    python3 scripts/fetch_sources.py pubmed 23384147 [...]      # PubMed abstract
    python3 scripts/fetch_sources.py doi 10.1111/jomf.12092     # abstract from Crossref, OpenAlex, Europe PMC
    python3 scripts/fetch_sources.py html URL NAME              # web page -> web_NAME.txt
    python3 scripts/fetch_sources.py pdf URL NAME               # PDF -> pdf_NAME.layout.txt / .raw.txt (needs pdftotext)

Files land in --cache (default ../source_cache, which is git-ignored: these are copyrighted
texts and are never committed). Network access required. Stdlib only, plus poppler's
pdftotext for PDFs.
"""
import argparse, html, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'literature-evidence-verifier (https://github.com/duncan-haywood/monorepo-projects)'}
EU = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'


def get(url, as_json=False):
    req = urllib.request.Request(url, headers=UA)
    for i in range(5):
        try:
            data = urllib.request.urlopen(req, timeout=60).read()
            return json.loads(data) if as_json else data
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503):
                time.sleep(3 * (i + 1))
                continue
            raise
    raise RuntimeError('gave up on ' + url)


def pmc(cache, ids):
    for p in ids:
        root = ET.fromstring(get(EU + 'efetch.fcgi?db=pmc&id=' + p.replace('PMC', '')))
        parts = []

        def walk(e):
            if e.tag in ('p', 'title'):
                parts.append(' '.join(''.join(e.itertext()).split()))
                return
            if e.tag == 'tr':
                parts.append(' | '.join(' '.join(''.join(c.itertext()).split()) for c in e))
                return
            for c in e:
                walk(c)
        walk(root)
        open(os.path.join(cache, f'pmc_{p}.txt'), 'w', encoding='utf-8').write('\n'.join(parts))
        print(p, len(parts), 'blocks')
        time.sleep(0.5)


def pubmed(cache, ids):
    for pm in ids:
        a = ET.fromstring(get(EU + 'efetch.fcgi?db=pubmed&retmode=xml&id=' + pm)).find('.//PubmedArticle')
        title = ''.join(a.find('.//ArticleTitle').itertext())
        ab = [((e.get('Label') + ': ') if e.get('Label') else '') + ''.join(e.itertext()) for e in a.findall('.//MedlineCitation//AbstractText')]
        ids_ = {e.get('IdType'): e.text for e in a.findall('./PubmedData/ArticleIdList/ArticleId')}
        open(os.path.join(cache, f'pubmed_{pm}.txt'), 'w', encoding='utf-8').write(
            f'PMID {pm}\nTITLE: {title}\nDOI: {ids_.get("doi")}\nABSTRACT:\n' + '\n'.join(ab) + '\n')
        print(pm, title[:70])
        time.sleep(0.5)


def doi(cache, dois):
    for d in dois:
        parts = []
        try:
            a = get('https://api.crossref.org/works/' + urllib.parse.quote(d), True)['message'].get('abstract')
            if a:
                parts.append('CROSSREF ABSTRACT:\n' + html.unescape(re.sub(r'<[^>]+>', ' ', a)))
        except Exception as e:  # noqa: BLE001
            print('crossref', d, e)
        try:
            w = get('https://api.openalex.org/works/doi:' + d, True)
            ix = w.get('abstract_inverted_index')
            if ix:
                parts.append('OPENALEX ABSTRACT:\n' + ' '.join(t for _, t in sorted((p, t) for t, ps in ix.items() for p in ps)))
        except Exception as e:  # noqa: BLE001
            print('openalex', d, e)
        try:
            ep = get('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&query=' + urllib.parse.quote(f'DOI:"{d}"'), True)
            for r in (ep.get('resultList') or {}).get('result', [])[:1]:
                if r.get('abstractText'):
                    parts.append(f"EUROPEPMC ABSTRACT (pmid {r.get('pmid')}):\n" + html.unescape(re.sub(r'<[^>]+>', ' ', r['abstractText'])))
        except Exception as e:  # noqa: BLE001
            print('europepmc', d, e)
        key = 'doi_' + re.sub(r'[^A-Za-z0-9]+', '_', d)
        open(os.path.join(cache, key + '.txt'), 'w', encoding='utf-8').write(f'DOI {d}\n\n' + '\n\n'.join(parts) + '\n')
        print(d, len(parts), 'abstract copies')
        time.sleep(1)


def html2text(raw):
    t = re.sub(r'(?s)<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<header.*?</header>|<footer.*?</footer>', '', raw)
    t = re.sub(r'<(p|br|h\d|li|tr|div)[^>]*>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    return re.sub(r'\n\s*\n+', '\n', re.sub(r'[ \t\r]+', ' ', t))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('kind', choices=['pmc', 'pubmed', 'doi', 'html', 'pdf'])
    ap.add_argument('args', nargs='+')
    ap.add_argument('--cache', default=os.path.join(ROOT, 'source_cache'))
    a = ap.parse_args(argv)
    os.makedirs(a.cache, exist_ok=True)
    if a.kind == 'pmc':
        pmc(a.cache, a.args)
    elif a.kind == 'pubmed':
        pubmed(a.cache, a.args)
    elif a.kind == 'doi':
        doi(a.cache, a.args)
    elif a.kind == 'html':
        url, name = a.args
        raw = get(url).decode('utf-8', errors='replace')
        open(os.path.join(a.cache, f'web_{name}.txt'), 'w', encoding='utf-8').write(html2text(raw))
    else:
        url, name = a.args
        pdf = os.path.join(a.cache, name + '.pdf')
        open(pdf, 'wb').write(get(url))
        subprocess.run(['pdftotext', '-layout', pdf, os.path.join(a.cache, f'pdf_{name}.layout.txt')], check=True)
        subprocess.run(['pdftotext', pdf, os.path.join(a.cache, f'pdf_{name}.raw.txt')], check=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
