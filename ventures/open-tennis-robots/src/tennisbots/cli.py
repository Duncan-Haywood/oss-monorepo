"""Command line: `tennisbots aim | drill | catch-study | collect`."""

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
