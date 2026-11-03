"""The library, the outputs and the worker's state in a bucket (docs/CLOUD.md).

Mac side
  push_paths / push_library   copy library files up as library/<root name>/<path in the root>. The
                              root folder's name and the file name are kept, because asset ids are
                              sha1("<root name>/<stem>"): the worker's mirror then yields the same
                              ids as the Mac. Clips (.mp4 .mov .insv) go up as 1920 px H.264
                              proxies by default (`cloud_video = "proxy"`; "original" sends them as
                              shot), made with proxies.make_video over the whole clip and keeping
                              the original file name; the cameras' own low-res sidecars (.lrf .lrv)
                              add nothing to a proxy and stay home in that mode. Every object
                              carries meta blake2b = backup.digest of the SOURCE file, so a later
                              push can tell an object is the file it came from without
                              downloading it; proxies also carry igmp-proxy = "1".
                              The store's `cloud` table remembers each key's size, mtime and
                              digest, so an unchanged file is skipped without being re-read; a
                              changed one is hashed (the root's _checksums.csv answers when it is
                              current) and compared with the object's meta before uploading.
  pull_outputs                take outputs/ into outputs.out_root(cfg): output_dir, or the outbox
                              while its drive is away (outputs.sync moves them later). Never
                              deletes a local file. A manifest (state_dir/cloud-pulled.json) of the
                              etag each file was pulled at keeps a re-pull from fetching it again,
                              wherever it has since moved.
  seed                        hand the Mac's database to a worker that has none (state/seed.sqlite)

Worker side
  restore_state               the worker's database: local, else state/igmp.sqlite, else the seed
  mirror_library              library/ -> <dest>/<root name>/<rel>; the worker scans those roots
  push_outputs                output_dir (and any outbox) -> outputs/<rel>
  snapshot_state              a consistent copy of the live database (sqlite's online backup)
  acquire/renew/release_lease lease.json: one worker owns the state at a time. Creating it uses
                              put_bytes(if_none_match), taking over an expired one or renewing
                              uses if_match on the etag just read, so two workers racing never
                              both believe they hold it.

Failures of single files are recorded and reported, never raised: one unreadable clip must not
stop the rest of a push.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import socket
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import backup, outputs
from .bucket import Bucket, Obj, PreconditionFailed, open_bucket
from .config import Config

log = logging.getLogger(__name__)

LIBRARY = "library/"
OUTPUTS = "outputs/"
STATE_KEY = "state/igmp.sqlite"
SEED_KEY = "state/seed.sqlite"
LEASE_KEY = "lease.json"
STATUS_KEY = "status.json"
VIDEO_EXT = {".mp4", ".mov", ".insv"}
LOWRES_EXT = {".lrf", ".lrv"}          # DJI / Insta360 low-resolution copies the cameras write
OUTPUT_DIRS = ("photos", "reels", "carousels", "ready", "astro")
SKIP_DIRS = backup.SKIP_DIRS | {"_organize"}


# --------------------------------------------------------------------------- helpers

def scan_roots(cfg: Config) -> list[Path]:
    """The library roots plus their spool folders (ingest.scan_roots), or just the roots."""
    try:
        from . import ingest
        fn = getattr(ingest, "scan_roots", None)
    except ImportError:
        fn = None
    if fn is None:
        return list(cfg.library_roots)
    try:
        return list(fn(cfg))
    except ValueError:              # no ingest root (and so no spool) configured
        return list(cfg.library_roots)


def key_for(root: Path, path: Path, prefix: str = LIBRARY) -> str:
    return prefix + Path(root).name + "/" + Path(path).relative_to(root).as_posix()


def _root_of(path: Path, roots: list[Path]) -> Path | None:
    """The deepest root holding path (a spool folder may sit inside state_dir, itself anywhere)."""
    p = Path(path).expanduser().absolute()
    hits = [r for r in roots if p.is_relative_to(Path(r).expanduser().absolute())]
    return max(hits, key=lambda r: len(Path(r).absolute().parts)) if hits else None


def _tmp_dir(cfg: Config) -> Path:
    d = cfg.state_dir / "cloud-tmp" / uuid.uuid4().hex[:12]
    d.mkdir(parents=True, exist_ok=True)
    return d


def _video_mode(cfg: Config) -> str:
    mode = str((cfg.extra or {}).get("cloud_video", "proxy")).lower()
    if mode not in ("proxy", "original"):
        raise ValueError(f"cloud_video = {mode!r}: use \"proxy\" or \"original\"")
    return mode


def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def _save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex[:8]}")
    tmp.write_text(json.dumps(data, sort_keys=True, indent=1))
    os.replace(tmp, path)


def _now_iso(ts: float | None = None) -> str:
    return datetime.fromtimestamp(time.time() if ts is None else ts, timezone.utc).isoformat(timespec="seconds")


class _Digests:
    """backup.digest, answered from a root's _checksums.csv when it is current for the file."""

    def __init__(self):
        self.manifests: dict[Path, dict] = {}

    def __call__(self, root: Path, path: Path, st: os.stat_result) -> str:
        if root not in self.manifests:
            try:
                self.manifests[root] = backup.load(root)
            except (OSError, ValueError, KeyError):
                self.manifests[root] = {}
        e = self.manifests[root].get(path.relative_to(root).as_posix())
        if e and e.size == st.st_size and e.mtime_ns == st.st_mtime_ns:
            return e.blake2b
        return backup.digest(path)


