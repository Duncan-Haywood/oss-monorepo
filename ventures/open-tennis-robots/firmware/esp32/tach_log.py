# Log one launcher wheel's tach periods for `tennisbots tach-jitter` (2026-11-18, firmware/esp32/README.md
# "The take survey's jitter limit"). Run it from the REPL instead of main.py, with the wheel spinning at a steady speed
# (its ESC on a servo tester, or the drill paused with the wheels up to speed), never with a ball in the feeder:
#
#     import tach_log; tach_log.run(34, 600)                 # GPIO 34 = top wheel, 35 = bottom
#     import tach_log; tach_log.run(34, 600, capture=True)   # the same edges timed by MCPWM0's capture unit
#     import tach_log; tach_log.run(34, 600, capture=True, sub=8)   # ... kept to 1/8 us (README "Periods finer than a
#                                                                   # microsecond"); printed as fractional microseconds
#
# It times the rising edges with a hard interrupt, as main.Tach does, and prints one period in microseconds per line;
# save the output to a file on the Pi (e.g. `mpremote exec "import tach_log; tach_log.run(34, 600)" > top.txt`).
# With capture=True (README "A tach timed in hardware") the periods come from the capture unit's latched times
# (capture.py, controller.CaptureClock), as main.Tach reads them with config.TACH_CAPTURE on: log both ways on the same
# steady wheel and compare what `tennisbots tach-jitter` reads for each.
import time
from array import array

from machine import Pin

import controller

# A hard interrupt may not allocate, so the periods go into a buffer made before the interrupt is armed.
_st = {"buf": array("l", [0]), "i": 0, "last": 0, "cap": None, "clock": None}


def _edge(_):
    st = _st
    now = time.ticks_us()
    last = st["last"]
    if st["cap"] is None:
        period = time.ticks_diff(now, last) if last else -1
    else:
        period = st["clock"].period(st["cap"].ticks(), time.ticks_diff(now, last) if last else 0)
        if period > st["clock"].stall_us * st["clock"].sub:
            period = -1                      # the first edge (or a stop): no period to log
    if period >= 0 and st["i"] < len(st["buf"]):
        st["buf"][st["i"]] = period
        st["i"] += 1
    st["last"] = now


def run(pin=34, n=600, timeout_s=30, capture=False, ch=None, sub=1):
    _st["buf"], _st["i"], _st["last"] = array("l", [0] * n), 0, 0
    _st["cap"] = _st["clock"] = None
    if capture:
        import capture as cap
        _st["cap"] = cap.Capture(pin, (0 if pin == 34 else 1) if ch is None else ch)
        _st["clock"] = controller.CaptureClock(sub=sub)
    p = Pin(pin, Pin.IN)
    p.irq(_edge, Pin.IRQ_RISING, hard=True)
    t0 = time.ticks_ms()
    while _st["i"] < n and time.ticks_diff(time.ticks_ms(), t0) < timeout_s * 1000:
        time.sleep_ms(20)
    p.irq(None)
    got = _st["i"]
    sub = _st["clock"].sub if _st["clock"] is not None else 1
    print("# tach_log pin", pin, "capture" if capture else "interrupt", got, "periods (us)", "sub", sub)
    for k in range(got):
        print(_st["buf"][k] if sub == 1 else "%.4f" % (_st["buf"][k] / sub))
