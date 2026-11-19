"""Do more tach pulses a revolution let the contact-time fit see short takes? (2026-11-19, firmware/esp32/README.md
"More tach pulses a revolution")

README "Short takes that read 0: no ball saw them" found that a take shorter than a revolution moves a wheel's fit
only when the contact straddles a tach edge: with one magnet a revolution most balls of a 1-2.5 ms take carry no
information about it, and no grid or pick can recover it. Two or four magnets put an edge every half or quarter
revolution. This sweep asks whether that is worth building, before touching the simulator's board path.

Paired single-wheel trials, the pattern of tests/loop_residual_sweep.py with a finer plant: a first-order wheel
(0.1 ms Euler steps), the firmware's own WheelLoop every 10 ms on a once-a-revolution PeriodTach (magnet 0), and a
half-sine take of a share `DROP` of the wheel's speed. The control is the same whatever is fitted: every magnet's edge
time is logged beside it (floored to 1/8 us, the capture tach's resolution, plus an optional sensor jitter), and the
same ball is refitted offline with 1, 2 and 4 magnets by the board's own fit (`drop_from_commands_steps`, its
`per` and `angles`, the take survey's depth). Magnets are placed at k / N of a revolution plus a normal error of
`SPACING_DEG`; the fit's `angles` are learnt from the 0.25 s of periods before the ball (`magnet_spacing`), or, for
the "naive" rows, taken as 1 / N each.

Per ball and fit: the rms at every candidate in DENSE_MS; "sees" = the fit at the true take beats the step's squared
rms by 20% (take_shelf_bound's test); the ball's own least; and the drop read at the step and at the true take
against the true drop.

PREDICTION (written before the main run was scored, after only a 4-ball smoke test of the plumbing): with spacing
learnt (0.5 deg magnet error, no sensor jitter), (a) on takes of 1-2.5 ms four magnets "see" at least twice as many
balls as one magnet; (b) on instant balls (take 0) four magnets put the ball's least more than 0.5 ms off 0 on no
more balls than one magnet does; (c) the naive (1 / N) four-magnet fit is worse than the learnt one on (a).

ADDED BEFORE THE MAIN RUN (after a 3-ball look at the curves, 3,500 rpm, takes 0 / 1.5 / 3 ms, which showed four
magnets' curves flat up to the true take and rising steeply after it, rather than a valley at it): (d) the per-ball
bound (host.take_survey_bound's rule on one ball: the first candidate more than 2% and at least 2 ppm over the step's
rms; 8.5 ms when none is) holds the true take on at least 95% of four-magnet learnt balls, and its median on 1-2.5 ms
takes is at least 2 ms lower than one magnet's.

DECISION RULE (written with the prediction): if (b) holds and either (a) or (d) does, more magnets go to the board path next (the
simulator's tach, LaunchCheck's snapshot and the survey sending N periods a revolution, `config.TACH_PULSES`), and
NEXT.md says so; if either fails, the item is closed in NEXT.md with these numbers.

RESULT (main run, eval/tach-pulses-2026-11-19.md): (a) failed, 46 of 128 against 38; (b) held, 7 of 32 against 16;
(c) held, naive four magnets saw 1; (d) failed, the bound held on 207 of 256 and its median stayed 2.5 ms. The item is
closed by the rule; the board keeps one pulse a revolution. Not asked: the ball's least within 0.5 ms 116 of 224
against 51, and the step's drop error 0.55% against 0.11% (more magnets resolve the take, so the step misfits more).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/tach_pulses_sweep.py [--quick] [--jitter 0.5] [--spacing 0.5] [--out rows.jsonl]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/tach_pulses_sweep.py --report rows.jsonl [--survey]

Simulated only: a first-order wheel, an assumed half-sine take, magnets as points (a real Hall edge has a width and a
hysteresis that move with speed).
"""

import json
import math
import multiprocessing
import random
import statistics
import sys

sys.path.insert(0, __import__("os").path.join(__import__("os").path.dirname(__file__), "..", "firmware", "esp32"))
from feeder_sim import controller     # noqa: E402

