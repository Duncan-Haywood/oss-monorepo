"""Score every written structure under every ABC script; write results.txt."""
import itertools
import os
import statistics
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_sweep import gens
from chip_abc_sweep.flow import SCRIPTS, equivalent, score

DESIGNS = {
    "add16": (os.path.join(HERE, "..", "designs", "add16.v"),
              {f"{k}{b or ''}": (lambda k=k, b=b: gens.gen_add16(k, b))
               for k, b in [("plus", 0), ("ripple", 0), ("csel", 4), ("cselrip", 4), ("cselrip", 2)]}),
    "mul6": (os.path.join(HERE, "..", "designs", "mul6.v"),
             {f"{s}-{o}-{m}": (lambda s=s, o=o, m=m: gens.gen_mul6(s, o, m))
              for s, o, m in gens.mul6_config_space()}),
}


def run():
    out, summary = [], []
    for design, (ref, structs) in DESIGNS.items():
        table = {}
        with tempfile.TemporaryDirectory() as d:
            for name, gen in structs.items():
                f = os.path.join(d, f"{name}.v")
                open(f, "w").write(gen())
                assert equivalent(ref, design, f, design), (design, name)
                for sc in SCRIPTS:
                    r = score(f, design, sc)
                    table[(name, sc)] = (r["cells"], r["depth"], r["cells"] * r["depth"])
        out.append(f"== {design}: cells / depth / cells*depth (all structures proved equivalent to the reference)")
        out.append("structure".ljust(22) + "".join(s.ljust(20) for s in SCRIPTS))
        for name in structs:
            out.append(name.ljust(22) + "".join("{}/{}/{}".format(*table[(name, s)]).ljust(20) for s in SCRIPTS))
        # spread of the product: across structures for a fixed script vs across scripts for a fixed structure
        within = {s: max(table[(n, s)][2] for n in structs) / min(table[(n, s)][2] for n in structs) for s in SCRIPTS}
        across = {n: max(table[(n, s)][2] for s in SCRIPTS) / min(table[(n, s)][2] for s in SCRIPTS) for n in structs}
        out.append("max/min product across structures, per script: " +
                   ", ".join(f"{s} {v:.2f}" for s, v in within.items()))
        out.append("max/min product across scripts, per structure: " +
                   ", ".join(f"{n} {v:.2f}" for n, v in across.items()))
        best = min(table.items(), key=lambda kv: kv[1][2])
        out.append(f"best product: {best[1][2]} ({best[0][0]} under {best[0][1]}); "
                   f"best per script: " + ", ".join(f"{s} {min(table[(n, s)][2] for n in structs)}" for s in SCRIPTS))
        out.append("")
        summary.append((design, statistics.median(within.values()), statistics.median(across.values())))
    out.append("median spread factor (max/min product): " + "; ".join(
        f"{d}: across structures {w:.2f}, across scripts {a:.2f}" for d, w, a in summary))
    v = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    out.append(f"tool: {v}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    print(text)
