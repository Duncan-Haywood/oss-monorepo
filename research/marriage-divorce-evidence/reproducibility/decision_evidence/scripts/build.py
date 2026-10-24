#!/usr/bin/env python3
"""Build and mechanically verify the decision-evidence base.

    python3 scripts/fetch_sources.py          # once: rebuild source_cache/ (network; texts not committed)
    python3 scripts/build.py --doi            # check quotes, numbers, derivations and DOIs; write outputs
    python3 scripts/build.py --check          # re-check evidence.json against the cache; exit 1 on mismatch

Checks reuse ../literature_evidence/scripts/verify_quotes.py (quote fragments verbatim after
normalisation; every number in a quote present in the source; every stored value printed in the
quote or recomputed from a `derivation` whose inputs are printed) and check_dois.py's Crossref
lookup (title, year and first author against the citation). A record is `verified` only when
every check that applies passed. Writes evidence.json, SOURCES.json, doi_check.json,
factor_grades.json, EVIDENCE.md, FACTORS.md and ../../app/data/decision_evidence.json.
"""
import argparse, datetime, difflib, importlib.util, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                                   # reproducibility/decision_evidence
PROJECT = os.path.dirname(os.path.dirname(ROOT))               # research/marriage-divorce-evidence
LIT = os.path.join(PROJECT, 'reproducibility', 'literature_evidence')
APP_OUT = os.path.join(PROJECT, 'app', 'data', 'decision_evidence.json')
CACHE = os.environ.get('DECISION_CACHE', os.path.join(ROOT, 'source_cache'))
DATE = '2026-10-20'


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vq = _load('verify_quotes', os.path.join(LIT, 'scripts', 'verify_quotes.py'))
cd = _load('check_dois', os.path.join(LIT, 'scripts', 'check_dois.py'))
sys.path.insert(0, HERE)
from sources import SOURCES  # noqa: E402
from records import RECORDS  # noqa: E402
from factors import FACTORS, GRADES  # noqa: E402

Z = vq.Z
_base_derive = vq.derive


def derive(d):
    """verify_quotes.derive plus the methods these records need."""
    m, x = d['method'], d['inputs']
    if m == 'two_props_rd':        # k1/n1 - k0/n0 with Wald CI
        p1, p0 = x['k1'] / x['n1'], x['k0'] / x['n0']
        se = math.sqrt(p1 * (1 - p1) / x['n1'] + p0 * (1 - p0) / x['n0'])
        return (p1 - p0, p1 - p0 - Z * se, p1 - p0 + Z * se)
    if m == 'percent_diff':        # (p1 - p0) / 100, no CI
        return ((x['p1'] - x['p0']) / 100, None, None)
    if m == 'diff_p_two_sided':    # difference with a two-sided p-value -> normal-approximation CI
        z = _z_from_p(x['p'])
        se = abs(x['diff']) / z
        return (x['diff'], x['diff'] - Z * se, x['diff'] + Z * se)
    if m == 'percent_change_ci':   # "+18 percent (CI 0.81-1.49)" -> 1.18 with the printed CI
        return (1 + x['percent_change'] / 100, x['ci_low'], x['ci_high'])
    return _base_derive(d)


def _z_from_p(p):
    lo, hi = 0.0, 10.0               # invert the two-sided normal tail by bisection (stdlib only)
    for _ in range(200):
        mid = (lo + hi) / 2
        if math.erfc(mid / math.sqrt(2)) > p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


vq.derive = derive


def sources_for(cache=CACHE):
    out = {}
    for k, meta in SOURCES.items():
        out[k] = vq.Source(k, meta, PROJECT if meta['kind'] == 'repo' else cache)
    return out


def check(rec, srcs):
    """verify_quotes.check_record plus `comparison_value` (must be printed in the quote)."""
    res = vq.check_record(rec, srcs)
    cv = rec.get('comparison_value')
    if cv is not None and not any(vq.close(cv, q) for _, q in vq.numbers(rec.get('quote') or '')):
        res['problems'].append(f'comparison_value={cv} not printed in quote')
        res['values'] = 'fail'
    return res