def library_files(roots: list[Path]):
    """Every file push_library sends: dot files and folders, .tmp files, _organize/ logs and
    volume housekeeping folders are left out; _checksums.csv goes up with the rest."""
    for root in roots:
        if not Path(root).is_dir():
            continue
        for dirpath, dirs, files in os.walk(root):
            dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
            for name in sorted(files):
                if name.startswith(".") or name.endswith(".tmp"):
                    continue
                yield Path(root), Path(dirpath) / name


# --------------------------------------------------------------------------- push the library

# igmp-proxy values that satisfy proxy mode: "1" a proxy, "original" a clip already smaller than one
PROXY_MARKS = ("1", "original")


def _transcode(cfg: Config, src: Path, tmp_dir: Path) -> Path:
    from . import proxies
    recipe = "video360" if src.suffix.lower() == ".insv" else "video"
    dest = tmp_dir / src.name                 # the proxy keeps the clip's name (and so its asset id)
    proxies.make_video(src, dest, recipe, cfg)   # video_args(..., stretches=None): the whole clip
    return dest


def push_paths(cfg: Config, store, bucket: Bucket, paths: list[Path], *, limit: int | None = None) -> dict:
    """Upload these library files. Returns lists of paths pushed / skipped / failed, plus bytes
    sent. `limit` stops after that many uploads (skips do not count)."""
    roots = scan_roots(cfg)
    mode = _video_mode(cfg)
    digest = _Digests()
    report: dict = {"pushed": [], "skipped": [], "failed": [], "bytes": 0}
    for raw in paths:
        path = Path(raw)
        if limit is not None and len(report["pushed"]) >= limit:
            break
        root = _root_of(path, roots)
        if root is None:
            log.warning("cloud push: %s is not under a library root", path)
            report["failed"].append(str(path))
            continue
        root = Path(root).expanduser().absolute()
        path = path.expanduser().absolute()
        key = key_for(root, path)
        ext = path.suffix.lower()
        if mode == "proxy" and ext in LOWRES_EXT:
            report["skipped"].append(str(path))
            continue
        proxied = mode == "proxy" and ext in VIDEO_EXT
        try:
            st = path.stat()
            row = store.get("cloud", key) or {}
            if (not row.get("error") and row.get("blake2b") and row.get("size") == st.st_size
                    and row.get("mtime_ns") == st.st_mtime_ns and bool(row.get("proxied")) == proxied):
                report["skipped"].append(str(path))
                continue
            d = digest(root, path, st)
            entry = {"key": key, "path": str(path), "size": st.st_size, "mtime": st.st_mtime,
                     "mtime_ns": st.st_mtime_ns, "blake2b": d, "proxied": proxied}
            have = bucket.head(key)
            if have is not None and have.meta.get("blake2b") == d \
                    and (have.meta.get("igmp-proxy") in PROXY_MARKS) == proxied:
                store.put("cloud", key, {**entry, "bytes": have.size, "pushed_at": row.get("pushed_at")
                                         or _now_iso(have.mtime)})
                report["skipped"].append(str(path))
                continue
            meta = {"blake2b": d}
            if proxied:
                tmp = _tmp_dir(cfg)
                try:
                    up = _transcode(cfg, path, tmp)
                    if up.stat().st_size < st.st_size:
                        obj = bucket.put_file(key, up, meta={**meta, "igmp-proxy": "1"})
                    else:               # a low-bitrate clip: its proxy would be the bigger file
                        obj = bucket.put_file(key, path, meta={**meta, "igmp-proxy": "original"})
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
            else:
                obj = bucket.put_file(key, path, meta=meta)
            store.put("cloud", key, {**entry, "bytes": obj.size, "pushed_at": _now_iso()})
            report["pushed"].append(str(path))
            report["bytes"] += obj.size
        except Exception as e:          # one bad file never stops the push
            log.warning("cloud push: %s failed: %s", path, e)
            report["failed"].append(str(path))
            try:
                store.put("cloud", key, {"key": key, "path": str(path), "error": str(e)[:500],
                                         "failed_at": _now_iso()})
            except Exception:
                pass
    return report


