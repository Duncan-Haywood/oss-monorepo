"""Read PGLib-OPF MATPOWER (.m) case files into a PYPOWER case dict, and read PGLib's
published PowerModels.jl baseline objectives (BASELINE.md) for validation."""
import re
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parents[2] / "data" / "pglib"

_BLOCK = re.compile(r"mpc\.(\w+)\s*=\s*\[(.*?)\];", re.S)
_SCALAR = re.compile(r"mpc\.baseMVA\s*=\s*([0-9.eE+-]+)\s*;")


def _matrix(body):
    rows = []
    for line in body.splitlines():
        line = line.split("%", 1)[0].strip().rstrip(";").strip()
        if line:
            rows.append([float(x) for x in line.split()])
    width = max(len(r) for r in rows)
    if any(len(r) != width for r in rows):
        raise ValueError("ragged matrix in case file")
    return np.array(rows, dtype=float)


def load_m(path):
    """Parse a MATPOWER version-2 case file. Returns {'version','baseMVA','bus','gen','branch','gencost'}."""
    text = Path(path).read_text()
    blocks = {name: _matrix(body) for name, body in _BLOCK.findall(text)}
    m = _SCALAR.search(text)
    if m is None:
        raise ValueError("no baseMVA")
    ppc = {"version": "2", "baseMVA": float(m.group(1))}
    for k in ("bus", "gen", "branch", "gencost"):
        ppc[k] = blocks[k]
    gen = ppc["gen"]
    if gen.shape[1] < 21:  # PYPOWER expects the full MATPOWER gen width (ramp columns etc.)
        gen = np.hstack([gen, np.zeros((gen.shape[0], 21 - gen.shape[1]))])
    ppc["gen"] = gen
    return ppc


def case_path(name, kind="typ"):
    suffix = "" if kind == "typ" else f"__{kind}"
    return DATA / f"pglib_opf_{name}{suffix}.m"


def baseline(path=DATA / "BASELINE.md"):
    """{(case, kind): (dc_cost, ac_cost)} from PGLib's BASELINE.md (PowerModels.jl v0.19.9 + IPOPT)."""
    out, kind = {}, None
    for line in Path(path).read_text().splitlines():
        if line.startswith("## "):
            kind = "typ" if "(TYP)" in line else "api" if "(API)" in line else "sad" if "(SAD)" in line else None
        if not line.startswith("| pglib_opf_") or kind is None:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        name = cells[0][len("pglib_opf_"):]
        name = re.sub(r"__(api|sad)$", "", name)
        num = lambda s: float("nan") if s.startswith("inf") or s in ("-", "") else float(s)
        out[(name, kind)] = (num(cells[3]), num(cells[4]))
    return out
