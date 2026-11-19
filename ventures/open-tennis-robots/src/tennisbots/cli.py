"""Command line: `tennisbots aim | drill | run | serve | esc-lag | tach-jitter | fit-launcher | catch-study | collect`."""

from __future__ import annotations

import argparse
import json
import os
import random
import sys

from . import __version__
from . import ballistics as bl
from . import catcher, collector, court, launcher, listing

DISCLAIMER = (
    "No warranty. Provided free and as-is, without warranty of any kind. Not engineering or "
    "safety advice; you are responsible for verifying every output and for building and "
    "operating any machine safely. Ball launchers and moving robots can injure people."
)


def _shot_dict(shot: launcher.Shot, wheels: launcher.WheelLauncher) -> dict:
    out = {
        "speed_mps": round(shot.speed, 2),
        "speed_kmh": round(shot.speed * 3.6, 1),
        "topspin_rpm": shot.topspin_rpm,
        "sidespin_rpm": shot.sidespin_rpm,
        "elevation_deg": round(shot.elevation_deg, 2),
        "azimuth_deg": round(shot.azimuth_deg, 2),
        "landing": [round(shot.landing[0], 2), round(shot.landing[1], 2)],
        "net_clearance_m": None if shot.net_clearance is None else round(shot.net_clearance, 2),
        "flight_time_s": round(shot.flight_time, 2),
    }
    try:
        rt, rb = wheels.wheel_rpm(shot.speed, shot.topspin_rpm * bl.RPM)
        out["wheel_rpm"] = {"top": round(rt), "bottom": round(rb)}
    except ValueError as exc:
        out["wheel_rpm"] = {"error": str(exc)}
    return out


def cmd_aim(a: argparse.Namespace) -> int:
    origin = launcher.default_origin(a.machine_y, a.height)
    shot = launcher.aim(origin, (a.x, a.y), a.speed, a.topspin, a.sidespin)
    print(json.dumps(_shot_dict(shot, launcher.WheelLauncher()), indent=2))
    return 0


def cmd_drill(a: argparse.Namespace) -> int:
    """A drill file: {"machine": {"y": 0, "height": 1.0}, "shots": [{"x":, "y":, "speed":, "topspin":}, ...]}."""
    with open(a.file) as fh:
        spec = json.load(fh)
    m = spec.get("machine", {})
    origin = launcher.default_origin(m.get("y", 0.0), m.get("height", 1.0))
    wheels = launcher.WheelLauncher(**spec.get("launcher", {}))
    out, failed = [], 0
    for i, s in enumerate(spec["shots"]):
        try:
            shot = launcher.aim(origin, (s["x"], s["y"]), s["speed"], s.get("topspin", 0.0), s.get("sidespin", 0.0))
            out.append(_shot_dict(shot, wheels))
        except ValueError as exc:
            failed += 1
            out.append({"shot": i, "error": str(exc)})
    print(json.dumps({"shots": out}, indent=2))
    return 1 if failed else 0


