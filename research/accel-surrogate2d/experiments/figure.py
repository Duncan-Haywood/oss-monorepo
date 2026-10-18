"""Draw figure.svg from results.json: per mesh, median error of the FE solve itself (against the 128x16
reference) beside the median error of the float and 6-bit QAT surrogates (against the same reference).
Stdlib only."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, 'results.json')))


def med(a):
    import statistics
    return 100 * statistics.mean(statistics.median(s) for s in a)


bars = []
for key, m in r['meshes'].items():
    bars += [(key + ' FE solve', med(m['fe_vs_ref']), '#c0392b'),
             (key + ' float surrogate', med(m['float_vs_ref']), '#1f6fb2'),
             (key + ' 6-bit QAT surrogate', med(m['qat6_vs_ref']), '#2e8b57')]
top = max(v for _, v, _ in bars)
W, rowh = 640, 34
out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" font-family="sans-serif" font-size="13">' % (W, 60 + rowh * len(bars)),
       '<rect width="100%" height="100%" fill="#fff"/>',
       '<text x="10" y="22" font-size="14" font-weight="bold">Median error against the 128x16 reference mesh (%)</text>']
for i, (name, v, c) in enumerate(bars):
    y = 40 + i * rowh
    w = 380 * v / top
    out.append('<text x="10" y="%d" fill="#222">%s</text>' % (y + 17, name))
    out.append('<rect x="200" y="%d" width="%.1f" height="22" fill="%s"/>' % (y, w, c))
    out.append('<text x="%.1f" y="%d" fill="#222">%.1f</text>' % (206 + w, y + 17, v))
out.append('</svg>')
open(os.path.join(HERE, 'figure.svg'), 'w').write('\n'.join(out) + '\n')
