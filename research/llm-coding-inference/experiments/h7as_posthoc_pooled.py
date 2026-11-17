"""Milestone 7as, post hoc (exploratory, written after reading h7as_fresh_share.txt; decides nothing): the pooled
interval alone at 1.5B disapproval n 1,000 under 7as's stream (seed + 13), two more, and four unrelated seeds (2,000 draws
each), to tell whether that cell's 92.6% is the base estimator or Monte Carlo.  python3 experiments/h7as_posthoc_pooled.py"""
import random, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.argv = sys.argv[:1]; sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A
A.RARE_FALLBACK = None  # pinned: replays as committed (LOG.md 7aw)
A.NEG_FLOOR = None  # pinned (LOG.md 7az): replays as committed
import h7ao_two_phase as T
c=next(c for c in T.cells() if c['label']=='1.5B disapproval' and c['n']==1000)
out = []
h,f,n=c['h'],c['f'],c['n']; N=len(h); truth=sum(h)/N
for s, R in [(c["seed"] + 13, 1000), (c["seed"] + 14, 1000), (c["seed"] + 5, 1000), (101, 2000), (202, 2000), (303, 2000), (404, 2000)]:
    rr=random.Random(s); cov=0
    for d in range(R):
        lab={i:h[i] for i in rr.sample(range(N),n)}
        e,lo,hi=A.audit_interval({"design":"pooled","cells":[list(range(N))]},f,lab); cov+=lo<=truth<=hi
    out.append(f"seed {s}: {R} draws, pooled coverage {100 * cov / R:.2f}%")
text = "\n".join(out); print(text); (HERE / "h7as_posthoc_pooled.txt").write_text(text + "\n")
