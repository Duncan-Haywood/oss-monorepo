"""Analytic cost model for the serial-MAC engine. Every constant here is an ASSUMPTION.

Energy per operation is an order-of-magnitude, 45 nm figure in the spirit of the table in
Horowitz (2014), "Computing's energy problem (and what we can do about it)", ISSCC. The values
below are typed from memory of that table and were NOT re-checked against the paper in this
run; treat them as plausible orders of magnitude and use the sensitivity factor, not the point
value. They say nothing about any other process node.
"""
E_MULT_8X8_PJ = 0.2      # assumed 8x8-bit integer multiply, 45 nm; scaled by weight_bits/8
E_ADD_32_PJ = 0.1        # assumed 32-bit integer add, 45 nm; scaled by accumulator width / 32
E_SRAM_PJ_PER_BIT = 0.16  # assumed small on-chip array read, about 10 pJ per 64-bit word
ACT_BITS = 8


def energy_per_mac_pj(wbits, accw=24):
    mult = E_MULT_8X8_PJ * (wbits * ACT_BITS) / (8 * 8)
    add = E_ADD_32_PJ * accw / 32
    wread = E_SRAM_PJ_PER_BIT * wbits
    aread = E_SRAM_PJ_PER_BIT * ACT_BITS
    return mult + add + wread + aread


def energy_per_inference_nj(macs, wbits, accw=24, factor=1.0):
    return macs * energy_per_mac_pj(wbits, accw) * factor / 1000.0


def storage_kbit(inputs, hidden, out, wbits, accw=24):
    return ((inputs * hidden + hidden * out) * wbits + (hidden + out) * accw) / 1000.0


def always_on_uw(e_nj, rate_hz):
    """Average power in microwatts of back-to-back inferences at rate_hz; no leakage, no front end."""
    return e_nj * rate_hz * 1e-9 * 1e6
