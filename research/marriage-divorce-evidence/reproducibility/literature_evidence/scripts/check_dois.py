#!/usr/bin/env python3
"""Re-check every DOI in evidence.json against Crossref (network required).

For each distinct DOI it fetches https://api.crossref.org/works/<doi> and compares the
registered title, year and first-author surname with the record's `citation` string.
Writes doi_check.json: {doi: {status, crossref_title, crossref_year, crossref_first_author,
title_similarity, year_match, author_match}}. status is "ok" when the DOI resolves and all
three agree, "mismatch" when it resolves but disagrees, "unresolved" on 404/network error.

    python3 scripts/check_dois.py [--evidence evidence.json] [--out doi_check.json]
"""
import argparse, difflib, json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def fold(s):
    s = unicodedata.normalize('NFKD', s or '')
    return ''.join(c for c in s if not unicodedata.combining(c)).lower()


def crossref(doi):
    url = 'https://api.crossref.org/works/' + urllib.parse.quote(doi)
    req = urllib.request.Request(url, headers={'User-Agent': 'literature-evidence-verifier (https://github.com/duncan-haywood/monorepo-projects)'})
    for i in range(5):
        try:
            return json.load(urllib.request.urlopen(req, timeout=40))['message']
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (i + 1))
        except Exception:  # noqa: BLE001
            time.sleep(3 * (i + 1))
    return None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--evidence', default=os.path.join(ROOT, 'evidence.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'doi_check.json'))
    a = ap.parse_args(argv)
    ev = json.load(open(a.evidence, encoding='utf-8'))
    recs = ev['records'] if isinstance(ev, dict) else ev
    cites = {}
    for r in recs:
        if r.get('doi'):
            cites.setdefault(r['doi'], r['citation'])
    out = {}
    for doi, cit in sorted(cites.items()):
        m = crossref(doi)
        if m is None:
            out[doi] = {'status': 'unresolved'}
            print('UNRESOLVED', doi)
            continue
        title = (m.get('title') or [''])[0]
        year = ((m.get('issued') or {}).get('date-parts') or [[None]])[0][0]
        years = {y for y in (((m.get(k) or {}).get('date-parts') or [[None]])[0][0]
                             for k in ('issued', 'published-print', 'published-online')) if y}
        fam = ((m.get('author') or [{}])[0]).get('family', '')
        # the citation's title is the text after "(YEAR). " up to the next ". "
        mt = re.search(r'\(\d{4}\)\.\s*(.+?)\.\s', cit)
        ctitle = mt.group(1) if mt else cit
        ft, fc = fold(re.sub(r'\W+', ' ', title)).strip(), fold(re.sub(r'\W+', ' ', cit))
        sim = difflib.SequenceMatcher(None, ft, fold(re.sub(r'\W+', ' ', ctitle)).strip()).ratio()
        if ft and ft in fc:      # registered title (often without subtitle) appears verbatim in the citation
            sim = 1.0
        ym = any(f'({y})' in cit for y in years)
        am = bool(fam) and fold(fam)[:5] in fold(cit)[:60]
        st = 'ok' if (sim >= 0.8 and ym and am) else 'mismatch'
        out[doi] = {'status': st, 'crossref_title': title, 'crossref_year': year, 'crossref_years': sorted(years), 'crossref_first_author': fam,
                    'crossref_container': (m.get('container-title') or [''])[0],
                    'title_similarity': round(sim, 3), 'year_match': ym, 'author_match': am}
        print(st.upper(), doi, year, fam, '|', title[:70], '| sim', round(sim, 2))
        time.sleep(1)
    json.dump(out, open(a.out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    bad = [d for d, v in out.items() if v['status'] != 'ok']
    print(f'{len(out)} DOIs checked; {len(out) - len(bad)} ok; not ok: {bad}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
