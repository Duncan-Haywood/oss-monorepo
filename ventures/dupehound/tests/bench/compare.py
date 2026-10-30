"""Compare a jscpd JSON report with a dupehound JSON report.
A jscpd clone is 'found' by dupehound if some dupehound clone pairs the same two
files with overlapping line ranges on both sides (either orientation)."""
import json, sys, collections
j = json.load(open(sys.argv[1])); d = json.load(open(sys.argv[2]))
def norm(p): return p.lstrip('./')
def ov(a1,a2,b1,b2): return a1 <= b2 and b1 <= a2
jc = [((norm(c['firstFile']['name']), c['firstFile']['start'], c['firstFile']['end']),
       (norm(c['secondFile']['name']), c['secondFile']['start'], c['secondFile']['end']), c['lines']) for c in j['duplicates']]
dc = [((norm(c['first']['file']), c['first']['start_line'], c['first']['end_line']),
       (norm(c['second']['file']), c['second']['start_line'], c['second']['end_line']), c['lines']) for c in d['clones']]
def index(cs):
    ix = collections.defaultdict(list)
    for a, b, _ in cs:
        ix[(a[0], b[0])].append((a, b)); ix[(b[0], a[0])].append((b, a))
    return ix
def recall(src, other):
    ix = index(other); hit = 0; hit_lines = 0; tot_lines = 0
    for a, b, n in src:
        tot_lines += n
        if any(ov(a[1],a[2],x[1],x[2]) and ov(b[1],b[2],y[1],y[2]) for x, y in ix[(a[0], b[0])]):
            hit += 1; hit_lines += n
    return hit, len(src), hit_lines, tot_lines
# Same-file vs cross-file, and line coverage on copy side
def cover(cs):
    s = collections.defaultdict(set)
    for a, b, _ in cs:
        for side in (a, b): pass
        s[b[0]].update(range(b[1], b[2] + 1))
    return s
h, n, hl, tl = recall(jc, dc)
print(f"jscpd clones also found by dupehound: {h}/{n} ({100*h/n:.1f}%), by lines {100*hl/tl:.1f}%")
h, n, hl, tl = recall(dc, jc)
print(f"dupehound clones also found by jscpd: {h}/{n} ({100*h/n:.1f}%), by lines {100*hl/tl:.1f}%")
print("jscpd stats:", j['statistics']['total'])
print("dupehound stats:", d['statistics'])

# Line-level: every (file, line) inside either side of any clone.
def lines(cs):
    s = set()
    for a, b, _ in cs:
        for f, x, y in (a, b):
            s.update((f, l) for l in range(x, y + 1))
    return s
L1, L2 = lines(jc), lines(dc)
inter = len(L1 & L2)
print(f"line-level: jscpd flags {len(L1)}, dupehound {len(L2)}, both {inter}; "
      f"dupehound recall of jscpd lines {100*inter/len(L1):.1f}%, jscpd recall of dupehound lines {100*inter/len(L2):.1f}%")
# Pair-level by file pair only (ignores which earlier copy was chosen as the partner)
fp1 = {frozenset((a[0], b[0])) for a, b, _ in jc}; fp2 = {frozenset((a[0], b[0])) for a, b, _ in dc}
files1 = {f for a, b, _ in jc for f in (a[0], b[0])}; files2 = {f for a, b, _ in dc for f in (a[0], b[0])}
print(f"files with a clone: jscpd {len(files1)}, dupehound {len(files2)}, both {len(files1 & files2)}")