DT = 0.0001                     # plant step, s
DROP = 0.08                     # the ball's take, a share of the wheel's speed
FREE = 9000.0                   # the wheel's free speed; the loop is told the same
DENSE_MS = tuple(x / 2 for x in range(0, 17))     # 0-8 ms by 0.5
PULSES = (1, 2, 4)
RPMS = (2000, 3500, 5000, 6500)
TAUS = (0.3, 0.6)
TAKES = (0.0, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0)
PHASES = 4
SUB = 8                         # edge times floored to 1 / SUB us


def trial(rpm, tau, take_ms, phase, n_mag, spacing_deg, jitter_us, seed):
    rng = random.Random(seed)
    pos = sorted((k / n_mag + (rng.gauss(0, spacing_deg / 360) if k else 0.0)) % 1.0 for k in range(n_mag))
    pos[0] = 0.0
    tach = controller.PeriodTach()
    loop = controller.WheelLoop(9000)
    cmd = rpm / FREE
    loop.i = 0.0
    w = float(rpm)
    rev = rng.random()
    t_ball = 1.2 + phase * 0.0071 + rng.random() * 0.01
    t_end = t_ball + 0.6
    T = take_ms / 1000
    w_ball = None
    edges = []                  # (time us, magnet index) for every magnet
    last0 = None                # the board's last magnet-0 edge, whole us
    ticks = []                  # (time us, cmd) from 0.3 s before the ball
    steps = int(t_end / DT)
    for s in range(steps):
        t = s * DT
        acc = (FREE * cmd - w) / tau
        w_new = w + acc * DT
        if w_ball is None and t + DT > t_ball:
            w_ball = w
            if T == 0:
                w_new -= DROP * w_ball
        if w_ball is not None and T > 0 and t < t_ball + T:
            a, b = max(t, t_ball), min(t + DT, t_ball + T)
            if b > a:   # the half-sine's share over [a, b]
                share = 0.5 * (math.cos(math.pi * (a - t_ball) / T) - math.cos(math.pi * (b - t_ball) / T))
                w_new -= DROP * w_ball * share
        r0 = rev
        rev += (w + w_new) / 2 / 60.0 * DT
        w = w_new
        # every magnet crossed in this step, timed linearly inside it
        base = math.floor(r0)
        for turn in (base, base + 1):
            for k, p in enumerate(pos):
                x = turn + p
                if r0 < x <= rev:
                    te = (t + (x - r0) / (rev - r0) * DT) * 1e6
                    if jitter_us:
                        te += rng.gauss(0, jitter_us)
                    edges.append((math.floor(te * SUB) / SUB, k))
                    if k == 0:
                        tw = int(te)
                        if last0 is not None:
                            tach.edge(tw - last0)
                        last0 = tw
        if s % 100 == 0 and last0 is not None:       # the 10 ms loop
            now = int(round((t + DT) * 1e6))
            cmd = loop.update(rpm, tach.rpm(now - last0), 10)
            if t >= t_ball - 0.3:
                ticks.append((now, cmd))
    edges.sort()
    return edges, ticks, w_ball, t_ball


def fit_inputs(edges, ticks, n_use, n_mag, t_ball):
    """Periods and ticks for a fit on `n_use` of the build's `n_mag` magnets (every n_mag / n_use-th), from the first
    magnet-0 edge 0.3 s before the ball."""
    step = n_mag // n_use
    es = [e for e in edges if e[1] % step == 0]
    t0 = t_ball * 1e6 - 300000
    i0 = next(i for i, e in enumerate(es) if e[0] >= t0 and e[1] == 0)
    es = es[i0:]
    times = [e[0] for e in es]
    periods = [b - a for a, b in zip(times, times[1:])]
    tk = []
    j = 0
    for now, c in ticks:
        if now < times[0]:
            continue
        while j + 1 < len(times) and times[j + 1] <= now:
            j += 1
        tk.append((j, now - times[j], c))
    return periods, tk


