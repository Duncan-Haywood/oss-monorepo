"""igmp: library -> Instagram photos and reels.

  igmp init        write a settings template (~/.config/igmp/config.toml)
  igmp plan        what a run would read, write and ask Claude; writes nothing. Run it first.
  igmp verify-library   --record a manifest of the library (--hash: sample contents too);
                   without --record, check the library still matches it
  igmp run         every stage below, resuming where the last run stopped
  igmp scan | prefilter | score | edit | reels | status
  --dry-run        with run or a stage: the plan for just that, writing nothing

The library is only read. Every command runs with safety's tripwire up and compares the library
before and after; it exits 3 if anything under a library root changed or a write to it was blocked.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

from . import catalog, config, integrity, media, safety
from .models import Asset, Metrics
from .store import Store

log = logging.getLogger("igmp")


def scan(cfg: config.Config, store: Store) -> list[Asset]:
    found = catalog.scan(cfg.library_roots)
    new = updated = 0
    for a in found:
        old = store.get("assets", a.id, Asset)
        if old is not None:
            # keep what later stages added (clip length), refresh what the catalog derives
            fresh = a.model_copy(update={"duration_s": old.duration_s})
            if fresh != old:
                store.put("assets", a.id, fresh)
                updated += 1
            continue
        if a.kind.startswith("video"):
            try:
                a = a.model_copy(update={"duration_s": media.probe(a.preview, cfg).get("duration_s")})
            except Exception as e:      # a damaged clip is recorded, not fatal
                store.put("jobs", f"probe:{a.id}", {"file": a.preview, "error": str(e)})
                continue
        store.put("assets", a.id, a)
        new += 1
    log.info("catalog: %d assets (%d new, %d updated)", len(found), new, updated)
    return [a for _, a in store.all("assets", Asset)]


def online(a: Asset) -> bool:
    """False when the shot's drive isn't connected: skip it now, pick it up next run."""
    first = a.preview or a.raw or (a.files[0] if a.files else None)
    return a.kind == "sequence" or (first is not None and Path(first).exists())


def _measure(args):
    from . import prefilter
    a, cfg = args
    try:
        return prefilter.measure(a, cfg)
    except Exception as e:          # one bad file must not stop a 15k-file pass
        return e


def measure(cfg: config.Config, store: Store, assets: list[Asset]) -> None:
    from . import prefilter, sequences
    # sequences have no file of their own: their metrics come from sequences.detect below
    todo = [a for a in assets if a.kind != "sequence" and not store.has("metrics", a.id)]
    offline = [a for a in todo if not online(a)]
    todo = [a for a in todo if online(a)]
    log.info("measuring %d assets (%d on drives that aren't connected: skipped)", len(todo), len(offline))
    with ProcessPoolExecutor(initializer=safety.guard_worker, initargs=(cfg,)) as pool:   # tripwire in workers too
        for a, m in zip(todo, pool.map(_measure, [(a, cfg) for a in todo], chunksize=8)):
            if isinstance(m, Exception):
                store.put("jobs", f"measure:{a.id}", {"error": str(m)})
            else:
                store.put("metrics", a.id, m)
    from . import vision
    vision.vision_pass(cfg, store, assets)       # on-device Apple Vision; a no-op off macOS
    metrics = {k: m for k, m in store.all("metrics", Metrics)}
    known = [a for a in assets if a.id in metrics]
    selected = prefilter.select_candidates(known, metrics)
    # timelapse / stop-motion: a run of evenly spaced tripod frames becomes one "sequence" asset,
    # judged as a whole; its frames stop being candidates. Re-runs find the same ids, never re-wrap.
    found, selected = sequences.detect(known, selected)
    for s in found:
        store.put("assets", s.id, s)
    store.put_many("metrics", list(selected.items()))
    vision.vision_pass(cfg, store, [*assets, *found])   # detect rebuilds sequence metrics: refill them
    log.info("candidates: %d of %d", sum(m.candidate for m in selected.values()), len(selected))


def status(store: Store) -> None:
    for table in ("assets", "metrics", "scores", "edits", "reels", "jobs"):
        print(f"{table:8} {sum(1 for _ in store.all(table))}")


def run_backup(cfg: config.Config, args) -> int:
    """Checksums for every library root and the outputs; `copy --to DEST` mirrors them, verified."""
    import json
    from . import backup
    # the library plus finished outputs; previews and the live database are rebuildable caches
    roots = [r for r in cfg.library_roots if r.exists()]
    roots += [d for d in (cfg.output_dir / "photos", cfg.output_dir / "reels") if d.exists()]
    bad = 0
    for root in roots:
        if args.action == "verify":
            report = backup.verify(root)
            bad += len(report["damaged"]) + len(report["missing"]) + len(report["unreadable"])
        elif args.action == "copy":
            if not args.to:
                raise SystemExit("backup copy needs --to DEST")
            report = backup.copy(root, config.Path(args.to).expanduser() / root.parent.name / root.name)
            bad += len(report["conflict"]) + len(report["failed"])
        else:
            report = backup.manifest(root)
        summary = {k: (len(v) if isinstance(v, list) else v) for k, v in report.items()}
        print(root, json.dumps(summary))
        (cfg.state_dir / "backup").mkdir(parents=True, exist_ok=True)
        (cfg.state_dir / "backup" / f"{args.action or 'manifest'}-{root.parent.name}-{root.name}.json").write_text(
            json.dumps(report, indent=1, default=str))
    return 1 if bad else 0


def guarded(cfg: config.Config, work) -> int:
    """Run `work` with the library tripwire up and the library listed before and after. Exit 3
    if anything under a library root changed, or a write to it was blocked (and so did not happen)."""
    with safety.guard(cfg) as g:
        before = {r: integrity.snapshot([r])[0] for r in cfg.library_roots if r.is_dir()}
        try:
            code = work()
        except safety.UnsafeWrite as e:
            log.error("stopped: %s", e)
            code = 3
        finally:
            diff = integrity.Diff()
            for root, entries in before.items():
                if root.is_dir():               # a drive unplugged mid-run is not a change to it
                    d = integrity.compare(entries, integrity.snapshot([root])[0])
                    diff.added += d.added
                    diff.removed += d.removed
                    diff.changed += d.changed
            if diff:
                log.error("the library changed during this run (%s). If you did not add or edit files "
                          "there yourself meanwhile, this is a bug: please report it.", diff.summary())
                for line in diff.lines():
                    log.error("  %s", line)
            if g.violations:
                log.error("safety blocked %d write(s) to the library (none happened), e.g.:", len(g.violations))
                for v in g.violations[:5]:
                    log.error("  %s", v)
    return 3 if diff or g.violations else code


def dry_run(cfg: config.Config, command: str) -> int:
    from . import plan
    if command in ("plan", "run"):
        stages = plan.STAGES
    elif command in plan.STAGES:
        stages = tuple(dict.fromkeys(("scan", command)))
    else:
        print(f"igmp: --dry-run goes with run or a stage ({', '.join(plan.STAGES)})", file=sys.stderr)
        return 2
    with safety.guard(cfg, dry_run=True) as g:
        plan.report(cfg, stages)
    for v in g.violations:
        log.error("dry run: %s", v)
    return 3 if g.violations else 0


def verify_library(cfg: config.Config, args) -> int:
    if args.record:
        with safety.guard(cfg):
            where, n, unreadable = integrity.record(cfg, hash_files=args.hash)
        print(f"recorded {n} entries under {len(cfg.library_roots)} root(s)"
              f"{' with content samples' if args.hash else ''}: {where}")
        for u in unreadable:
            print(f"  could not read {u}")
        return 0
    if not integrity.manifest_path(cfg).exists():
        print("no manifest yet: run `igmp verify-library --record` before a run", file=sys.stderr)
        return 2
    diff, doc = integrity.check(cfg)
    if not diff:
        print(f"library unchanged since {doc['created']} ({len(doc['entries'])} entries"
              f"{', content samples compared' if doc.get('hashed') else ''})")
        return 0
    print(f"library CHANGED since {doc['created']}: {diff.summary()}")
    for line in diff.lines():
        print(f"  {line}")
    return 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="igmp", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["init", "plan", "verify-library", "run", "scan", "prefilter", "score",
                                       "edit", "reels", "tag", "backup", "geo", "music", "status"])
    p.add_argument("action", nargs="?", choices=["manifest", "verify", "copy"], help="backup only")
    p.add_argument("--to", type=str, default=None, help="backup copy destination")
    p.add_argument("--only", type=str, default=None, help="limit to events whose key contains this text")
    p.add_argument("--limit", type=int, default=None, help="score at most this many candidates")
    p.add_argument("--config", type=str, default=None)
    p.add_argument("--dry-run", action="store_true", help="with run or a stage: show the plan, write nothing")
    p.add_argument("--record", action="store_true", help="verify-library: save a new manifest of the library")
    p.add_argument("--hash", action="store_true", help="verify-library --record: also sample file contents")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    path = config.Path(args.config).expanduser() if args.config else config.DEFAULT_PATH
    if args.command == "init":
        print(f"settings template: {config.write_template(path)}")
        return 0
    try:
        cfg = config.load(path)
    except safety.UnsafeConfig as e:
        print(f"igmp: refusing to start: {e}", file=sys.stderr)
        return 2
    if args.command == "plan" or args.dry_run:
        return dry_run(cfg, args.command)
    if args.command == "verify-library":
        return verify_library(cfg, args)
    return guarded(cfg, lambda: run_command(cfg, args))


def run_command(cfg: config.Config, args) -> int:
    store = Store(cfg.db_path)
    log.addHandler(logging.FileHandler(cfg.state_dir / "igmp.log"))
    if args.command == "status":
        status(store)
        return 0
    if args.command == "backup":
        return run_backup(cfg, args)
    if args.command == "music":
        from . import music
        print(music.library_listing(cfg) or f"no licensed tracks in {music.music_dir(cfg)}")
        return 0

    from . import metadata

    def refresh() -> list[Asset]:
        # every stage leaves its results in the sidecars, so metadata stays part of the process
        current = [a for _, a in store.all("assets", Asset)]
        metadata.tag_all(cfg, store, current)
        return current

    assets = scan(cfg, store)
    if args.command in ("geo", "run"):
        # place shots from the phone's GPS track; under `run` an unavailable track is only logged
        from . import geo
        geo.geo_pass(cfg, store, assets, geo.load_track(cfg) if args.command == "geo" else None)
    if args.command in ("prefilter", "run"):
        measure(cfg, store, assets)
        assets = [a for _, a in store.all("assets", Asset)]
    if args.only:
        assets = [a for a in assets if args.only in a.event_key]
    if args.limit:
        keep = [a for a in assets if (m := store.get("metrics", a.id, Metrics)) and m.candidate
                and not store.has("scores", a.id)][:args.limit]
        ids = {a.id for a in keep} | {a.id for a in assets if store.has("scores", a.id)}
        assets = [a for a in assets if a.id in ids]
    if args.command in ("score", "edit", "reels", "run"):
        from .judge import backend
        judge = backend(cfg)
        if args.command in ("score", "run"):
            from . import taste
            taste.score_all(cfg, store, judge, assets)
            assets = refresh()
        if args.command in ("edit", "run"):
            from . import editing
            editing.edit_all(cfg, store, judge, assets)
            assets = refresh()
        if args.command in ("reels", "run"):
            from . import reels
            reels.build_all(cfg, store, judge, assets)
    if args.command in ("scan", "prefilter", "reels", "tag", "geo", "run"):
        refresh()
    status(store)
    return 0


if __name__ == "__main__":
    sys.exit(main())
