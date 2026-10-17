"""Derive per-copy work and vitamin cost from the selfrep-closure Prusa Mendel model (imported, not copied)."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure.bom import SHOPS  # noqa: E402
from selfrep_closure.closure import closure  # noqa: E402

PRINT_G_PER_H = 25.0   # ASSUMED sustained FDM throughput, grams of part per hour
ASSEMBLY_H = 6.0       # ASSUMED unit-hours to assemble and calibrate a copy (stylised: the unit does it)


def printer_copy(variant="lm8uu", shop="printer"):
    """Return (work_h, vit_cost, closure_cost, total_cost) for one copy built by ``shop``.

    Only FDM-printed mass is timed; parts the router or laser would make are NOT timed here, so
    use the printer-alone shop for the main results.
    """
    procs = SHOPS[shop]
    c, tot = closure(variant, procs)
    print_h = c["mass"] * tot["mass"] / PRINT_G_PER_H
    return print_h + ASSEMBLY_H, (1 - c["cost"]) * tot["cost"], c["cost"], tot["cost"]