def score_ball(args):
    rpm, tau, take_ms, phase, spacing, jitter, seed = args
    n_mag = max(PULSES)
    edges, ticks, w_ball, t_ball = trial(rpm, tau, take_ms, phase, n_mag, spacing, jitter, seed)
    out = {"rpm": rpm, "tau": tau, "take_ms": take_ms, "phase": phase, "spacing": spacing, "jitter": jitter,
           "seed": seed, "fits": {}}
    for n_use in PULSES:
        periods, tk = fit_inputs(edges, ticks, n_use, n_mag, t_ball)
        modes = [("learnt", None)] if n_use == 1 else [("learnt", None), ("naive", None)]
        for mode, _ in modes:
            if n_use == 1:
                angles = None
            elif mode == "naive":
                angles = [1.0 / n_use] * len(periods)
            else:
                # learnt from the periods before the ball (0.25 s, whole revolutions from magnet 0)
                tt, k = 0.0, 0
                while k < len(periods) and tt + periods[k] < 250000:
                    tt += periods[k]
                    k += 1
                f = controller.magnet_spacing(periods[:k - k % n_use], n_use)
                angles = [f[j % n_use] for j in range(len(periods))]
            rms, drops = [], []
            for c in DENSE_MS:
                r = None
                for item in controller.drop_from_commands_steps(periods, tk, take=controller.take_offsets(c * 1000),
                                                                levels=controller.TAKE_SURVEY_LEVELS,
                                                                after=controller.TAKE_SURVEY_AFTER,
                                                                angles=angles, per=n_use):
                    if item is not None:
                        r = item[1]
                rms.append(None if r is None else r[4])
                drops.append(None if r is None else r[0])
            out["fits"][f"{n_use} {mode}"] = {"rms": rms, "drop": drops}
    return out


def grid(quick, spacing, jitter):
    cases = []
    seed = 1000
    rpms, taus, takes, phases = (RPMS, TAUS, TAKES, PHASES) if not quick else ((3500,), (0.3,), (0.0, 1.5), 2)
    for rpm in rpms:
        for tau in taus:
            for take in takes:
                for ph in range(phases):
                    seed += 1
                    cases.append((rpm, tau, take, ph, spacing, jitter, seed))
    return cases


def bound_ms(rms, tol=0.02, floor_ppm=2.0):
    """One ball's upper bound on the take: the first candidate more than `tol` and `floor_ppm` over the step's rms
    (host.take_survey_bound's rule, on one ball rather than the survey's mean), 8.5 ms when none is."""
    for c, r in zip(DENSE_MS[1:], rms[1:]):
        if r > max(rms[0] * (1 + tol), rms[0] + floor_ppm * 1e-6):
            return c
    return 8.5


def report(rows):
    keys = sorted({k for r in rows for k in r["fits"]}, key=lambda s: (int(s.split()[0]), s.split()[1]))
    i_of = {c: i for i, c in enumerate(DENSE_MS)}
    print(f"{len(rows)} balls; spacing {rows[0]['spacing']} deg, jitter {rows[0]['jitter']} us")
    print("fit            | sees 1-2.5 ms | sees 3-6 ms | least within 0.5 ms (takes > 0) | instant least > 0.5 ms "
          "| drop err at step / at true take (mean abs, %)")
    for key in keys:
        sees_s = sees_l = n_s = n_l = within = n_pos = inst_off = n_inst = 0
        e_step, e_true = [], []
        b_in = b_n = 0
        b_short = []
        for r in rows:
            f = r["fits"].get(key)
            if f is None or any(x is None for x in f["rms"]):
                continue
            rms = f["rms"]
            tk = r["take_ms"]
            least = DENSE_MS[min(range(len(rms)), key=lambda i: rms[i])]
            bnd = bound_ms(rms)
            b_n += 1
            b_in += tk <= bnd
            if 1.0 <= tk <= 2.5:
                b_short.append(bnd)
            e_step.append(abs(f["drop"][0] / DROP - 1))
            e_true.append(abs(f["drop"][i_of[tk]] / DROP - 1))
            if tk == 0:
                n_inst += 1
                inst_off += least > 0.5
                continue
            n_pos += 1
            within += abs(least - tk) <= 0.5
            sees = rms[i_of[tk]] ** 2 < 0.8 * rms[0] ** 2
            if tk <= 2.5:
                n_s += 1
                sees_s += sees
            else:
                n_l += 1
                sees_l += sees
        print(f"{key:14} | {sees_s:3} of {n_s:3}    | {sees_l:3} of {n_l:3}  | {within:3} of {n_pos:3}"
              f"                     | {inst_off:2} of {n_inst:2}               | "
              f"{100 * statistics.fmean(e_step):.2f} / {100 * statistics.fmean(e_true):.2f} | bound holds {b_in} of {b_n}, "
              f"median on 1-2.5 ms {statistics.median(b_short) if b_short else float('nan'):g} ms")


