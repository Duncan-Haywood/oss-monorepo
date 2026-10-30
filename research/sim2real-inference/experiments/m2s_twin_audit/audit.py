"""Audit of the *-twin projects under research/: what evidence each carries.

Stdlib only. Reads each twin project's README.md and project.json and records
(1) whether it discloses itself as stylised, (2) whether it names a real data
source, (3) whether it uses a paired / control-variate estimator, (4) any
explicit rho (paired correlation) values it states. Keyword rules, not
judgement: they over- and under-count in known ways (see README.md here).
Run: python3 audit.py   (writes results/audit.csv and results/summary.txt)
"""
import csv, json, os, re, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
REAL = re.compile(r'(public dataset|open dataset|datasheet|data sheet|published (?:table|figure|data|value|measurement)|'
                  r'\bkaggle\b|\bnasa\b|\bnoaa\b|\busgs\b|\bopenml\b|doi\.org|arxiv\.org/abs)', re.I)
PAIR = re.compile(r'(control variate|prediction-powered|\bppi\b|paired (?:twin|correlation|rollout|estimat))', re.I)
RHO = re.compile(r'(?:ρ|\brho\b)\s*(?:\([^)]*\))?\s*(?:=|≈|~|of)\s*(0?\.\d+|1\.0)', re.I)

def text(d):
    t = ''
    for f in ('README.md', 'project.json'):
        p = os.path.join(ROOT, 'research', d, f)
        if os.path.exists(p):
            t += open(p, errors='ignore').read() + '\n'
    return t

dirs = sorted(d for d in os.listdir(os.path.join(ROOT, 'research'))
              if 'twin' in d and not d.startswith(('_', '.'))
              and os.path.isdir(os.path.join(ROOT, 'research', d)))
rows = []
for d in dirs:
    t = text(d)
    rhos = [float(x) for x in RHO.findall(t) if 0 < float(x) <= 1]
    rows.append(dict(slug=d, stylised=int(bool(re.search(r'styli[sz]ed', t, re.I))),
                     real_source=int(bool(REAL.search(t))), paired=int(bool(PAIR.search(t))),
                     n_rho=len(rhos), rho_min=min(rhos) if rhos else '', rho_max=max(rhos) if rhos else ''))
with open(os.path.join(HERE, 'results', 'audit.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

n = len(rows)
def k(key): return sum(r[key] for r in rows)
allrho = [r for r in rows if r['n_rho']]
both = [r for r in rows if r['stylised'] and not r['real_source']]
out = [f'twin projects audited: {n}',
       f'disclose "stylised": {k("stylised")} ({k("stylised")/n:.0%})',
       f'name a real data source (keyword rule): {k("real_source")} ({k("real_source")/n:.0%})',
       f'stylised and no real source named: {len(both)} ({len(both)/n:.0%})',
       f'use a paired / control-variate estimator: {k("paired")} ({k("paired")/n:.0%})',
       f'state at least one explicit rho value: {len(allrho)} ({len(allrho)/n:.0%})']
if allrho:
    lo = [r['rho_min'] for r in allrho]; hi = [r['rho_max'] for r in allrho]
    out.append(f'stated rho values, across those: min {min(lo)}, median of per-project max {st.median(hi)}, max {max(hi)}')
open(os.path.join(HERE, 'results', 'summary.txt'), 'w').write('\n'.join(out) + '\n')
print('\n'.join(out))
