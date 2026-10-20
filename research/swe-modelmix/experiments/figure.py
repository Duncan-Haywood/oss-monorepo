"""Write experiments/runs_needed.svg: runs per arm needed to detect a difference in projects per run, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text()
ROWS = [(int(p), int(n)) for p, n in re.findall(r"detect a (\d+)% difference in projects per run: (\d+)", TEXT)]
CV = re.search(r"CV ([\d.]+) over (\d+) runs", TEXT)


def main():
    if not ROWS or not CV:
        raise SystemExit("no rows parsed from results.txt")
    W, H, L, R, T, B = 640, 380, 64, 24, 64, 64
    top = max(n for _, n in ROWS) * 1.12
    bw = (W - L - R) / len(ROWS)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d" font-family="sans-serif" font-size="13">',
         '<title id="t">Runs per arm to compare two models on projects per run</title>',
         f'<desc id="d">Bar chart of runs per arm needed to detect a 25%, 50% or 100% difference in projects landed per research run, given a coefficient of variation of {CV.group(1)} measured over {CV.group(2)} Sonnet runs.</desc>',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{L}" y="24" font-weight="bold" font-size="15">Runs per arm to detect a difference in projects per run</text>',
         f'<text x="{L}" y="44" fill="#444">CV {CV.group(1)} measured over {CV.group(2)} Sonnet research runs</text>',
         f'<line x1="{L}" y1="{H-B}" x2="{W-R}" y2="{H-B}" stroke="#333"/><line x1="{L}" y1="{T}" x2="{L}" y2="{H-B}" stroke="#333"/>']
    for i, (p, n) in enumerate(ROWS):
        h = n / top * (H - B - T)
        x = L + i * bw + bw * 0.2
        o.append(f'<rect x="{x:.1f}" y="{H-B-h:.1f}" width="{bw*0.6:.1f}" height="{h:.1f}" fill="#1f6fb2"/>')
        o.append(f'<text x="{x+bw*0.3:.1f}" y="{H-B-h-6:.1f}" text-anchor="middle">{n}</text>')
        o.append(f'<text x="{x+bw*0.3:.1f}" y="{H-B+20}" text-anchor="middle">{p}% difference</text>')
    o.append(f'<text x="{(L+W-R)/2}" y="{H-14}" text-anchor="middle" fill="#444">effect size to detect</text>')
    o.append(f'<text transform="translate(18 {(T+H-B)/2}) rotate(-90)" text-anchor="middle" fill="#444">runs per arm</text></svg>')
    (HERE / "runs_needed.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
