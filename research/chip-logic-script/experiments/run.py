"""Score the chip-ppa-logic proposer files and sweep configs under every ABC script; prove each mapped netlist."""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_logic_script import flow, sweep  # noqa: E402

SCRIPTS = list(flow.SCRIPTS)
SPACES = {"pop16": (sweep.pop16_config_space(), sweep.gen_pop16),
          "clz16": (sweep.clz16_config_space(), sweep.gen_clz16),
          "absd8": (sweep.absd8_config_space(), sweep.gen_absd8)}


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
                    table[(n, s, "cd")] = (sc["cells"], sc["depth"])
                    if not ok:
                        net_bad.append((n, s))
        valid = [n for n in cands if rtl_ok[n]]
        out.append(f"== {design}: {len(cands)} candidates, {len(cands) - len(valid)} rejected by the RTL equivalence gate "
                   f"({', '.join(n for n in cands if not rtl_ok[n]) or 'none'}); "
                   f"{len(valid) * len(SCRIPTS)} (candidate, script) pairs scored; "
                   f"{len(net_bad)} mapped netlists NOT equivalent to the reference {net_bad or ''}")
        out.append("cells*depth (cells/depth) per candidate and script:")
        out.append("candidate".ljust(26) + "".join(s.ljust(19) for s in SCRIPTS))
        for n in valid:
            out.append(n.ljust(26) + "".join(f"{table[(n, s)]} ({table[(n, s, 'cd')][0]}/{table[(n, s, 'cd')][1]})".ljust(19) for s in SCRIPTS))
        out.append("")
        out.append("winner per script (lowest cells*depth; ties listed):")
        winners = {}
        for s in SCRIPTS:
            m = min(table[(n, s)] for n in valid)
            w = [n for n in valid if table[(n, s)] == m]
            winners[s] = (m, w)
            out.append(f"  {s.ljust(14)} {m}  {', '.join(w)}  (reference {table[('reference', s)]}, ratio {m / table[('reference', s)]:.2f})")
        ref_def = table[("reference", SCRIPTS[0])]
        ref_vals = [table[("reference", s)] for s in SCRIPTS]
        ref_best = min(ref_vals)
        overall = min(v[0] for v in winners.values())
        arg = min(((n, s) for n in valid for s in SCRIPTS), key=lambda k: table[k])
        base_win = winners[SCRIPTS[0]][1]
        keep = sum(1 for s in SCRIPTS if set(winners[s][1]) & set(base_win))
        out.append(f"default-script winner {base_win} also wins (or ties) under {keep} of {len(SCRIPTS)} scripts")
        out.append(f"reference default {ref_def}; reference best script {ref_best} ({SCRIPTS[ref_vals.index(ref_best)]}); "
                   f"overall best {overall} = {arg[0]} under {arg[1]}, cells/depth {table[(arg[0], arg[1], 'cd')]}")
        out.append(f"overall best / reference-default = {overall / ref_def:.2f}; overall best / reference-best-script = {overall / ref_best:.2f}")
        out.append("")
        summary.append((design, overall / ref_def, overall / ref_best, keep))
    out.append("summary: " + "; ".join(f"{d}: best/ref-default {a:.2f}, best/ref-best-script {b:.2f}, default winner holds under {k}/{len(SCRIPTS)}" for d, a, b, k in summary))
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    (ROOT / "experiments" / "results.txt").write_text(text)
    print(text)
