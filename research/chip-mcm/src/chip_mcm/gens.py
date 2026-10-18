"""Verilog for a bank of constant multipliers y_j = x * K_j (x unsigned XW bits), three forms (original, MIT).

`op` writes each product with Yosys's `*`; `csd` writes each as its own canonical-signed-digit sum; `mcm`
shares two-digit sub-sums (x +/- (x << d)) across the whole bank by greedy common-subexpression elimination
(Hartley 1996) on the CSD digits.
"""
from collections import Counter

XW = 8
WW = 16  # internal width: x * K < 2**16 for K < 256; sums are exact modulo 2**WW and outputs are truncated


def csd(k):
    """Canonical signed digits of k >= 0 as a list of (shift, +1/-1); no two adjacent non-zero digits."""
    out, i = [], 0
    while k:
        if k & 1:
            d = 2 - (k & 3)
            out.append((i, d))
            k -= d
        k >>= 1
        i += 1
    return out


def _pairs_by_key(t):
    """Disjoint pairs of raw-x terms of one constant, (i, j, key) with key = (shift gap, sign product).

    Keys are taken most-frequent first within the constant, so pairs of different keys never overlap.
    """
    raw = [i for i, x in enumerate(t) if x[2] == "x"]
    cand = {}
    for a in raw:
        for b in raw:
            if t[b][0] > t[a][0]:
                cand.setdefault((t[b][0] - t[a][0], t[a][1] * t[b][1]), []).append((a, b))
    out, used = [], set()
    for key in sorted(cand, key=lambda k: (-len(cand[k]), k)):
        for a, b in cand[key]:
            if a not in used and b not in used:
                out.append((a, b, key))
                used.update((a, b))
    return out


def share(ks):
    """Greedy CSE over the CSD digits of the constants in `ks`.

    Returns (terms, patterns): terms[j] is a list of (shift, sign, wire) with wire 'x' or a pattern name, and
    patterns maps a name to (gap, sign) meaning wire = x + sign * (x << gap). A pattern is built only when it
    is used at least twice across the bank.
    """
    terms = [[(s, d, "x") for s, d in csd(k)] for k in ks]
    patterns = {}
    while True:
        count = Counter()
        for t in terms:
            count.update(key for _, _, key in _pairs_by_key(t))
        if not count:
            break
        key, n = max(count.items(), key=lambda kv: (kv[1], -kv[0][0], kv[0][1]))
        if n < 2:
            break
        name = f"p{key[0]}{'p' if key[1] > 0 else 'n'}"
        patterns[name] = key
        for j, t in enumerate(terms):
            hits = [(a, b) for a, b, k in _pairs_by_key(t) if k == key]
            drop = {i for ab in hits for i in ab}
            new = [(t[a][0], t[a][1], name) for a, _ in hits]
            terms[j] = [x for i, x in enumerate(t) if i not in drop] + new
    return terms, patterns


def _sum(ts):
    if not ts:
        return f"{WW}'d0"
    s = ""
    for n, (sh, sg, w) in enumerate(ts):
        t = f"({w} << {sh})" if sh else f"{w}"
        s += (t if sg > 0 else f"- {t}") if n == 0 else (f" + {t}" if sg > 0 else f" - {t}")
    return s


def verilog(form, ks, xw=XW):
    """Return (source, top) for a bank computing y0..y{M-1} = x * ks[j]. `form` is 'op', 'csd' or 'mcm'."""
    top = f"{form}_{'_'.join(map(str, ks))}"
    yws = [xw + max(1, k.bit_length()) for k in ks]
    outs = ", ".join(f"output [{w-1}:0] y{j}" for j, w in enumerate(yws))
    head = f"module {top}(input [{xw-1}:0] x, {outs}); wire [{WW-1}:0] xe = x;\n"
    body = ""
    if form == "op":
        for j, (k, w) in enumerate(zip(ks, yws)):
            body += f"assign y{j} = x * {w}'d{k};\n"
    else:
        if form == "csd":
            terms, pats = [[(s, d, "xe") for s, d in csd(k)] for k in ks], {}
        elif form == "mcm":
            terms, pats = share(ks)
            terms = [[(s, g, "xe" if w == "x" else w) for s, g, w in t] for t in terms]
        else:
            raise ValueError(form)
        for name, (gap, sg) in pats.items():
            body += f"wire [{WW-1}:0] {name} = xe {'+' if sg > 0 else '-'} (xe << {gap});\n"
        for j, t in enumerate(terms):
            body += f"wire [{WW-1}:0] s{j} = {_sum(t)};\nassign y{j} = s{j}[{yws[j]-1}:0];\n"
    return head + body + "endmodule\n", top


def adders(form, ks):
    """Two-input add/subtract operations the form writes (a count of the source, not a synthesis result)."""
    if form == "csd":
        return sum(max(0, len(csd(k)) - 1) for k in ks)
    terms, pats = share(ks)
    return len(pats) + sum(max(0, len(t) - 1) for t in terms)