def push_library(cfg: Config, store, bucket: Bucket, *, limit: int | None = None) -> dict:
    """Push every library file (library_files) under the scan roots that are connected. Returns
    push_paths' lists plus counts and bytes sent."""
    roots = [Path(r) for r in scan_roots(cfg) if Path(r).is_dir()]
    paths = [p for _, p in library_files(roots)]
    r = push_paths(cfg, store, bucket, paths, limit=limit)
    r["counts"] = {"files": len(paths), "pushed": len(r["pushed"]), "skipped": len(r["skipped"]),
                   "failed": len(r["failed"])}
    r["roots"] = [str(p) for p in roots]
    return r


def unpushed(cfg: Config, store) -> int:
    """Library files whose current size and mtime the cloud table has not recorded as pushed
    (no hashing; low-res sidecars count only in original mode)."""
    mode = _video_mode(cfg)
    n = 0
    for root, p in library_files([Path(r) for r in scan_roots(cfg)]):
        if mode == "proxy" and p.suffix.lower() in LOWRES_EXT:
            continue
        root, p = root.expanduser().absolute(), p.expanduser().absolute()
        row = store.get("cloud", key_for(root, p)) or {}
        try:
            st = p.stat()
        except OSError:
            continue
        if row.get("error") or row.get("size") != st.st_size or row.get("mtime_ns") != st.st_mtime_ns:
            n += 1
    return n


# --------------------------------------------------------------------------- the worker's library

def mirror_library(cfg: Config, bucket: Bucket, dest: Path) -> dict:
    """Download library/ into dest/<root name>/<rel> where a file is missing or its size differs.
    `roots` are the dest/<root name> folders: set cfg.library_roots to them and scan."""
    dest = Path(dest)
    out = {"downloaded": 0, "current": 0, "failed": 0, "bytes": 0, "roots": []}
    roots: set[Path] = set()
    for o in bucket.list(LIBRARY):
        rel = o.key[len(LIBRARY):]
        if "/" not in rel:
            continue
        name = rel.split("/", 1)[0]
        target = dest / rel
        roots.add(dest / name)
        try:
            if target.is_file() and target.stat().st_size == o.size:
                out["current"] += 1
                continue
            bucket.get_file(o.key, target)
            out["downloaded"] += 1
            out["bytes"] += o.size
        except Exception as e:
            log.warning("cloud mirror: %s failed: %s", o.key, e)
            out["failed"] += 1
    for r in roots:
        r.mkdir(parents=True, exist_ok=True)
    out["roots"] = sorted(roots)
    return out


# --------------------------------------------------------------------------- outputs

def _output_files(base: Path):
    for sub in OUTPUT_DIRS:
        top = base / sub
        if not top.is_dir():
            continue
        for dirpath, dirs, files in os.walk(top):
            dirs[:] = sorted(d for d in dirs if not d.startswith("."))
            for name in sorted(files):
                if not name.startswith(".") and not name.endswith(".tmp"):   # dot files: renders in progress
                    p = Path(dirpath) / name
                    yield p, p.relative_to(base).as_posix()


