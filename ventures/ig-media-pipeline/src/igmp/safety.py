"""The one boundary between igmp and the photo library.

Nothing igmp does may modify, move, rename, delete or add a file under a library root, and an
original is never edited in place: edit settings live in the state database and in .pp3 files
under state/, and every render is a new file under output_dir. Three layers hold that line, so
no single mistake can cross it:

1. Config. `check_config` refuses an output_dir that is a library root, sits inside one, or
   contains one. Symlinks, `..`, letter case and Unicode normalisation are resolved first, and
   folder identity (device, inode) catches aliases a path comparison cannot see.
2. Writers. The writers here are the one way to write: `atomic`, `write_text`, `save_image`,
   `move`, `make_dirs`, `scratch`, `staged_copy`, and `run`/`popen` for external tools. A target
   outside output_dir or inside a library root is refused. A file is written into a private temp
   folder beside its target and renamed into place, so a crash never leaves half a file. A file
   igmp did not write, or one that changed since igmp wrote it, is never replaced; the ledger
   `state/written.jsonl` records what igmp wrote. The only deletions made here are of temp
   folders created here, under output_dir.
   External tools get their own rules (`check_tool_args`):
     ffmpeg       library files only as `-i` inputs (and, through `run`, never with -y)
     ffprobe      library files only as what it reads (never after -o)
     exiftool     library files only in a read-only command: no tag assignment (`-TAG=`,
                  `-TAG<SRC`), and none of -o -w -tagsFromFile -overwrite_original* -geotag
                  -srcfile -delete_original -restore_original -@ (exiftool edits in place and
                  leaves `<name>_original` backups)
     rawtherapee  never a library path; a private symlink to a RAW, kept outside the library, is
                  accepted as a -c input when -s/-S/-O are absent (no sidecar is read or written)
     anything     else (claude included): no library path at all
3. Tripwire. `guard` installs a process-wide audit hook (PEP 578). It sees every write-mode
   open, rename, delete, mkdir, chmod, utime, xattr, truncate, copy, sqlite connect and process
   launch in this interpreter, third-party libraries included. Any of them aimed at a library
   path raises LibraryWriteError before it happens, and every process launch is held to the
   tool rules above. Worker processes install the hook too (`guard_worker`).
   Native code that calls the OS directly is outside its sight. igmp's native libraries
   (Pillow's codecs, LibRaw via rawpy) only read, and the before/after library check in cli
   (integrity.py) would report anything that slipped through.

igmp only reads the library. Files are opened read-only (Pillow, rawpy, the csv index, ffmpeg
inputs). On a volume mounted with access times, reading can update a file's atime. Contents,
sizes, modification times and directory entries are never touched.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unicodedata
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import unquote, urlparse

if TYPE_CHECKING:
    from .config import Config

LEDGER = "written.jsonl"
TEMP_PREFIX = ".igmp-tmp-"


class UnsafeWrite(PermissionError):
    """igmp refused a write: outside output_dir, over a file it did not write, or in a dry run."""


class LibraryWriteError(UnsafeWrite):
    """Something tried to change the photo library. Always a bug; the operation did not happen."""


class UnsafeConfig(ValueError):
    """Settings that would put outputs inside the library, or the library inside outputs."""


# --- paths -----------------------------------------------------------------------------------

def resolve(path) -> Path:
    """Absolute, with `~`, symlinks and `..` resolved (as far as the path exists)."""
    return Path(os.path.realpath(os.path.expanduser(os.fsdecode(path))))


def _fold(text: str) -> str:
    """Comparison form. macOS volumes (APFS, exFAT) are usually case- and normalisation-
    insensitive, so compare as if every disk were; on a case-sensitive disk that only makes the
    checks stricter."""
    return unicodedata.normalize("NFC", text).casefold()


def _identity(path: Path) -> tuple[int, int] | None:
    try:
        st = os.stat(path)
    except (OSError, ValueError):
        return None
    return st.st_dev, st.st_ino


def component(name: str, fallback: str = "untitled") -> str:
    """`name` as one safe path component: no separators or control characters, no leading dots
    (so never `..` or a hidden file), at most 150 characters."""
    text = re.sub(r"[/\\:\x00-\x1f]", "-", name).strip().lstrip(".").strip()
    return text[:150] or fallback


@dataclass(frozen=True)
class _Root:
    path: Path                              # resolved
    forms: tuple[str, ...]                  # folded: as resolved, and as configured (made absolute)
    identity: tuple[int, int] | None        # (st_dev, st_ino) when it exists

    @classmethod
    def of(cls, path) -> _Root:
        given = os.path.abspath(os.path.expanduser(os.fsdecode(path)))
        real = resolve(given)
        forms = tuple(dict.fromkeys(_fold(p).rstrip(os.sep) for p in (str(real), given)))
        return cls(real, forms, _identity(real))

    def contains(self, path: Path) -> bool:
        """`path` (already resolved) is this folder or lies under it."""
        text = _fold(str(path))
        if any(text == f or text.startswith(f + os.sep) for f in self.forms):
            return True
        if self.identity is None:
            return False
        # aliases a path comparison cannot see (macOS firmlinks, bind mounts): same folder object
        return any(_identity(p) == self.identity for p in (path, *path.parents))

    def mentioned_in(self, arg: str) -> bool:
        """The library path appears somewhere in a command-line argument (`-o/x`, `file:/x`...)."""
        text = _fold(arg)
        return any(f + os.sep in text or text.endswith(f) for f in self.forms)


@dataclass(frozen=True)
class Boundary:
    library: tuple[_Root, ...]
    output: _Root

    def in_library(self, path) -> _Root | None:
        p = resolve(path)
        return next((r for r in self.library if r.contains(p)), None)

    def in_output(self, path) -> bool:
        return self.output.contains(resolve(path))

    def mentions_library(self, arg: str) -> bool:
        if os.path.isabs(arg) and self.in_library(arg) is not None:
            return True
        return any(r.mentioned_in(arg) for r in self.library)


def boundary(cfg: Config) -> Boundary:
    return _boundary(tuple(str(r) for r in cfg.library_roots), str(cfg.output_dir))


@lru_cache(maxsize=32)
def _boundary(roots: tuple[str, ...], output: str) -> Boundary:
    return Boundary(tuple(_Root.of(r) for r in roots), _Root.of(output))


def in_library(cfg: Config, path) -> bool:
    return boundary(cfg).in_library(path) is not None


def check_config(cfg: Config) -> None:
    """Refuse settings where outputs and library overlap. Called by config.load."""
    out = _Root.of(cfg.output_dir)
    for given in cfg.library_roots:
        root = _Root.of(given)
        if root.contains(out.path):
            raise UnsafeConfig(
                f"output_dir {cfg.output_dir} is inside (or is) the library root {given}, so igmp "
                "would write into your library. Pick a folder outside it, for example ~/Pictures/igmp "
                "or a sibling folder on the same drive.")
        if out.contains(root.path):
            raise UnsafeConfig(
                f"library root {given} is inside output_dir {cfg.output_dir}. Keep the library and "
                "igmp's outputs in separate folders.")


# --- what igmp wrote -------------------------------------------------------------------------

class _Ledger:
    """The files igmp wrote under one output_dir, with the size and mtime it left each at.

    An append-only JSON-lines file, so worker processes can add to it; every check re-reads
    the lines added since the last one."""

    def __init__(self, output: Path):
        self.output = output
        self.path = output / "state" / LEDGER
        self.lock = threading.Lock()
        self.entries: dict[str, tuple[int, int]] = {}
        self.offset = 0

    def _key(self, p: Path) -> str:
        return _fold(os.path.relpath(p, self.output))

    def _refresh(self) -> None:
        try:
            with open(self.path, "rb") as fh:
                fh.seek(self.offset)
                data = fh.read()
        except FileNotFoundError:
            return
        end = data.rfind(b"\n") + 1          # only whole lines; a partial one is still being written
        for line in data[:end].splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get("gone"):
                self.entries.pop(e["path"], None)
            else:
                self.entries[e["path"]] = (e["size"], e["mtime_ns"])
        self.offset += end

    def _append(self, entry: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        try:
            os.write(fd, (json.dumps(entry, sort_keys=True) + "\n").encode())
        finally:
            os.close(fd)

    def owns(self, p: Path) -> bool:
        st = p.stat()
        with self.lock:
            self._refresh()
            return self.entries.get(self._key(p)) == (st.st_size, st.st_mtime_ns)

    def record(self, p: Path) -> None:
        st = p.stat()
        with self.lock:
            self._append({"path": self._key(p), "size": st.st_size, "mtime_ns": st.st_mtime_ns})
            self._refresh()

    def forget(self, p: Path) -> None:
        with self.lock:
            self._append({"path": self._key(p), "gone": True})
            self._refresh()


_ledgers: dict[str, _Ledger] = {}
_ledgers_lock = threading.Lock()


def _ledger(cfg: Config) -> _Ledger:
    out = boundary(cfg).output.path
    with _ledgers_lock:
        return _ledgers.setdefault(str(out), _Ledger(out))


# --- writers ---------------------------------------------------------------------------------

def check_write(cfg: Config, path) -> Path:
    """`path` resolved, if igmp may create or change it at all: inside output_dir and outside
    every library root. Raises LibraryWriteError or UnsafeWrite otherwise."""
    b = boundary(cfg)
    p = resolve(path)
    root = next((r for r in b.library if r.contains(p)), None)
    if root is not None:
        raise LibraryWriteError(f"refusing to write {path}: it is inside the photo library {root.path}")
    if not b.output.contains(p):
        raise UnsafeWrite(f"refusing to write {path}: it is outside output_dir {b.output.path}")
    return p


def output_path(cfg: Config, path) -> Path:
    """check_write, and an existing file there must be one igmp wrote and nobody changed since."""
    p = check_write(cfg, path)
    if os.path.lexists(p) and (not p.is_file() or not _ledger(cfg).owns(p)):
        raise UnsafeWrite(f"refusing to replace {p}: igmp did not write it, or it was changed "
                          "after igmp did. Move it away to let igmp write there.")
    return p


def make_dirs(cfg: Config, path) -> Path:
    p = check_write(cfg, path)
    p.mkdir(parents=True, exist_ok=True)
    return p


@contextmanager
def atomic(cfg: Config, path) -> Iterator[Path]:
    """Yield a fresh, not-yet-existing path to write (in a private temp folder beside `path`,
    with the same file name so tools infer the format); on success it is renamed onto `path`
    in one step. On failure nothing is left behind."""
    final = output_path(cfg, path)
    folder = make_dirs(cfg, final.parent)
    tmpdir = Path(tempfile.mkdtemp(prefix=TEMP_PREFIX, dir=folder))
    try:
        tmp = tmpdir / final.name
        yield tmp
        if not tmp.is_file():
            raise RuntimeError(f"nothing was written for {final}")
        output_path(cfg, final)               # again: something may have appeared meanwhile
        os.replace(tmp, final)
        _ledger(cfg).record(final)
    finally:
        _remove_own_temp(cfg, tmpdir)


def write_text(cfg: Config, path, text: str) -> Path:
    with atomic(cfg, path) as tmp:
        tmp.write_text(text)
    return Path(path)


def save_image(cfg: Config, img, path, **save_kw) -> Path:
    """PIL Image.save, atomically and inside the boundary."""
    with atomic(cfg, path) as tmp:
        img.save(tmp, **save_kw)
    return Path(path)


def move(cfg: Config, src, dst) -> Path:
    """Move one of igmp's outputs within output_dir (never onto a file igmp did not write)."""
    s = check_write(cfg, src)
    d = output_path(cfg, dst)
    make_dirs(cfg, d.parent)
    os.replace(s, d)
    led = _ledger(cfg)
    led.forget(s)
    led.record(d)
    return Path(dst)


