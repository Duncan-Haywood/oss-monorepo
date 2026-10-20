"""Draw figure.svg from results.json: share of 15 deflection limits broken by the screened min-mass design (judged on the
128x16 reference) against the safety margin, for the 64x8 FE solve, the float surrogate and the 6-bit QAT surrogate.
Stdlib only."""
import json, os, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, 'results.json')))
m = r['meshes']['64x8']
margins = [str(x) for x in r['margins']]
series = [('64x8 FE solve', [m['loop_fe'][k]['violation'] for k in margins], '#c0392b'),
          ('float surrogate', [statistics.mean(x[k]['violation'] for x in m['loop_float']) for k in margins], '#1f6fb2'),
          ('6-bit QAT surrogate', [statistics.mean(x[k]['violation'] for x in m['loop_qat6']) for k in margins], '#2e8b57')]
W, H, x0, y0, ph = 640, 300, 60, 40, 200
out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" font-family="sans-serif" font-size="13">' % (W, H),
       '<rect width="100%" height="100%" fill="#fff"/>',
       '<text x="10" y="22" font-size="14" font-weight="bold">Deflection limits broken by the screened design (%), 64x8 Q6 mesh</text>']
top = 40.0
for gi, k in enumerate(margins):
    gx = x0 + gi * 190
    for si, (name, vals, c) in enumerate(series):
        v = 100 * vals[gi]
        h = ph * v / top
        x = gx + si * 52
        out.append('<rect x="%d" y="%.1f" width="46" height="%.1f" fill="%s"/>' % (x, y0 + ph - h, h, c))
        out.append('<text x="%d" y="%.1f" fill="#222">%.1f</text>' % (x + 8, y0 + ph - h - 4, v))
    out.append('<text x="%d" y="%d" fill="#222">margin %d %%</text>' % (gx + 30, y0 + ph + 20, round(100 * float(k))))
for i, (name, _, c) in enumerate(series):
    out.append('<rect x="%d" y="%d" width="12" height="12" fill="%s"/><text x="%d" y="%d" fill="#222">%s</text>' % (60 + i * 180, 275, c, 78 + i * 180, 286, name))
out.append('</svg>')
open(os.path.join(HERE, 'figure.svg'), 'w').write('\n'.join(out) + '\n')
