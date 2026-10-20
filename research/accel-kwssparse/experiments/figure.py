"""Redraw experiments/frontier.png (accuracy vs modelled energy) from results.json only."""
import json, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
r = json.load(open(os.path.join(H, 'results.json')))
fig, ax = plt.subplots(figsize=(7, 4.2))
for n, v in r.items():
    a = np.mean([x['test'] for x in v]); e = np.mean([x['energy_nj'] for x in v])
    mf = v[0]['multiplier_free']
    ax.scatter(e, a, c='#d95f02' if mf else '#1b6ca8', marker='s' if 'pruned' in n else 'o', s=40)
    ax.annotate(n, (e, a), fontsize=6, xytext=(3, 3), textcoords='offset points')
ax.set_xscale('log'); ax.set_xlabel('modelled energy per inference (nJ, assumed 45 nm constants)')
ax.set_ylabel('test accuracy (mean of 5 seeds)'); ax.set_title('accel-kwssparse: Speech Commands MLP 70-64-11 (orange = multiplier-free)', fontsize=9)
ax.grid(alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(H, 'frontier.png'), dpi=130)
