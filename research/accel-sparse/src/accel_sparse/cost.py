"""Energy / storage model for a serial multiply-accumulate engine with optional zero-skipping.

Every constant is an ASSUMPTION, reused from research/accel-kws/src/accel_kws/cost.py (45 nm
orders of magnitude in the spirit of Horowitz 2014, ISSCC; typed from memory there and not
re-checked against the paper). Values are for relative comparison only.
"""
import math

E_MULT_8X8_PJ = 0.2      # 8x8 integer multiply, scaled by (wbits*abits)/64
E_ADD_PJ_24 = 0.075      # 24-bit accumulate (0.1 pJ at 32 bit, scaled by 24/32)
E_READ_PJ_PER_BIT = 0.16  # small on-chip array read, per bit
E_NEG_PJ = 0.01          # assumed conditional negate/gate for a multiplier-free +-1 weight


def layer_energy_pj(fan_in, fan_out, nnz, kind, wbits, abits, skip_zeros):
    """Energy of one matrix-vector layer.

    kind: 'mult' (wbits x abits multiplier), 'signadd' (ternary/binary weights: add or subtract
    the activation, no multiplier).  skip_zeros: weights stored sparsely (value + column index
    per nonzero) and zero weights cost nothing; otherwise all fan_in*fan_out weights are read,
    and for 'signadd' the add is only clock-gated off for zeros.
    """
    total = fan_in * fan_out
    n = nnz if skip_zeros else total
    idx_bits = math.ceil(math.log2(fan_in)) if skip_zeros else 0
    read = n * (wbits + idx_bits) * E_READ_PJ_PER_BIT + n * abits * E_READ_PJ_PER_BIT
    if kind == 'mult':
        arith = n * (E_MULT_8X8_PJ * wbits * abits / 64.0 + E_ADD_PJ_24)
    else:
        active = nnz  # clock-gated adds for zeros, or only nonzeros visited
        arith = active * (E_NEG_PJ + E_ADD_PJ_24)
    return read + arith


def storage_bits(fan_in, fan_out, nnz, wbits, skip_zeros):
    if skip_zeros:
        return nnz * (wbits + math.ceil(math.log2(fan_in)))
    return fan_in * fan_out * wbits
