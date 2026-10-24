"""Write experiments/coefficient_estimates.svg: mean estimate and mean 95% interval half-width of the code's
regression coefficient (true 1.0) for naive, human-only and DSL estimators, from results.txt E1.

    python3 experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = {}
sec = False
for line in (HERE / "results.txt").read_text().splitlines():
    if line.startswith("E1."):
        sec = True
    elif line.startswith("E2."):
        break
    m = re.match(r"code\(b1\)\s+(\w+)\s+1\.00\s+([\d.]+)\s+\S+\s+([\d.]+)\s+([\d.]+)", line)
    if sec and m:
        rows[m.group(1)] = (float(m.group(2)), float(m.group(4)) / 2)
W, H, L, R = 560, 260, 70, 30
lo, hi = 0.4, 1.6
x = lambda v: L + (v - lo) / (hi - lo) * (W - L - R)
names = {"naive": "Naive: OLS on LLM codes", "human": "Human-only (about 210 items)", "dsl": "DSL: LLM codes + hand-coded"}
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">',
       '<title id="t">Estimates of a regression coefficient on an LLM-coded variable</title>',
       '<desc id="d">Naive estimate is 0.74 with a narrow interval that excludes the true value 1.0; human-only and DSL estimates '
       'are near 1.0, DSL with a narrower interval.</desc>',
       '<style>text{font:13px sans-serif;fill:#222}@media(prefers-color-scheme:dark){text{fill:#eee}}</style>',
       f'<line x1="{x(1)}" x2="{x(1)}" y1="30" y2="{H-40}" stroke="#888" stroke-dasharray="4"/>',
       f'<text x="{x(1)}" y="22" text-anchor="middle">true value 1.0</text>']
for i, (k, col) in enumerate((("naive", "#c0392b"), ("human", "#888"), ("dsl", "#1f6fb2"))):
    y = 70 + i * 55
    est, hw = rows[k]
    svg += [f'<text x="{L}" y="{y-14}">{names[k]}</text>',
            f'<line x1="{x(est-hw)}" x2="{x(est+hw)}" y1="{y}" y2="{y}" stroke="{col}" stroke-width="3"/>',
            f'<circle cx="{x(est)}" cy="{y}" r="6" fill="{col}"/>',
            f'<text x="{x(est+hw)+8}" y="{y+5}">{est:.2f} ± {hw:.2f}</text>']
svg += [f'<text x="{W/2}" y="{H-8}" text-anchor="middle">coefficient on the code (mean estimate, mean 95% half-width)</text></svg>']
(HERE / "coefficient_estimates.svg").write_text("\n".join(svg))
