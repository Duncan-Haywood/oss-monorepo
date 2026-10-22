"""Draw system.png from results.json: whole-system cascade saving vs front-end cost."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(H, 'results.json')))
fig, ax = plt.subplots(figsize=(7, 4.2))
for c in r['cascade']:
    if c['clf_only'] > 0:
        ax.plot(r['scales'], [100 * x for x in c['system']], marker='o', label='target %.2f' % c['target'])
ax.set_xscale('log'); ax.invert_xaxis()
ax.set_xlabel('front-end energy as a multiple of the modelled one (1 = 46.8 nJ/frame)')
ax.set_ylabel('whole-system energy saving of cascade (%)')
ax.set_title('accel-sysmodel: cascade saving once the front end is counted', fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(H, 'system.png'), dpi=130)
