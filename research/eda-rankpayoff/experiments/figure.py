"""Write scatter.svg: Spearman agreement against P(best design mapped) at k=3, one dot per screen, truth = latency.

    python experiments/figure.py        # recomputes from data.json with run.py's own functions, stdlib only
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run  # noqa: E402


def main():
    truth = run.TRUTH["latency"]
    pts = []
    for n, (fam, s) in run.screens("latency").items():
        m = run.measure(s, truth)
        pts.append((fam, n, m["spearman"], m["cap3"]))
    W, H, L, B, T, Rm = 640, 420, 70, 60, 50, 20
    x0, x1, y0, y1 = 0.5, 1.0, 0.4, 1.0
    sx = lambda v: L + (v - x0) / (x1 - x0) * (W - L - Rm)
    sy = lambda v: H - B - (v - y0) / (y1 - y0) * (H - B - T)
    col = {"sweep": "#9aa5b1", "named": "#c0392b", "none": "#1f6fb2"}
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d" font-family="sans-serif" font-size="12">',
         '<title id="t">Rank agreement does not predict screen payoff</title>',
         '<desc id="d">Each dot is a cheap screen for the mapped latency of 40 MAC engines. Horizontal: Spearman rank agreement with the truth. Vertical: probability the best design of a random pool of 20 is among the 3 the screen sends to the mapper.</desc>',
         f'<rect width="{W}" height="{H}" fill="#fff"/>']
    for v in (0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
        o.append(f'<line x1="{sx(v):.1f}" y1="{T}" x2="{sx(v):.1f}" y2="{H-B}" stroke="#e3e6ea"/><text x="{sx(v):.1f}" y="{H-B+16}" text-anchor="middle" fill="#333">{v:.1f}</text>')
        o.append(f'<line x1="{L}" y1="{sy(v):.1f}" x2="{W-Rm}" y2="{sy(v):.1f}" stroke="#e3e6ea"/><text x="{L-8}" y="{sy(v)+4:.1f}" text-anchor="end" fill="#333">{v:.1f}</text>')
    for fam, n, a, b in sorted(pts, key=lambda p: p[0] != "sweep"):
        if x0 <= a <= x1 and y0 <= b <= y1:
            o.append(f'<circle cx="{sx(a):.1f}" cy="{sy(b):.1f}" r="{5 if fam != "sweep" else 3}" fill="{col[fam]}" fill-opacity="0.85"/>')
        if fam != "sweep" and n in ("x gates", "x fanout", "x unit"):
            o.append(f'<text x="{sx(a)+8:.1f}" y="{sy(b)+4:.1f}" fill="#333">{n[2:]}</text>')
    o.append(f'<text x="{(L+W-Rm)/2}" y="{H-14}" text-anchor="middle" fill="#333">Spearman rank agreement with mapped latency</text>')
    o.append(f'<text transform="translate(16 {(T+H-B)/2}) rotate(-90)" text-anchor="middle" fill="#333">P(best of pool mapped), k = 3</text>')
    o.append(f'<text x="{L}" y="24" font-size="14" font-weight="bold" fill="#111">Screens with the same rank agreement pay off very differently</text>')
    o.append('<text x="%d" y="40" fill="#555">grey: 200 type-rescaled logical-effort screens; red: named proxies; blue: cycles alone</text>' % L)
    o.append("</svg>")
    (HERE / "scatter.svg").write_text("\n".join(o))


if __name__ == "__main__":
    main()