@contextmanager
def scratch(cfg: Config, under=None) -> Iterator[Path]:
    """A private, empty working folder (under state/tmp, or `under` inside output_dir), deleted
    with everything in it afterwards. Tools may write freely inside it."""
    parent = make_dirs(cfg, under or cfg.state_dir / "tmp")
    d = Path(tempfile.mkdtemp(prefix=TEMP_PREFIX, dir=parent))
    try:
        yield d
    finally:
        _remove_own_temp(cfg, d)


@contextmanager
def staged_copy(cfg: Config, src) -> Iterator[Path]:
    """A private copy of a library file (read once, read-only) in a scratch folder under state/,
    deleted afterwards. For tools that may write beside their input, such as a raw converter
    that saves a sidecar, or for an output_dir where symlinks are unavailable (exFAT)."""
    source = Path(src)
    with scratch(cfg) as work:
        copy = work / component(source.name)
        shutil.copyfile(source, copy)
        yield copy


def _remove_own_temp(cfg: Config, d: Path) -> None:
    """The only deletion igmp makes: a temp folder it created under output_dir."""
    p = check_write(cfg, d)
    if p.name.startswith(TEMP_PREFIX) and p != boundary(cfg).output.path:
        shutil.rmtree(p, ignore_errors=True)


# --- external tools --------------------------------------------------------------------------