def push_outputs(cfg: Config, bucket: Bucket) -> dict:
    """Worker: output_dir's photos/ reels/ carousels/ ready/ astro/ (and anything an outbox holds)
    -> outputs/<rel>. A local manifest (state_dir/cloud-outputs.json) keeps each file's size,
    mtime and digest, and the digest it was pushed at, so an unchanged file is neither rehashed
    nor asked about again."""
    mpath = cfg.state_dir / "cloud-outputs.json"
    man = _load_json(mpath)
    out = {"pushed": 0, "current": 0, "failed": 0, "bytes": 0}
    bases = [cfg.output_dir] + ([outputs.outbox_dir(cfg)] if outputs.outbox_dir(cfg) != cfg.output_dir else [])
    seen: set[str] = set()
    for base in bases:
        if not base.is_dir():
            continue
        for p, rel in _output_files(base):
            if rel in seen:
                continue
            seen.add(rel)
            try:
                st = p.stat()
                e = man.get(rel) or {}
                if e.get("size") == st.st_size and e.get("mtime_ns") == st.st_mtime_ns and e.get("blake2b"):
                    d = e["blake2b"]
                else:
                    d = backup.digest(p)
                e = {"size": st.st_size, "mtime_ns": st.st_mtime_ns, "blake2b": d, "pushed": e.get("pushed")}
                key = OUTPUTS + rel
                if e["pushed"] != d:
                    have = bucket.head(key)
                    if have is None or have.size != st.st_size or have.meta.get("blake2b") != d:
                        obj = bucket.put_file(key, p, meta={"blake2b": d})
                        out["pushed"] += 1
                        out["bytes"] += obj.size
                    else:
                        out["current"] += 1
                    e["pushed"] = d
                else:
                    out["current"] += 1
                man[rel] = e
            except Exception as err:
                log.warning("cloud outputs: %s failed: %s", p, err)
                out["failed"] += 1
        _save_json(mpath, man)
    _save_json(mpath, man)
    return out


def pull_outputs(cfg: Config, store, bucket: Bucket) -> dict:
    """Mac: outputs/ -> outputs.out_root(cfg) (output_dir, or the outbox while its drive is away).
    Skips a file pulled before at the same etag (state_dir/cloud-pulled.json), or present with
    the same size and digest. Writes a temporary name and renames; never deletes a local file.
    `store` is unused: these are the worker's outputs, and outputs.sync rewrites records."""
    del store
    mpath = cfg.state_dir / "cloud-pulled.json"
    man = _load_json(mpath)
    base = outputs.out_root(cfg)
    out = {"downloaded": 0, "current": 0, "failed": 0, "bytes": 0, "to": str(base)}
    for o in bucket.list(OUTPUTS):
        rel = o.key[len(OUTPUTS):]
        if not rel or any(part in ("", ".", "..") for part in rel.split("/")):
            continue
        try:
            e = man.get(rel) or {}
            if e.get("etag") == o.etag and e.get("size") == o.size:
                out["current"] += 1
                continue
            target = base / rel
            if target.is_file() and target.stat().st_size == o.size:
                h = bucket.head(o.key)
                if h is not None and h.meta.get("blake2b") and h.meta["blake2b"] == backup.digest(target):
                    man[rel] = {"etag": o.etag, "size": o.size, "blake2b": h.meta["blake2b"]}
                    out["current"] += 1
                    continue
            got = bucket.get_file(o.key, target)
            man[rel] = {"etag": got.etag, "size": got.size, "blake2b": got.meta.get("blake2b")}
            out["downloaded"] += 1
            out["bytes"] += got.size
        except Exception as err:
            log.warning("cloud pull: %s failed: %s", o.key, err)
            out["failed"] += 1
    _save_json(mpath, man)
    return out


# --------------------------------------------------------------------------- state

