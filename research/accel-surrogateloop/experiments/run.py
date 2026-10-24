"""Surrogate-assisted vs FE-only design search at equal FE-evaluation budget. Results go to results.json and results.txt.
python3 run.py [--report]"""
import json, os, sys, time
from multiprocessing import Pool
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'src'))
from accel_surrogateloop import fe2d, loop

SEEDS = 8
BUDGET = 150
CHECK = [50, 100, 150]
LIMITS = {'u40': 0.040, 'u30': 0.030}     # limit = 64x8 deflection of a uniform beam of this height (m)
METHODS = ['random', 'es', 'assisted_float', 'assisted_qat6']
LONG = 1500                              # long ES run for a best-known reference


def limit_of(name):
    return fe2d.tip_deflection(np.full(fe2d.NSEG, LIMITS[name]), *loop.MESH)


def job(args):
    lname, seed, method = args
    lim = limit_of(lname)
    rng = np.random.default_rng(100 + seed)
    t = time.time()
    st = None
    if method == 'random':
        tr = loop.random_search(rng, lim, BUDGET)[0]
    elif method == 'es':
        tr = loop.es(rng, lim, BUDGET)[0]
    elif method == 'assisted_float':
        tr, _, _, st = loop.assisted(rng, lim, BUDGET)
    elif method == 'assisted_qat6':
        tr, _, _, st = loop.assisted(rng, lim, BUDGET, wbits=6)
    elif method == 'long':
        tr = loop.es(rng, lim, LONG)[0]
    return {'limit': lname, 'seed': seed, 'method': method, 'trace': tr, 'stats': st, 'secs': time.time() - t}


def main():
    jobs = [(l, s, m) for l in LIMITS for s in range(SEEDS) for m in METHODS] + [(l, 0, 'long') for l in LIMITS]
    t0 = time.time()
    with Pool(min(len(jobs), os.cpu_count() or 1)) as p:
        out = p.map(job, jobs, chunksize=1)
    res = {'budget': BUDGET, 'check': CHECK, 'limits': {l: limit_of(l) for l in LIMITS}, 'seeds': SEEDS, 'runs': out,
           'secs': time.time() - t0}
    json.dump(res, open(os.path.join(HERE, 'results.json'), 'w'))
    report()


def summarise(res):
    S = {}
    for l in res['limits']:
        ref = [r for r in res['runs'] if r['limit'] == l and r['method'] == 'long'][0]['trace'][-1]
        S[l] = {'ref': ref, 'methods': {}}
        for m in METHODS:
            rs = [r for r in res['runs'] if r['limit'] == l and r['method'] == m]
            row = {}
            for c in res['check']:
                v = [r['trace'][c - 1] for r in rs]
                feas = [x for x in v if x is not None]
                gap = [x / ref - 1 for x in feas]
                row[c] = {'feasible': len(feas), 'n': len(v), 'median_gap': float(np.median(gap)) if gap else None,
                          'worst_gap': float(max(gap)) if gap else None, 'best_gap': float(min(gap)) if gap else None}
            S[l]['methods'][m] = row
            if rs[0]['stats']:
                S[l]['methods'][m]['picks'] = [sum(r['stats']['picked'] for r in rs), sum(r['stats']['infeasible_picks'] for r in rs)]
    return S


def report():
    res = json.load(open(os.path.join(HERE, 'results.json')))
    S = summarise(res)
    lines = ['64x8 Q6 FE solve as the evaluator (%.2f s each on this CPU); %d seeds; budget %d FE evaluations; first 30 are random for every method'
             % (0.18, res['seeds'], res['budget']),
             'gap = best feasible mass / best-known mass - 1; best-known = one %d-evaluation ES run per limit (not a proven optimum)' % LONG, '']
    for l, s in S.items():
        lines.append('limit %s: tip deflection <= %.4f mm (uniform %.0f mm beam); best-known mass sum(h) = %.4f m'
                     % (l, 1000 * res['limits'][l], 1000 * LIMITS[l], s['ref']))
        lines.append('method | evals | feasible runs | median gap % | best gap % | worst gap %')
        for m, row in s['methods'].items():
            for c in res['check']:
                r = row[c]
                f = lambda x: '-' if x is None else '%.2f' % (100 * x)
                lines.append('%s | %d | %d/%d | %s | %s | %s' % (m, c, r['feasible'], r['n'], f(r['median_gap']), f(r['best_gap']), f(r['worst_gap'])))
            if 'picks' in row:
                lines.append('%s: of %d surrogate-chosen designs sent to the FE solve, %d broke the limit' % (m, *row['picks']))
        lines.append('')
    open(os.path.join(HERE, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    report() if '--report' in sys.argv else main()
