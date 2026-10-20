"""Redraw experiments/frontier.svg-style PNG (accuracy vs modelled energy) from results.json only."""
import json, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
sys.path.insert(0, H)
from run import energies
r = json.load(open(os.path.join(H, 'results.json')))
fig, ax = plt.subplots(figsize=(7, 4.2))
for sp, mk in ((0.0, 'o'), (0.75, 's')):
    rows = [x for x in r if x['sparsity'] == sp]
    for name, col, idx, et in (('int8', '#1b6ca8', 1, 0.04), ('share', '#d95f02', 0, 0.04)):
        pts = {}
        for x in rows:
            if x['design'].startswith(name) and x['design'] != 'float32':
                pts.setdefault(x['design'], []).append((x['test'], energies(x, et)[idx]))
        xs = [np.mean([p[1] for p in v]) for v in pts.values()]; ys = [np.mean([p[0] for p in v]) for v in pts.values()]
        ax.plot(xs, ys, marker=mk, color=col, ls='-' if sp == 0 else '--', lw=1, ms=5,
                label='%s, %s' % ('int8 MAC (act read once)' if name == 'int8' else 'product table K=2..32', 'dense' if sp == 0 else '75% pruned'))
ax.set_xscale('log'); ax.set_ylim(0.85, 0.98)
ax.set_xlabel('modelled energy per inference (nJ, assumed 45 nm constants; table read 0.04 pJ/bit)')
ax.set_ylabel('test accuracy (mean of 10 splits)'); ax.set_title('accel-lut: digits MLP 64-32-10', fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(H, 'frontier.png'), dpi=130)
