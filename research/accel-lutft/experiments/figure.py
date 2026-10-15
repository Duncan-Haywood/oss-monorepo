"""Redraw accuracy-vs-energy figure from results.json only."""
import json, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
sys.path.insert(0, H)
from run import energy
r = json.load(open(os.path.join(H, 'results.json')))
fig, axs = plt.subplots(1, 2, figsize=(9, 3.8), sharey=True)
for ax, sp in zip(axs, (0.0, 0.75)):
    rows = [x for x in r if x['sparsity'] == sp]
    for pref, col, mk in (('post', '#d95f02', 'o'), ('ft', '#1b9e77', 's')):
        d = {}
        for x in rows:
            n = x['design']
            if n.startswith(pref) and n[len(pref):].isdigit():
                d.setdefault(n, []).append(x['test'])
        ks = sorted(d, key=lambda n: int(n[len(pref):]))
        ys = [np.mean(d[n]) for n in ks]
        xs = [np.mean([energy(x) for x in rows if x['design'] == n]) for n in ks]
        ax.plot(xs, ys, marker=mk, color=col, lw=1, label='table, shared values %s' % ('(post-training)' if pref == 'post' else '(fine-tuned)'))
        for n, a, b in zip(ks, xs, ys):
            ax.annotate('K=' + n[len(pref):], (a, b), fontsize=6, xytext=(3, -8), textcoords='offset points')
    ie = np.mean([energy(x) for x in rows if x['design'] == 'int8']); ia = np.mean([x['test'] for x in rows if x['design'] == 'int8'])
    ax.plot([ie], [ia], marker='D', color='#1b6ca8', ls='', label='int8 MAC (activation read once)')
    ax.set_title('%s' % ('dense' if sp == 0 else '75% pruned'), fontsize=9); ax.set_xlabel('modelled energy per inference (nJ, table read 0.04 pJ/bit)', fontsize=7)
    ax.grid(alpha=.3)
axs[0].set_ylabel('test accuracy (mean of 10 splits)'); axs[0].legend(fontsize=6)
fig.suptitle('accel-lutft: digits MLP 64-32-10, assumed energy constants', fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(H, 'frontier.png'), dpi=130)
