"""Draw frontier.png (accuracy vs modelled energy, by hidden width) from results.json only."""
import json, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
sys.path.insert(0, H)
from run import energy_nj, WIDTHS, KS
r = json.load(open(os.path.join(H, 'results.json')))
fig, ax = plt.subplots(figsize=(7, 4.2))
for n, mk in zip(WIDTHS, 'osd'):
    def pt(name):
        t = np.mean([x['test'] for x in r if x['width'] == n and x['design'] == name])
        return energy_nj(n, name, 0.04) / energy_nj(n, 'int8', 0.04), t
    ax.plot(*zip(*[pt('int8')]), marker=mk, color='#1b6ca8', ls='', label='int8 MAC, width %d' % n)
    ax.plot(*zip(*[pt('hybrid%d' % k) for k in KS]), marker=mk, color='#d95f02', ls='-', lw=1, ms=5, label='table layer 1, K=8/16/32, width %d' % n)
ax.axvline(1, color='grey', lw=.8)
ax.set_xlabel('modelled energy relative to int8 MAC of the same width (table read 0.04 pJ/bit, assumed)')
ax.set_ylabel('test accuracy (mean of 10 splits)'); ax.set_title('accel-lutwide: digits MLP 64-N-10', fontsize=9)
ax.legend(fontsize=6); ax.grid(alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(H, 'frontier.png'), dpi=130)
