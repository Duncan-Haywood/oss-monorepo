"""Does a ball's take spread over a few milliseconds fool the board's drop reading? (2026-11-17, firmware/esp32/README.md
"A take that lasts a few milliseconds").

Every simulator run so far took the ball's momentum from the wheels at one instant, and the board's loop fit
(`drop_from_commands_steps`) models the take as a step at one moment t0. A real ball is in the wheels for a few
milliseconds: with 150 mm wheels gripping a ball over about 50 mm of travel while it speeds up from the shuttle to
18-27 m/s, contact lasts about 2L / v = 4 to 6 ms. The simulator now spreads a take over `take_ms`
(`SimFeeder(take_ms=, take_shape=)`): "halfsine" (force rising and falling symmetrically) or "front" (force at its peak
at first contact, falling linearly to zero: the ball slips most while it is slowest).

The reading is a ratio of revolution periods, and one revolution is 7 to 60 ms (1,000 to 9,000 rpm), so a take of a
few ms sits inside one or two of them.

PREDICTION, written before the run: a revolution's time is the integral of 1/speed over its angle, and a take that is
short against a revolution changes that integral as a step at the take's centroid would, to second order in
take / period. So the fit's t0 lands on the centroid (T/2 for halfsine, T/3 for front) and the drop comes back right:
readings at 1,000 rpm and up keep their mean within 0.1% of the true drop and their sd within 0.05 points of the
instant take at 3 ms, within 0.1 points at 6 ms. DECISION RULE: if any profile of 6 ms or less moves the mean reading
by more than 0.3% of the true drop or the sd above 0.3%, the loop fit needs a contact-time term (a ramp, not a step);
otherwise the step model stands and the firmware is unchanged.

Builds: reading_floor's (min_fit_heldout's three launchers and two wheel lags on the first-order 8k and ESC 50 ms told
plants, calibration drill plus the held-out slow drill, hold mode, seed 7), the plant at 0.1 ms steps with the 1 us
timer for every mode, the instant take included, so the only change between rows is the take. The true drop is the
momentum the ball carried away (total rpm taken over the wheel's speed at first contact), not the speed the wheel
reaches after the take, since the loop is already pushing back while it lasts.

A second part reruns the jittery-tach plant (3 us, 10k) with polish on, as shipped since "Not the simulator's step
either", at the shipped 1 ms plant and an instant take, seeds 7 and 8: the item that run left open.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_spread.py [--raw out.jsonl] [--modes 0,1,2,3,4]

One process per case on every core; a case is two drills. `--raw` appends each case as it finishes and a rerun skips
the cases already there. The physics is the simulator's assumption, not a real wheel.
"""

import json
import multiprocessing
import statistics
import sys

import feeder_sim
import min_fit_heldout as h
import min_fit_rpm_sweep as m
import reading_floor as rf
import unsure_weight as u
from feeder_sim import SimFeeder, controller
from tennisbots import host, launcher

# (label, take_ms, shape, plant index, seeds, 0.1 ms plant)
MODES = (("instant", 0.0, "halfsine", (0, 2), (7,), True),
         ("halfsine 3 ms", 3.0, "halfsine", (0, 2), (7,), True),
         ("halfsine 6 ms", 6.0, "halfsine", (0, 2), (7,), True),
         ("front 4 ms", 4.0, "front", (0, 2), (7,), True),
         ("jitter, polish", 0.0, "halfsine", (1,), (7, 8), False))

FINE_STEP = """\
for s in range(SUB):                 # the shipped Euler step, SUB times per millisecond, with the take's share
    if self.esc_tau:
        self._drive[i] += (hw.esc_cmd[i] - self._drive[i]) * 0.001 / SUB / self.esc_tau
    else:
        self._drive[i] = hw.esc_cmd[i]
    target = self.wheel_max * self._drive[i]
    self.wheel[i] += (target - self.wheel[i]) * 0.001 / SUB / self.wheel_tau
    if self._takes:
        self.wheel[i] = max(0.0, self.wheel[i] - self._take_share(i, t0 + s * 1000 / SUB, t0 + (s + 1) * 1000 / SUB))
    before = self.rev[i]
    self.rev[i] += self.wheel[i] / 60000.0 / SUB
    if int(self.rev[i]) > int(before):
        frac = (s + (int(self.rev[i]) - before) / (self.rev[i] - before)) / SUB
        self.us = t0 + int(frac * 1000)
        if self.tach_jitter_us:
            self.us += int(round(self._rng.gauss(0.0, self.tach_jitter_us)))
        tach._p(None)
"""


