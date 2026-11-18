"""One small object-store interface, so the library, outputs and state can live in a bucket.

Two implementations share it (docs/CLOUD.md, "The bucket interface"):

  LocalBucket  a folder. Each object is a file at <root>/<key>; what S3 keeps beside an object
               (its user metadata, content type and etag) sits in a sidecar <root>/.meta/<key>.json,
               which list() never shows. The etag is the blake2b of the content (backup.digest's
               hash), so it changes exactly when the bytes do. Writes go to a temporary name and
               are renamed into place. Every write to a key holds a per-key lock file made with
               O_CREAT|O_EXCL, so a conditional put checks and writes as one step: two processes
               racing to create lease.json behave as they would on S3 (one wins, the other gets
               PreconditionFailed). Use it in tests, or on a NAS share both machines mount.
  S3Bucket     any S3-compatible store (Cloudflare R2, Backblaze B2, AWS S3, MinIO) through boto3,
               imported only when one is opened. Files move with upload_file/download_file, which
               switch to multipart transfers for large files; conditional writes use put_object's
               IfNoneMatch="*" and IfMatch=<etag>, which R2 and S3 honour, and a refused condition
               (412 PreconditionFailed, or 409 ConditionalRequestConflict while another
               conditional write to the key is in flight) becomes PreconditionFailed here.

Credentials are never read from a file in this repository or from config.toml: boto3's default
chain finds them (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the environment, a profile, or an
instance role).

`open_bucket(cfg)` reads `cloud_url` ("s3://name[/prefix]" or "file:///path"), `cloud_endpoint`,
`cloud_region` (default "auto", what R2 expects) and `cloud_prefix` from cfg.extra; with no
`cloud_url` the cloud is off and it returns None.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import uuid
from abc import ABC, abstractmethod
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator
from urllib.parse import unquote, urlparse

log = logging.getLogger(__name__)

META_DIR = ".meta"
PART = ".igmp-part"             # suffix of LocalBucket's half-written temporaries
CHUNK = 8 << 20
LOCK_WAIT_S = 30.0              # how long a writer waits for another writer of the same key
LOCK_STALE_S = 120.0            # a lock this old belongs to a process that died; it is broken
MULTIPART_BYTES = 64 << 20      # S3: files above this go up and down in 64 MB parts


class PreconditionFailed(Exception):
    """A conditional put whose condition did not hold (the object exists, or its etag moved)."""


@dataclass
class Obj:
    key: str
    size: int
    etag: str
    mtime: float
    meta: dict[str, str] = field(default_factory=dict)


class Bucket(ABC):
    """Keys are relative to the bucket (and its prefix), '/'-separated, never starting with '/'."""

    @abstractmethod
    def list(self, prefix: str = "") -> Iterator[Obj]: ...

    @abstractmethod
    def head(self, key: str) -> Obj | None: ...

    @abstractmethod
    def put_file(self, key: str, path: Path, *, meta: dict[str, str] | None = None) -> Obj: ...

    @abstractmethod
    def get_file(self, key: str, path: Path) -> Obj:
        """Download to path (a temporary name beside it, then renamed). Raises KeyError when absent."""

    @abstractmethod
    def put_bytes(self, key: str, data: bytes, *, if_match: str | None = None,
                  if_none_match: bool = False, content_type: str | None = None) -> Obj: ...

    @abstractmethod
    def get_bytes(self, key: str) -> tuple[bytes, Obj] | None: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...


def _check_key(key: str) -> str:
    parts = key.split("/")
    if not key or key.startswith("/") or any(p in ("", ".", "..") for p in parts) or parts[0] == META_DIR:
        raise ValueError(f"bad object key {key!r}")
    return key


# --------------------------------------------------------------------------- a folder

class LocalBucket(Bucket):
    def __init__(self, root: Path):
        self.root = Path(root).expanduser()

    def __repr__(self) -> str:
        return f"LocalBucket({str(self.root)!r})"

    # paths
    def _path(self, key: str) -> Path:
        return self.root / _check_key(key)

    def _meta_path(self, key: str) -> Path:
        return self.root / META_DIR / (_check_key(key) + ".json")

    def _writable(self) -> None:
        """Never create a folder under a missing /Volumes/<drive> (outputs.py explains why)."""
        from . import outputs
        vol = outputs.volume_root(self.root)
        if vol is not None and not outputs._mounted(vol):
            raise OSError(f"{vol} is not mounted; the bucket at {self.root} is unavailable")

    @contextmanager
    def _lock(self, key: str):
        lock = self.root / META_DIR / (_check_key(key) + ".lock")
        lock.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + LOCK_WAIT_S
        while True:
            try:
                fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
                os.write(fd, f"{os.getpid()}\n".encode())
                os.close(fd)
                break
            except FileExistsError:
                try:
                    if time.time() - lock.stat().st_mtime > LOCK_STALE_S:
                        lock.unlink(missing_ok=True)
                        continue
                except FileNotFoundError:
                    continue
                if time.monotonic() > deadline:
                    raise TimeoutError(f"{lock} held for over {LOCK_WAIT_S:.0f} s")
                time.sleep(0.005)
        try:
            yield
        finally:
            lock.unlink(missing_ok=True)

    # the sidecar
    def _read_meta(self, key: str, st: os.stat_result) -> dict:
        """The sidecar, when it describes the file as it is now; else one rebuilt from the file
        (an object copied into the folder by hand, or a sidecar a crash left behind)."""
        try:
            side = json.loads(self._meta_path(key).read_text())
            if side.get("size") == st.st_size and side.get("mtime_ns") == st.st_mtime_ns:
                return side
        except (OSError, ValueError, AttributeError):
            pass
        # stale or absent: the bytes changed without the sidecar, so neither its etag nor its meta
        # (whose blake2b names the old content) describes them any more
        return {"etag": _hash_file(self._path(key)), "size": st.st_size, "mtime_ns": st.st_mtime_ns,
                "meta": {}, "content_type": None}

    def _write_meta(self, key: str, path: Path, etag: str, meta: dict | None, content_type: str | None) -> None:
        st = path.stat()
        side = {"etag": etag, "size": st.st_size, "mtime_ns": st.st_mtime_ns, "meta": dict(meta or {}),
                "content_type": content_type}
        mp = self._meta_path(key)
        mp.parent.mkdir(parents=True, exist_ok=True)
        tmp = mp.with_name(f".{mp.name}.{uuid.uuid4().hex[:8]}{PART}")
        tmp.write_text(json.dumps(side, sort_keys=True))
        os.replace(tmp, mp)

    def _obj(self, key: str) -> Obj | None:
        p = self._path(key)
        try:
            st = p.stat()
        except (FileNotFoundError, NotADirectoryError):
            return None
        if not p.is_file():
            return None
        side = self._read_meta(key, st)
        return Obj(key, st.st_size, side["etag"], st.st_mtime, dict(side.get("meta") or {}))

    # the interface
    def list(self, prefix: str = "") -> Iterator[Obj]:
        if not self.root.is_dir():
            return
        keys = []
        # walk only the folder the prefix names ("library/" -> <root>/library)
        start = self.root / prefix.rsplit("/", 1)[0] if "/" in prefix else self.root
        for dirpath, dirs, files in os.walk(start):
            here = Path(dirpath)
            if here == self.root:
                dirs[:] = [d for d in dirs if d != META_DIR]
            for name in files:
                if name.endswith(PART):
                    continue
                key = (here / name).relative_to(self.root).as_posix()
                if key.startswith(prefix):
                    keys.append(key)
        for key in sorted(keys):            # S3 lists in key order
            if (o := self._obj(key)) is not None:
                yield o

    def head(self, key: str) -> Obj | None:
        return self._obj(key)

    def _put(self, key: str, write, *, meta=None, content_type=None, check=None) -> Obj:
        """Write under the key's lock: check(current Obj | None) may raise PreconditionFailed;
        write(tmp_path) fills the temporary file and returns its etag; it is renamed into place
        and described."""
        self._writable()
        dest = self._path(key)
        with self._lock(key):
            if check is not None:
                check(self._obj(key))
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_name(f".{dest.name}.{uuid.uuid4().hex[:8]}{PART}")
            try:
                etag = write(tmp)
                os.replace(tmp, dest)
            finally:
                tmp.unlink(missing_ok=True)
            self._write_meta(key, dest, etag, meta, content_type)
            return self._obj(key)

    def put_file(self, key: str, path: Path, *, meta: dict[str, str] | None = None) -> Obj:
        src = Path(path)

        def write(tmp: Path) -> str:
            h = _hasher()                      # hashed as it is copied: one read of the source
            with src.open("rb") as fi, tmp.open("wb") as fo:
                while chunk := fi.read(CHUNK):
                    h.update(chunk)
                    fo.write(chunk)
            if tmp.stat().st_size != src.stat().st_size:
                raise OSError(f"short copy of {src}")
            return h.hexdigest()
        return self._put(key, write, meta=meta)

    def get_file(self, key: str, path: Path) -> Obj:
        o = self._obj(key)
        if o is None:
            raise KeyError(key)
        dest = Path(path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(f".{dest.name}.{uuid.uuid4().hex[:8]}{PART}")
        try:
            with self._path(key).open("rb") as fi, tmp.open("wb") as fo:
                while chunk := fi.read(CHUNK):
                    fo.write(chunk)
            if tmp.stat().st_size != o.size:
                raise OSError(f"short download of {key}")
            os.replace(tmp, dest)
        finally:
            tmp.unlink(missing_ok=True)
        return o

    def put_bytes(self, key: str, data: bytes, *, if_match: str | None = None,
                  if_none_match: bool = False, content_type: str | None = None) -> Obj:
        def check(cur: Obj | None):
            if if_none_match and cur is not None:
                raise PreconditionFailed(f"{key} exists")
            if if_match is not None and (cur is None or cur.etag != if_match):
                raise PreconditionFailed(f"{key}: etag is {cur.etag if cur else 'absent'}, not {if_match}")
        def write(tmp: Path) -> str:
            tmp.write_bytes(data)
            return _hash_bytes(data)
        return self._put(key, write, content_type=content_type,
                         check=check if (if_match is not None or if_none_match) else None)

    def get_bytes(self, key: str) -> tuple[bytes, Obj] | None:
        p = self._path(key)
        try:
            data = p.read_bytes()
        except (FileNotFoundError, IsADirectoryError, NotADirectoryError):
            return None
        o = self._obj(key)
        if o is None:
            return None
        if o.size != len(data):          # replaced between the read and the stat: describe what was read
            o = Obj(key, len(data), _hash_bytes(data), o.mtime, o.meta)
        return data, o

    def delete(self, key: str) -> None:
        self._writable()
        with self._lock(key):
            self._path(key).unlink(missing_ok=True)
            self._meta_path(key).unlink(missing_ok=True)
        for base in (self._path(key).parent, self._meta_path(key).parent):   # prune emptied folders
            while base not in (self.root, self.root / META_DIR):
                try:
                    base.rmdir()
                except OSError:
                    break
                base = base.parent


def _hasher():
    return hashlib.blake2b(digest_size=20)      # backup.digest's hash


def _hash_file(path: Path) -> str:
    h = _hasher()
    with Path(path).open("rb") as fh:
        while chunk := fh.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def _hash_bytes(data: bytes) -> str:
    h = _hasher()
    h.update(data)
    return h.hexdigest()


# --------------------------------------------------------------------------- S3-compatible

class S3Bucket(Bucket):
    def __init__(self, bucket: str, prefix: str = "", endpoint_url: str | None = None,
                 region: str | None = "auto", *, client=None):
        self.bucket = bucket
        self.prefix = _norm_prefix(prefix)
        self.endpoint_url = endpoint_url
        self.region = region
        self._client = client

    def __repr__(self) -> str:
        return f"S3Bucket({self.bucket!r}, prefix={self.prefix!r}, endpoint_url={self.endpoint_url!r})"

    @property
    def client(self):
        if self._client is None:
            import boto3
            from botocore.config import Config as BotoConfig
            self._client = boto3.client(
                "s3", endpoint_url=self.endpoint_url or None, region_name=self.region or None,
                config=BotoConfig(retries={"max_attempts": 8, "mode": "standard"}))
        return self._client

    def _transfer(self):
        from boto3.s3.transfer import TransferConfig
        return TransferConfig(multipart_threshold=MULTIPART_BYTES, multipart_chunksize=MULTIPART_BYTES,
                              max_concurrency=4)

    def _k(self, key: str) -> str:
        return self.prefix + _check_key(key)

    @staticmethod
    def _code(e) -> tuple[str, int]:
        r = getattr(e, "response", {}) or {}
        return str(r.get("Error", {}).get("Code", "")), int(r.get("ResponseMetadata", {}).get("HTTPStatusCode") or 0)

    def _missing(self, e) -> bool:
        code, status = self._code(e)
        return status == 404 or code in ("404", "NoSuchKey", "NotFound")

    def list(self, prefix: str = "") -> Iterator[Obj]:
        pages = self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=self.prefix + prefix)
        for page in pages:
            for c in page.get("Contents", []) or []:
                key = c["Key"][len(self.prefix):]
                if not key or key.endswith("/"):
                    continue
                yield Obj(key, int(c.get("Size", 0)), _unquote(c.get("ETag", "")), _ts(c.get("LastModified")))

    def head(self, key: str) -> Obj | None:
        from botocore.exceptions import ClientError
        try:
            r = self.client.head_object(Bucket=self.bucket, Key=self._k(key))
        except ClientError as e:
            if self._missing(e):
                return None
            raise
        return Obj(key, int(r.get("ContentLength", 0)), _unquote(r.get("ETag", "")), _ts(r.get("LastModified")),
                   dict(r.get("Metadata") or {}))

    def put_file(self, key: str, path: Path, *, meta: dict[str, str] | None = None) -> Obj:
        extra = {"Metadata": {k: str(v) for k, v in (meta or {}).items()}} if meta else None
        self.client.upload_file(str(path), self.bucket, self._k(key), ExtraArgs=extra, Config=self._transfer())
        o = self.head(key)
        if o is None:
            raise OSError(f"{key}: upload finished but the object is not there")
        if o.size != Path(path).stat().st_size:
            raise OSError(f"{key}: uploaded {o.size} bytes of {Path(path).stat().st_size}")
        return o

    def get_file(self, key: str, path: Path) -> Obj:
        o = self.head(key)
        if o is None:
            raise KeyError(key)
        dest = Path(path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name(f".{dest.name}.{uuid.uuid4().hex[:8]}{PART}")
        try:
            self.client.download_file(self.bucket, self._k(key), str(tmp), Config=self._transfer())
            if tmp.stat().st_size != o.size:
                raise OSError(f"short download of {key} ({tmp.stat().st_size} of {o.size} bytes)")
            os.replace(tmp, dest)
        finally:
            tmp.unlink(missing_ok=True)
        return o

    def put_bytes(self, key: str, data: bytes, *, if_match: str | None = None,
                  if_none_match: bool = False, content_type: str | None = None) -> Obj:
        from botocore.exceptions import ClientError
        kw = {"Bucket": self.bucket, "Key": self._k(key), "Body": data}
        if if_none_match:
            kw["IfNoneMatch"] = "*"
        if if_match is not None:
            kw["IfMatch"] = f'"{_unquote(if_match)}"'
        if content_type:
            kw["ContentType"] = content_type
        try:
            r = self.client.put_object(**kw)
        except ClientError as e:
            code, status = self._code(e)
            if status in (409, 412) or code in ("PreconditionFailed", "ConditionalRequestConflict"):
                raise PreconditionFailed(f"{key}: {code or status}") from e
            raise
        return Obj(key, len(data), _unquote(r.get("ETag", "")), time.time(), {})

    def get_bytes(self, key: str) -> tuple[bytes, Obj] | None:
        from botocore.exceptions import ClientError
        try:
            r = self.client.get_object(Bucket=self.bucket, Key=self._k(key))
        except ClientError as e:
            if self._missing(e):
                return None
            raise
        data = r["Body"].read()
        return data, Obj(key, len(data), _unquote(r.get("ETag", "")), _ts(r.get("LastModified")),
                         dict(r.get("Metadata") or {}))

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._k(key))


def _unquote(etag: str) -> str:
    return (etag or "").strip().strip('"')


def _ts(value) -> float:
    if value is None:
        return 0.0
    return value.timestamp() if hasattr(value, "timestamp") else float(value)


def _norm_prefix(*parts: str | None) -> str:
    bits = [b for p in parts if p for b in str(p).split("/") if b]
    return "/".join(bits) + "/" if bits else ""


# --------------------------------------------------------------------------- settings

def open_bucket(cfg) -> Bucket | None:
    """The bucket config.toml names, or None when `cloud_url` is unset (the cloud is off)."""
    x = cfg.extra or {}
    url = str(x.get("cloud_url") or "").strip()
    if not url:
        return None
    u = urlparse(url)
    if u.scheme == "file":
        root = Path(unquote(u.netloc + u.path) if u.netloc not in ("", "localhost") else unquote(u.path))
        prefix = _norm_prefix(x.get("cloud_prefix"))
        return LocalBucket(root.expanduser() / prefix if prefix else root.expanduser())
    if u.scheme == "s3":
        if not u.netloc:
            raise ValueError(f"cloud_url {url!r} names no bucket (s3://<bucket>[/prefix])")
        return S3Bucket(u.netloc, _norm_prefix(u.path, x.get("cloud_prefix")),
                        endpoint_url=x.get("cloud_endpoint") or None, region=x.get("cloud_region") or "auto")
    raise ValueError(f"cloud_url {url!r}: use s3://<bucket>[/prefix] or file:///<folder>")
