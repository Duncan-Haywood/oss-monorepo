"""A launcher tach timed by the ESP32's MCPWM capture unit instead of the pin interrupt (2026-11-18, README "A tach
timed in hardware"). Opt-in: config.TACH_CAPTURE = True.

The pin interrupt reads ticks_us() when its handler runs, so every edge time carries the handler's latency and its
spread (flash cache misses, other interrupts). The capture unit latches a free-running 80 MHz counter (APB_CLK) on
the edge itself, in hardware; the handler only reads the latched value, so how late it runs no longer moves the time,
as long as it runs before the next edge (6 ms at 10,000 rpm).

Every address and bit below is from Espressif's register headers for the ESP32 (esp-idf v5.2.2,
components/soc/esp32/include/soc/): reg_base.h (DR_REG_PWM0_BASE 0x3ff5E000, DR_REG_DPORT_BASE 0x3ff00000,
DR_REG_GPIO_BASE 0x3ff44000), mcpwm_reg.h (MCPWM_CAP_TIMER_CFG_REG +0xe8, MCPWM_CAP_CHn_CFG_REG +0xf0 + 4n,
MCPWM_CAP_CHn_REG +0xfc + 4n, MCPWM_CLK_REG +0x120), dport_reg.h (DPORT_PERIP_CLK_EN_REG +0x0C0 and
DPORT_PERIP_RST_EN_REG +0x0C4, DPORT_PWM0_CLK_EN / DPORT_PWM0_RST = bit 17), gpio_reg.h (GPIO_FUNCn_IN_SEL_CFG_REG =
GPIO base + 0x130 + 4n, GPIO_SIGn_IN_SEL bit 7, pin number in bits 5:0) and gpio_sig_map.h (PWM0_CAP0_IN_IDX 109,
PWM0_CAP1_IN_IDX 110). MicroPython's machine.PWM uses the LEDC peripheral, not MCPWM, so MCPWM0's capture unit is free.

Status: checked on the simulator (tests/feeder_sim.py runs this file against a stand-in register file) and by
tests/test_capture.py; not yet run on a board. Bench it with tach_log.run(34, 600, capture=True) and
`tennisbots tach-jitter` before turning it on.
"""

import sys
from array import array

from machine import mem32

try:
    import micropython
    viper = micropython.viper
except (ImportError, AttributeError):    # CPython (the simulator): a plain function over the stand-in registers
    def viper(f):
        return f

if sys.implementation.name != "micropython":
    # Viper's casts, for CPython. On the board `ptr32` and `uint` are the viper compiler's own; these never run there.
    class _Word:
        def __init__(self, addr):
            self.addr = addr

        def __getitem__(self, i):
            return mem32[self.addr + 4 * i]

    def ptr32(x):
        return _Word(x) if isinstance(x, int) else x

    def uint(x):
        return x & 0xFFFFFFFF

MCPWM0 = 0x3FF5E000
CAP_TIMER_CFG = MCPWM0 + 0xE8
CAP_CH_CFG = MCPWM0 + 0xF0            # + 4 * channel
CAP_CH_VALUE = MCPWM0 + 0xFC          # + 4 * channel: the counter's value at the channel's last capture
MCPWM_CLK = MCPWM0 + 0x120
DPORT_PERIP_CLK_EN = 0x3FF000C0
DPORT_PERIP_RST_EN = 0x3FF000C4
DPORT_PWM0 = 1 << 17
GPIO_FUNC_IN_SEL_CFG = 0x3FF44130     # + 4 * signal index
PWM0_CAP0_IN_IDX = 109                # + channel
TICKS_PER_US = 80                     # APB_CLK, 80 MHz

CAP_EN = 1
CAP_MODE_POSEDGE = 2 << 1             # MCPWM_CAPn_MODE (bits 2:1): bit 1 of the field captures the rising edge
GPIO_SIG_IN_SEL = 1 << 7              # route the signal through the GPIO matrix from the pin in bits 5:0


def setup(pin, ch):
    """Route `pin` to MCPWM0 capture channel `ch` (0-2), rising edges, no prescale, and start the capture timer.
    Run once at boot, outside any interrupt (it allocates)."""
    mem32[DPORT_PERIP_CLK_EN] = mem32[DPORT_PERIP_CLK_EN] | DPORT_PWM0
    mem32[DPORT_PERIP_RST_EN] = mem32[DPORT_PERIP_RST_EN] & ~DPORT_PWM0
    mem32[MCPWM_CLK] = 1                                       # MCPWM_CLK_EN: the register file's clock
    mem32[GPIO_FUNC_IN_SEL_CFG + 4 * (PWM0_CAP0_IN_IDX + ch)] = GPIO_SIG_IN_SEL | (pin & 0x3F)
    mem32[CAP_CH_CFG + 4 * ch] = CAP_EN | CAP_MODE_POSEDGE     # prescale 0 (every edge), not inverted
    mem32[CAP_TIMER_CFG] = 1                                   # MCPWM_CAP_TIMER_EN, no sync


@viper
def _ticks_since(reg: uint, last) -> int:
    # Native 32-bit arithmetic, so the hard interrupt never builds a big int: the counter passes 2**30 every 13 s and
    # MicroPython's small ints stop there. -1 means a gap of 2**30 ticks or more (a stopped wheel).
    p = ptr32(last)
    v = ptr32(reg)[0]
    d = uint(uint(v) - uint(p[0]))
    p[0] = v
    if d > uint(0x3FFFFFFF):
        return -1
    return int(d)


class Capture:
    """One capture channel. `ticks()` (from the pin's hard interrupt) is the 80 MHz ticks since the previous call's
    capture, or -1 for a gap too long to count; it allocates nothing."""

    def __init__(self, pin, ch):
        setup(pin, ch)
        self.reg = CAP_CH_VALUE + 4 * ch          # made here, once: as a big int it must not be built in the interrupt
        self.last = array("L", [mem32[self.reg]])

    def ticks(self):
        return _ticks_since(self.reg, self.last)
