# Fewest late changes to other people when a posted week is reissued after a call-out, by an independent ILP (HiGHS via
# scipy), on the 41 weeks dumped by eval/reissue-ilp-export.mjs. Two stages per week:
#   1. least open hours, under the hard rules alone (the same rules as eval/callout-ilp-check.py: availability with the
#      caller's day off and the started shifts pinned, one person per shift copy, the rest gap between any two of a
#      person's shifts, the weekly hour cap, a daily cap when set, at most maxConsec days in a row);
#   2. at exactly that many open hours, the fewest changes to people other than the caller, counted the way
#      scheduleChanges (calc.mjs) counts them: per person, a posted shift kept at the same start and end is no change;
#      on each day the leftover posted and new shifts pair off as moves, and the rest are cancellations or additions,
#      so that day costs max(unkept posted shifts, unmatched new shifts). No pay terms.
# With --all the caller's own changes count too (scheduleChanges with no one exempt): the study exempts every change to
# the caller, so the least under its count may move the caller's other shifts, which a rule exempting only the change the
# caller asked for would not allow for free.
# Each engine roster is also scored by the same count and checked against the hard rules, so the count is tied to
# scheduleChanges and the rules to the engine.
#   node eval/reissue-ilp-export.mjs > /tmp/r.json && python3 eval/reissue-ilp-check.py /tmp/r.json   (pip install scipy)
import json, sys, time
from collections import defaultdict
import numpy as np
ALL = '--all' in sys.argv
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix


def model(w):
    sl, el = w['slots'], w['elig']
    P, S = len(el), len(sl)
    days = sorted({s[2] for s in sl})
    types = sorted({(s[0], s[1]) for s in sl})
    T = len(types)
    tof = [types.index((s[0], s[1])) for s in sl]
    tday = [next(s[2] for s in sl if (s[0], s[1]) == t) for t in types]
    posted = np.zeros((P, T), dtype=int)
    for s, o in enumerate(w['posted']):
        if o >= 0: posted[o][tof[s]] += 1
    others = [p for p in range(P) if p != w['caller'] or ALL]
    D = len(days)
    # variables: x[p,s], open[s], y[p,d] works day d, k[p,t] posted shifts of type t kept, c[p,d] changes on day d
    nx, no, ny, nk, nc = P * S, S, P * D, P * T, P * D
    X = lambda p, s: p * S + s
    O = lambda s: nx + s
    Y = lambda p, d: nx + no + p * D + d
    K = lambda p, t: nx + no + ny + p * T + t
    C = lambda p, d: nx + no + ny + nk + p * D + d
    nv = nx + no + ny + nk + nc
    hours = [(s[1] - s[0]) / 60 for s in sl]
    rows = []
    row = lambda coefs, lo, hi: rows.append((coefs, lo, hi))
    for s in range(S): row([(X(p, s), 1) for p in range(P)] + [(O(s), 1)], 1, 1)
    for p in range(P):
        row([(X(p, s), hours[s]) for s in range(S)], 0, w['maxH'][p])
        for a in range(S):
            for b in range(a + 1, S):
                if not (el[p][a] and el[p][b]): continue
                x, y = (a, b) if sl[a][0] <= sl[b][0] else (b, a)
                if sl[y][0] < sl[x][1] + w['rest']: row([(X(p, a), 1), (X(p, b), 1)], 0, 1)
        for di, d in enumerate(days):
            on = [s for s in range(S) if sl[s][2] == d]
            for s in on: row([(X(p, s), 1), (Y(p, di), -1)], -np.inf, 0)
            if w['maxDaily'][p] > 0: row([(X(p, s), hours[s]) for s in on], 0, w['maxDaily'][p])
        m = w['maxConsec']
        for di in range(D - m):
            if all(days[di + j] == days[di] + j for j in range(m + 1)):
                row([(Y(p, di + j), 1) for j in range(m + 1)], 0, m)
        for t in range(T):  # k <= assigned copies of type t (k <= posted copies is its bound)
            row([(K(p, t), 1)] + [(X(p, s), -1) for s in range(S) if tof[s] == t], -np.inf, 0)
        for di, d in enumerate(days):
            ts = [t for t in range(T) if tday[t] == d]
            # c >= sum(posted - k) and c >= sum(assigned - k) over the day's types
            row([(C(p, di), 1)] + [(K(p, t), 1) for t in ts], sum(posted[p][t] for t in ts), np.inf)
            row([(C(p, di), 1)] + [(K(p, t), 1) for t in ts] + [(X(p, s), -1) for s in range(S) if tof[s] in ts], 0, np.inf)
    lb, ub = np.zeros(nv), np.full(nv, np.inf)
    ub[:nx + no + ny] = 1
    for p in range(P):
        for s in range(S):
            if not el[p][s]: ub[X(p, s)] = 0
        for t in range(T): ub[K(p, t)] = posted[p][t]
    integ = np.ones(nv); integ[nx + no + ny + nk:] = 0  # c is continuous: at the optimum it equals the integer max
    A = lil_matrix((len(rows), nv))
    for r, (coefs, _, _) in enumerate(rows):
        for v, cf in coefs: A[r, v] += cf
    return dict(A=A.tocsr(), lo=[r[1] for r in rows], hi=[r[2] for r in rows], lb=lb, ub=ub, integ=integ, nv=nv, X=X, O=O, C=C,
                P=P, S=S, D=D, hours=hours, others=others, rows=rows, sl=sl, days=days, tof=tof, posted=posted, types=types)