def run(true, tau, spec, plant, seed):
    """unsure_weight.run with the true drop read from the simulator's own take record (sim.taken)."""
    u.LC.update = u._tagging_update
    u.LC._loop_fit = u._se_loop_fit
    sim = SimFeeder(balls=None, wheel_tau_s=tau, true_launcher=true, seed=seed, **plant)
    sim.hw.launch.esc_tau_us = int(round(1e6 * plant.get("esc_tau_s", 0.0)))
    sim.hw.launch._tags = tags = []
    sim.hw.launch._ses = {}
    res, _ = m.rs._run(sim, host.plan_drill(spec))
    wheels = []
    if res.ok:
        recs = [r for r in res.launches if r.get("launched")]
        for n, (r, (at, dws), tag) in enumerate(zip(recs, sim.taken, tags)):
            for k, name in ((0, "top"), (1, "bottom")):
                wheels.append({"shot": n, "wheel": name, "tag": tag, "rpm": float(r[f"rpm_{name}"]),
                               "unsure": bool(r.get(f"unsure_{name}")),
                               "ratio": float(r[f"drop_{name}"]) / (dws[k] / at[k])})
    return res, wheels, [{k: r.get(k) for k in u.KEYS} for r in res.launches]


def case(args):
    mi, pi, tau, li, seed = args
    label, take_ms, shape, _, _, fine = MODES[mi]
    if fine:
        rf._FINE_STEP = FINE_STEP
        feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    plant = dict(h.PLANTS[pi][1], take_ms=take_ms, take_shape=shape)
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    cres, cw, clog = run(true, tau, m.rs.load("drill.calibration.json"), plant, seed)
    if not cres.ok:
        return args, {"aborted": "calibration: " + cres.aborted}
    res, w, log = run(true, tau, h.heldout_drill(3.0), plant, seed)
    if not res.ok:
        return args, {"aborted": res.aborted}
    for x in cw:
        x["drill"] = "calibration"
    for x in w:
        x["drill"] = "slow"
    return args, {"wheels": cw + w, "log": clog + log}


def main():
    raw = sys.argv[sys.argv.index("--raw") + 1] if "--raw" in sys.argv else None
    mis = range(len(MODES))
    if "--modes" in sys.argv:
        mis = [int(i) for i in sys.argv[sys.argv.index("--modes") + 1].split(",")]
    grid = [(mi, pi, tau, li, seed) for mi in mis for pi in MODES[mi][3] for seed in MODES[mi][4]
            for tau in h.LAGS for li in range(len(h.LAUNCHERS))]
    done = {}
    if raw:
        try:
            with open(raw) as f:
                for line in f:
                    k, r = json.loads(line)
                    done[tuple(k)] = r
        except FileNotFoundError:
            pass
    todo = [g for g in grid if tuple(g) not in done]
    with multiprocessing.Pool(multiprocessing.cpu_count(), maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(case, todo):
            done[tuple(a)] = r
            print(f"  {a}: {'aborted ' + r['aborted'] if 'aborted' in r else 'done'}", file=sys.stderr, flush=True)
            if raw:
                with open(raw, "a") as f:
                    f.write(json.dumps([list(a), r]) + "\n")
    ok = [g for g in grid if "wheels" in done[tuple(g)]]
    for g in grid:
        if "aborted" in done[tuple(g)]:
            print(f"aborted: {g}: {done[tuple(g)]['aborted']}")
    print(f"{len(ok)} of {len(grid)} builds ran (calibration drill + held-out slow drill, hold mode)")
    print(f"\n{'plant':16} {'take':15} | {'wheels':>6} {'mean':>7} {'sd':>6} {'>1% off':>7} {'marked':>6} | "
          f"{'speed err':>9} {'spin mean':>9} {'spin worst':>10}")
    for mi in mis:
        for pi in MODES[mi][3]:
            gs = [g for g in ok if g[0] == mi and g[1] == pi]
            ws = [w for g in gs for w in done[tuple(g)]["wheels"] if w["rpm"] >= u.FLOOR]
            if not ws:
                continue
            rs = [w["ratio"] for w in ws]
            es = [e for e in (u.fit_errors(done[tuple(g)]["log"], g[3], 1.0) for g in gs) if e is not None]
            print(f"{h.PLANTS[pi][0]:16} {MODES[mi][0]:15} | {len(ws):6d} {statistics.fmean(rs):7.4f} "
                  f"{100 * statistics.pstdev(rs):5.2f}% {sum(abs(q - 1) > 0.01 for q in rs):7d} "
                  f"{sum(w['unsure'] for w in ws):6d} | "
                  f"{100 * statistics.fmean(e[0] for e in es):8.2f}% {100 * statistics.fmean(e[1] for e in es):8.2f}% "
                  f"{100 * max(e[1] for e in es):9.2f}%")
    print("\nBy speed band (both noise-free plants): reading mean / sd per take")
    for lo, hi in ((1000, 2000), (2000, 3000), (3000, 4500), (4500, 9000)):
        row = []
        for mi in mis:
            if MODES[mi][3] == (1,):
                continue
            rs = [w["ratio"] for g in ok if g[0] == mi for w in done[tuple(g)]["wheels"] if lo <= w["rpm"] < hi]
            row.append(f"{MODES[mi][0]} {statistics.fmean(rs):.4f}/{100 * statistics.pstdev(rs):.2f}%"
                       if len(rs) > 1 else "-")
        print(f"  {lo:5d}-{hi:<5d} rpm: " + " | ".join(row))


if __name__ == "__main__":
    main()