def cmd_run(a: argparse.Namespace) -> int:
    """Run a drill file on a real feeder over its serial port (pip install tennisbots[serial])."""
    from . import host
    print(DISCLAIMER, file=sys.stderr)
    try:
        recovery = a.recovery_s
        if a.refit_after and recovery is None and a.shot_log:
            recovery = host.recovery_from_log(a.shot_log, a.inertia)
            if recovery is not None:
                print(f"tach recovery {recovery:.3f} s, from the calibration shots in {a.shot_log}")
        if a.refit_after and recovery is None:
            print("note: no tach recovery time (pass --recovery-s, or --shot-log a log holding a calibration drill): "
                  "a refit from shots at one speed reads slow shots low", file=sys.stderr)
        prior = host.last_survey_from_log(a.shot_log) if a.shot_log else None
        with open(a.file) as fh:
            calibration = host.is_calibration(json.load(fh))
        if calibration and prior is None:
            print("note: no ESC lag survey in the shot log yet (pass --shot-log): this drill's own survey prints the "
                  "lag its balls pick; if it says set ESC_TAU_US, re-flash and run the calibration again",
                  file=sys.stderr)
        res = host.run_file(a.file, a.port, log=print, refit_after=a.refit_after, recovery_s=recovery,
                            inertia=a.inertia, prior_survey=prior, esc_lag_ok=a.esc_lag_ok)
        for ev in res.refits:
            if ev["used"]:
                print(json.dumps({"refit": ev}))
        if a.shot_log:
            n = host.append_shot_log(a.shot_log, res, os.path.basename(a.file))
            print(f"{n} launch record{'' if n == 1 else 's'} appended to {a.shot_log}")
    except ImportError:
        print("drill not run: needs pyserial (pip install 'tennisbots[serial]')", file=sys.stderr)
        return 2
    except (ValueError, OSError) as exc:
        print(f"drill not run: {exc}", file=sys.stderr)
        return 2
    if res.held:                      # 2026-11-16: the board's ESC_TAU_US disagrees with the last survey (exit 4)
        print(res.aborted, file=sys.stderr)
        return 4
    if res.dry_shot is not None:      # 2026-11-16: an empty pocket, found from the wheels' speed (exit 3, not a fault)
        print(f"stopped: {res.aborted}", file=sys.stderr)
        return 3
    if res.aborted:
        print(f"aborted (ESTOP sent; release the button and send CLEAR_ESTOP to go again): {res.aborted}",
              file=sys.stderr)
        return 1
    print(f"{len(res.shots)} balls fed; {res.link_errors} bad frames on the link")
    advice = host.esc_survey_advice(res.esc_survey, res.esc_tau_ms or 0)
    if advice:
        print(advice)
    advice = host.take_survey_advice(res.take_survey)
    if advice:
        print(advice)
    return 0


def cmd_serve(a: argparse.Namespace) -> int:
    """Serve the drill page on the Pi so the project page's drill builder can send drills to the machine."""
    from . import remote
    print(DISCLAIMER, file=sys.stderr)
    try:
        import serial  # noqa: F401  (optional dependency, checked before the server starts)
    except ImportError:
        print("not started: needs pyserial (pip install 'tennisbots[serial]')", file=sys.stderr)
        return 2
    try:
        remote.serve(a.port, a.listen, shot_log=a.shot_log, esc_lag_ok=a.esc_lag_ok, use_key=not a.no_key,
                     allow_hosts=tuple(h.lower() for h in a.allow_host or ()))
    except OSError as exc:
        print(f"not started: {exc}", file=sys.stderr)
        return 2
    return 0


def cmd_esc_lag(a: argparse.Namespace) -> int:
    """The ESC lag the last logged drill's balls pick (firmware/esp32/README.md "Checked before a calibration drill")."""
    from . import host
    sv = host.last_survey_from_log(a.log)
    if sv is None:
        print(f"no ESC lag survey in {a.log} (run a drill with --shot-log on firmware from 2026-11-16 or later)",
              file=sys.stderr)
        return 1
    ran = sv.get("esc_tau_ms")
    print(json.dumps({k: sv.get(k) for k in ("at", "drill", "wheels", "least_ms", "refined_ms", "esc_tau_ms")}))
    print(host.esc_survey_advice(sv, ran or 0))
    tv = host.last_take_survey_from_log(a.log)
    if tv is not None:
        print(host.take_survey_advice(tv))
    return 0


def cmd_tach_jitter(a: argparse.Namespace) -> int:
    """A tach's edge jitter from a steady wheel's logged periods (firmware/esp32/README.md "The take survey's jitter
    limit"; log them with firmware/esp32/tach_log.py)."""
    from . import tach
    try:
        est = tach.edge_jitter(tach.read_periods(a.periods))
    except (OSError, ValueError) as e:
        print(f"tach-jitter: {e}", file=sys.stderr)
        return 1
    print(json.dumps(est))
    print(tach.jitter_advice(est["jitter_us"]))
    return 0


