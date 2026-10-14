"""Map the chip-ppa-mac candidates to SKY130 HD cells under four ABC scripts and compare with the generic-gate ranking.

Needs the PDK files: sh fetch_pdk.sh pdk   (from this project directory)."""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_ppa_sky130mac import flow, gens  # noqa: E402

SCRIPTS = list(flow.SCRIPTS)


def ranks(vals):
    order = sorted(range(len(vals)), key=lambda i: vals[i])
    r = [0.0] * len(vals)
    i = 0
    while i < len(order):  # average ranks for ties
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    n = len(x)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    return cov / (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5


def run(pdk=ROOT / "pdk"):
    out = []
    lib = ROOT / "work" / "sky130_filtered.lib"
    lib.parent.mkdir(exist_ok=True)
    flow.filtered_liberty(Path(pdk) / flow.LIB_REL, lib)
    ref = ROOT / "designs" / "mac4.v"
    with tempfile.TemporaryDirectory() as d:
        cands = {"reference": ref}
        for f in sorted((ROOT / "proposals" / "mac4").glob("*.v")):
            cands["P:" + f.stem] = f
        for cfg in gens.mac4_config_space():
            p = Path(d) / ("sw_" + "_".join(cfg) + ".v")
            p.write_text(gens.gen_mac4(*cfg))
            cands["S:" + "_".join(cfg)] = p
        rtl_ok = {n: flow.equivalent(ref, "mac4", f, "mac4") for n, f in cands.items()}
        sky, gen, net_bad = {}, {}, []
        for n, f in cands.items():
            if not rtl_ok[n]:
                continue
            for s in SCRIPTS:
                r, ok = flow.map_checked(ref, "mac4", f, "mac4", s, lib)
                sky[(n, s)] = r
                gen[(n, s)] = flow.generic_score(f, "mac4", s)
                if not ok:
                    net_bad.append((n, s))
    valid = [n for n in cands if rtl_ok[n]]
    out.append(f"== mac4 on SKY130 HD (tt_025C_1v80): {len(cands)} candidates, {len(cands) - len(valid)} rejected by the RTL gate "
               f"({', '.join(n for n in cands if not rtl_ok[n]) or 'none'}); {len(valid) * len(SCRIPTS)} (candidate, script) pairs mapped; "
               f"{len(net_bad)} mapped netlists NOT equivalent to the reference {net_bad or ''}")
    fa = lambda n, s: sky[(n, s)]["area_um2"] * sky[(n, s)]["delay_ps"]
    fg = lambda n, s: gen[(n, s)]["cells"] * gen[(n, s)]["depth"]
    out.append("every candidate: area um2 / ABC delay ps / area*delay (um2*ns) | generic cells*depth, per script:")
    out.append("candidate".ljust(24) + "".join(s.ljust(34) for s in SCRIPTS))
    for n in valid:
        out.append(n.ljust(24) + "".join(
            f"{sky[(n, s)]['area_um2']:.0f}/{sky[(n, s)]['delay_ps']:.0f}/{fa(n, s) / 1000:.0f} | {fg(n, s)}".ljust(34) for s in SCRIPTS))
    groups = {"reference": ["reference"], "proposer files": [n for n in valid if n.startswith("P:")],
              "sweep": [n for n in valid if n.startswith("S:")]}
    out.append("")
    out.append("best area*delay (um2*ns) per group and script (lower is better):")
    out.append("group".ljust(18) + "".join(s.ljust(14) for s in SCRIPTS))
    best = {g: [min(fa(n, s) for n in names) / 1000 for s in SCRIPTS] for g, names in groups.items()}
    for g, v in best.items():
        out.append(g.ljust(18) + "".join(f"{x:.0f}".ljust(14) for x in v))
    for g in ("proposer files", "sweep"):
        out.append(f"{g}-best / reference, same script: " + ", ".join(f"{s} {best[g][i] / best['reference'][i]:.2f}" for i, s in enumerate(SCRIPTS)))
    out.append("generic-gate (chip-ppa-mac metric) sweep-best / reference, same script: " + ", ".join(
        f"{s} {min(fg(n, s) for n in groups['sweep']) / fg('reference', s):.2f}" for s in SCRIPTS))
    pairs = [(n, s) for n in valid for s in SCRIPTS]
    out.append("")
    out.append(f"Spearman rank correlation over all {len(pairs)} (candidate, script) pairs, generic cells*depth vs SKY130 area*delay: "
               f"{spearman([fg(*k) for k in pairs], [fa(*k) for k in pairs]):.2f}")
    out.append(f"  generic cells vs SKY130 area: {spearman([gen[k]['cells'] for k in pairs], [sky[k]['area_um2'] for k in pairs]):.2f}")
    out.append(f"  generic depth vs SKY130 delay: {spearman([gen[k]['depth'] for k in pairs], [sky[k]['delay_ps'] for k in pairs]):.2f}")
    for s in SCRIPTS:
        pp = [(n, s) for n in valid]
        out.append(f"  within script {s}: generic cells*depth vs SKY130 area*delay {spearman([fg(*k) for k in pp], [fa(*k) for k in pp]):.2f}")
    argg = min(pairs, key=lambda k: fg(*k))
    args = min(pairs, key=lambda k: fa(*k))
    out.append(f"best by generic metric: {argg[0]} under {argg[1]}; its SKY130 area*delay {fa(*argg) / 1000:.0f} um2*ns")
    out.append(f"best by SKY130 area*delay: {args[0]} under {args[1]} = {fa(*args) / 1000:.0f} um2*ns "
               f"(area {sky[args]['area_um2']:.0f} um2, delay {sky[args]['delay_ps']:.0f} ps)")
    out.append(f"reference best across scripts: {min(best['reference']):.0f} um2*ns; overall best / reference best = {fa(*args) / 1000 / min(best['reference']):.2f}")
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
               + "; PDK commit e5cc6e799f5ddf36e6bdf2d8c5db73373b88f52c (ORFS sky130hd, tt_025C_1v80)")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run(*(sys.argv[1:2]))
    (ROOT / "experiments" / "results.txt").write_text(text)
    print(text)
