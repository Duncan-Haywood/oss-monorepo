#!/usr/bin/env python3
"""Mechanically re-check every record in ../evidence.json.

For each record this checks, without judgement calls:

1. quote      - every fragment of `quote` (fragments are separated by "..." or an
                ellipsis) occurs in the cached source text, after normalising Unicode
                (NFKC), dashes/minus signs, quotes, case, whitespace and table-cell pipes.
                Numbers must match as printed: "2.41" does not match "2.412" or "2.42".
2. numbers    - every number printed in the quote occurs as a token in the source.
3. values     - `estimate`, `ci_low`, `ci_high` are either printed in the quote
                (or the quote's percentage / 100) or are recomputed here from the
                record's `derivation` (whose inputs must themselves be printed in the
                quote). Arithmetic tolerance: 0.0006 absolute or 0.1% relative.
4. extra quotes (base rates etc.) get checks 1-2 against their own source.

Source texts are NOT in the repository (copyright). Put plain-text extractions in
--cache (default: ./source_cache next to evidence.json; see SOURCES.json for which file
each source key expects and how it was made). A record whose source text is absent is
reported as SKIPPED for checks 1, 2 and 4; check 3 and the derivation arithmetic still run.

Exit status: 0 when every checked record agrees with its stored `verified` flag and no
check that could run failed for a record marked verified; 1 otherwise.

    python3 scripts/verify_quotes.py                 # check, print summary
    python3 scripts/verify_quotes.py --cache DIR -v  # verbose per-record output
    python3 scripts/verify_quotes.py --json out.json # machine-readable report
"""
import argparse, json, math, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

DASHES = dict.fromkeys(map(ord, '−–—‒‐‑﹣－'), '-')
QUOTES = {ord('‘'): "'", ord('’'): "'", ord('′'): "'", ord('“'): '"',
          ord('”'): '"', ord('″'): '"', ord('´'): "'"}
ELLIPSIS = re.compile(r'\s*(?:\.\s?\.\s?\.|…)\s*')
NUM = re.compile(r'(?<![\d.])-?(?:\d{1,3}(?:,\d{3})+|\d+)?\.?\d+(?!\d)')
TOKEN = re.compile(r'\w+|[^\w\s|]')


def normalise(s, glyph_fixes=()):
    s = unicodedata.normalize('NFKC', s)
    for a, b in glyph_fixes:
        s = s.replace(a, b)
    s = s.replace('­', '').translate(DASHES).translate(QUOTES)
    return s.lower()


def tokens(s):
    return ' ' + ' '.join(TOKEN.findall(s)) + ' '


def dehyphenate(s):
    return re.sub(r'(?<=[a-z])-\s*\n\s*(?=[a-z])', '', s)


class Source:
    def __init__(self, key, meta, cache):
        self.key, self.meta, self.texts, self.flat = key, meta, [], []
        fixes = [tuple(x) for x in meta.get('glyph_fixes', [])]
        for f in meta.get('cache_files', []):
            p = os.path.join(cache, f)
            if os.path.exists(p):
                raw = normalise(open(p, encoding='utf-8', errors='replace').read(), fixes)
                self.texts.append(tokens(raw))
                self.texts.append(tokens(dehyphenate(raw)))
                self.flat.append(re.sub(r'\s+', ' ', raw))

    @property
    def available(self):
        return bool(self.texts)

    def has(self, fragment):
        t = tokens(normalise(fragment))
        if t.strip() == '':
            return True
        return any(t in x for x in self.texts)


    def has_number(self, num):
        """A number as printed: not part of a longer number (2.41 is not in 2.412 or 12.41)."""
        pat = re.compile(r'(?<![\d.])' + re.escape(num) + r'(?![\d])')
        return any(pat.search(x) for x in self.flat)


def fragments(quote):
    q = quote.strip()
    parts = [p.strip(' "\'“”').lstrip('.,;: ') for p in ELLIPSIS.split(q)]
    return [p for p in parts if len(TOKEN.findall(p)) > 0]


