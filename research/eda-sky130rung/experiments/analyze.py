"""Rank agreement between the generic-gate rung and the SKY130-mapped rung. Reads mapped.json; writes results.txt, rungs.png.
Run: PYTHONPATH=../src python analyze.py (matplotlib for the figure only)"""
import json
from pathlib import Path
from eda_sky130rung import rank as R

D = Path(__file__).resolve().parent
J = json.load(open(D / "mapped.json"))
rows = J["rows"]
for r in rows:
    r["lat_ns"] = r["cycles"] * r["delay_ps"] / 1000
    r["gen_obj"] = r["gen_cells"] * r["cycles"]
    r["map_obj"] = r["area_um2"] * r["lat_ns"]
col = lambda k: [r[k] for r in rows]
out = [f"# {J['yosys']}; SKY130 HD tt_025C_1v80 at ORFS commit {J['pdk_commit'][:10]}; ABC script: {J['script']}",
       f"# {len(rows)} MAC-engine designs (p = 1..8 lanes, wb = 4..8 bits) from eda-harness; generic numbers from its committed log", ""]
out.append("pair (generic rung vs SKY130 rung)                          spearman  kendall")
for name, a, b in [("cells vs mapped area", "gen_cells", "area_um2"),
                   ("depth vs mapped delay", "gen_depth", "delay_ps"),
                   ("cells x cycles vs area x latency", "gen_obj", "map_obj"),
                   ("flip-flops vs mapped flip-flops", "gen_ff", "ff")]:
    out.append(f"{name:60s}{R.spearman(col(a), col(b)):7.3f}  {R.kendall(col(a), col(b)):7.3f}")
for k in (3, 5, 10):
    out.append(f"top-{k} overlap on cells x cycles vs area x latency: {R.top_k_overlap(col('gen_obj'), col('map_obj'), k):.2f}")
apc = [r["area_um2"] / r["gen_cells"] for r in rows]
out.append(f"mapped area per generic cell (um2): min {min(apc):.2f}, max {max(apc):.2f}")
gf = set(R.pareto_idx([(r["gen_cells"], r["cycles"]) for r in rows]))
mf = set(R.pareto_idx([(r["area_um2"], r["lat_ns"]) for r in rows]))
mf_c = set(R.pareto_idx([(r["area_um2"], r["cycles"]) for r in rows]))
lab = lambda s: ", ".join(f"p{rows[i]['p']}w{rows[i]['wb']}" for i in sorted(s, key=lambda i: rows[i]["cycles"]))
out += ["", f"Pareto front, generic (cells, cycles):          {lab(gf)}",
        f"Pareto front, SKY130 (area, cycles):            {lab(mf_c)}",
        f"Pareto front, SKY130 (area, latency = cycles x delay): {lab(mf)}",
        f"front overlap generic vs SKY130 (area, cycles): {len(gf & mf_c)} of {len(gf)} / {len(mf_c)}",
        f"front overlap generic vs SKY130 (area, latency): {len(gf & mf)} of {len(gf)} / {len(mf)}"]
out += ["", "best design by objective:",
        "  generic cells x cycles: " + lab({min(range(len(rows)), key=lambda i: rows[i]['gen_obj'])}),
        "  SKY130 area x latency:  " + lab({min(range(len(rows)), key=lambda i: rows[i]['map_obj'])})]
out += ["", "delay_ps by lanes p (wb = 6): " + ", ".join(f"p{r['p']}={r['delay_ps']:.0f}" for r in rows if r["wb"] == 6)]
(D / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
try:
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    f, ax = plt.subplots(1, 2, figsize=(9, 3.6))
    ax[0].scatter(col("gen_cells"), col("area_um2"), c=col("wb"), cmap="viridis"); ax[0].set(xlabel="generic-gate cells (Yosys 0.33)", ylabel="SKY130 mapped area (um2)", title="area: rank-preserving")
    sc = ax[1].scatter(col("gen_obj"), col("map_obj"), c=col("p"), cmap="plasma"); ax[1].set(xscale="log", yscale="log", xlabel="cells x cycles", ylabel="area x latency (um2 ns)", title="objective")
    f.colorbar(sc, ax=ax[1], label="lanes p"); f.tight_layout(); f.savefig(D / "rungs.png", dpi=110)
except ImportError:
    pass
