"""Scatter of SPMe's 2-cycle minimum electrolyte concentration against the SPMe-DFN score gap (stdlib only).
    python experiments/trust/figure.py   # reads probe.jsonl and the committed scores, writes trust.svg"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run  # noqa: E402

W, H, ML, MR, MT, MB = 640, 420, 70, 20, 40, 55


def main():
    rows = run.committed()
    pr = {json.loads(l)["i"]: json.loads(l) for l in (HERE / "probe.jsonl").read_text().splitlines()}
    x0, x1, y0, y1 = -0.1, 0.75, 0.0, 1.05
    sx = lambda v: ML + (v - x0) / (x1 - x0) * (W - ML - MR)
    sy = lambda v: H - MB - (v - y0) / (y1 - y0) * (H - MT - MB)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         '<style>.a{stroke:#888;stroke-width:1}.t{fill:#333}.g{stroke:#ddd}@media(prefers-color-scheme:dark){.t{fill:#ddd}.g{stroke:#444}}</style>',
         f'<text class="t" x="{ML}" y="22" font-size="14">SPMe minimum salt (2 cycles) flags where its 100-cycle score is wrong</text>']
    for v in (0, 0.2, 0.4, 0.6):
        o.append(f'<line class="g" x1="{sx(v):.1f}" y1="{MT}" x2="{sx(v):.1f}" y2="{H-MB}"/>'
                 f'<text class="t" x="{sx(v):.1f}" y="{H-MB+16}" text-anchor="middle">{v:.1f}</text>')
    for v in (0, 0.25, 0.5, 0.75, 1.0):
        o.append(f'<line class="g" x1="{ML}" y1="{sy(v):.1f}" x2="{W-MR}" y2="{sy(v):.1f}"/>'
                 f'<text class="t" x="{ML-6}" y="{sy(v)+4:.1f}" text-anchor="end">{v:.2f}</text>')
    o.append(f'<line x1="{ML}" y1="{sy(run.GAP_UNTRUSTED):.1f}" x2="{W-MR}" y2="{sy(run.GAP_UNTRUSTED):.1f}" stroke="#d62728" stroke-dasharray="4 3"/>')
    o.append(f'<text x="{W-MR-4}" y="{sy(run.GAP_UNTRUSTED)-5:.1f}" text-anchor="end" fill="#d62728">untrusted above (gap &gt; 0.25)</text>')
    for r in rows:
        p = pr[r["i"]]
        g = run.rel_gap(r["spme"], r["dfn"])
        bad = run.untrusted(r["spme"], r["dfn"])
        fill = "#d62728" if bad else "#1f77b4"
        if p["ok"]:
            o.append(f'<circle cx="{sx(p["r_min"]):.1f}" cy="{sy(g):.1f}" r="4.5" fill="{fill}" fill-opacity="0.8"/>')
        else:
            cx, cy = sx(p["r_min"]), sy(g)
            o.append(f'<path d="M{cx-5:.1f},{cy-5:.1f}L{cx+5:.1f},{cy+5:.1f}M{cx-5:.1f},{cy+5:.1f}L{cx+5:.1f},{cy-5:.1f}" stroke="{fill}" stroke-width="2"/>')
    o.append(f'<text class="t" x="{(ML+W-MR)/2}" y="{H-14}" text-anchor="middle">SPMe minimum electrolyte concentration / initial, 2-cycle run (x = solver failure, plotted at 0)</text>')
    o.append(f'<text class="t" transform="translate(18,{(MT+H-MB)/2}) rotate(-90)" text-anchor="middle">(DFN &#8722; SPMe) / DFN, cycle-100 Wh/kg</text>')
    o.append('</svg>')
    (HERE / "trust.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