def numbers(text):
    out = []
    for m in NUM.finditer(normalise(text)):
        s = m.group(0).replace(',', '')
        try:
            out.append((m.group(0), float(s)))
        except ValueError:
            pass
    return out


def close(a, b):
    """Equal at the precision values are stored (3 decimals); large counts/rates to 1e-4 relative."""
    return abs(a - b) <= 6e-4 or (abs(b) >= 10 and abs(a - b) / abs(b) <= 1e-4)


Z = 1.959964


def derive(d):
    """Recompute (estimate, ci_low, ci_high) from a derivation spec. None = not derived."""
    m, x = d['method'], d['inputs']
    if m == 'exp_coef':           # Cox/logit coefficient B (and SE of B) -> ratio scale
        b, se = x['b'], x.get('se')
        return (math.exp(b), math.exp(b - Z * se) if se else None, math.exp(b + Z * se) if se else None)
    if m == 'ratio_se_delta':     # ratio and SE reported on the ratio scale (delta method)
        r, se = x['ratio'], x['se']
        s = se / r
        return (r, math.exp(math.log(r) - Z * s), math.exp(math.log(r) + Z * s))
    if m == 'ratio_log_se':       # printed ratio (e^B, OR, HR) with the printed SE of its log coefficient B
        r, se = x['ratio'], x['se_log']
        return (r, math.exp(math.log(r) - Z * se), math.exp(math.log(r) + Z * se))
    if m == 'ratio_ci_printed':   # printed ratio and printed 95% CI (nothing derived; kept for symmetry)
        return (x['ratio'], x['ci_low'], x['ci_high'])
    if m == 'percent_change':     # "reduces the odds by 11 percent" -> 0.89
        return (1 + x['percent_change'] / 100, None, None)
    if m == 'coef_se_normal':     # a coefficient itself with Wald CI
        b, se = x['b'], x['se']
        return (b, b - Z * se, b + Z * se)
    if m == 'p_se_normal':        # proportion with SE -> Wald CI (floored at 0)
        p, se = x['p'], x['se']
        return (p, max(0.0, p - Z * se), p + Z * se)
    if m == 'one_minus_survival': # disruption = 1 - survival, CI from SE of survival
        s, se = x['survival'], x['se']
        p = 1 - s
        return (p, max(0.0, p - Z * se), p + Z * se)
    if m == 'percent':            # printed percentage -> proportion
        return (x['percent'] / 100, x.get('low_percent', None) and x['low_percent'] / 100,
                x.get('high_percent', None) and x['high_percent'] / 100)
    if m == 'count_ratio':        # k of n
        return (x['k'] / x['n'], None, None)
    if m == 'midpoint':
        return ((x['low'] + x['high']) / 2, x['low'], x['high'])
    if m == 'reciprocal_ci':      # 1/ratio, CI swapped
        return (1 / x['ratio'], 1 / x['ci_high'], 1 / x['ci_low'])
    raise ValueError('unknown derivation method ' + m)


def derivation_inputs(d):
    """Inputs that must be printed in the quote (sign-insensitive: 'reduces by 11 percent' is -11)."""
    return [v for k, v in d['inputs'].items() if isinstance(v, (int, float)) and not k.startswith('assumed_')]


