"""Latency models. All constants are ASSUMED for this stylised study; they are not measured and the
datasheet-derived MCU figures were written from memory and not re-verified in this run."""
import math


def accel_cycles(sizes, lanes, overhead=3):
    """P-lane MAC array, output-stationary (accel-dataflow's schedule at batch 1): a layer with O outputs and
    I inputs takes ceil(O/P)*I cycles plus `overhead` cycles; bias/ReLU/requantise folded into the overhead."""
    return sum(math.ceil(o / lanes) * i + overhead for i, o in zip(sizes[:-1], sizes[1:]))


def mcu_cycles(sizes, cycles_per_mac, overhead=40):
    """Software loop: cycles_per_mac covers load, multiply-accumulate and loop cost; per-layer overhead for
    requantise/ReLU/bias of each output is charged as `overhead` once per layer plus 4 cycles per output."""
    return sum(i * o * cycles_per_mac + 4 * o + overhead for i, o in zip(sizes[:-1], sizes[1:]))


# name -> (clock Hz, assumed cycles per int8 MAC in a compiled C loop, no SIMD)
MCUS = {
    "Cortex-M0+ @ 48 MHz (assumed 6 cyc/MAC)": (48e6, 6.0),
    "Cortex-M4 @ 168 MHz (assumed 2.5 cyc/MAC)": (168e6, 2.5),
}
ACCEL_CLOCKS = (25e6, 50e6)   # Hz, assumed achievable clocks of a small accelerator


def latency_s(cycles, clock):
    return cycles / clock
