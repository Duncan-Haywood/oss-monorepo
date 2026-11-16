"""How the board's ESC-lag survey should add up its wheels (2026-11-16, firmware/esp32/README.md "Each wheel its own
noise").

The survey (README "The ESC lag surveyed on the board") refits each launched wheel at every lag of
`controller.ESC_SURVEY_GRID_US` and sums the squared residual rms per lag over the wheels, then refines the least
with `controller.survey_pick`. A plain sum treats every wheel as equally noisy. Tach jitter is a fixed time error on
each edge, so it is a larger share of a short (fast) revolution than of a long one: a fast wheel's misses are many
times a slow one's, and its few residual points decide the sum. With a separate noise level per wheel, the joint
likelihood of a lag is the sum over wheels of n log(rms^2), so each wheel votes with its own relative improvement.

This collects every launched wheel's snapshot and tick log (rally then calibration drill on one simulated board, as
tests/esc_survey_sweep.py), refits each at the grid's lags exactly as the board's survey does (`refine=0`), and
compares the picks under three rules:

  sum      sum of rms^2 (the board's rule before this change)
  log      sum of log(rms^2)
  rel      sum of rms^2 / that wheel's least rms^2 over the grid

    PYTHONPATH=src:tests:firmware/esp32 python tests/esc_survey_weight.py [--all] [--seeds 7,8,9] [--detail]

--detail prints, for each build where the rules disagree, every wheel's speed and rms per lag. Physics and plants are
the simulator's assumptions, not measurements.
"""

import math
import sys

from feeder_sim import SimFeeder, controller
import esc_survey_sweep as ess
from tennisbots import host, launcher

PLANTS = ess.PLANTS + [("ESC lag 100 ms, jitter 5 us", {"esc_tau_s": 0.10, "tach_jitter_us": 5.0}),
                       ("ESC lag 40 ms, jitter 3 us", {"esc_tau_s": 0.04, "tach_jitter_us": 3.0}),
                       ("first-order, jitter 3 us", {"tach_jitter_us": 3.0})]
GRID = controller.ESC_SURVEY_GRID_US


def wheels(kw, tau_s, se, sp, seed):
    """[(rpm before the ball, [rms^2 at each grid lag])] for every launched wheel all lags could fit."""
    sim = SimFeeder(true_launcher=launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp), wheel_tau_s=tau_s,
                    seed=seed, **kw)
    lc = sim.hw.launch
    lc.survey = ()                         # collected here instead, so the board does not spend the time
    got = []
    loop_fit = controller.LaunchCheck._loop_fit

    def watched(self, snap, ticks, edges0, targets, speeds, dips, flags):
        for k in (0, 1):
            if targets[k] > 0:
                raw = [(c - edges0[k], us, u) for c, us, u in ticks[k]]
                got.append((speeds[k], list(snap[k]), raw))
        yield from loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags)
    controller.LaunchCheck._loop_fit = watched
    try:
        for d in ("drill.rally.json", "drill.calibration.json"):
            res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(ess.load(d)), sim.sleep)
            if not res.ok:
                raise RuntimeError(res.aborted)
        lc.finish()
    finally:
        controller.LaunchCheck._loop_fit = loop_fit
    out = []
    for rpm, periods, raw in got:
        r2 = []
        for g in GRID:
            fit = controller.drop_from_commands(periods, controller.esc_lagged_ticks(periods, raw, g), refine=0)
            if fit is None:
                break
            r2.append(fit[4] * fit[4])
        if len(r2) == len(GRID):
            out.append((rpm, r2))
    return out


def sums(ws, rule):
    s = [0.0] * len(GRID)
    for _, r2 in ws:
        lo = min(r2)
        for i, v in enumerate(r2):
            if rule == "sum":
                s[i] += v
            elif rule == "log":
                s[i] += math.log(max(v, 1e-30))
            else:
                s[i] += v / lo if lo > 0 else 1.0
    return s


def pick(ws, rule):
    s = sums(ws, rule)
    if rule == "log":                      # survey_pick wants positive sums: shift so the least is 1
        m = min(s)
        s = [v - m + 1.0 for v in s]
    i, ref = controller.survey_pick(GRID, s)
    return GRID[i] / 1000, ref / 1000


def main():
    taus = (0.2, 0.4, 0.8) if "--all" in sys.argv else (0.4,)
    seeds = [int(x) for x in ess_arg("--seeds", "7").split(",")]
    rules = ("sum", "log", "rel")
    print("plant | wheel lag s | true se/sp | seed | wheels | " + " | ".join(f"{r}: least / refined ms" for r in rules))
    for name, kw in PLANTS:
        true_ms = 1000 * kw.get("esc_tau_s", 0.0)
        for tau_s in taus:
            for se, sp in ess.TRUE:
                for seed in seeds:
                    ws = wheels(kw, tau_s, se, sp, seed)
                    ps = [pick(ws, r) for r in rules]
                    print(f"{name} | {tau_s} | {se}/{sp} | {seed} | {len(ws)} | "
                          + " | ".join(f"{a:g} / {b:.0f}" for a, b in ps) + f" | true {true_ms:g}", flush=True)
                    if "--detail" in sys.argv and len({round(b) for _, b in ps}) > 1:
                        for rpm, r2 in sorted(ws):
                            print(f"    {rpm:7.0f} rpm  " + " ".join(f"{1e6 * math.sqrt(v):7.0f}" for v in r2))


def ess_arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


if __name__ == "__main__":
    main()
