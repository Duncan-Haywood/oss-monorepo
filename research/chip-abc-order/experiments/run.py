"""Score textual variants of equivalent RTL under three ABC scripts; write results.txt."""
import os
import statistics
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_abc_order import gens, variants
from chip_abc_order.flow import equivalent, score

SCRIPTS = ["yosys_default", "dch_map", "resyn2_map"]
KINDS = {"shuffle": ["shuffle"], "rename": ["rename"], "permute": ["permute"], "all": ["shuffle", "rename", "permute"]}
SEEDS = 12
DESIGNS = {
    "add16": os.path.join(HERE, "..", "designs", "add16.v"),
    "mul6": os.path.join(HERE, "..", "designs", "mul6.v"),
}
STRUCTS = [
    ("add16", "plus", lambda: gens.gen_add16("plus", 0)),
    ("add16", "ripple", lambda: gens.gen_add16("ripple", 0)),
    ("add16", "csel4", lambda: gens.gen_add16("csel", 4)),
    ("add16", "cselrip4", lambda: gens.gen_add16("cselrip", 4)),
    ("mul6", "mul6-cfg0", lambda: gens.gen_mul6(*gens.mul6_config_space()[0])),
    ("mul6", "mul6-cfg3", lambda: gens.gen_mul6(*gens.mul6_config_space()[3])),
]


def write(path, text):
    with open(path, "w") as fh:
        fh.write(text)


def run():
    out = ["cells*depth over %d seeds per rewrite kind; 'base' is the generated text unchanged" % SEEDS,
           "structure".ljust(12) + "script".ljust(15) + "base".ljust(7) + "".join(f"{k} (distinct/min-max)".ljust(24) for k in KINDS),
           ]
    worst, changed, total, unproved = 1.0, 0, 0, 0
    with tempfile.TemporaryDirectory() as d:
        for design, name, gen in STRUCTS:
            ref, base_src = DESIGNS[design], gen()
            f = os.path.join(d, "v.v")
            vsets = {}
            for kind, ks in KINDS.items():
                vsets[kind] = [variants.variant(base_src, ks, seed) for seed in range(SEEDS)]
                for src in vsets[kind]:
                    write(f, src)
                    if not equivalent(ref, design, f, design):
                        unproved += 1
            for sc in SCRIPTS:
                write(f, base_src)
                b = score(f, design, sc)
                base = b["cells"] * b["depth"]
                row = name.ljust(12) + sc.ljust(15) + str(base).ljust(7)
                for kind, srcs in vsets.items():
                    vals = []
                    for src in srcs:
                        write(f, src)
                        r = score(f, design, sc)
                        vals.append(r["cells"] * r["depth"])
                    vals.append(base)
                    total += len(vals) - 1
                    changed += sum(v != base for v in vals[:-1])
                    worst = max(worst, max(vals) / min(vals))
                    row += f"{len(set(vals))} / {min(vals)}-{max(vals)}".ljust(24)
                out.append(row)
    out.append(f"variants scored: {total}; differing from base: {changed}; worst max/min ratio: {worst:.3f}; "
               f"variants not proved equivalent to the reference: {unproved}")
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    print(text)