def cmd_fit_launcher(a: argparse.Namespace) -> int:
    """The launcher's efficiencies from a shot log's wheel speed drops (firmware/esp32/README.md "Shot log")."""
    from . import host
    recs = host.read_shot_log(a.log)
    fit = launcher.fit_from_drops(recs, inertia=a.inertia, ball_kg=a.ball_kg, recovery_s=a.recovery_s)
    out = {
        "shots": fit.shots,
        "speed_efficiency": round(fit.speed_efficiency, 3),
        "spin_efficiency": None if fit.spin_efficiency is None else round(fit.spin_efficiency, 3),
        "recovery_s": None if fit.recovery_s is None else round(fit.recovery_s, 3),
        "rms_drop": round(fit.rms, 4),
        "unsure_readings": fit.unsure,
        "inertia_assumed_kgm2": a.inertia,
        "ball_kg_assumed": a.ball_kg,
        "note": fit.note,
    }
    if a.radar_speed_eff:
        inertia = launcher.inertia_from_radar(fit, a.radar_speed_eff, a.inertia)
        out["inertia_kgm2"] = round(inertia, 6)
        out["config_py"] = f"WHEEL_INERTIA_KGM2 = {inertia:.5f}"
    else:
        lm = fit.launcher()
        out["drill_launcher_block"] = {"launcher": {"speed_efficiency": round(lm.speed_efficiency, 3),
                                                    "spin_efficiency": round(lm.spin_efficiency, 3)}}
    print(json.dumps(out, indent=2))
    return 0


def cmd_lift_hub_reset(a: argparse.Namespace) -> int:
    """After re-setting the lift's slip hub on the bench: restart the feeder's jam count (cad/README.md "Slip hub wear")."""
    from . import host
    try:
        why = host.reset_lift_hub_port(a.port)
    except ImportError:
        print("not sent: needs pyserial (pip install 'tennisbots[serial]')", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"not sent: {exc}", file=sys.stderr)
        return 2
    if why:
        print(f"not reset: {why}", file=sys.stderr)
        return 1
    print("lift slip hub's jam count restarted; the feeder no longer reports it due")
    return 0


def cmd_catch_study(a: argparse.Namespace) -> int:
    widths = a.net_width or [3.0]
    speeds = a.base_speed or [2.5]
    print(f"{a.n} simulated returns per cell, seed {a.seed}; camera {a.fps:.0f} fps, "
          f"sigma {a.sigma * 100:.0f} cm, latency {a.latency * 1000:.0f} ms")
    print("net width (m) | base speed (m/s) | caught | too wide | too high")
    for w in widths:
        for v in speeds:
            rig = catcher.CatchRig(net_width=w, max_speed=max(v, 1e-9), max_accel=a.accel, latency=a.latency)
            r = catcher.study(a.n, rig, seed=a.seed, fps=a.fps, sigma=a.sigma)
            print(f"{w:13.1f} | {v:16.1f} | {r.caught / r.returns:6.0%} | {r.too_wide / r.returns:8.0%} | "
                  f"{r.too_high / r.returns:8.0%}")
    return 0


def cmd_collect(a: argparse.Namespace) -> int:
    if a.balls_file:
        with open(a.balls_file) as fh:
            balls = [tuple(map(float, line.split(",")[:2])) for line in fh if line.strip() and not line.startswith("#")]
    else:
        rng = random.Random(a.seed)
        half = court.DOUBLES_WIDTH / 2 + 1.0
        balls = [(rng.uniform(-court.HALF_LENGTH - 2, court.HALF_LENGTH + 2), rng.uniform(-half, half))
                 for _ in range(a.balls)]
    zones = collector.practice_zones() if a.practice else []
    planner = collector.Planner(zones)
    start = (a.start_x, a.start_y)
    route = planner.collect(start, balls, capacity=a.capacity, speed=a.speed)
    print(json.dumps({
        "balls": len(balls),
        "picked": route.picks,
        "left_in_keep_out": len(route.skipped),
        "dump_trips": sum(1 for e, _ in route.events if e == "dump"),
        "distance_m": round(route.length, 1),
        "drive_time_min": round(route.duration / 60, 1),
        "waypoints": [[round(x, 2), round(y, 2)] for x, y in route.waypoints] if a.waypoints else None,
    }, indent=2))
    return 0


def _print_readiness(r: listing.Readiness) -> None:
    print("Readiness:", "ready" if r.ok else f"{len(r.blocking)} blocking item(s)", file=sys.stderr)
    for b in r.blocking:
        print("  BLOCKING  " + b, file=sys.stderr)
    for a in r.advisory:
        print("  advisory  " + a, file=sys.stderr)


