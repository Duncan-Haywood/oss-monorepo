# Log one launcher wheel's tach periods for `tennisbots tach-jitter` (2026-11-18, firmware/esp32/README.md
# "The take survey's jitter limit"). Run it from the REPL instead of main.py, with the wheel spinning at a steady speed
# (its ESC on a servo tester, or the drill paused with the wheels up to speed), never with a ball in the feeder:
#
#     import tach_log; tach_log.run(34, 600)      # GPIO 34 = top wheel, 35 = bottom
#
# It times the rising edges with a hard interrupt, as main.Tach does, and prints one period in microseconds per line;
# save the output to a file on the Pi (e.g. `mpremote exec "import tach_log; tach_log.run(34, 600)" > top.txt`).
import time
from array import array

from machine import Pin

# A hard interrupt may not allocate, so the periods go into a buffer made before the interrupt is armed.
_st = {"buf": array("l", [0]), "i": 0, "last": 0}


def _edge(_):
    st = _st
    now = time.ticks_us()
    if st["last"] and st["i"] < len(st["buf"]):
        st["buf"][st["i"]] = time.ticks_diff(now, st["last"])
        st["i"] += 1
    st["last"] = now


def run(pin=34, n=600, timeout_s=30):
    _st["buf"], _st["i"], _st["last"] = array("l", [0] * n), 0, 0
    p = Pin(pin, Pin.IN)
    p.irq(_edge, Pin.IRQ_RISING, hard=True)
    t0 = time.ticks_ms()
    while _st["i"] < n and time.ticks_diff(time.ticks_ms(), t0) < timeout_s * 1000:
        time.sleep_ms(20)
    p.irq(None)
    got = _st["i"]
    print("# tach_log pin", pin, got, "periods (us)")
    for k in range(got):
        print(_st["buf"][k])