EXIFTOOL_WRITES = {"-o", "-out", "-w", "-w!", "-w+", "-textout", "-W", "-tagout", "-tagsfromfile",
                   "-overwrite_original", "-overwrite_original_in_place", "-delete_original",
                   "-delete_original!", "-restore_original", "-geotag", "-srcfile", "-@", "-stay_open"}
RAWTHERAPEE_SIDECARS = {"-s", "-S", "-O"}


def exiftool_reads_only(cmd: Sequence[str]) -> bool:
    """True when an exiftool command can only read: no write option and no tag assignment.
    (A plain `exiftool -TAG=value file` rewrites the file and leaves file_original beside it.)"""
    for arg in cmd[1:]:
        if not arg.startswith("-"):
            continue
        if arg.lower() in {o.lower() for o in EXIFTOOL_WRITES} or "=" in arg or "<" in arg:
            return False
    return True


def _private_link(arg: str, b: Boundary) -> bool:
    """A symlink to a library file that itself lives outside the library (igmp's work folder or
    the system temp folder), so anything written beside it lands there, not beside the original."""
    p = Path(os.path.abspath(arg))
    return p.is_symlink() and b.in_library(p.parent) is None


def check_tool_args(cmd: Sequence[str], b: Boundary, strict: bool = True) -> None:
    """What an external tool may be handed (see the module notes). `strict` (safety.run) also
    refuses ffmpeg -y; the tripwire checks every other launch with strict=False."""
    tool = Path(cmd[0]).name.lower()
    ffmpeg, ffprobe = tool.startswith("ffmpeg"), tool.startswith("ffprobe")
    exiftool, rawtherapee = tool.startswith("exiftool"), tool.startswith("rawtherapee")
    if strict and ffmpeg and "-y" in cmd[1:]:
        raise UnsafeWrite("ffmpeg -y overwrites without asking; give ffmpeg a fresh output path and -n")
    rt_inputs = cmd.index("-c") + 1 if rawtherapee and "-c" in cmd else len(cmd)
    for i, arg in enumerate(cmd[1:], 1):
        if not b.mentions_library(arg):
            continue
        if (ffmpeg and cmd[i - 1] == "-i") or (ffprobe and cmd[i - 1] != "-o"):
            continue
        if exiftool and exiftool_reads_only(cmd):
            continue
        if rawtherapee and i >= rt_inputs and _private_link(arg, b) and not RAWTHERAPEE_SIDECARS & set(cmd):
            continue
        raise LibraryWriteError(f"refusing to run {tool} with the library path {arg}: see safety.check_tool_args "
                                "for what each tool may be given")