def solve(w, limit=300):
    m = model(w)
    open_cost = np.zeros(m['nv'])
    for s in range(m['S']): open_cost[m['O'](s)] = m['hours'][s]
    t0 = time.time()
    r1 = milp(open_cost, constraints=LinearConstraint(m['A'], m['lo'], m['hi']), integrality=m['integ'], bounds=Bounds(m['lb'], m['ub']), options={'time_limit': limit})
    if r1.status != 0: return None, None, r1.status, time.time() - t0
    best_open = round(r1.fun, 6)
    ch_cost = np.zeros(m['nv'])
    for p in m['others']:
        for d in range(m['D']): ch_cost[m['C'](p, d)] = 1
    A2 = LinearConstraint(open_cost.reshape(1, -1), -np.inf, best_open + 1e-6)
    r2 = milp(ch_cost, constraints=[LinearConstraint(m['A'], m['lo'], m['hi']), A2], integrality=m['integ'], bounds=Bounds(m['lb'], m['ub']), options={'time_limit': limit})
    return best_open, (round(r2.fun, 6) if r2.status == 0 else None), r2.status, time.time() - t0


def score(w, owner):
    """Open hours, changes to others (the ILP's count) and broken hard rules of a fixed roster."""
    sl, el = w['slots'], w['elig']
    P = len(el)
    opn = sum((s[1] - s[0]) / 60 for s, o in zip(sl, owner) if o < 0)
    broken = []
    for p in range(P):
        mine = sorted([s for s, o in enumerate(owner) if o == p], key=lambda s: sl[s][0])
        if any(not el[p][s] for s in mine): broken.append(f'{p} ineligible')
        if sum((sl[s][1] - sl[s][0]) / 60 for s in mine) > w['maxH'][p] + 1e-9: broken.append(f'{p} hours')
        for i in range(len(mine)):
            for j in range(i + 1, len(mine)):
                a, b = mine[i], mine[j]
                if sl[b][0] < sl[a][1] + w['rest']: broken.append(f'{p} rest')
        worked = sorted({sl[s][2] for s in mine}); run = 1
        for i in range(1, len(worked)):
            run = run + 1 if worked[i] == worked[i - 1] + 1 else 1
            if run > w['maxConsec']: broken.append(f'{p} consec')
    changes = 0
    for p in range(P):
        if p == w['caller'] and not ALL: continue
        was, now = defaultdict(int), defaultdict(int)
        for s, o in enumerate(w['posted']):
            if o == p: was[(sl[s][0], sl[s][1], sl[s][2])] += 1
        for s, o in enumerate(owner):
            if o == p: now[(sl[s][0], sl[s][1], sl[s][2])] += 1
        byday = defaultdict(lambda: [0, 0])
        for t in set(was) | set(now):
            k = min(was[t], now[t])
            byday[t[2]][0] += was[t] - k; byday[t[2]][1] += now[t] - k
        changes += sum(max(a, b) for a, b in byday.values())
    return opn, changes, broken


if __name__ == '__main__':
    W = json.load(open([a for a in sys.argv[1:] if not a.startswith('--')][0]))
    variants = list(W[0]['engine'])
    tot = defaultdict(float); n_above = defaultdict(int); mismatch = 0; broken_any = 0; least = 0
    for w in W:
        best_open, best_ch, st, secs = solve(w)
        cells = []
        for v in variants:
            e = w['engine'][v]
            o, ch, broken = score(w, e['owner'])
            if (not ALL and ch != e['changes']) or abs(o - e['open']) > 1e-6: mismatch += 1
            if broken: broken_any += 1
            tot[v] += ch
            if best_ch is not None and ch > best_ch + 1e-6: n_above[v] += 1
            cells.append(f'{v} {e["open"]:g} h {ch:>2}{" (scheduleChanges " + str(e["changes"]) + ")" if not ALL and ch != e["changes"] else ""}')
        tot['ilp'] += best_ch if best_ch is not None else float('nan')
        if best_ch is not None and best_ch + 1e-6 >= score(w, w['engine']['keep/shift 1']['owner'])[1]: least += 1
        print(f'{w["set"]:6} {w["case"]:8} ilp open {best_open:g} h, least changes {best_ch:g}   ' + '   '.join(cells) + f'   {secs:.1f}s', flush=True)
    print(f'{len(W)} weeks{" (the caller counted too)" if ALL else ""}; least changes in total {tot["ilp"]:g}; ' + '; '.join(f'{v} {tot[v]:g} ({n_above[v]} weeks above the least)' for v in variants))
    print(f'engine change counts differing from the ILP count: {mismatch}; engine rosters breaking an ILP rule: {broken_any}; keep/shift 1 at the least on {least} of {len(W)}')