def check_record(r, sources):
    res = {'id': r['id'], 'quote': 'skipped', 'numbers': 'skipped', 'values': None,
           'extra_quotes': [], 'problems': []}
    src = sources.get(r.get('source'))
    qnums = numbers(r.get('quote') or '')
    qvals = [v for _, v in qnums]
    # 1-2: quote fragments and numbers against the source
    if src is None:
        res['problems'].append(f"unknown source key {r.get('source')!r}")
        res['quote'] = res['numbers'] = 'fail'
    elif src.available:
        missing = [f for f in fragments(r.get('quote') or '') if not src.has(f)]
        res['quote'] = 'ok' if r.get('quote') and not missing else 'fail'
        for f in missing:
            res['problems'].append('quote fragment not in source: ' + f[:160])
        nmiss = [s for s, _ in qnums if not src.has_number(s)]
        res['numbers'] = 'ok' if not nmiss else 'fail'
        if nmiss:
            res['problems'].append('numbers not in source: ' + ', '.join(nmiss))
    # 3: values traced to quote or derivation
    d = r.get('derivation')
    vals = {k: r.get(k) for k in ('estimate', 'ci_low', 'ci_high', 'range_low', 'range_high') if r.get(k) is not None}
    if d:
        try:
            got = derive(d)
        except Exception as e:  # noqa: BLE001
            res['problems'].append(f'derivation error: {e}')
            got = (None, None, None)
        for k, g in zip(('estimate', 'ci_low', 'ci_high'), got):
            if k in vals and g is not None and not close(vals[k], g):
                res['problems'].append(f'{k}={vals[k]} but derivation gives {g:.4f}')
            if k in vals and g is None and not any(close(vals[k], q) for q in qvals):
                res['problems'].append(f'{k}={vals[k]} not derived and not printed in quote')
        for v in derivation_inputs(d):
            if not any(close(abs(v), abs(q)) for q in qvals):
                res['problems'].append(f'derivation input {v} not printed in quote')
    else:
        for k, v in vals.items():
            ok = any(close(v, q) or close(v, q / 100) for q in qvals)
            if not ok:
                res['problems'].append(f'{k}={v} not printed in quote and no derivation')
    res['values'] = 'ok' if not any(p.startswith(('estimate', 'ci_', 'derivation')) for p in res['problems']) else 'fail'
    # 4: extra quotes (base rates, denominators)
    for eq in r.get('extra_quotes') or []:
        s2 = sources.get(eq.get('source'))
        st = 'skipped'
        if s2 is None:
            st = 'fail'
            res['problems'].append(f"extra quote: unknown source {eq.get('source')!r}")
        elif s2.available:
            miss = [f for f in fragments(eq['quote']) if not s2.has(f)]
            miss += [s for s, _ in numbers(eq['quote']) if not s2.has_number(s)]
            st = 'ok' if not miss else 'fail'
            for f in miss:
                res['problems'].append(f"extra quote ({eq.get('source')}) missing: {f[:120]}")
        res['extra_quotes'].append(st)
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--evidence', default=os.path.join(ROOT, 'evidence.json'))
    ap.add_argument('--sources', default=os.path.join(ROOT, 'SOURCES.json'))
    ap.add_argument('--cache', default=os.environ.get('LIT_CACHE', os.path.join(ROOT, 'source_cache')))
    ap.add_argument('--json', help='write per-record results here')
    ap.add_argument('-v', '--verbose', action='store_true')
    a = ap.parse_args(argv)

    ev = json.load(open(a.evidence, encoding='utf-8'))
    recs = ev['records'] if isinstance(ev, dict) else ev
    smeta = json.load(open(a.sources, encoding='utf-8'))['sources']
    sources = {k: Source(k, v, a.cache) for k, v in smeta.items()}
    avail = sum(s.available for s in sources.values())
    if not avail:
        print(f'NOTE: no cached source texts under {a.cache}; quote checks are skipped and only '
              'value/derivation checks run. See SOURCES.json for how to rebuild the cache.')
    out, bad = [], 0
    counts = {'quote': {}, 'values': {}}
    for r in recs:
        res = check_record(r, sources)
        out.append(res)
        for k in counts:
            counts[k][res[k]] = counts[k].get(res[k], 0) + 1
        failed = res['quote'] == 'fail' or res['numbers'] == 'fail' or res['values'] == 'fail' or 'fail' in res['extra_quotes']
        if r.get('verified') and failed:
            bad += 1
            print(f"MISMATCH {r['id']}: marked verified but: " + '; '.join(res['problems']))
        elif a.verbose and res['problems']:
            print(f"{r['id']} (verified={r.get('verified')}): " + '; '.join(res['problems']))
    nver = sum(1 for r in recs if r.get('verified'))
    print(f"{len(recs)} records, {nver} marked verified; cached sources available: {avail}/{len(sources)}")
    print('quote checks:', counts['quote'], '| value checks:', counts['values'])
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1)
    print('OK' if bad == 0 else f'{bad} record(s) marked verified failed a check')
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
