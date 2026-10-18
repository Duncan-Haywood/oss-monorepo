"""Draw flagged_works.png (most-repeated unverified citations) from results.json only."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(__file__)
r = json.load(open(os.path.join(H, 'results.json')))
top = list(r['works'].items())[:12][::-1]
fig, ax = plt.subplots(figsize=(7, 4))
ax.barh([k for k, _ in top], [len(v) for _, v in top], color='#1b6ca8')
ax.set_xlabel('research projects whose README flags this citation as unverified')
ax.set_title('free-citeaudit: %d of %d project READMEs flag a citation or figure' % (len(r['flagging']), r['projects']), fontsize=9)
ax.grid(axis='x', alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(H, 'flagged_works.png'), dpi=130)