_approved = threading.local()


def _prepare(cmd: Sequence, cfg: Config, writes: Sequence, kwargs: dict) -> tuple[list[str], dict]:
    cmd = [os.fspath(c) for c in cmd]
    b = boundary(cfg)
    check_tool_args(cmd, b)
    for w in writes:
        check_write(cfg, w)
    cwd = kwargs.pop("cwd", None)
    if cwd is None:             # tools that drop files in the working folder drop them in state/
        cwd = cfg.state_dir if cfg.state_dir.is_dir() else tempfile.gettempdir()
    if b.in_library(cwd) is not None:
        raise LibraryWriteError(f"refusing to run {cmd[0]} with its working folder in the library ({cwd})")
    env = dict(kwargs.pop("env", None) or os.environ)
    env.pop("FFREPORT", None)   # would make ffmpeg write a report file into the working folder
    return cmd, {**kwargs, "cwd": cwd, "env": env}


@contextmanager
def _launching(cmd: list[str]):
    _approved.cmd = cmd
    try:
        yield
    finally:
        _approved.cmd = None


def run(cmd: Sequence, cfg: Config, *, writes: Sequence = (), **kwargs) -> subprocess.CompletedProcess:
    """subprocess.run for every external tool igmp starts, after checking what it is handed.
    `writes` are the files the tool will create; each must be inside the boundary."""
    cmd, kwargs = _prepare(cmd, cfg, writes, kwargs)
    with _launching(cmd):
        return subprocess.run(cmd, **kwargs)


