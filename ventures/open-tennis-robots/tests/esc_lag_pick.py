"""Pick a build's ESC lag (config ESC_TAU_US) from its own balls, and check the board's drops with it (2026-11-16,
firmware/esp32/README.md "An ESC lag picked from the build's own balls").

An ESC that ramps its output puts a second lag between the command and the wheel. The loop-command drop fit absorbs
it into the wheel's lag and the ball's moment, so the drop reads low, and the standard error check (`LOOP_SE_MAX`)
marks only some of those drills. One ball cannot tell the two lags apart reliably; a drill's balls together can. For each candidate
lag on `GRID_US` every launched wheel's snapshot is refitted on `controller.esc_lagged_ticks`, the squared residuals
are summed over the drill, and the least wins. Then the drills run again with the board's `LaunchCheck.esc_tau_us` set
to it, and each record's drop is compared with the simulator's true one.

    PYTHONPATH=src:tests:firmware/esp32 python tests/esc_lag_pick.py [--all]

One build per kind at wheel lag 0.4 s (--all: 0.2 / 0.4 / 0.8 s). Physics is the simulator's assumption, not a
measurement; on a real build the same sums need the board's snapshots and tick logs, which it does not send yet.
"""

import statistics
import sys

from feeder_sim import SimFeeder, controller
import refit_sweep as rs
from tennisbots import host, launcher

GRID_US = (0, 20000, 50000, 100000, 200000, 400000)
TRUE = ((0.70, 0.35), (0.95, 0.65))
DRILLS = ("drill.rally.json", "drill.calibration.json")
KINDS = [("first-order", {}), ("ESC lag 30 ms", {"esc_tau_s": 0.03}), ("ESC lag 40 ms", {"esc_tau_s": 0.04}),
         ("ESC lag 80 ms", {"esc_tau_s": 0.08}), ("ESC lag 100 ms", {"esc_tau_s": 0.10}),
         ("ESC lag 100 ms, jitter 3 us", {"esc_tau_s": 0.10, "tach_jitter_us": 3.0})]


def run(kw, tau_s, se, sp, drill, esc_tau_us=0):
    """[(true drop, snapshot, ticks, loop fit as the record has it)] per launched wheel."""
    sim = SimFeeder(balls=None, wheel_tau_s=tau_s, seed=7,
                    true_launcher=launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp), **kw)
    sim.hw.launch.esc_tau_us = esc_tau_us
    balls, snaps, loops = [], [], []
    take = sim._take_momentum

    def taken():
        before = tuple(sim.wheel)
        take()
        balls.append((before, tuple(sim.wheel)))
    sim._take_momentum = taken
    update, loop_fit = controller.LaunchCheck.update, controller.LaunchCheck._loop_fit

    def watched(self, *a, **k):
        went = update(self, *a, **k)
        if went:
            e0 = self.edges0
            snaps.append(([list(s) for s in self.last_snap],
                          [[(c - e0[i], us, u) for c, us, u in self.last_ticks[i]] for i in (0, 1)]))
        return went

    def watched_loop(self, *a, **k):
        yield from loop_fit(self, *a, **k)
        loops.append(self.last_loop)
    controller.LaunchCheck.update, controller.LaunchCheck._loop_fit = watched, watched_loop
    try:
        rs._run(sim, host.plan_drill(rs.load(drill)))
        sim.hw.launch.finish()
    finally:
        controller.LaunchCheck.update, controller.LaunchCheck._loop_fit = update, loop_fit
    out = []
    for (before, after), (sn, tk), lp in zip(balls, snaps, loops):
        for k in (0, 1):
            if before[k] > 0:
                out.append((1 - after[k] / before[k], sn[k], tk[k], lp[k]))
    return out


def pick(wheels):
    """The grid lag with the least summed squared residual over the wheels every lag could fit, and the sums."""
    sums = dict.fromkeys(GRID_US, 0.0)
    for _, periods, ticks, _ in wheels:
        fits = {g: controller.drop_from_commands(periods, controller.esc_lagged_ticks(periods, ticks, g))
                for g in GRID_US}
        if any(f is None for f in fits.values()):
            continue
        for g, f in fits.items():
            sums[g] += f[4] ** 2               # the residual's rms, a share of the pre-ball speed
    return min(sums, key=sums.get), sums


def ratios(wheels):
    return [lp[0] / t for t, _, _, lp in wheels if lp is not None]


def line(rs_):
    return (f"{statistics.fmean(rs_):.4f} {statistics.pstdev(rs_):.4f} {min(rs_):.3f} {max(rs_):.3f}"
            if rs_ else "-")


def main():
    taus = (0.2, 0.4, 0.8) if "--all" in sys.argv else (0.4,)
    print("kind | wheel lag s | picked ESC lag ms | record drop/true, ESC_TAU_US 0: mean sd min max | "
          "with the picked lag: mean sd min max")
    for name, kw in KINDS:
        for tau_s in taus:
            base = [w for se, sp in TRUE for d in DRILLS for w in run(kw, tau_s, se, sp, d)]
            g, _ = pick(base)
            after = base if g == 0 else [w for se, sp in TRUE for d in DRILLS for w in run(kw, tau_s, se, sp, d, g)]
            print(f"{name} | {tau_s} | {g // 1000} | {line(ratios(base))} | {line(ratios(after))}")


if __name__ == "__main__":
    main()
