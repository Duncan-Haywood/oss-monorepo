"""Score each adder style under three ABC scripts, after proving it equivalent to a + b; write results.txt."""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from chip_cse_style import gens
from chip_cse_style.flow import equivalent, score

SCRIPTS = ["yosys_default", "dch_map", "resyn2_map"]
REF = os.path.join(HERE, "..", "designs", "add16.v")


def run():
    out = ["style".ljust(10) + "".join(f"{s} cells/depth/product".ljust(34) for s in SCRIPTS) + "proved"]
    with tempfile.TemporaryDirectory() as d:
        for st in gens.STYLES:
            f = os.path.join(d, "v.v")
            open(f, "w").write(gens.gen_add16(st))
            row = st.ljust(10)
            for sc in SCRIPTS:
                r = score(f, "add16", sc)
                row += f"{r['cells']}/{r['depth']}/{r['cells'] * r['depth']}".ljust(34)
            out.append(row + str(equivalent(REF, "add16", f, "add16")))
    out.append("tool: " + subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip())
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = run()
    open(os.path.join(HERE, "results.txt"), "w").write(text)
    print(text)
