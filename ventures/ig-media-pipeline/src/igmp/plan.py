"""`igmp plan` (and `--dry-run` on run or any stage): what a run would read, write and ask Claude.

Nothing is written and no Claude call is made. It lists the library (directory listings only),
reads the state database as an immutable file if one exists, and checks which tools are
installed. cli runs it inside safety.guard(dry_run=True), so a write it attempted to the library
or to output_dir would be blocked and reported. Run it first against a real library.

Counts of Claude calls are ranges: later stages depend on earlier answers (how many candidates
the prefilter keeps, how many frames Claude keeps, how often the critics ask for a revision).
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

from . import catalog, safety
from .config import Config
from .models import Asset, Curation, Metrics

STAGES = ("scan", "geo", "prefilter", "score", "edit", "reels", "tag")


class ReadOnlyStore:
    """The state database opened immutable (no journal, lock or -wal/-shm file is created), with
    the read half of Store's interface, so the stages' own selection code can run on it."""

    def __init__(self, path: Path):
        self.db = sqlite3.connect(f"{Path(path).resolve().as_uri()}?immutable=1", uri=True)
        self.tables = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}

    def get(self, table, key, model=None):
        if table not in self.tables:
            return None
        row = self.db.execute(f"SELECT value FROM {table} WHERE key = ?", (key,)).fetchone()
        if row is None:
            return None
        return model.model_validate_json(row[0]) if model else json.loads(row[0])

    def has(self, table, key) -> bool:
        return table in self.tables and self.db.execute(
            f"SELECT 1 FROM {table} WHERE key = ?", (key,)).fetchone() is not None

    def all(self, table, model=None):
        if table not in self.tables:
            return
        for key, value in self.db.execute(f"SELECT key, value FROM {table} ORDER BY key").fetchall():
            yield key, (model.model_validate_json(value) if model else json.loads(value))

    def close(self) -> None:
        self.db.close()


@dataclass
class Step:
    stage: str
    reads: str
    writes: str
    calls: tuple[int, int | None] = (0, 0)     # (at least, at most); None: depends on earlier answers
    note: str = ""


def _volume(path: Path) -> str:
    try:
        st = os.statvfs(path)
    except OSError:
        return "not found (drive not connected? its shots are skipped until it is)"
    if st.f_flag & getattr(os, "ST_RDONLY", 1):
        return "mounted read-only"
    return "mounted read-write (igmp only reads it)"


def _device(p: Path) -> int | None:
    for q in (p, *p.parents):
        try:
            return os.stat(q).st_dev
        except OSError:
            continue
    return None


def _calls(lo: int, hi: int | None) -> str:
    if hi is None:
        return f"{lo}+ call(s) (more once earlier stages have answers)"
    return f"{lo} call(s)" if lo == hi else f"{lo}-{hi} call(s)"


def _which(tool: str) -> str | None:
    p = Path(tool).expanduser()
    return str(p) if p.is_file() else shutil.which(tool)


def steps(cfg: Config, assets: list[Asset], store, stages: tuple[str, ...]) -> list[Step]:
    has = (lambda t, k: store.has(t, k)) if store else (lambda t, k: False)
    out: list[Step] = []
    new = [a for a in assets if not has("assets", a.id)]
    if "scan" in stages:
        clips = sum(a.kind.startswith("video") for a in new)
        out.append(Step("scan", f"directory listings of {len(cfg.library_roots)} root(s); ffprobe on {clips} new clip(s)",
                        f"{len(new)} new row(s) in state/igmp.sqlite"))
    if "geo" in stages:
        out.append(Step("geo", "the phone's GPS track (Photos library, exported photos or a GPX/CSV, read-only)",
                        "places in state/igmp.sqlite, state/location-suggestions.csv"))

    unmeasured = [a for a in assets if not has("metrics", a.id)]
    if "prefilter" in stages:
        previews = sum(not (cfg.state_dir / "previews" / f"{a.id}.jpg").exists() for a in unmeasured)
        stills = sum(not a.kind.startswith("video") for a in unmeasured)
        out.append(Step("prefilter", f"{stills} still(s) (camera JPEG/INSP, or a RAW's embedded preview) and "
                        f"{len(unmeasured) - stills} clip(s) (the camera's proxy when there is one)",
                        f"{previews} preview JPEG(s) in state/previews/, metrics in state/igmp.sqlite"))

    metrics = {a.id: store.get("metrics", a.id, Metrics) for a in assets} if store else {}
    to_score = [a for a in assets if metrics.get(a.id) and metrics[a.id].candidate and not has("scores", a.id)]
    pending = len(unmeasured) if "prefilter" in stages else 0     # each could become a candidate
    unscored = len(to_score) + pending if "score" in stages else 0
    if "score" in stages:
        out.append(Step("score", f"{len(to_score) + pending} preview(s) at most, from state/previews/",
                        "scores in state/igmp.sqlite", (len(to_score), len(to_score) + pending),
                        "one call per candidate not yet scored; Claude sees previews, never originals"))

    if "edit" in stages:
        from . import editing
        picks = editing.keepers(store, assets) if store else []
        dropped: set[str] = set()
        for _, c in (store.all("curation", Curation) if store else []):
            dropped |= set(c.drop)
        todo = [(a, s) for a, s in picks if a.id not in dropped and not has("edits", a.id)]
        events = Counter(a.event_key for a, _ in picks)
        curations = sum(1 for k, n in events.items() if n > 1 and not has("curation", k))
        rt = _which(cfg.rawtherapee_cli)
        lo, hi = curations + 2 * len(todo), curations + (2 + editing.REVISIONS) * len(todo)
        out.append(Step("edit", f"{len(todo)} RAW file(s){' so far' if unscored else ''} (rawpy, and RawTherapee "
                        "through a private symlink)", "edited JPEGs and .pp3 files under photos/<event>/",
                        (lo, None if unscored else hi) if rt else (0, 0),
                        "" if rt else f"rawtherapee-cli not found at {cfg.rawtherapee_cli}: edits will fail"))

    if "reels" in stages:
        from . import reels
        opts = reels.options_for(store, assets) if store else {}
        todo_reels = [k for k in opts if not has("reels", k)]
        lo, hi = 2 * len(todo_reels), (2 + reels.CRITIC_ROUNDS) * len(todo_reels)
        ok = bool(_which(cfg.ffmpeg) and _which(cfg.ffprobe))
        out.append(Step("reels", f"clips and stills of {len(todo_reels)} event(s){' so far' if unscored else ''} "
                        "(ffmpeg -i, read-only)", "reels/<event>.mp4 + .caption.txt, work files in state/reels/",
                        (lo, None if unscored else hi) if ok else (0, 0),
                        "" if ok else "ffmpeg/ffprobe not found: reels will fail"))

    # every command except plan, status, backup and music refreshes the XMP sidecars afterwards
    from . import metadata
    inside = [a for a in assets if a.kind != "sequence" and safety.in_library(cfg, metadata.sidecar_path(a))]
    out.append(Step("tag", "the state database",
                    f"up to {len(inside)} XMP sidecar(s) <name>.xmp beside their originals in the library "
                    "(the one kind of file igmp adds there; only changed ones are rewritten)"))
    return out


def report(cfg: Config, stages: tuple[str, ...] = STAGES, out: TextIO | None = None) -> int:
    """Print the plan. Returns the most Claude calls it could make (-1 when open-ended)."""
    w = lambda line="": print(line, file=out or sys.stdout)
    w("igmp plan: nothing is written and no Claude call is made.")
    w()
    w("Library (only ever read)")
    for root in cfg.library_roots:
        w(f"  {root}   {_volume(root)}")
    if not cfg.library_roots:
        w("  (no library_roots set)")
    w()
    w("Output (every file igmp writes goes here)")
    w(f"  {cfg.output_dir}   {'exists' if cfg.output_dir.exists() else 'will be created'}")
    out_dev = _device(cfg.output_dir)
    if any(r.exists() and _device(r) == out_dev for r in cfg.library_roots):
        w("  on the same drive as the library, in a separate folder")
    elif cfg.library_roots:
        w("  on another drive than the library, which can be mounted read-only")
    safety.check_config(cfg)
    w("  outside every library root, and contains none: ok")

    store = None
    if cfg.db_path.exists():
        store = ReadOnlyStore(cfg.db_path)
        wal = cfg.db_path.with_name(cfg.db_path.name + "-wal")
        busy = wal.exists() and wal.stat().st_size > 0
        w(f"  state: {cfg.db_path} (as of its last checkpoint{'; a run may be in progress' if busy else ''})")
    else:
        w("  state: none yet (first run)")

    assets = catalog.scan(cfg.library_roots)
    if store:       # sequences exist only in the database: they are made by the prefilter
        assets += [a for _, a in store.all("assets", Asset) if a.kind == "sequence"]
    kinds = Counter(a.kind for a in assets)
    w()
    w(f"Found {len(assets)} asset(s): " + (", ".join(f"{n} {k}" for k, n in sorted(kinds.items())) or "none")
      + f" in {len({a.event_key for a in assets})} event(s)")

    w()
    w("Tools")
    for name, tool in (("ffmpeg", cfg.ffmpeg), ("ffprobe", cfg.ffprobe), ("rawtherapee-cli", cfg.rawtherapee_cli),
                       ("exiftool", cfg.exiftool)):
        w(f"  {name:16} {_which(tool) or 'NOT FOUND'}")
    if cfg.backend == "claude-code":
        w(f"  {'claude':16} {_which(cfg.claude_cli) or 'NOT FOUND'}")
    else:
        w(f"  {'api key':16} {'set' if os.environ.get('ANTHROPIC_API_KEY') else 'ANTHROPIC_API_KEY not set'}")

    w()
    w("Stages")
    total_lo, total_hi = 0, 0
    for s in steps(cfg, assets, store, stages):
        w(f"  {s.stage}")
        w(f"    reads   {s.reads}")
        w(f"    writes  {s.writes}")
        w(f"    Claude  {_calls(*s.calls)}")
        if s.note:
            w(f"    note    {s.note}")
        total_lo += s.calls[0]
        total_hi = None if total_hi is None or s.calls[1] is None else total_hi + s.calls[1]
    w()
    w(f"Claude in total: {_calls(total_lo, total_hi)} ({cfg.backend}, {cfg.model})")
    w("Originals are only read: igmp refuses any write, rename, move or delete of them, and any new file "
      "in the library other than an XMP sidecar.")
    if store:
        store.close()
    return -1 if total_hi is None else total_hi