def survey_report(rows):
    """EXPLORATORY (added after the main run's per-ball numbers were seen): the board judges a take from a survey,
    the squared rms summed over a drill's wheels, not from one ball. Here each (take, wheel lag) group's 16 balls
    (four speeds, four phases) are summed as one survey: its least (with the board's parabola, survey_pick, on the
    dense grid) and its bound (host.take_survey_bound's rule on the mean)."""
    keys = sorted({k for r in rows for k in r["fits"]}, key=lambda s: (int(s.split()[0]), s.split()[1]))
    groups = {}
    for r in rows:
        groups.setdefault((r["take_ms"], r["tau"]), []).append(r)
    grid_us = [int(c * 1000) for c in DENSE_MS]
    print(f"{len(groups)} surveys of {len(rows) // max(1, len(groups))} balls (take, wheel lag)")
    print("fit            | pick within 0.5 ms (takes > 0) | instant picked > 0.5 ms | bound holds | bound on 1-2.5 ms takes")
    for key in keys:
        within = n_pos = inst = n_inst = b_in = 0
        bshort = []
        for (tk, tau), rs in sorted(groups.items()):
            sums = [0.0] * len(DENSE_MS)
            ok = 0
            for r in rs:
                f = r["fits"].get(key)
                if f is None or any(x is None for x in f["rms"]):
                    continue
                ok += 1
                for i, x in enumerate(f["rms"]):
                    sums[i] += x * x
            if not ok:
                continue
            _, pick = controller.survey_pick(grid_us, sums)
            pick /= 1000
            mean = [math.sqrt(x / ok) for x in sums]
            bnd = bound_ms(mean)
            b_in += tk <= bnd
            if tk == 0:
                n_inst += 1
                inst += pick > 0.5
            else:
                n_pos += 1
                within += abs(pick - tk) <= 0.5
                if tk <= 2.5:
                    bshort.append(bnd)
        print(f"{key:14} | {within:2} of {n_pos:2}                       | {inst} of {n_inst}                  | "
              f"{b_in:2} of {len(groups)}    | {' '.join(f'{b:g}' for b in bshort)}")


def main():
    quick = "--quick" in sys.argv
    spacing = float(sys.argv[sys.argv.index("--spacing") + 1]) if "--spacing" in sys.argv else 0.5
    jitter = float(sys.argv[sys.argv.index("--jitter") + 1]) if "--jitter" in sys.argv else 0.0
    if "--report" in sys.argv:
        with open(sys.argv[sys.argv.index("--report") + 1]) as f:
            rows = [json.loads(ln) for ln in f]
        report(rows)
        if "--survey" in sys.argv:
            print()
            survey_report(rows)
        return
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    cases = grid(quick, spacing, jitter)
    rows = []
    with multiprocessing.Pool(multiprocessing.cpu_count()) as pool:
        for r in pool.imap_unordered(score_ball, cases):
            rows.append(r)
            if out:
                with open(out, "a") as f:
                    f.write(json.dumps(r) + "\n")
    rows.sort(key=lambda r: r["seed"])
    report(rows)


if __name__ == "__main__":
    main()
