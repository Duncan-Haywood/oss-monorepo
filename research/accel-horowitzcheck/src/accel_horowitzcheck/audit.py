"""Find every energy constant in research/accel-*/src and compare it with Horowitz Fig. 1.1.9."""
import ast
import glob
import os

from . import horowitz as H

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")

# name -> (what the paper gives, the value implied by the figure)
def reference():
    add24 = H.interp(H.ADD_INT_PJ, 24)
    return {
        "E_MULT_8X8_PJ": ("8-bit integer multiply", H.MULT_INT_PJ[8]),
        "E_ADD_32_PJ": ("32-bit integer add", H.ADD_INT_PJ[32]),
        "E_ADD_PJ_24": ("24-bit add, log-log interpolation of 8 and 32-bit", add24),
        "E_SRAM_PJ_PER_BIT": ("8 KB array, 10 pJ per 64 bits", H.CACHE_64B_PJ[8192] / 64),
        "E_READ_PJ_PER_BIT": ("8 KB array, 10 pJ per 64 bits", H.CACHE_64B_PJ[8192] / 64),
        "E_FP32_FLOP_PJ": ("mean of fp32 add 0.9 and fp32 multiply 3.7", (H.FADD_PJ[32] + H.FMULT_PJ[32]) / 2),
    }


def scan():
    """Return rows (project, file, name, value) for each top-level numeric E_* assignment."""
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "accel-*", "src", "*", "*.py"))):
        proj = path.split(os.sep)[-4]
        tree = ast.parse(open(path).read())
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
            tup = [e.id for t in node.targets if isinstance(t, ast.Tuple) for e in t.elts]
            if tup and isinstance(node.value, ast.Tuple):
                vals = [e.value for e in node.value.elts if isinstance(e, ast.Constant)]
                for n, v in zip(tup, vals):
                    if n.startswith("E_"):
                        rows.append((proj, os.path.basename(path), n, v))
            elif names and names[0].startswith("E_") and isinstance(node.value, ast.Constant):
                rows.append((proj, os.path.basename(path), names[0], node.value.value))
    return rows


def audit():
    ref = reference()
    out = []
    for proj, f, name, v in scan():
        if name in ref:
            what, paper = ref[name]
            out.append({"project": proj, "file": f, "name": name, "value": v, "paper": round(paper, 4),
                        "what": what, "ratio": round(v / paper, 3)})
        else:
            out.append({"project": proj, "file": f, "name": name, "value": v, "paper": None,
                        "what": "no counterpart in Fig. 1.1.9 (an assumption of the project)", "ratio": None})
    return out
