"""Bar chart of hand-labelled headline types with Wilson intervals.  python experiments/figure.py"""
import sys
from collections import Counter
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from swe_nullrate import LABELS, read_tsv, wilson  # noqa: E402

labels = [r[1] for r in read_tsv(HERE.parent / "data" / "labels.tsv")[1:]]
n = len(labels)
c = Counter(labels)
W, H, L, T = 640, 300, 130, 40
bw = (W - L - 30) / 100.0  # px per percentage point
rows = []
for i, lab in enumerate(LABELS):
    y = T + i * 52
    p = c[lab] / n
    lo, hi = wilson(c[lab], n)
    rows.append(
        f'<text x="{L-8}" y="{y+18}" text-anchor="end" font-size="14" fill="currentColor">{lab}</text>'
        f'<rect x="{L}" y="{y}" width="{p*100*bw:.1f}" height="26" fill="#4477aa"/>'
        f'<line x1="{L+lo*100*bw:.1f}" x2="{L+hi*100*bw:.1f}" y1="{y+13}" y2="{y+13}" stroke="currentColor" stroke-width="2"/>'
        f'<text x="{L+hi*100*bw+6:.1f}" y="{y+18}" font-size="13" fill="currentColor">{c[lab]}/{n} = {p:.0%}</text>'
    )
svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Headline type of 80 sampled project summaries">'
    f'<text x="{L}" y="22" font-size="15" font-weight="bold" fill="currentColor">Headline type of {n} sampled project summaries (hand-labelled, Wilson 95%)</text>'
    + "".join(rows) + "</svg>"
)
(HERE / "headline_types.svg").write_text(svg, encoding="utf-8")
print("wrote", HERE / "headline_types.svg")
