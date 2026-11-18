"""Independent check of beam.mjs: Macaulay singularity functions in exact rational arithmetic.

No stiffness matrix, no elements: the unknown reactions, fixed-end moments and the two
integration constants come from v = 0 at supports, v' = 0 at fixed ends and global
equilibrium, solved exactly with fractions.Fraction. Random multi-span beams (constant EI)
with point loads, point moments and partial trapezoidal loads are compared at 200 stations
for bending moment and deflection, and at every support for the reaction.

Run: python3 check/differential.py   (needs node on PATH; writes nothing)
"""
import json, random, subprocess, sys
from fractions import Fraction as Fr
from pathlib import Path

HERE = Path(__file__).resolve().parent

def mac(x, a, n):
    d = x - a
    if d < 0: return Fr(0)
    if n > 0: return d ** n
    # a couple at a makes M jump there: take the left-hand limit (x = a counts as before it),
    # except at x = 0 where only the right-hand side exists. dump.mjs uses the same convention.
    return Fr(1) if (d > 0 or x == 0) else Fr(0)

def terms_for(model):
    """Moment terms (coef, a, n, tag) for the known loads: M(x) += coef * <x-a>^n."""
    t = []
    for l in model['loads']:
        if l['type'] == 'point':
            t.append((-Fr(l['P']), Fr(l['x']), 1))
        elif l['type'] == 'moment':
            t.append((Fr(l['M']), Fr(l['x']), 0))
        else:
            x1, x2, w1, w2 = Fr(l['x1']), Fr(l['x2']), Fr(l['w1']), Fr(l['w2'])
            k = (w2 - w1) / (x2 - x1)
            t += [(-w1 / 2, x1, 2), (-k / 6, x1, 3), (w1 / 2, x2, 2), (k / 6, x2, 3), (k * (x2 - x1) / 2, x2, 2)]
    return t

def solve_gauss(A, b):
    n = len(A); M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = next(r for r in range(c, n) if M[r][c] != 0)
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c and M[r][c] != 0:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * bb for a, bb in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]

def macaulay(model):
    EI = Fr(model['EI']); sup = [Fr(0)]
    for L in model['spans']: sup.append(sup[-1] + Fr(L))
    known = terms_for(model)
    # unknowns: R_k (up) at non-free supports, C_k (clockwise) at fixed supports, c0, c1
    unk = [('R', k) for k, s in enumerate(model['supports']) if s != 'free'] + [('C', k) for k, s in enumerate(model['supports']) if s == 'fixed'] + [('c0', None), ('c1', None)]
    def unit_term(u):  # moment term contributed by a unit value of unknown u
        kind, k = u
        if kind == 'R': return (Fr(1), sup[k], 1)
        if kind == 'C': return (Fr(1), sup[k], 0)
        return None
    def v_of(terms, x):  # EI v contribution (without constants)
        return sum(c * mac(x, a, n + 2) / ((n + 1) * (n + 2)) for c, a, n in terms)
    def th_of(terms, x):
        return sum(c * mac(x, a, n + 1) / (n + 1) for c, a, n in terms)
    rows, rhs = [], []
    for k, s in enumerate(model['supports']):
        if s == 'free': continue
        row = []
        for u in unk:
            if u[0] == 'c0': row.append(EI)
            elif u[0] == 'c1': row.append(EI * sup[k])
            else: row.append(v_of([unit_term(u)], sup[k]))
        rows.append(row); rhs.append(-v_of(known, sup[k]))
        if s == 'fixed':
            row = []
            for u in unk:
                if u[0] == 'c0': row.append(Fr(0))
                elif u[0] == 'c1': row.append(EI)
                else: row.append(th_of([unit_term(u)], sup[k]))
            rows.append(row); rhs.append(-th_of(known, sup[k]))
    # equilibrium past the right end: M and V beyond x_end vanish -> evaluate M at end + 1 and end + 2
    for xe in (sup[-1] + 1, sup[-1] + 2):
        row = [Fr(0) if u[0] in ('c0', 'c1') else (lambda tt: tt[0] * mac(xe, tt[1], tt[2]))(unit_term(u)) for u in unk]
        rows.append(row); rhs.append(-sum(c * mac(xe, a, n) for c, a, n in known))
    sol = solve_gauss(rows, rhs)
    vals = dict(zip(unk, sol))
    allterms = known + [(vals[u] * unit_term(u)[0], unit_term(u)[1], unit_term(u)[2]) for u in unk if u[0] in ('R', 'C')]
    def M(x): return sum(c * mac(x, a, n) for c, a, n in allterms)
    def defl(x): return -(vals[('c0', None)] + vals[('c1', None)] * x + v_of(allterms, x) / EI)
    R = [vals.get(('R', k), Fr(0)) for k in range(len(sup))]
    return M, defl, R, sup

