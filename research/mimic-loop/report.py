"""Aggregate results/*.json into results.txt and results.svg (test-set paired accuracy per round)."""
import glob, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
runs = [json.load(open(p)) for p in sorted(glob.glob(os.path.join(HERE, "results", "*.json")))]
out = []
out.append("Paired accuracy = share of held-out (human, imitator) pairs where the detector picks the human text; 50% is chance.")
out.append("'cur' = the round's evolved detector, 'plain' = the unadapted round-0 detector. 24 test pairs per cell (95% bootstrap interval on cur in brackets).")
for r in runs:
    out.append(f"\n== {r['family']} / {r['proposer']} / seed {r['seed']} (budget {r['budget']} per side per round; model calls {r['model_calls']})")
    out.append("round  paired_cur [95% CI]      paired_plain  AUROC_1text  len/ref  copy4  distinct2 gen/human  on-topic  valid")
    for x in r["rounds"]:
        lo, hi = x["paired_acc_current_ci"]
        out.append(f"{x['round']:>5}  {x['paired_acc_current']:.2f} [{lo:.2f},{hi:.2f}]      {x['paired_acc_plain']:.2f}          "
                   f"{x['single_auroc_current']:.2f}         {x['mean_len']:.0f}/{x['ref_len']:.0f}  {x['copy4']:.3f}  "
                   f"{x['distinct2_gen']:.2f}/{x['distinct2_human']:.2f}          {x['judge_on_topic']:.2f}      {x['valid']}")
    last = r["rounds"][-1]
    out.append(f"final detector prompt: {last['detector']}")
    out.append(f"final imitator prompt: {last['imitator']} (few-shot examples: {last['imitator_shots']})")
    out.append(f"sample (generated, test context 0): {last['sample'][0]!r}")
out.append("\n== Summary: final-round test paired accuracy of the evolved detector (lower = imitator better) and of the plain detector")
out.append("family   proposer  seed  round0_plain  final_cur  final_plain  mean_cur_over_rounds1-3")
for r in runs:
    rs = r["rounds"]
    out.append(f"{r['family']:<8} {r['proposer']:<8} {r['seed']:>4}  {rs[0]['paired_acc_plain']:.2f}          {rs[-1]['paired_acc_current']:.2f}       "
               f"{rs[-1]['paired_acc_plain']:.2f}        {sum(x['paired_acc_current'] for x in rs[1:]) / len(rs[1:]):.2f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

# figure: one panel per family, one line per proposer
fams = sorted({r["family"] for r in runs}); cols = {"random": "#1f6fb2", "ga": "#2e8b57", "grips": "#8e44ad", "llm": "#c0392b"}
W, H = 760, 330; pw = (W - 40) // max(1, len(fams))
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Paired accuracy of the evolving detector against each proposer\'s imitator, by round">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>']
for k, f in enumerate(fams):
    x0 = 50 + k * pw; L, R, T, B = x0, x0 + pw - 40, 40, H - 70
    o.append(f'<text x="{(L + R) / 2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="13">{f}: detector paired accuracy (test)</text>')
    o.append(f'<rect x="{L}" y="{T}" width="{R - L}" height="{B - T}" fill="none" stroke="#999"/>')
    for v in (0, .25, .5, .75, 1):
        y = B - v * (B - T)
        o.append(f'<line x1="{L}" x2="{R}" y1="{y}" y2="{y}" stroke="{"#c33" if v == .5 else "#eee"}" stroke-dasharray="{"4 3" if v == .5 else "0"}"/>'
                 f'<text x="{L - 4}" y="{y + 4}" text-anchor="end" font-family="sans-serif" font-size="10">{v:.2f}</text>')
    n = max(len(r["rounds"]) for r in runs) - 1
    for i in range(n + 1):
        o.append(f'<text x="{L + i * (R - L) / n}" y="{B + 14}" text-anchor="middle" font-family="sans-serif" font-size="10">round {i}</text>')
    for j, r in enumerate([r for r in runs if r["family"] == f]):
        pts = " ".join(f"{L + i * (R - L) / n:.1f},{B - x['paired_acc_current'] * (B - T):.1f}" for i, x in enumerate(r["rounds"]))
        o.append(f'<polyline points="{pts}" fill="none" stroke="{cols[r["proposer"]]}" stroke-width="2"/>')
        o.append(f'<text x="{L + 8 + 70 * j}" y="{H - 30}" font-family="sans-serif" font-size="11" fill="{cols[r["proposer"]]}">&#9632; {r["proposer"]}</text>')
o.append(f'<text x="{W / 2}" y="{H - 8}" text-anchor="middle" font-family="sans-serif" font-size="10">red dashed = chance (0.5); 24 pairs per point, one seed, stylised toy setting</text></svg>')
os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
open(os.path.join(HERE, "results", "figure.svg"), "w").write("\n".join(o))
print("ok", len(runs))
