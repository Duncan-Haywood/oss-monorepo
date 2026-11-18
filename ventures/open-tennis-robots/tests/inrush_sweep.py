"""Contactor inrush across the assumptions (2026-11-14; cad/README.md "Contactor inrush and precharge").

    python3 tests/inrush_sweep.py

`Feeder.contactor_inrush` closes the contactor onto the switched bus as a series R-L-C, solved in closed form. Every
figure but the charger's 29.2 V is assumed, so this sweeps the three that move the answer most: the pack's
resistance, each ESC's input capacitance and the loop's inductance per metre. For each case it prints a direct close
(peak current, microseconds over the BMS's assumed 150 A trip) and a close after the 4.7 ohm, 0.5 s precharge (the
contactor's peak, and the precharge relay's).

Since 2026-11-14 the precharged close includes the loads that start while the bus charges (`Feeder.precharge_bus`):
the stepper driver holding, at the pack's full and low ends. A second table repeats the sweep with the old firmware's
servo pulse at rest (`servo_pulse_at_rest=True`), which set the shuttle's servo seeking home at stall during the
precharge (both with the stepper's ENABLE tied to GND, as it was then).

A third table (2026-11-14, later) compares the stepper driver holding from power-up (ENABLE tied to GND) with its
ENABLE held off until the contactor's coil has been on for CONTACTOR_SETTLE_MS, and gives what the contactor makes
re-closing after one assumed 10 ms bounce (`Feeder.contactor_bounce`), with and without the stepper enabled.
"""

import itertools
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
from otr_cad.params import Feeder  # noqa: E402

PACK_OHM = (0.020, 0.040, 0.080)
ESC_UF = (470.0, 1000.0, 2000.0)
UH_PER_M = (0.3, 0.6, 1.0)


def rows():
    out = []
    for r, c, l in itertools.product(PACK_OHM, ESC_UF, UH_PER_M):
        p = Feeder(pack_ohm=r, esc_cap_uf=c, loop_uh_per_m=l)
        d = p.contactor_inrush()
        out.append({"pack_mohm": r * 1e3, "esc_uf": c, "uh_per_m": l, "direct_a": d["direct"]["peak_a"],
                    "direct_bms_us": d["direct"]["bms_over_us"], "damping": d["damping"],
                    "close_a": d["closing"]["peak_a"], "precharge_a": d["precharge"]["peak_a"],
                    "residual_v": d["precharge"]["residual_v"], "fails": p.check_inrush()})
    return out


def servo_rows():
    out = []
    for r, c, l in itertools.product(PACK_OHM, ESC_UF, UH_PER_M):
        for pulse in (False, True):
            p = Feeder(pack_ohm=r, esc_cap_uf=c, loop_uh_per_m=l, servo_pulse_at_rest=pulse, stepper_holds_at_power_up=True)
            su = p.contactor_inrush()["startup"]
            out.append({"pack_mohm": r * 1e3, "esc_uf": c, "uh_per_m": l, "pulse": pulse,
                        "full_a": su["full"]["close"]["peak_a"], "low_a": su["low"]["close"]["peak_a"],
                        "low_gap_v": su["low"]["gap_v"], "bms_us": max(b["close"]["bms_over_us"] for b in su.values()),
                        "fails": bool(p.check_inrush())})
    return out


def enable_rows():
    out = []
    for r, c, l in itertools.product(PACK_OHM, ESC_UF, UH_PER_M):
        row = {"pack_mohm": r * 1e3, "esc_uf": c, "uh_per_m": l}
        for held in (True, False):
            p = Feeder(pack_ohm=r, esc_cap_uf=c, loop_uh_per_m=l, stepper_holds_at_power_up=held)
            row["tied_a" if held else "gated_a"] = p.contactor_inrush()["closing"]["peak_a"]
            row["tied_fails" if held else "gated_fails"] = bool(p.check_inrush())
            if not held:
                b = p.contactor_bounce()
                row["bounce_idle_a"], row["bounce_stepper_a"] = b["idle"]["peak_a"], b["stepper enabled"]["peak_a"]
        out.append(row)
    return out