def snapshot_state(cfg: Config, bucket: Bucket, key: str = STATE_KEY) -> Obj:
    """Upload a consistent copy of cfg.db_path, taken with sqlite's online backup (safe while
    other connections write: WAL pages are folded in)."""
    if not cfg.db_path.exists():
        raise FileNotFoundError(f"no database at {cfg.db_path}")
    tmp = _tmp_dir(cfg)
    try:
        snap = tmp / cfg.db_path.name
        src = sqlite3.connect(cfg.db_path, timeout=60)
        dst = sqlite3.connect(snap)
        try:
            src.backup(dst)
            dst.execute("PRAGMA journal_mode=DELETE")      # one self-contained file
            dst.commit()
        finally:
            dst.close()
            src.close()
        return bucket.put_file(key, snap, meta={"blake2b": backup.digest(snap)})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def restore_state(cfg: Config, bucket: Bucket) -> str:
    """Worker start. 'local' when cfg.db_path exists; else 'state' (the worker's own snapshot) or
    'seed' (a Mac's database) after downloading it; 'none' when the bucket has neither."""
    if cfg.db_path.exists():
        return "local"
    for key, label in ((STATE_KEY, "state"), (SEED_KEY, "seed")):
        if bucket.head(key) is not None:
            bucket.get_file(key, cfg.db_path)
            return label
    return "none"


def seed(cfg: Config, bucket: Bucket, *, force: bool = False) -> Obj:
    """Mac: upload the local database as state/seed.sqlite for a worker that has no state yet.
    Refused once the worker has written state/igmp.sqlite (it owns the state then), unless force."""
    if not force and bucket.head(STATE_KEY) is not None:
        raise RuntimeError(f"the worker already owns {STATE_KEY}; seeding now would be ignored "
                           "(use --force to upload a seed anyway)")
    return snapshot_state(cfg, bucket, key=SEED_KEY)


# --------------------------------------------------------------------------- the lease

def _lease(bucket: Bucket) -> tuple[dict | None, Obj | None]:
    got = bucket.get_bytes(LEASE_KEY)
    if got is None:
        return None, None
    data, obj = got
    try:
        lease = json.loads(data)
        return (lease if isinstance(lease, dict) else {}), obj
    except ValueError:
        return {}, obj              # unreadable: treated as expired


def _lease_body(owner: str, ttl_s: float, now: float, acquired_at: float | None = None) -> bytes:
    return json.dumps({"owner": owner, "host": socket.gethostname(), "acquired_at": acquired_at or now,
                       "expires_at": now + ttl_s}, sort_keys=True).encode()


def acquire_lease(bucket: Bucket, owner: str, ttl_s: float = 1800, now: float | None = None) -> bool:
    """True when `owner` holds lease.json afterwards: created it, renewed its own, or took over
    one that had expired. False while another owner's lease runs, or when another worker won a
    race for it."""
    now = time.time() if now is None else now
    lease, obj = _lease(bucket)
    try:
        if obj is None:
            bucket.put_bytes(LEASE_KEY, _lease_body(owner, ttl_s, now), if_none_match=True,
                             content_type="application/json")
            return True
        ours = lease.get("owner") == owner
        expired = float(lease.get("expires_at") or 0) <= now
        if not (ours or expired):
            return False
        since = lease.get("acquired_at") if ours and not expired else None
        bucket.put_bytes(LEASE_KEY, _lease_body(owner, ttl_s, now, since), if_match=obj.etag,
                         content_type="application/json")
        return True
    except PreconditionFailed:
        return False


def renew_lease(bucket: Bucket, owner: str, ttl_s: float = 1800, now: float | None = None) -> bool:
    """Extend our lease. False when it is gone or someone else holds it (stop working then)."""
    now = time.time() if now is None else now
    lease, obj = _lease(bucket)
    if obj is None or lease.get("owner") != owner:
        return False
    try:
        bucket.put_bytes(LEASE_KEY, _lease_body(owner, ttl_s, now, lease.get("acquired_at")),
                         if_match=obj.etag, content_type="application/json")
        return True
    except PreconditionFailed:
        return False


def release_lease(bucket: Bucket, owner: str) -> None:
    """Give the lease up if it is ours: rewritten as expired, conditionally on the etag just read,
    so a worker that took it over in between keeps it."""
    lease, obj = _lease(bucket)
    if obj is None or lease.get("owner") != owner:
        return
    now = time.time()
    body = json.dumps({**lease, "expires_at": now, "released_at": now}, sort_keys=True).encode()
    try:
        bucket.put_bytes(LEASE_KEY, body, if_match=obj.etag, content_type="application/json")
    except PreconditionFailed:
        pass