def crossref_check(doi, citation):
    m = cd.crossref(doi)
    if m is None:
        return {'status': 'unresolved'}
    title = (m.get('title') or [''])[0]
    years = {y for y in (((m.get(k) or {}).get('date-parts') or [[None]])[0][0]
                         for k in ('issued', 'published-print', 'published-online')) if y}
    fam = ((m.get('author') or [{}])[0]).get('family', '')
    mt = re.search(r'\(\d{4}\)\.\s*(.+?)\.\s', citation)
    ctitle = mt.group(1) if mt else citation
    ft = cd.fold(re.sub(r'\W+', ' ', title)).strip()
    sim = difflib.SequenceMatcher(None, ft, cd.fold(re.sub(r'\W+', ' ', ctitle)).strip()).ratio()
    if ft and ft in cd.fold(re.sub(r'\W+', ' ', citation)):
        sim = 1.0
    ym = any(f'({y})' in citation for y in years)
    am = bool(fam) and cd.fold(fam)[:5] in cd.fold(citation)[:60]
    return {'status': 'ok' if (sim >= 0.8 and ym and am) else 'mismatch', 'crossref_title': title,
            'crossref_years': sorted(years), 'crossref_first_author': fam,
            'title_similarity': round(sim, 3), 'year_match': ym, 'author_match': am}


def doi_targets(rec):
    """(doi, citation-to-compare) pairs for a record."""
    out = []
    if rec.get('doi'):
        out.append((rec['doi'], rec['citation'].split(' (Figure as reported by')[0]))
    if rec.get('secondhand_doi'):
        out.append((rec['secondhand_doi'], rec['citation'].split('reported by ', 1)[-1]))
    return out


def lit_records():
    ev = json.load(open(os.path.join(LIT, 'evidence.json'), encoding='utf-8'))
    return {r['id']: r for r in ev['records']}


def resolve_ref(ref, own, lit):
    ref, _, role = ref.partition('#')
    kind, rid = ref.split(':', 1)
    src = own if kind == 'decision' else lit
    r = src.get(rid)
    if r is None:
        raise SystemExit(f'factor evidence ref {ref} not found')
    keep = ['id', 'title', 'predictor', 'contrast', 'measure', 'unit', 'estimate', 'ci_low', 'ci_high', 'range_low', 'range_high',
            'effect_text', 'direction', 'design_class', 'design', 'population', 'n', 'outcome', 'follow_up', 'citation', 'doi', 'url',
            'source', 'locator', 'quote', 'provenance', 'verified', 'caveats', 'se_or_other', 'adjusted_for']
    out = {k: r[k] for k in keep if k in r}
    out['ref'] = ref
    out['role'] = role or 'direct'
    out['evidence_file'] = ('reproducibility/decision_evidence/evidence.json' if kind == 'decision'
                            else 'reproducibility/literature_evidence/evidence.json')
    if kind == 'literature':
        out['design_class'] = lit_design_class(r)
    return out


def lit_design_class(r):
    """Grade a literature_evidence record: longitudinal (prospective panel, or event-history models of
    dated survey marital histories) with covariates -> prospective_observational_adjusted; unadjusted
    (zero-order) estimates and one-time respondent-reported retrospective surveys -> cross_sectional."""
    d = (r.get('design') or '').lower()
    if (r.get('adjusted_for') or 'none').lower().startswith('none') or 'respondent-reported' in d:
        return 'cross_sectional'
    if 'prospective' in d or 'event history' in d or 'cox' in d or 'panel' in d:
        return 'prospective_observational_adjusted'
    return 'cross_sectional'