def main():
    rs = rows()
    print("pack mOhm  ESC uF  uH/m  zeta | direct A  >150 A us | precharged: close A  relay A  left V")
    for x in rs:
        print(f"{x['pack_mohm']:9.0f} {x['esc_uf']:7.0f} {x['uh_per_m']:5.1f} {x['damping']:5.2f} |"
              f" {x['direct_a']:8.0f} {x['direct_bms_us']:10.0f} | {x['close_a']:19.1f} {x['precharge_a']:8.2f} "
              f"{x['residual_v']:7.2f}")
    d = [x["direct_a"] for x in rs]
    us = [x["direct_bms_us"] for x in rs]
    print(f"\n{len(rs)} cases. Direct close: {min(d):.0f} to {max(d):.0f} A, over 150 A for {min(us):.0f} to {max(us):.0f} us; "
          f"{sum(u > 200 for u in us)} of {len(rs)} past an assumed 200 us BMS delay.")
    print(f"Precharged close: at most {max(x['close_a'] for x in rs):.1f} A; relay at most "
          f"{max(x['precharge_a'] for x in rs):.2f} A; cases the check fails: {sum(bool(x['fails']) for x in rs)}")
    ss = servo_rows()
    print("\nStart-up loads during the precharge (stepper holding; servo pulsed at rest or not)")
    print("pack mOhm  ESC uF  uH/m  servo | close A at 29.2 V  at 24 V  gap V at 24 V  >150 A us")
    for x in ss:
        print(f"{x['pack_mohm']:9.0f} {x['esc_uf']:7.0f} {x['uh_per_m']:5.1f} {'pulse' if x['pulse'] else 'none':>6} |"
              f" {x['full_a']:17.1f} {x['low_a']:8.1f} {x['low_gap_v']:14.2f} {x['bms_us']:10.0f}")
    for pulse in (False, True):
        g = [x for x in ss if x["pulse"] == pulse]
        m = [max(x["full_a"], x["low_a"]) for x in g]
        print(f"servo {'pulsed at rest (old firmware)' if pulse else 'unpulsed until a FEED'}: contactor makes "
              f"{min(m):.0f} to {max(m):.0f} A; over 150 A past 200 us in {sum(x['bms_us'] > 200 for x in g)}; "
              f"cases the check fails: {sum(x['fails'] for x in g)} of {len(g)}")

    es = enable_rows()
    print("\nStepper ENABLE: tied to GND (holds from power-up) or held off until the contactor closes; one 10 ms bounce")
    print("pack mOhm  ESC uF  uH/m | close A tied  gated | bounce re-close A idle  stepper on")
    for x in es:
        print(f"{x['pack_mohm']:9.0f} {x['esc_uf']:7.0f} {x['uh_per_m']:5.1f} | {x['tied_a']:12.1f} {x['gated_a']:6.1f} |"
              f" {x['bounce_idle_a']:22.1f} {x['bounce_stepper_a']:11.1f}")
    t, g = [x["tied_a"] for x in es], [x["gated_a"] for x in es]
    bi, bs = [x["bounce_idle_a"] for x in es], [x["bounce_stepper_a"] for x in es]
    print(f"ENABLE tied: {min(t):.0f} to {max(t):.0f} A, check fails {sum(x['tied_fails'] for x in es)} of {len(es)}; "
          f"gated: {min(g):.0f} to {max(g):.0f} A, check fails {sum(x['gated_fails'] for x in es)} of {len(es)}. "
          f"Bounce re-close: {min(bi):.0f} to {max(bi):.0f} A idle, {min(bs):.0f} to {max(bs):.0f} A with the stepper on.")


if __name__ == "__main__":
    main()
