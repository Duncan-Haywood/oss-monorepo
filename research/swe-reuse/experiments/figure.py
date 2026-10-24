"""Bar chart of inbound-reference counts per project.  python experiments/figure.py"""
import sys
from collections import Counter, defaultdict
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from swe_reuse import edges  # noqa: E402


def rows(name):
    return [l.split("\t") for l in (HERE.parent / "data" / name).read_text(encoding="utf-8").splitlines()[1:]]


created = {s: int(c) for s, c, _ in rows("projects.tsv") if c}
refs = defaultdict(set)
for a, b in rows("refs.tsv"):
    refs[a].add(b)
indeg = Counter(b for _, b in edges(refs, created))
dist = Counter(min(indeg[s], 5) for s in created)
n = len(created)
W, H, L, T = 640, 300, 120, 40
mx = max(dist.values())
bars = []
for d in range(6):
    y = T + d * 40
    w = (W - L - 150) * dist[d] / mx
    lab = "5 or more" if d == 5 else str(d)
    bars.append(f'<text x="{L-8}" y="{y+18}" text-anchor="end" font-size="14" fill="currentColor">{lab}</text>'
                f'<rect x="{L}" y="{y}" width="{w:.1f}" height="26" fill="#4477aa"/>'
                f'<text x="{L+w+6:.1f}" y="{y+18}" font-size="13" fill="currentColor">{dist[d]} ({dist[d]/n:.0%})</text>')
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Projects by number of later projects that name them">'
       f'<text x="{L}" y="22" font-size="15" font-weight="bold" fill="currentColor">Later projects naming each of {n} projects</text>' + "".join(bars) + "</svg>")
(HERE / "inbound.svg").write_text(svg, encoding="utf-8")