def popen(cmd: Sequence, cfg: Config, *, writes: Sequence = (), **kwargs) -> subprocess.Popen:
    """subprocess.Popen with the same checks as run (for tools fed frame by frame)."""
    cmd, kwargs = _prepare(cmd, cfg, writes, kwargs)
    with _launching(cmd):
        return subprocess.Popen(cmd, **kwargs)


# --- tripwire --------------------------------------------------------------------------------

_active: list[tuple[Boundary, bool]] = []        # (boundary, dry run: output_dir is off limits too)
_violations: list[str] = []
_installed = False
_WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND


def _fd_path(fd: int) -> str | None:
    """The path behind an open file descriptor (Linux /proc, macOS F_GETPATH), if knowable."""
    try:
        if sys.platform == "darwin":
            import fcntl
            return os.fsdecode(fcntl.fcntl(fd, fcntl.F_GETPATH, bytes(1024)).rstrip(b"\0"))
        return os.readlink(f"/proc/self/fd/{fd}")
    except (OSError, ValueError, AttributeError):
        return None


def _deny(what: str, path, dir_fd=None, *, by_fd: bool = False) -> None:
    if isinstance(path, int) and by_fd:
        path = _fd_path(path)     # utime/chmod/truncate/xattr through a descriptor change the file too
    if path is None or isinstance(path, int):
        return
    try:
        text = os.fsdecode(path)
    except TypeError:
        return
    if dir_fd not in (None, -1) and not os.path.isabs(text):
        return                  # relative to an open folder: the call that opened it was checked
    p = resolve(text)
    for b, dry_run in list(_active):
        root = next((r for r in b.library if r.contains(p)), None)
        if root is not None:
            msg = f"blocked {what} {text}: it is inside the photo library {root.path}"
            _violations.append(msg)
            raise LibraryWriteError(msg)
        if dry_run and b.output.contains(p):
            msg = f"blocked {what} {text}: this is a dry run"
            _violations.append(msg)
            raise UnsafeWrite(msg)


def _deny_command(args, cwd=None) -> None:
    if getattr(_approved, "cmd", None) is not None:
        return                  # launched through run()/popen(), which checked it strictly
    if isinstance(args, (str, bytes)):
        argv = ["sh", os.fsdecode(args)]        # a shell line: any library path in it is refused
    else:
        argv = [os.fsdecode(a) for a in (args or ())]
    if not argv:
        return
    for b, _ in list(_active):
        try:
            check_tool_args(argv, b, strict=False)
        except UnsafeWrite as e:
            _violations.append(f"blocked launching {argv[0]}: {e}")
            raise
    if cwd is not None:
        _deny("running a process in", cwd)


def _sqlite(args) -> None:
    db = os.fsdecode(args[0]) if args and isinstance(args[0], (str, bytes, os.PathLike)) else ""
    if not db or db == ":memory:":
        return
    if db.startswith("file:"):
        url = urlparse(db)
        if re.search(r"(^|&)(immutable=1|mode=ro)(&|$)", url.query):
            return              # read-only: sqlite will not write the file or create journals
        db = unquote(url.path)
    _deny("opening a database at", db)


