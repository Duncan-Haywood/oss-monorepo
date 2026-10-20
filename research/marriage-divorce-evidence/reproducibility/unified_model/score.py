"""Reference implementation of the browser scorer (app/unified.js), in plain Python.

Written loop for loop like the JavaScript (no numpy in the scoring path) so the parity test
agrees to rounding error. Used to write the test vectors and to check the Gaussian treatment of
missing inputs against multiple imputation (export.py).

score(bundle, profile, opts) -> {'horizons': [...], 'risk': [{mean, lo, hi}], 'draws': S}
  profile: {input name: value or None}; values are the raw codes listed in bundle['inputs'].
  opts: population (a survey key or 'new'), outcome ('native', 'separation_or_divorce',
        'legal_divorce'), start (years married now; 0 = from the wedding), horizons (years ahead).
"""
import math


# ---------------------------------------------------------------- deterministic normals
def mulberry32(seed):
    state = [seed & 0xFFFFFFFF]

    def imul(a, b):
        return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF

    def nxt():
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        a = state[0]
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return nxt


def normals(seed):
    u = mulberry32(seed)

    def nxt():
        u1 = 1 - u()
        u2 = u()
        return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
    return nxt


# ---------------------------------------------------------------- B-splines (engine.js splineFeatures)
def _basis(t, d, x, m):
    nb = len(t) - d - 1
    prev = [0.0] * (len(t) - 1)
    prev[m] = 1.0
    lower = prev
    for k in range(1, d + 1):
        cur = [0.0] * (len(t) - 1 - k)
        for i in range(len(cur)):
            v = 0.0
            a = t[i + k] - t[i]
            b = t[i + k + 1] - t[i + 1]
            if a > 0:
                v += ((x - t[i]) / a) * prev[i]
            if b > 0:
                v += ((t[i + k + 1] - x) / b) * prev[i + 1]
            cur[i] = v
        lower = prev
        prev = cur
    value = prev[:nb]
    deriv = [0.0] * nb
    for i in range(nb):
        a = t[i + d] - t[i]
        b = t[i + d + 1] - t[i + 1]
        v = 0.0
        if a > 0:
            v += (d / a) * lower[i]
        if b > 0:
            v -= (d / b) * lower[i + 1]
        deriv[i] = v
    return value, deriv


def _interval(t, d, x):
    nb = len(t) - d - 1
    m = d
    while m < nb - 1 and x >= t[m + 1]:
        m += 1
    return m


def spline_features(spec, x):
    t, d = spec['knots'], spec['degree']
    lo, hi = t[d], t[len(t) - d - 1]
    if x < lo or x > hi:
        edge = lo if x < lo else hi
        value, deriv = _basis(t, d, edge, _interval(t, d, edge))
        out = [v + deriv[i] * (x - edge) for i, v in enumerate(value)]
    else:
        out = _basis(t, d, x, _interval(t, d, x))[0]
    return out if spec['include_bias'] else out[:-1]


# ---------------------------------------------------------------- linear algebra (as in unified.js)
def cholesky(A):
    n = len(A)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = A[i][j]
            for k in range(j):
                s -= L[i][k] * L[j][k]
            if i == j:
                L[i][i] = math.sqrt(s) if s > 1e-12 else 0.0
            else:
                L[i][j] = s / L[j][j] if L[j][j] > 0 else 0.0
    return L


def chol_solve(L, b):
    n = len(L)
    y = [0.0] * n
    for i in range(n):
        s = b[i]
        for k in range(i):
            s -= L[i][k] * y[k]
        y[i] = s / L[i][i] if L[i][i] > 0 else 0.0
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = y[i]
        for k in range(i + 1, n):
            s -= L[k][i] * x[k]
        x[i] = s / L[i][i] if L[i][i] > 0 else 0.0
    return x


# ---------------------------------------------------------------- the design row
def design_row(bundle, profile):
    """Raw (unstandardised) main design values; None where the input was not given."""
    ds = bundle['design']
    row = []
    for col in ds['columns']:
        row.append(None)
    pos = {c: i for i, c in enumerate(ds['columns'])}
    for v, spec in ds['splines'].items():
        x = profile.get(v)
        if x is not None:
            for j, f in enumerate(spline_features(spec, float(x))):
                row[pos[f'{v}[s{j}]']] = f
    for v, levels in ds['onehot'].items():
        x = profile.get(v)
        if x is not None:
            for lv in levels[1:]:
                row[pos[f'{v}={lv}']] = 1.0 if str(x) == str(lv) else 0.0
    for v in ds['linear'] + ds['binary'] + ['female', 'same_sex']:
        x = profile.get(v)
        if x is not None:
            row[pos[v]] = float(x)
    ut = profile.get('union_type') or 'Married'
    for u in ds['union_types'][1:]:
        row[pos[f'union_type={u}']] = 1.0 if ut == u else 0.0
    return row