def cmd_listing(a: argparse.Namespace) -> int:
    cfg = listing.load(a.config)
    r = listing.readiness(cfg)
    if a.action == "build":
        body = listing.build(cfg)
        text = json.dumps(body, indent=2)
        if a.out:
            with open(a.out, "w") as fh:
                fh.write(text + "\n")
        else:
            print(text)
        _print_readiness(r)
        return 0 if r.ok else 1
    if a.action == "types":
        req = listing.types_request(cfg, a.keywords)
        creds = listing.credentials()
        print(json.dumps(listing.send(req, listing.access_token(creds)), indent=2))
        return 0
    # submit
    live = a.live or a.validate
    seller = os.environ.get("SPAPI_SELLER_ID", "<SPAPI_SELLER_ID>")
    req = listing.put_request(cfg, listing.build(cfg), seller, validate=not a.live)
    _print_readiness(r)
    if not live:
        print(json.dumps(dict(req, note="dry run: nothing sent. Add --validate, then --live."), indent=2))
        return 0
    if a.live and not r.ok:
        print("error: refusing --live while blocking items remain", file=sys.stderr)
        return 1
    creds = listing.credentials()
    req = listing.put_request(cfg, listing.build(cfg), creds["SPAPI_SELLER_ID"], validate=not a.live)
    print(json.dumps(listing.send(req, listing.access_token(creds)), indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="tennisbots", description="Open-source tennis robots: plan shots, size the "
                                "catch net, route the ball collector.", epilog=DISCLAIMER)
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("aim", help="elevation, azimuth and wheel rpm to land a ball on a target")
    s.add_argument("--x", type=float, required=True, help="target x in m (net = 0, player baseline = 11.885)")
    s.add_argument("--y", type=float, default=0.0, help="target y in m (centre line = 0)")
    s.add_argument("--speed", type=float, required=True, help="ball speed in m/s")
    s.add_argument("--topspin", type=float, default=0.0, help="rpm, negative for backspin")
    s.add_argument("--sidespin", type=float, default=0.0, help="rpm, positive curves left")
    s.add_argument("--machine-y", type=float, default=0.0)
    s.add_argument("--height", type=float, default=1.0, help="launch height in m")
    s.set_defaults(func=cmd_aim)

    s = sub.add_parser("drill", help="check and compile a JSON drill file into machine settings")
    s.add_argument("file")
    s.set_defaults(func=cmd_drill)

    s = sub.add_parser("run", help="run a drill file on the feeder over serial: aim, wait for the wheels, feed")
    s.add_argument("file")
    s.add_argument("--port", default="/dev/ttyAMA0", help="serial device wired to the ESP32 (default /dev/ttyAMA0)")
    s.add_argument("--shot-log", help="append each stroke's wheel speed drops to this JSON-lines file (fit-launcher)")
    s.add_argument("--refit-after", type=int, metavar="N",
                   help="after every N shots, fit the launcher's efficiencies to this run's wheel speed drops and "
                        "re-plan the remaining shots' wheel speeds when they moved more than the fit's own "
                        "error (5%% speed, 15%% spin)")
    s.add_argument("--recovery-s", type=float,
                   help="the tach's recovery time for --refit-after (default: fitted from the --shot-log file)")
    s.add_argument("--inertia", type=float, default=launcher.WHEEL_INERTIA_KGM2,
                   help="one wheel's inertia in kg m^2, as config.py's WHEEL_INERTIA_KGM2 (for --refit-after)")
    s.add_argument("--esc-lag-ok", action="store_true",
                   help="run a calibration drill even when the board's ESC_TAU_US disagrees with the shot log's last "
                        "ESC lag survey (by default it stops before the first ball, exit 4)")
    s.set_defaults(func=cmd_run)

    s = sub.add_parser("serve", help="on the feeder's Pi: a page that runs drills sent from the drill builder, with "
                                     "a Stop button (README \"Running a drill from the page\")")
    s.add_argument("--port", default="/dev/ttyAMA0", help="serial device wired to the ESP32 (default /dev/ttyAMA0)")
    s.add_argument("--listen", default="0.0.0.0:8080", help="address:port to serve on (default 0.0.0.0:8080)")
    s.add_argument("--shot-log", help="append each drill's wheel speed drops to this JSON-lines file")
    s.add_argument("--esc-lag-ok", action="store_true", help="as for run: run a calibration drill despite an ESC "
                                                             "lag mismatch")
    s.add_argument("--no-key", action="store_true", help="let anyone on the network start a drill without the "
                                                         "printed key (Stop never needs it)")
    s.add_argument("--allow-host", action="append", metavar="NAME",
                   help="another host name the page may be opened by (IP addresses, localhost and .local always work)")
    s.set_defaults(func=cmd_serve)

    s = sub.add_parser("esc-lag", help="the ESC lag the shot log's last survey picks, and whether ESC_TAU_US should "
                                       "change")
    s.add_argument("log", help="JSON-lines shot log written by `run --shot-log`")
    s.set_defaults(func=cmd_esc_lag)

    s = sub.add_parser("tach-jitter", help="a launcher tach's edge jitter from a steady wheel's logged periods, and "
                                           "whether the contact-time survey can see through it")
    s.add_argument("periods", help="text file of periods in us, one per line (firmware/esp32/tach_log.py's output)")
    s.set_defaults(func=cmd_tach_jitter)

    s = sub.add_parser("fit-launcher", help="the launcher's speed and spin efficiency from a shot log's wheel speed "
                                            "drops, no radar gun")
    s.add_argument("log", help="JSON-lines shot log written by `run --shot-log`")
    s.add_argument("--inertia", type=float, default=launcher.WHEEL_INERTIA_KGM2,
                   help="one wheel's inertia in kg m^2, as config.py's WHEEL_INERTIA_KGM2")
    s.add_argument("--ball-kg", type=float, default=launcher.BALL_KG,
                   help="one ball's mass in kg (weigh a few of yours: the fitted efficiencies scale with it; "
                        "ITF balls are 0.056 to 0.0594)")
    s.add_argument("--recovery-s", type=float, help="the wheel loop's recovery time constant, if known "
                                                     "(fitted when the log spans speeds)")
    s.add_argument("--radar-speed-eff", type=float,
                   help="a speed efficiency measured with a radar gun: report the wheel's true inertia instead")
    s.set_defaults(func=cmd_fit_launcher)

    s = sub.add_parser("lift-hub-reset", help="after re-setting the lift's slip hub on the bench, restart the "
                                              "feeder's jam count (clears FLAG_LIFT_HUB_DUE)")
    s.add_argument("--port", default="/dev/ttyAMA0", help="serial device wired to the ESP32 (default /dev/ttyAMA0)")
    s.set_defaults(func=cmd_lift_hub_reset)

    s = sub.add_parser("catch-study", help="simulate how many returns a moving catch net would catch")
    s.add_argument("--n", type=int, default=200)
    s.add_argument("--net-width", type=float, action="append", help="repeat to compare widths")
    s.add_argument("--base-speed", type=float, action="append", help="repeat to compare speeds (0 = fixed net)")
    s.add_argument("--accel", type=float, default=5.0)
    s.add_argument("--latency", type=float, default=0.10)
    s.add_argument("--fps", type=float, default=120.0)
    s.add_argument("--sigma", type=float, default=0.05, help="camera fix error, m")
    s.add_argument("--seed", type=int, default=1)
    s.set_defaults(func=cmd_catch_study)

    s = sub.add_parser("collect", help="plan a ball-collecting route")
    s.add_argument("--balls", type=int, default=60, help="random balls if no --balls-file")
    s.add_argument("--balls-file", help="CSV of x,y ball positions in court coordinates")
    s.add_argument("--seed", type=int, default=1)
    s.add_argument("--capacity", type=int, default=75)
    s.add_argument("--speed", type=float, default=0.6, help="rover cruise speed m/s")
    s.add_argument("--start-x", type=float, default=-court.HALF_LENGTH - 2.0)
    s.add_argument("--start-y", type=float, default=court.DOUBLES_WIDTH / 2 + 0.5)
    s.add_argument("--practice", action="store_true", help="avoid the player's and feeder's zones")
    s.add_argument("--waypoints", action="store_true")
    s.set_defaults(func=cmd_collect)

    s = sub.add_parser("listing", help="sell a build: Amazon listing from a seller config (your own account)")
    s.add_argument("action", choices=["build", "types", "submit"])
    s.add_argument("config", help="seller JSON (see sell/seller.example.json)")
    s.add_argument("-o", "--out", help="build: write the listing JSON here")
    s.add_argument("--keywords", default="tennis ball machine", help="types: product type search")
    mode = s.add_mutually_exclusive_group()
    mode.add_argument("--validate", action="store_true", help="submit: Amazon validates, creates nothing")
    mode.add_argument("--live", action="store_true", help="submit: create or update the listing")
    s.set_defaults(func=cmd_listing)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except (ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
