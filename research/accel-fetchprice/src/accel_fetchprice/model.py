"""Price the operand-fetch and register differences measured in accel-planebatch.

Inputs are RTL-measured counts (fetches, cycles, Yosys flops) from data/planebatch_results.json.
Energy constants are NOT measured: every function takes them as arguments and returns either a
unit-free breakeven or an energy in the caller's unit.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "..", "data", "planebatch_results.json")


def load(path=DATA):
    return json.load(open(path))


def pair(rows, shape, B):
    """(OS row, WS row) for one shape and batch."""
    os_ = [r for r in rows if r["shape"] == shape and r["B"] == B and r["design"] == "OS"]
    ws = [r for r in rows if r["shape"] == shape and r["B"] == B and r["design"] == "WS"]
    if len(os_) != 1 or len(ws) != 1:
        raise KeyError((shape, B))
    return os_[0], ws[0]


def weight_fetches_saved(os_, ws):
    return os_["rtl_w_rd"] - ws["rtl_w_rd"]


def extra_flops(os_, ws):
    return ws["flops"] - os_["flops"]


def breakeven_flop_cycle(os_, ws, e_weight):
    """Energy per extra flop per cycle at which WS-with-register-file equals OS.

    WS saves `w_saved * e_weight` and pays `extra_flops * cycles * e_flop` (idle clock load or
    leakage of the extra storage, whatever its origin). Returns None when WS saves nothing (B=1).
    Below the returned e_flop WS wins on energy; above it OS wins.
    """
    saved = weight_fetches_saved(os_, ws)
    paid = extra_flops(os_, ws) * ws["rtl_cycles"]
    if saved <= 0 or paid <= 0:
        return None
    return e_weight * saved / paid


def psum_words(r):
    return r["model_p_wr"] + r["model_p_rd"]


def breakeven_psum_ratio(os_, ws):
    """Ratio e_psum / e_weight at which the model's WS (partial sums in SRAM, not built) equals OS.

    WS saves w_saved weight fetches and pays (psum_words(WS) - psum_words(OS)) extra SRAM word
    accesses. Returns None when WS saves nothing or pays nothing extra.
    """
    saved = weight_fetches_saved(os_, ws)
    extra = psum_words(ws) - psum_words(os_)
    if saved <= 0 or extra <= 0:
        return None
    return saved / extra


def energy_delta(os_, ws, e_weight, e_flop, gated=False):
    """WS-with-register-file minus OS, fetch and extra-flop terms only (MACs and activation fetches are equal)."""
    d = -weight_fetches_saved(os_, ws) * e_weight
    if not gated:
        d += extra_flops(os_, ws) * ws["rtl_cycles"] * e_flop
    return d
