"""Trace of the slow drill's shot-2 release timeout (2026-11-16, firmware/esp32/README.md "The slow drill's release
timeout"): the first-order plant, wheel lag 0.8 s, build 0.95 / 0.35, `host.HOLD_RPM` 3,000, first four shots. Prints
every command the Pi sends (heartbeats too) and the telemetry every 0.1 s with the simulator's true wheel speeds and the
board's SteadyGate state. About 1.5 minutes.

    PYTHONPATH=src:tests:firmware/esp32 python tests/release_timeout_trace.py
"""

from feeder_sim import SimFeeder
import min_fit_rpm_sweep as m
from tennisbots import host, launcher, protocol as P
host.HOLD_RPM=3000.0
true=launcher.WheelLauncher(speed_efficiency=0.95, spin_efficiency=0.35)
sim=SimFeeder(balls=None, wheel_tau_s=0.8, true_launcher=true)
shots=host.plan_drill(m.slow_drill())[:4]
for s in shots: print("plan", s.index, s.rpm_top, s.rpm_bottom, s.elevation_cdeg, s.azimuth_cdeg, s.interval_s)
link=host.FeederLink(sim, sim.clock)
orig_send=link.send
def send(cmd,*v):
    print(f"{sim.clock():8.3f} SEND {cmd} {v}"); return orig_send(cmd,*v)
link.send=send
orig=link.poll; last=[None]
def poll():
    t=orig()
    if t is not None and (last[0] is None or t.t-last[0]>=0.05):
        last[0]=t.t
        fl=[n for n,b in (("AIM",P.FLAG_AIM_SETTLING),("WS",P.FLAG_WHEELS_SETTLING),("AZU",P.FLAG_AZ_UNHOMED)) if t.flags&b]
        hw=sim.hw
        print(f"{t.t:8.3f} rpm {t.rpm_top:5d} {t.rpm_bottom:5d} true {sim.wheel[0]:7.1f} {sim.wheel[1]:7.1f} fed {t.balls_fed} {fl} feeding {getattr(hw,'feeding',None)} ok_ms {hw.wheels_steady.ok_ms} need {hw.wheels_steady.need}")
    return t
link.poll=poll
res=host.run_drill(link, shots, sim.sleep, log=print)
print(res.ok, res.aborted)
