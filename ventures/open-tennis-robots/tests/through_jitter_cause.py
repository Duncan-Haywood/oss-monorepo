"""Why the jittery tach does worse through a speed change (2026-11-17, firmware/esp32/README.md "The jittery tach
through a speed change").

`tests/min_fit_heldout.py --through` found the 3 us tach-jitter plant the one plant where LOOP_THROUGH_CHANGE did
worse: 8 of 324 wheels' record drops more than 2% off against 3 with the hold, and one build's spin error 2.16%
against 1.26%. Two explanations predict different things:

- CHANCE. The through mode sends the next speeds sooner, so the whole drill's timing moves and every tach edge draws
  a different jitter sample from the simulator's random stream. If that is all, the misses land on wheels whose fit
  never went through a change as often as on those that did, and other seeds move the counts either way.
- CAUSE. A wheel whose loop fit runs on periods through the next shot's speed change is fitted on more pulses, and
  most of them are the speed change's, not the ball's. If those pulses' jitter (or the change itself) biases D, the
  misses cluster on the wheels whose fit crossed a change, and they stay there on other seeds.

So each launched wheel is tagged by how its loop fit was made: "crossed" (the targets changed before the verdict,
and with LOOP_THROUGH_CHANGE the fit took the periods up to the verdict, through the change), "watched" (a short
wheel watched past its verdict) and "plain". The same held-out builds (min_fit_heldout's three launchers, two lags,
the 3 us 10k plant, its slow drill at 3.0 s) run on seeds 7 (the held-out seed) to 7 + N - 1, hold and through.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/through_jitter_cause.py [--seeds 6] [--plant 1] [--raw out.jsonl]

One process per case on every core. The physics is the simulator's assumption, not a real wheel.
"""

import json
import multiprocessing
import statistics
import sys

import min_fit_heldout as h
import min_fit_rpm_sweep as m
from feeder_sim import SimFeeder, controller
from tennisbots import host, launcher

LC = controller.LaunchCheck
_update = LC.update
_loop_fit = LC._loop_fit


def _tagging_loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags):
    # revolutions the tach's ring had already overwritten when the fit took its periods: the tick log counts edges
    # from edges0, the periods start that many edges later, so every tick lands that many revolutions early
    cut = []
    for k in (0, 1):
        last = max((c for c, _, _ in ticks[k]), default=edges0[k]) - edges0[k]
        cut.append(max(0, last - len(snap[k])) if targets[k] > 0 else 0)
    self._cuts.append(cut)
    return _loop_fit(self, snap, ticks, edges0, targets, speeds, dips, flags)


def _tagging_update(self, now_ms, rpms, targets=None, tachs=None, cmds=None, since=None):
    went = _update(self, now_ms, rpms, targets, tachs, cmds, since)
    if went:
        tag = "watched" if self.ext is not None else ("crossed" if self.frozen else "plain")
        self._tags.append(tag)
    return went


def run(true, tau, spec, plant, seed):
    LC.update = _tagging_update
    LC._loop_fit = _tagging_loop_fit
    sim = SimFeeder(balls=None, wheel_tau_s=tau, true_launcher=true, seed=seed, **plant)
    sim.hw.launch.esc_tau_us = int(round(1e6 * plant.get("esc_tau_s", 0.0)))
    sim.hw.launch._tags = tags = []
    sim.hw.launch._cuts = cuts = []
    balls = []
    take = sim._take_momentum

    def taken():
        before = tuple(sim.wheel)
        take()
        balls.append((before, tuple(sim.wheel)))
    sim._take_momentum = taken
    res, _ = m.rs._run(sim, host.plan_drill(spec))
    wheels = []
    if res.ok:
        recs = [r for r in res.launches if r.get("launched")]
        assert len(recs) == len(tags) == len(cuts), (len(recs), len(tags), len(cuts))
        for n, (r, (before, after), tag, cut) in enumerate(zip(recs, balls, tags, cuts)):
            for k, name in ((0, "top"), (1, "bottom")):
                wheels.append({"shot": n, "wheel": name, "tag": tag, "cut": cut[k], "rpm": float(r[f"rpm_{name}"]),
                               "ratio": float(r[f"drop_{name}"]) / (1 - after[k] / before[k])})
    return res, wheels


def case(args):
    pi, tau, li, seed, through = args
    pname, plant = h.PLANTS[pi]
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = through
    host.HOLD_RPM = h.SHIPPED_HOLD
    res, wheels = run(true, tau, h.heldout_drill(3.0), plant, seed)
    if not res.ok:
        return args, {"aborted": res.aborted}
    return args, {"wheels": wheels}


def main():
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 6
    pi = int(sys.argv[sys.argv.index("--plant") + 1]) if "--plant" in sys.argv else 1
    raw = sys.argv[sys.argv.index("--raw") + 1] if "--raw" in sys.argv else None
    grid = [(pi, tau, li, h.SEED + s, th) for s in range(seeds) for tau in h.LAGS for li in range(len(h.LAUNCHERS))
            for th in (False, True)]
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
    with multiprocessing.Pool(multiprocessing.cpu_count()) as pool:
        for a, r in pool.imap_unordered(case, todo):
            done[tuple(a)] = r
            print(f"  {a}: {'aborted ' + r['aborted'] if 'aborted' in r else 'done'}", file=sys.stderr)
            if raw:
                with open(raw, "a") as f:
                    f.write(json.dumps([list(a), r]) + "\n")

    print(f"Plant {h.PLANTS[pi][0]}, held-out slow drill at 3.0 s, seeds {h.SEED}-{h.SEED + seeds - 1}, "
          f"{len(h.LAUNCHERS) * len(h.LAGS)} builds a seed")
    print("\nPart 1. Record drop / true drop per launched wheel, by how its loop fit was made")
    print(f"{'mode':8} {'fit':8} {'band':>10} | {'wheels':>6} {'>2% off':>7} {'rate':>6} {'|err| mean':>10} "
          f"{'sd':>6} {'bias':>7}")
    for th in (False, True):
        ws = [w for g in grid if g[4] == th and "wheels" in done[tuple(g)] for w in done[tuple(g)]["wheels"]]
        for tag in ("plain", "crossed", "watched"):
            for lo, hi, lab in ((0, 1000, "<1000"), (1000, 2500, "1000-2500"), (2500, 99999, ">=2500")):
                xs = [w["ratio"] for w in ws if w["tag"] == tag and lo <= w["rpm"] < hi]
                if not xs:
                    continue
                off = sum(abs(x - 1) > 0.02 for x in xs)
                print(f"{'through' if th else 'hold':8} {tag:8} {lab:>10} | {len(xs):6d} {off:7d} "
                      f"{100 * off / len(xs):5.1f}% {100 * statistics.fmean(abs(x - 1) for x in xs):9.2f}% "
                      f"{100 * statistics.pstdev(xs):5.2f}% {100 * (statistics.fmean(xs) - 1):+6.2f}%")

    print("\nPart 2. Wheels more than 2% off, per seed (hold / through)")
    for s in range(seeds):
        row = []
        for th in (False, True):
            ws = [w for g in grid if g[3] == h.SEED + s and g[4] == th and "wheels" in done[tuple(g)]
                  for w in done[tuple(g)]["wheels"]]
            row.append(sum(abs(w["ratio"] - 1) > 0.02 for w in ws))
        print(f"  seed {h.SEED + s:3d}: {row[0]:3d} / {row[1]:3d}")
    for g in grid:
        if "aborted" in done[tuple(g)]:
            print(f"aborted: {g}: {done[tuple(g)]['aborted']}")


if __name__ == "__main__":
    main()
