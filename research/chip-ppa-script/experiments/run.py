"""Score the chip-ppa-loop proposer files and sweep configs under every ABC script; check each mapped netlist."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_ppa_script import flow, gens  # noqa: E402

SCRIPTS = list(flow.SCRIPTS)
SPACES = {"add16": (gens.add16_config_space(), gens.gen_add16), "mul6": (gens.mul6_config_space(), gens.gen_mul6)}


def run():
    out, summary = [], []
    for design, (space, gen) in SPACES.items():
        ref = ROOT / "designs" / f"{design}.v"
        with tempfile.TemporaryDirectory() as d:
            cands = {"reference": ref}
            for f in sorted((ROOT / "proposals" / design).glob("*.v")):
                cands["P:" + f.stem] = f
            for cfg in space:
                p = Path(d) / ("sw_" + "_".join(map(str, cfg)) + ".v")
                p.write_text(gen(*cfg))
                cands["S:" + "_".join(map(str, cfg))] = p
            rtl_ok = {n: flow.equivalent(ref, design, f, design) for n, f in cands.items()}
            table, net_bad = {}, []
            for n, f in cands.items():
                if not rtl_ok[n]:
                    continue
                for s in SCRIPTS:
                    sc, ok = flow.score_checked(ref, design, f, design, s)
                    table[(n, s)] = sc["cells"] * sc["depth"]
                    if not ok:
                        net_bad.append((n, s))
                    table[(n, s, "cd")] = (sc["cells"], sc["depth"])
        valid = [n for n in cands if rtl_ok[n]]
        prop = [n for n in valid if n.startswith("P:")]
        sweep = [n for n in valid if n.startswith("S:")]
        out.append(f"== {design}: {len(cands)} candidates, {len(cands) - len(valid)} rejected by the RTL equivalence gate "
                   f"({', '.join(n for n in cands if not rtl_ok[n]) or 'none'}); "
                   f"{len(valid) * len(SCRIPTS)} (candidate, script) pairs scored; "
                   f"{len(net_bad)} mapped netlists NOT equivalent to the reference {net_bad or ''}")
        out.append("cells*depth, per script:")
        out.append("group".ljust(34) + "".join(s.ljust(15) for s in SCRIPTS) + "best over scripts")
        rows = {"reference (script only)": ["reference"], f"proposer files ({len(prop)} valid, best)": prop,
                f"sweep configs ({len(sweep)}, best)": sweep}
        best = {}
        for label, names in rows.items():
            vals = [min(table[(n, s)] for n in names) for s in SCRIPTS]
            best[label] = vals
            out.append(label.ljust(34) + "".join(str(v).ljust(15) for v in vals) + str(min(vals)))
        ref_vals = best["reference (script only)"]
        ref_def, ref_best = ref_vals[0], min(ref_vals)
        both = [min(best[l][i] for l in best) for i in range(len(SCRIPTS))]
        out.append("ratio, proposer-best / reference, same script: " +
                   ", ".join(f"{s} {best[list(rows)[1]][i] / ref_vals[i]:.2f}" for i, s in enumerate(SCRIPTS)))
        overall = min(both)
        arg = min(((n, s) for n in valid for s in SCRIPTS), key=lambda k: table[k])
        out.append(f"reference under yosys_default {ref_def}; reference under its best script {ref_best} "
                   f"({SCRIPTS[ref_vals.index(ref_best)]}); overall best {overall} = {arg[0]} under {arg[1]} "
                   f"cells/depth {table[(arg[0], arg[1], 'cd')]}")
        out.append(f"overall best / reference-default = {overall / ref_def:.2f}; overall best / reference-best-script = {overall / ref_best:.2f}")
        out.append("")
        summary.append((design, overall / ref_def, overall / ref_best))
    out.append("summary: " + "; ".join(f"{d}: best/ref-default {a:.2f}, best/ref-best-script {b:.2f}" for d, a, b in summary))
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    (ROOT / "experiments" / "results.txt").write_text(text)
    print(text)
