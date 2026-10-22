"""Whole-system view of accel-cascade's committed results, using accel-frontend's per-frame energy."""
import json, os, sys
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(H, '..', 'src'))
from accel_sysmodel import system as S

casc = json.load(open(os.path.join(H, '..', '..', 'accel-cascade', 'experiments', 'results.json')))
fe = json.load(open(os.path.join(H, '..', '..', 'accel-frontend', 'experiments', 'results.json')))['fe_frame_nj']
scales = [1.0, 0.3, 0.1, 0.03, 0.01]
out = {'fe_frame_nj': fe, 'fe_per_decision_nj': S.fe_nj_per_decision(fe), 'scales': scales, 'cascade': [], 'budget': []}
lines = ['front end %.2f nJ/frame -> %.1f nJ/decision (12.5 frames)' % (fe, S.fe_nj_per_decision(fe)), '']
lines.append('A. whole-system saving of best single-or-cascade vs best single (mean over 5 seeds), by front-end cost scale')
lines.append('target | clf-only saving | ' + ' | '.join('fe x%g' % s for s in scales) + ' | test acc diff')
for t in casc['targets']:
    rows = [p['targets'][str(t)] for p in casc['per_seed'] if str(t) in p['targets']]
    se = np.array([r['single']['e_test'] for r in rows]); ae = np.array([r['any']['e_test'] for r in rows])
    ad = np.mean([r['any']['test'] - r['single']['test'] for r in rows])
    sav = [float(np.mean([S.saving(a, b, fe, s) for a, b in zip(se, ae)])) for s in scales]
    out['cascade'].append({'target': t, 'clf_only': float(np.mean((se - ae) / se)), 'system': sav, 'acc_diff': float(ad)})
    lines.append('%.2f | %5.1f%% | ' % (t, 100 * np.mean((se - ae) / se)) + ' | '.join('%5.2f%%' % (100 * x) for x in sav) + ' | %+.4f' % ad)
lines += ['', 'B. the other side: with the front end fixed, what does the most accurate model cost in whole-system energy?',
          'per seed, cheapest design with val >= 0.5 vs the design with the best val accuracy (test accuracy reported)']
rs = []
for p in casc['per_seed']:
    D = p['designs']
    cheap = min((d for d in D if d['val'] >= 0.5), key=lambda d: d['e_nj'])
    best = max(D, key=lambda d: d['val'])
    rs.append((cheap, best, S.system_nj(best['e_nj'], fe) / S.system_nj(cheap['e_nj'], fe)))
    out['budget'].append({'seed': p['seed'], 'cheap_e': cheap['e_nj'], 'cheap_test': cheap['test'], 'best_e': best['e_nj'], 'best_test': best['test'], 'system_ratio': rs[-1][2], 'clf_ratio': best['e_nj'] / cheap['e_nj']})
    lines.append('seed %d | cheap %.1f nJ test %.3f | best %.1f nJ test %.3f | classifier x%.1f, system x%.3f' % (p['seed'], cheap['e_nj'], cheap['test'], best['e_nj'], best['test'], best['e_nj'] / cheap['e_nj'], rs[-1][2]))
open(os.path.join(H, 'results.txt'), 'w').write('\n'.join(lines) + '\n')
json.dump(out, open(os.path.join(H, 'results.json'), 'w'), indent=1)
print('\n'.join(lines))
