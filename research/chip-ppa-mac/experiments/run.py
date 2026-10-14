"""Score the MAC proposer files and sweep configs under every ABC script; check each mapped netlist.

Adapted from chip-ppa-script/experiments/run.py (same author, MIT)."""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_ppa_mac import flow, gens  # noqa: E402

SCRIPTS = list(flow.SCRIPTS)


def run():
    out = []
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
        table, net_bad = {}, []
        for n, f in cands.items():
            if not rtl_ok[n]:
                continue
            for s in SCRIPTS:
                sc, ok = flow.score_checked(ref, "mac4", f, "mac4", s)
                table[(n, s)] = (sc["cells"], sc["depth"])
                if not ok:
                    net_bad.append((n, s))
    valid = [n for n in cands if rtl_ok[n]]
    out.append(f"== mac4: {len(cands)} candidates, {len(cands) - len(valid)} rejected by the RTL equivalence gate "
               f"({', '.join(n for n in cands if not rtl_ok[n]) or 'none'}); {len(valid) * len(SCRIPTS)} (candidate, script) "
               f"pairs scored; {len(net_bad)} mapped netlists NOT equivalent to the reference {net_bad or ''}")
    fom = lambda n, s: table[(n, s)][0] * table[(n, s)][1]
    out.append("every candidate, cells/depth/cells*depth per script:")
    out.append("candidate".ljust(28) + "".join(s.ljust(18) for s in SCRIPTS))
    for n in valid:
        out.append(n.ljust(28) + "".join(f"{table[(n, s)][0]}/{table[(n, s)][1]}/{fom(n, s)}".ljust(18) for s in SCRIPTS))
    prop = [n for n in valid if n.startswith("P:")]
    sweep = [n for n in valid if n.startswith("S:")]
    out.append("")
    out.append("best cells*depth per group (lower is better):")
    out.append("group".ljust(34) + "".join(s.ljust(15) for s in SCRIPTS) + "best")
    best = {}
    for label, names in {"reference (script only)": ["reference"], f"proposer files ({len(prop)} valid)": prop,
                         f"sweep ({len(sweep)} configs)": sweep}.items():
        vals = [min(fom(n, s) for n in names) for s in SCRIPTS]
        best[label] = vals
        out.append(label.ljust(34) + "".join(str(v).ljust(15) for v in vals) + str(min(vals)))
    labels = list(best)
    rv = best[labels[0]]
    out.append("ratio, proposer-best / reference, same script: " + ", ".join(f"{s} {best[labels[1]][i] / rv[i]:.2f}" for i, s in enumerate(SCRIPTS)))
    out.append("ratio, sweep-best / reference, same script: " + ", ".join(f"{s} {best[labels[2]][i] / rv[i]:.2f}" for i, s in enumerate(SCRIPTS)))
    arg = min(((n, s) for n in valid for s in SCRIPTS), key=lambda k: fom(*k))
    ref_best = min(rv)
    out.append(f"reference default {rv[0]}; reference under its best script {ref_best} ({SCRIPTS[rv.index(ref_best)]}); "
               f"overall best {fom(*arg)} = {arg[0]} under {arg[1]} (cells/depth {table[arg][0]}/{table[arg][1]})")
    out.append(f"overall best / reference-default = {fom(*arg) / rv[0]:.2f}; overall best / reference-best-script = {fom(*arg) / ref_best:.2f}")
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    (ROOT / "experiments" / "results.txt").write_text(text)
    print(text)
