"""igmp: library -> Instagram photos and reels.

  igmp init        write a settings template (~/.config/igmp/config.toml)
  igmp run         every stage below, resuming where the last run stopped
  igmp scan | prefilter | score | edit | reels | status
"""
from __future__ import annotations

import argparse
import logging
import sys
from concurrent.futures import ProcessPoolExecutor

from . import catalog, config, media
from .models import Asset, Metrics
from .store import Store

log = logging.getLogger("igmp")


def scan(cfg: config.Config, store: Store) -> list[Asset]:
    found = catalog.scan(cfg.library_roots)
    new = 0
    for a in found:
        if store.has("assets", a.id):
            continue
        if a.kind.startswith("video"):
            try:
                a = a.model_copy(update={"duration_s": media.probe(a.preview, cfg).get("duration_s")})
            except Exception as e:      # a damaged clip is recorded, not fatal
                store.put("jobs", f"probe:{a.id}", {"file": a.preview, "error": str(e)})
                continue
        store.put("assets", a.id, a)
        new += 1
    log.info("catalog: %d assets (%d new)", len(found), new)
    return [a for _, a in store.all("assets", Asset)]


def _measure(args):
    from . import prefilter
    a, cfg = args
    try:
        return prefilter.measure(a, cfg)
    except Exception as e:          # one bad file must not stop a 15k-file pass
        return e


def measure(cfg: config.Config, store: Store, assets: list[Asset]) -> None:
    from . import prefilter
    todo = [a for a in assets if not store.has("metrics", a.id)]
    log.info("measuring %d assets", len(todo))
    with ProcessPoolExecutor() as pool:
        for a, m in zip(todo, pool.map(_measure, [(a, cfg) for a in todo], chunksize=8)):
            if isinstance(m, Exception):
                store.put("jobs", f"measure:{a.id}", {"error": str(m)})
            else:
                store.put("metrics", a.id, m)
    metrics = {k: m for k, m in store.all("metrics", Metrics)}
    for key, m in prefilter.select_candidates([a for a in assets if a.id in metrics], metrics).items():
        store.put("metrics", key, m)
    log.info("candidates: %d of %d", sum(m.candidate for m in metrics.values()), len(metrics))


def status(store: Store) -> None:
    for table in ("assets", "metrics", "scores", "edits", "reels", "jobs"):
        print(f"{table:8} {sum(1 for _ in store.all(table))}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="igmp", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["init", "run", "scan", "prefilter", "score", "edit", "reels", "status"])
    p.add_argument("--config", type=str, default=None)
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    path = config.Path(args.config).expanduser() if args.config else config.DEFAULT_PATH
    if args.command == "init":
        print(f"settings template: {config.write_template(path)}")
        return 0
    cfg = config.load(path)
    store = Store(cfg.db_path)
    log.addHandler(logging.FileHandler(cfg.state_dir / "igmp.log"))
    if args.command == "status":
        status(store)
        return 0

    assets = scan(cfg, store)
    if args.command in ("prefilter", "run"):
        measure(cfg, store, assets)
    if args.command in ("score", "edit", "reels", "run"):
        from .judge import backend
        judge = backend(cfg)
        if args.command in ("score", "run"):
            from . import taste
            taste.score_all(cfg, store, judge, assets)
        if args.command in ("edit", "run"):
            from . import editing
            editing.edit_all(cfg, store, judge, assets)
        if args.command in ("reels", "run"):
            from . import reels
            reels.build_all(cfg, store, judge, assets)
    status(store)
    return 0


if __name__ == "__main__":
    sys.exit(main())
