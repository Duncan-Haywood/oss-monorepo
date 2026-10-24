"""Draw results/figure.svg from results.json (stdlib only): AUROC against mean generated length, raw and length-matched."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
W, H, L, R, T, B = 760, 330, 60, 20, 40, 50
PANELS = [("ngram-unseen", "n-gram detector, family unseen"), ("bino", "Binoculars-style zero-shot")]


def main():
    rows = json.load(open(os.path.join(HERE, "results.json")))["rows"]
    pw = (W - L - R - 40) / 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="11">',
           '<rect width="100%" height="100%" fill="#fff"/>',
           f'<text x="{W/2}" y="18" text-anchor="middle" font-size="13">Prompt-free AUROC of 32 replayed loop prompts: raw (filled) and length-matched (open)</text>']
    for k, (det, name) in enumerate(PANELS):
        x0 = L + k * (pw + 40)
        sx = lambda v: x0 + (v - 30) / (400 - 30) * pw
        sy = lambda v: T + (1 - (v - 0.3) / 0.7) * (H - T - B)
        out.append(f'<text x="{x0 + pw/2}" y="{T-8}" text-anchor="middle">{name}</text>')
        out.append(f'<rect x="{x0}" y="{T}" width="{pw}" height="{H-T-B}" fill="none" stroke="#888"/>')
        for v in (0.5, 0.75, 1.0):
            out.append(f'<line x1="{x0}" x2="{x0+pw}" y1="{sy(v)}" y2="{sy(v)}" stroke="#ddd"/>'
                       f'<text x="{x0-6}" y="{sy(v)+4}" text-anchor="end">{v:.2f}</text>')
        for v in (100, 200, 300, 400):
            out.append(f'<text x="{sx(v)}" y="{H-B+16}" text-anchor="middle">{v}</text>')
        out.append(f'<text x="{x0+pw/2}" y="{H-8}" text-anchor="middle">mean generated length (characters)</text>')
        for r in rows:
            col = "#c0392b" if r["family"] == "reddit" else "#1f6fb5"
            out.append(f'<circle cx="{sx(r["mean_len"]):.1f}" cy="{sy(r[det]["auroc"]):.1f}" r="4" fill="{col}" fill-opacity="0.75"/>')
            m = r[det]["matched_auroc"]
            if m is not None:
                out.append(f'<circle cx="{sx(r["mean_len"]):.1f}" cy="{sy(m):.1f}" r="4" fill="none" stroke="{col}" stroke-width="1.5"/>')
    out.append(f'<text x="{L}" y="{H-30}" fill="#c0392b" font-size="10"></text>')
    out.append(f'<text x="{W-R}" y="34" text-anchor="end" font-size="10"><tspan fill="#c0392b">reddit</tspan> · <tspan fill="#1f6fb5">reviews</tspan></text>')
    out.append("</svg>")
    os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
    open(os.path.join(HERE, "results", "figure.svg"), "w").write("\n".join(out))


if __name__ == "__main__":
    main()