def _open(args) -> None:
    path, mode, flags = (tuple(args) + (None, None, None))[:3]
    writing = (isinstance(mode, str) and any(c in mode for c in "wax+")) or \
              (isinstance(flags, int) and bool(flags & _WRITE_FLAGS))
    if writing:
        _deny("writing", path)


_HANDLERS = {
    "open": _open,
    "os.rename": lambda a: (_deny("renaming", a[0], a[2]), _deny("renaming onto", a[1], a[3])),
    "os.remove": lambda a: _deny("deleting", a[0], a[1]),
    "os.rmdir": lambda a: _deny("deleting", a[0], a[1]),
    "os.mkdir": lambda a: _deny("creating", a[0], a[2]),
    "os.link": lambda a: (_deny("linking", a[0], a[2]), _deny("linking onto", a[1], a[3])),
    "os.symlink": lambda a: _deny("linking onto", a[1], a[2]),
    "os.truncate": lambda a: _deny("truncating", a[0], by_fd=True),
    "os.utime": lambda a: _deny("changing times of", a[0], a[3], by_fd=True),
    "os.chmod": lambda a: _deny("changing permissions of", a[0], a[2], by_fd=True),
    "os.chown": lambda a: _deny("changing owner of", a[0], a[3], by_fd=True),
    "os.chflags": lambda a: _deny("changing flags of", a[0]),
    "os.lchflags": lambda a: _deny("changing flags of", a[0]),
    "os.setxattr": lambda a: _deny("setting an attribute on", a[0], by_fd=True),
    "os.removexattr": lambda a: _deny("removing an attribute from", a[0], by_fd=True),
    "shutil.rmtree": lambda a: _deny("deleting", a[0]),
    "shutil.copyfile": lambda a: _deny("copying onto", a[1]),
    "shutil.copymode": lambda a: _deny("copying permissions onto", a[1]),
    "shutil.copystat": lambda a: _deny("copying metadata onto", a[1]),
    "shutil.copytree": lambda a: _deny("copying onto", a[1]),
    "shutil.move": lambda a: (_deny("moving", a[0]), _deny("moving onto", a[1])),
    "tempfile.mkstemp": lambda a: _deny("creating", a[0]),
    "tempfile.mkdtemp": lambda a: _deny("creating", a[0]),
    "sqlite3.connect": _sqlite,
    "subprocess.Popen": lambda a: _deny_command(a[1], a[2]),
    "os.system": lambda a: _deny_command(a[0]),
    "os.posix_spawn": lambda a: _deny_command(a[1]),
    "os.exec": lambda a: _deny_command(a[1]),
    "os.spawn": lambda a: _deny_command(a[2]),
}


def _hook(event: str, args: tuple) -> None:
    if _active:
        handler = _HANDLERS.get(event)
        if handler is not None:
            handler(args)


def install() -> None:
    """Add the audit hook to this interpreter (once; audit hooks cannot be removed)."""
    global _installed
    if not _installed:
        sys.addaudithook(_hook)
        _installed = True


class Guard:
    def __init__(self, start: int):
        self.start = start

    @property
    def violations(self) -> list[str]:
        """Writes the tripwire blocked while this guard was up (they did not happen)."""
        return _violations[self.start:]


@contextmanager
def guard(cfg: Config, *, dry_run: bool = False) -> Iterator[Guard]:
    """Turn on the tripwire for `cfg`'s library (and, in a dry run, its output_dir too)."""
    install()
    entry = (boundary(cfg), dry_run)
    _active.append(entry)
    try:
        yield Guard(len(_violations))
    finally:
        _active.remove(entry)


def guard_worker(cfg: Config, dry_run: bool = False) -> None:
    """ProcessPoolExecutor initializer: the tripwire for the life of a worker process."""
    install()
    entry = (boundary(cfg), dry_run)
    if entry not in _active:
        _active.append(entry)
