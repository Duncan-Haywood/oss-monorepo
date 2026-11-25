"""Milestone 7zc diagnostic: the gear pump's speed at half idle speed in the 7h to 7zc factorial.

gear_pump_chosen / gear_pump_onerule build every gear-pump family once, Gear(rows, sizes) at n_r = 1, and
excavator_gear_pump.gear_powers passes the idle speed ratio n_r only to the neutral pressure p_n(q n_r). So in the
nine half-idle-speed conditions the gear pump's absorbed power is read off its working-speed (2100 r/min) power
curves at the lower neutral pressure, while the load-sensing pump's standby power is computed at half speed.
gear_pump_floor.py (7zb) builds Gear(rows, n_r) instead, reading the curves at 1050 r/min. This prints, for the nine
catalogue families of 7zb and each neutral reading at n_r = 0.5, P_idle at 64, 79 and 85 L/min and b under both
builds, and the ratio half-speed-curves / working-speed-curves.

Usage: python gear_pump_halfspeed.py > gear_pump_halfspeed_results.txt   (numpy; no Hugging Face data; seconds)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
import gear_pump_floor as fl  # noqa: E402
from excavator_gear_pump import Gear  # noqa: E402
from excavator_idle_standby import READINGS  # noqa: E402

QS = (64.0, 79.0, 85.0)


def compare(rows, sizes, reading, n_r=0.5):
    pn = READINGS[reading]
    out = {}
    for label, g in (("factorial", Gear(rows, 1.0, sizes=sizes, skip_short=True)),
                     ("own-speed", Gear(rows, n_r, sizes=sizes, skip_short=True))):
        out[label] = {q: g.idle(q, pn(q * n_r)) for q in QS}
    return out


def main():
    out = []
    p = out.append
    p("Milestone 7zc diagnostic: gear-pump idle power at half idle speed (n_r 0.5), read off working-speed curves "
      "(as the 7h to 7zc factorial does) and off the pump's own 1050 r/min curves (as 7zb does)")
    p("P_idle (kW) at 64 / 79 / 85 L/min; b = P(79)/P(64); ratio = own-speed / factorial at 85 L/min")
    p("")
    ratios = []
    for reading in READINGS:
        p(f"{reading}, n_r 0.5:")
        for name, (rows, sz) in fl.families().items():
            c = compare(rows, sz, reading)
            f, o = c["factorial"], c["own-speed"]
            ratio = o[85.0] / f[85.0]
            ratios.append(ratio)
            p(f"  {name:16s} factorial {f[64.0]:6.3f} {f[79.0]:6.3f} {f[85.0]:6.3f} b {f[79.0] / f[64.0]:.3f} | "
              f"own-speed {o[64.0]:6.3f} {o[79.0]:6.3f} {o[85.0]:6.3f} b {o[79.0] / o[64.0]:.3f} | ratio {ratio:.3f}")
        p("")
    p(f"ratio own-speed / factorial at 85 L/min over the {len(ratios)} family-readings: "
      f"min {min(ratios):.3f}, max {max(ratios):.3f}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