def primary_value(dev, profile):
    x = profile.get(dev['input'])
    if x is None:
        return None
    if dev['kind'] == 'lvl':
        return 1.0 if str(x) == str(dev['level']) else 0.0
    return float(x)


def quantile(sorted_vals, p):
    """numpy's default (linear) quantile of an already sorted list."""
    n = len(sorted_vals)
    h = (n - 1) * p
    lo = math.floor(h)
    hi = min(lo + 1, n - 1)
    return sorted_vals[lo] + (h - lo) * (sorted_vals[hi] - sorted_vals[lo])


def score(bundle, profile, opts):
    ds, post = bundle['design'], bundle['posterior']
    pops = bundle['populations']
    pop = opts.get('population', bundle['default_population'])
    lay = post['layout']
    S = len(post['draws'])
    raw = design_row(bundle, profile)
    z = [None if r is None else (r - m) / s for r, m, s in zip(raw, ds['mean'], ds['scale'])]
    cond = bundle['conditional']
    mu = cond['mean'][pop if pop in cond['mean'] else 'new']
    Sig = cond['cov']
    O = [i for i, v in enumerate(z) if v is not None]
    M = [i for i, v in enumerate(z) if v is None]
    cmean, Lc = [], []
    if M:
        if O:
            Loo = cholesky([[Sig[i][j] for j in O] for i in O])
            r = chol_solve(Loo, [z[i] - mu[i] for i in O])
            cmean = [mu[m] + sum(Sig[m][o] * r[k] for k, o in enumerate(O)) for m in M]
            # conditional covariance: Sig_MM - Sig_MO Sig_OO^-1 Sig_OM
            W = [chol_solve(Loo, [Sig[o][m] for o in O]) for m in M]
            C = [[Sig[mi][mj] - sum(Sig[mi][o] * W[b][k] for k, o in enumerate(O)) for b, mj in enumerate(M)]
                 for a, mi in enumerate(M)]
        else:
            cmean = [mu[m] for m in M]
            C = [[Sig[mi][mj] for mj in M] for mi in M]
        Lc = cholesky(C)
    # survey deviations for inputs that were given
    devs = []
    if pop in pops and pops[pop]['fitted']:
        for j, dv in enumerate(ds['deviation']):
            if dv['survey'] != pop:
                continue
            x = primary_value(dv, profile)
            if x is not None:
                devs.append((lay['delta'][0] + j, (x - dv['mean']) / dv['scale']))
    wy = profile.get('wedding_year')
    if wy is None:
        wy = pops[pop]['mean_wedding_year'] if pop in pops else 1990.0
    cz = (float(wy) - 1990) / 10
    bands = bundle['bands']
    NB = len(bands) - 1
    native = pops[pop]['outcome'] if pop in pops else 'separation_or_divorce'
    want = opts.get('outcome', 'native')
    shift = [0.0] * NB
    gam = bundle['outcome_layer']['legal_divorce']['log_ratio']
    if want == 'legal_divorce' and native != 'legal_divorce':
        shift = list(gam)
    elif want == 'separation_or_divorce' and native == 'legal_divorce':
        shift = [-g for g in gam]
    start = float(opts.get('start', 0.0))
    horizons = opts.get('horizons', [5, 10, 20])
    rnd = normals(bundle['prng_seed'])
    res = [[] for _ in horizons]
    si = pops[pop]['index'] if pop in pops and pops[pop]['fitted'] else None
    for d in range(S):
        th = post['draws'][d]
        zm = list(cmean)
        if M:
            eps = [rnd() for _ in M]
            for a in range(len(M)):
                s = 0.0
                for b in range(a + 1):
                    s += Lc[a][b] * eps[b]
                zm[a] += s
        lp = 0.0
        b0 = lay['beta'][0]
        k = 0
        for i in range(len(z)):
            if z[i] is not None:
                lp += th[b0 + i] * z[i]
            else:
                lp += th[b0 + i] * zm[k]
                k += 1
        for idx, x in devs:
            lp += th[idx] * x
        if si is not None:
            lp += th[lay['c'][0] + si] * cz
        base = []
        for b in range(NB):
            if si is not None:
                v = th[lay['g'][0] + b] + th[lay['a'][0] + si] + th[lay['r'][0] + si * NB + b]
            else:
                na = lay['a'][1] - lay['a'][0]
                v = th[lay['g'][0] + b] + sum(th[lay['a'][0] + j] for j in range(na)) / na
            base.append(math.exp(v + lp + shift[b]))
        for hi, h in enumerate(horizons):
            H = 0.0
            for b in range(NB):
                lo_b, hi_b = bands[b], bands[b + 1]
                ov = min(start + h, hi_b) - max(start, lo_b)
                if ov > 0:
                    H += base[b] * ov
            res[hi].append(-math.expm1(-H))
    out = []
    for vals in res:
        sv = sorted(vals)
        out.append(dict(mean=sum(vals) / len(vals), lo=quantile(sv, 0.05), hi=quantile(sv, 0.95)))
    return dict(horizons=list(horizons), risk=out, draws=S, missing_columns=len(M))