def build(args):
    srcs = sources_for()
    avail = {k: s.available for k, s in srcs.items()}
    missing = sorted(k for k, a in avail.items() if not a)
    if missing and not args.allow_missing:
        raise SystemExit('source texts missing (run scripts/fetch_sources.py): ' + ', '.join(missing))
    doi_path = os.path.join(ROOT, 'doi_check.json')
    dois = json.load(open(doi_path)) if os.path.exists(doi_path) else {}
    if args.doi:
        for rec in RECORDS:
            for d, cit in doi_targets(rec):
                if d not in dois or dois[d].get('status') != 'ok':
                    dois[d] = crossref_check(d, cit)
                    print(dois[d]['status'].upper(), d, dois[d].get('crossref_first_author'), dois[d].get('crossref_years'))
        json.dump(dict(sorted(dois.items())), open(doi_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    ids = [r['id'] for r in RECORDS]
    assert len(ids) == len(set(ids)), 'duplicate record ids'
    out, bad = [], 0
    for rec in RECORDS:
        assert rec['source'] in SOURCES, rec['id']
        res = check(rec, srcs)
        dstat = [dois.get(d, {}).get('status', 'unchecked') for d, _ in doi_targets(rec)]
        doi_ok = all(s == 'ok' for s in dstat)
        ok = (res['quote'] == 'ok' and res['numbers'] == 'ok' and res['values'] == 'ok'
              and all(e == 'ok' for e in res['extra_quotes']) and doi_ok)
        r = dict(rec)
        r['verified'] = ok
        r['verification'] = {'date': DATE, 'quote_in_source': res['quote'], 'numbers_in_source': res['numbers'],
                             'values_traced': res['values'], 'extra_quotes': res['extra_quotes'],
                             'doi': (dstat[0] if dstat else 'none (report has no DOI)'),
                             'problems': res['problems'], 'reason': 'all checks passed' if ok else '; '.join(res['problems'] + [f'doi {s}' for s in dstat if s != 'ok'])}
        if not ok:
            bad += 1
            print('NOT VERIFIED', rec['id'], r['verification']['reason'])
        out.append(r)
    own = {r['id']: r for r in out}
    lit = lit_records()
    grades = []
    for f in FACTORS:
        assert f['strongest_design'] in GRADES, f['factor']
        ev = [resolve_ref(x, own, lit) for x in f['evidence']]
        unverified = [e['ref'] for e in ev if not e.get('verified')]
        if unverified:
            raise SystemExit(f"{f['factor']}: unverified evidence {unverified}")
        g = dict(f)
        g['evidence'] = ev
        designs_on_divorce = [e['design_class'] for e in ev if not _other_outcome(e) and e['role'] == 'direct']
        best = min((GRADES.index(_grade_of(d)) for d in designs_on_divorce if _grade_of(d)), default=None)
        g['check_strongest_design_from_evidence'] = GRADES[best] if best is not None else None
        if g['check_strongest_design_from_evidence'] != f['strongest_design']:
            raise SystemExit(f"{f['factor']}: stated {f['strongest_design']} but evidence supports {g['check_strongest_design_from_evidence']}")
        grades.append(g)
    write_outputs(out, grades, dois)
    print(f'{len(out)} records, {len(out) - bad} verified; {len(grades)} factors graded; cached sources {sum(avail.values())}/{len(avail)}')
    return 0 if bad == 0 else 1


OTHER_OUTCOME = re.compile(r'\bNOT divorce\b|relationship quality|satisfaction|adjustment|communication|happiness|poverty|lived with both', re.I)


def _other_outcome(e):
    """Evidence whose outcome is not divorce/separation does not raise a factor's grade."""
    return bool(OTHER_OUTCOME.search(e.get('outcome') or '')) and 'stability' not in (e.get('outcome') or '').lower()


def _grade_of(design_class):
    return {'experimental': 'experimental', 'meta_analysis_experimental': 'experimental', 'quasi_experimental': 'quasi_experimental',
            'prospective_observational_adjusted': 'prospective_observational_adjusted', 'structural_selection_model': 'prospective_observational_adjusted',
            'cross_sectional': 'cross_sectional'}.get(design_class)


SCHEMA = {
    'id': 'unique record id', 'kind': 'intervention | natural_experiment | observational | project_analysis | design_standard',
    'factors': 'app factors this record informs (see factor_grades.json)', 'design_class': 'see scripts/records.py docstring',
    'estimate/ci_low/ci_high': 'in `unit`; printed in the quote or recomputed from `derivation`', 'derivation': 'how values were computed from printed inputs',
    'direction': 'lower_risk | higher_risk | null | mixed | better_quality | na', 'provenance': 'primary | abstract | secondhand | project_analysis',
    'verified': 'true only if every applicable mechanical check passed (see verification)',
}


def write_outputs(recs, grades, dois):
    about = ('Decision evidence for the divorce-risk app: interventions with experimental or quasi-experimental evidence, '
             'natural experiments on causes of divorce, observational anchors, and decision-aid design standards. Every quote is '
             'checked verbatim against the cached source text and every DOI at Crossref by scripts/build.py; source texts are not committed.')
    json.dump({'about': about, 'schema': SCHEMA, 'records': recs}, open(os.path.join(ROOT, 'evidence.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    smeta = {'about': 'Where each record\'s quote is checked. Rebuild the texts with scripts/fetch_sources.py; they are git-ignored (copyright).',
             'sources': SOURCES}
    json.dump(smeta, open(os.path.join(ROOT, 'SOURCES.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    json.dump(dict(sorted(dois.items())), open(os.path.join(ROOT, 'doi_check.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    fg = {'about': 'Evidence grade for each modifiable factor the app can change. strongest_design is the strongest design that estimates '
                   'an effect of the factor on divorce or separation; evidence entries are copied from the verified evidence files.',
          'grades': GRADES, 'factors': grades}
    json.dump(fg, open(os.path.join(ROOT, 'factor_grades.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    app_keep = ['id', 'kind', 'factors', 'title', 'design_class', 'design', 'population', 'country', 'years', 'n', 'outcome', 'measure', 'unit',
                'estimate', 'ci_low', 'ci_high', 'range_low', 'range_high', 'comparison_value', 'derivation', 'ci_note', 'effect_text', 'direction',
                'follow_up', 'caveats', 'citation', 'doi', 'url', 'locator', 'quote', 'provenance', 'principle', 'version_note']
    app = {'about': 'Exported by reproducibility/decision_evidence/scripts/build.py. Only verified records are included. '
                    'Interventions and natural experiments say what changing a decision did in trials; factor grades say how strong the '
                    'evidence is for each input the app lets you change. Use absolute risks with a stated time frame when showing these.',
           'generated': DATE,
           'interventions': [{k: r[k] for k in app_keep if k in r} | {'verified': True, 'verified_on': r['verification']['date']}
                             for r in recs if r['verified'] and r['kind'] != 'design_standard'],
           'design_standards': [{k: r[k] for k in app_keep if k in r} | {'verified': True}
                                for r in recs if r['verified'] and r['kind'] == 'design_standard'],
           'factor_grades': [{k: g[k] for k in ('factor', 'label', 'decision', 'app_inputs', 'strongest_design', 'direction', 'size',
                                                'causal_reading', 'gaps')}
                             | {'evidence': [{k: e[k] for k in ('ref', 'role', 'evidence_file', 'design_class', 'citation', 'doi', 'measure', 'estimate',
                                                                 'ci_low', 'ci_high', 'quote', 'provenance', 'verified') if k in e}
                                             for e in g['evidence']]}
                             for g in grades]}
    json.dump(app, open(APP_OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    write_md(recs, grades)


def _num(r):
    if r.get('estimate') is None and r.get('range_low') is None:
        return 'direction only'
    if r.get('range_low') is not None:
        return f"{r['range_low']:g} to {r['range_high']:g}"
    s = f"{r['estimate']:g}"
    if r.get('ci_low') is not None:
        s += f" ({r['ci_low']:g} to {r['ci_high']:g})"
    return s


def _cell(s):
    return str(s or '').replace('|', '/').replace('\n', ' ')


def write_md(recs, grades):
    from collections import Counter
    L = ['# Decision evidence: what changing a decision did in trials and natural experiments', '',
         'Generated by `scripts/build.py` from `evidence.json`; do not edit by hand. Each record\'s quote is checked verbatim '
         'against the source text and its DOI at Crossref. Effects are on divorce or separation unless the outcome column says otherwise. '
         'For how strong the evidence is for each input the app lets you change, see [FACTORS.md](FACTORS.md); for how the app should '
         'present it, see [DESIGN.md](DESIGN.md).', '']
    c1 = Counter(r['design_class'] for r in recs)
    c2 = Counter(r['provenance'] for r in recs)
    L += [f"{len(recs)} records, {sum(r['verified'] for r in recs)} verified. By design: " + ', '.join(f'{k} {v}' for k, v in sorted(c1.items()))
          + '. By provenance: ' + ', '.join(f'{k} {v}' for k, v in sorted(c2.items())) + '.', '']
    groups = [('Relationship education and couple therapy', lambda r: r['kind'] == 'intervention' and set(r['factors']) & {'relationship_education', 'counselling_therapy'}),
              ('Income support, job loss and windfalls', lambda r: 'income_employment' in r['factors'] and r['kind'] in ('intervention', 'natural_experiment')),
              ('Other natural experiments, selection models and observational anchors', lambda r: r['kind'] in ('natural_experiment', 'observational') and 'income_employment' not in r['factors']),
              ("This project's own estimates used in the grades", lambda r: r['kind'] == 'project_analysis'),
              ('Decision-aid design evidence (see DESIGN.md)', lambda r: r['kind'] == 'design_standard')]
    seen = set()
    for title, pred in groups:
        rows = [r for r in recs if r['id'] not in seen and pred(r)]
        seen |= {r['id'] for r in rows}
        L += [f'## {title}', '', '| Record | Design | Population, n | Outcome | Effect | Follow-up | Source |', '|---|---|---|---|---|---|---|']
        for r in rows:
            # Project-relative paths (this project's own reports) are written from this folder.
            link = ('https://doi.org/' + r['doi']) if r.get('doi') else (r['url'] if '://' in r['url'] else '../../' + r['url'])
            src = f"[{'doi:' + r['doi'] if r.get('doi') else 'report'}]({link})"
            L.append(f"| **{r['id']}**: {_cell(r['title'])} | {r['design_class']} ({r['provenance']}) | {_cell(r['population'])}; {_cell(r['n'])} | "
                     f"{_cell(r['outcome'])} | {_cell(r['effect_text'])} [{_cell(r.get('measure'))}: {_num(r)}] | {_cell(r['follow_up'])} | {src} |")
        L.append('')
    L += ['## Quotes and caveats', '']
    for r in recs:
        L += [f"- **{r['id']}** ({r['locator']}): “{r['quote']}” " + (f"*Caveats:* {r['caveats']}" if r.get('caveats') else '')]
    open(os.path.join(ROOT, 'EVIDENCE.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')

    F = ['# How strong is the evidence for each thing the app lets you change?', '',
         'Generated by `scripts/build.py` from `factor_grades.json`; do not edit by hand. The grade is the strongest design that estimates an '
         'effect of the factor **on divorce or separation**: experimental > quasi-experimental > prospective observational (adjusted) > '
         'cross-sectional. Event-history models of dated survey marital histories (NSFG, SIPP) with covariates fixed before the outcome count as adjusted longitudinal evidence; zero-order estimates and one-time retrospective online surveys count as cross-sectional. Studies of other outcomes (relationship quality, poverty), and studies where the factor was not what was randomised (marked indirect), are listed but do not raise the grade. Every number below '
         'is copied from a mechanically verified record in [`evidence.json`](evidence.json) or the project\'s '
         '[literature evidence](../literature_evidence/EVIDENCE.md).', '',
         '| Factor | Decision | Strongest evidence on divorce | Direction | Size | What a person can conclude |', '|---|---|---|---|---|---|']
    for g in grades:
        F.append(f"| **{g['label']}** | {_cell(g['decision'])} | {g['strongest_design'].replace('_', ' ')} | {_cell(g['direction'])} | {_cell(g['size'])} | {_cell(g['causal_reading'])} |")
    F.append('')
    for g in grades:
        F += [f"## {g['label']}", '', f"*App inputs:* {'; '.join(g['app_inputs'])}. *Gaps:* {g['gaps']}", '',
              '| Evidence | Design | Measure | Estimate (95% CI) | Provenance |', '|---|---|---|---|---|']
        for e in g['evidence']:
            name = e.get('title') or f"{e.get('predictor', '')}: {e.get('contrast', '')}"
            cite = e['citation'].split('(')[0].strip().rstrip(',') + ' ' + (re.search(r'\((\d{4})\)', e['citation']).group(0) if re.search(r'\((\d{4})\)', e['citation']) else '')
            F.append(f"| `{e['ref']}`{' (indirect: factor not randomised)' if e['role'] == 'indirect' else ''}: {_cell(name)}. {_cell(cite)} | {e['design_class'].replace('_', ' ')} | {_cell(e.get('measure'))} | {_num(e)} | {e['provenance']} |")
        F.append('')
    open(os.path.join(ROOT, 'FACTORS.md'), 'w', encoding='utf-8').write('\n'.join(F) + '\n')


def recheck(cache=CACHE):
    """Re-run every check against evidence.json; returns (n_records, problems)."""
    ev = json.load(open(os.path.join(ROOT, 'evidence.json'), encoding='utf-8'))['records']
    srcs = sources_for(cache)
    problems = []
    for r in ev:
        res = check(r, srcs)
        if r['verified'] and (res['values'] == 'fail' or res['quote'] == 'fail' or res['numbers'] == 'fail' or 'fail' in res['extra_quotes']):
            problems.append((r['id'], res['problems']))
    return len(ev), problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--doi', action='store_true', help='query Crossref for DOIs not yet ok in doi_check.json')
    ap.add_argument('--check', action='store_true', help='only re-check evidence.json')
    ap.add_argument('--allow-missing', action='store_true')
    a = ap.parse_args(argv)
    if a.check:
        n, probs = recheck()
        for p in probs:
            print('MISMATCH', p)
        print(f'{n} records re-checked; {len(probs)} mismatches')
        return 1 if probs else 0
    return build(a)


if __name__ == '__main__':
    sys.exit(main())
