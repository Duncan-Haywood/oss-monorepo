"""Energy model for a serial MAC engine running the MLP, and for the FE solve on a CPU.

Every constant is an ASSUMPTION (45 nm orders of magnitude in the spirit of Horowitz 2014, ISSCC;
the MAC constants are copied from research/accel-sparse/src/accel_sparse/cost.py, typed from
memory there and not re-checked against the paper). For relative comparison only.
"""
E_MULT_8X8_PJ = 0.2
E_ADD_PJ_24 = 0.075
E_READ_PJ_PER_BIT = 0.16
E_FP32_FLOP_PJ = 2.3     # assumed mean of fp32 add (0.9) and multiply (3.7) at 45 nm


def mlp_energy_pj(sizes, wbits, abits=8):
    e = 0.0
    for a, b in zip(sizes[:-1], sizes[1:]):
        n = a * b
        e += n * (wbits + abits) * E_READ_PJ_PER_BIT
        e += n * (E_MULT_8X8_PJ * wbits * abits / 64.0 + E_ADD_PJ_24)
    return e


def fe_energy_pj(flops):
    """FE solve on a CPU, arithmetic only (memory traffic ignored, which favours the CPU)."""
    return flops * E_FP32_FLOP_PJ


def breakeven_flops(sizes, wbits):
    """Simulator flop count above which the accelerator inference costs less than the solve."""
    return mlp_energy_pj(sizes, wbits) / E_FP32_FLOP_PJ