def read_lease(bucket: Bucket) -> dict | None:
    return _lease(bucket)[0]


def read_status(bucket: Bucket) -> dict | None:
    got = bucket.get_bytes(STATUS_KEY)
    if got is None:
        return None
    try:
        st = json.loads(got[0])
    except ValueError:
        return None
    return st if isinstance(st, dict) else None


# --------------------------------------------------------------------------- the command

def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1000 or unit == "TB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1000
    return f"{n} B"


def _when(v) -> str:
    if isinstance(v, (int, float)):
        return _now_iso(v)
    return str(v) if v else "?"


def _print_status(st: dict | None, lease: dict | None, waiting: int) -> None:
    if st is None:
        print("worker: no status.json yet (the worker has not finished a cycle)")
    else:
        at = st.get("finished_at") or st.get("time") or st.get("updated_at") or st.get("at")
        print(f"worker: last cycle {_when(at)}" + (f" on {st['host']}" if st.get("host") else ""))
        counts = st.get("counts")
        if isinstance(counts, dict) and counts:
            print("  " + ", ".join(f"{k} {v}" for k, v in counts.items()))
        tokens = st.get("tokens") if isinstance(st.get("tokens"), dict) else {}
        used = tokens.get("used", st.get("tokens_today"))
        cap = tokens.get("cap", st.get("tokens_cap", st.get("tokens_per_day")))
        if used is not None or cap is not None:
            print(f"  tokens today: {used if used is not None else '?'} of {cap if cap is not None else '?'}")
        errors = st.get("errors") or []
        if isinstance(errors, list) and errors:
            print(f"  errors ({len(errors)}):")
            for e in errors[:10]:
                # the step and the message; the full trace stays in status.json and the worker's log
                print(f"    {e.get('step', '?')}: {e.get('error', e)}" if isinstance(e, dict) else f"    {e}")
        elif errors:
            print(f"  errors: {errors}")
    if lease:
        state = "released" if lease.get("released_at") else (
            "expired" if float(lease.get("expires_at") or 0) <= time.time() else "held")
        print(f"lease: {state} by {lease.get('owner', '?')} ({lease.get('host', '?')}) "
              f"until {_when(lease.get('expires_at'))}")
    else:
        print("lease: none")
    print(f"library: {waiting} file(s) not pushed yet")


def cli_cloud(cfg: Config, store, args) -> int:
    """`igmp cloud push | pull | seed | status`."""
    bucket = open_bucket(cfg)
    if bucket is None:
        print('cloud is off: set cloud_url in config.toml, e.g. cloud_url = "s3://igmp-media" with '
              'cloud_endpoint = "https://<account>.r2.cloudflarestorage.com" (credentials in '
              'AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), or cloud_url = "file:///Volumes/NAS/igmp"')
        return 2
    action = getattr(args, "action", None)
    if action == "push":
        r = push_library(cfg, store, bucket, limit=getattr(args, "limit", None))
        c = r["counts"]
        print(f"pushed {c['pushed']} file(s) ({_human(r['bytes'])}), {c['skipped']} already there, "
              f"{c['failed']} failed, to {bucket!r}")
        for p in r["failed"][:20]:
            print(f"  failed: {p}")
        return 1 if r["failed"] else 0
    if action == "pull":
        r = pull_outputs(cfg, store, bucket)
        print(f"pulled {r['downloaded']} output(s) ({_human(r['bytes'])}) into {r['to']}, "
              f"{r['current']} current, {r['failed']} failed")
        return 1 if r["failed"] else 0
    if action == "seed":
        try:
            o = seed(cfg, bucket, force=bool(getattr(args, "force", False)))
        except (RuntimeError, FileNotFoundError) as e:
            print(f"seed refused: {e}")
            return 1
        print(f"seeded {o.key} ({_human(o.size)}) for the worker")
        return 0
    if action == "status":
        _print_status(read_status(bucket), read_lease(bucket), unpushed(cfg, store))
        return 0
    print(f"unknown cloud action {action!r}: use push, pull, seed or status")
    return 2