def rnd(lo, hi, den=4):
    return Fr(random.randint(int(lo * den), int(hi * den)), den)

def random_model(rng_seed):
    random.seed(rng_seed)
    n = random.randint(1, 5)
    spans = [rnd(3, 20) for _ in range(n)]
    while True:
        supports = [random.choice(['pin', 'pin', 'fixed', 'free']) for _ in range(n + 1)]
        restrained = sum(1 for s in supports if s != 'free') + sum(1 for s in supports if s == 'fixed')
        if restrained >= 2 and supports[0] != 'free' or supports[-1] != 'free':
            if not (n == 1 and 'free' in supports and 'fixed' not in supports) and restrained >= 2:
                # no free interior support next to a free end (mechanism)
                if all(s != 'free' for s in supports[1:-1]): break
    total = sum(spans); loads = []
    for _ in range(random.randint(1, 6)):
        kind = random.choice(['point', 'udl', 'udl', 'moment'])
        if kind == 'point': loads.append({'type': 'point', 'x': rnd(0, float(total)), 'P': rnd(-200, 2000)})
        elif kind == 'moment': loads.append({'type': 'moment', 'x': rnd(0, float(total)), 'M': rnd(-500, 500)})
        else:
            a = rnd(0, float(total) - 1); b = min(total, a + rnd(0.5, float(total)))
            loads.append({'type': 'udl', 'x1': a, 'x2': b, 'w1': rnd(0, 300), 'w2': rnd(0, 300)})
    return {'spans': spans, 'supports': supports, 'EI': rnd(1e4, 1e6, 1), 'loads': loads}

def to_json(o):
    if isinstance(o, Fr): return float(o)
    if isinstance(o, dict): return {k: to_json(v) for k, v in o.items()}
    if isinstance(o, list): return [to_json(v) for v in o]
    return o

def main(n_models=60):
    models = [random_model(s) for s in range(n_models)]
    cases, refs = [], []
    for m in models:
        M, defl, R, sup = macaulay(m)
        total = sup[-1]; xs = [total * i / 200 for i in range(201)]
        cases.append({'model': to_json(m), 'xs': [float(x) for x in xs]})
        refs.append(([float(M(x)) for x in xs], [float(defl(x)) for x in xs], [float(r) for r in R]))
    out = json.loads(subprocess.run(['node', str(HERE / 'dump.mjs')], input=json.dumps(cases), capture_output=True, text=True, check=True).stdout)
    worst = {'M': 0.0, 'defl': 0.0, 'R': 0.0}
    for (Mr, Dr, Rr), got, m in zip(refs, out, models):
        sM = max(1.0, max(abs(v) for v in Mr)); sD = max(1e-12, max(abs(v) for v in Dr)); sR = max(1.0, max(abs(v) for v in Rr))
        eM = max(abs(a - p['M']) for a, p in zip(Mr, got['pts'])) / sM
        eD = max(abs(a - p['defl']) for a, p in zip(Dr, got['pts'])) / sD
        eR = max(abs(a - r['force']) for a, r in zip(Rr, got['R'])) / sR
        worst['M'] = max(worst['M'], eM); worst['defl'] = max(worst['defl'], eD); worst['R'] = max(worst['R'], eR)
    print(f'{n_models} random beams (1-5 spans, pin/fixed/free, point loads, point moments, partial trapezoids), 201 stations each')
    print(f'worst relative difference vs exact Macaulay: moment {worst["M"]:.1e}, deflection {worst["defl"]:.1e}, reactions {worst["R"]:.1e}')
    ok = all(v < 1e-8 for v in worst.values())
    print('PASS' if ok else 'FAIL')
    return 0 if ok else 1

if __name__ == '__main__':
    sys.exit(main())
