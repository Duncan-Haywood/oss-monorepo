"""Read a backup artifact end-to-end and report whether it is structurally intact.

Exit code, file size, and mtime -- everything the rest of this tool looks at --
share one blind spot: an archive that is *big, fresh, and broken*. The common
shapes of that are mundane and, between them, account for a large share of
real-world "the backup was running fine for months" incidents:

  - `pg_dump ... | gzip > out.sql.gz` without `set -o pipefail`. The shell
    reports gzip's exit code, so pg_dump dying halfway is invisible. The file
    is fresh, it is large, and it is a truncated dump.
  - The destination filled up mid-write. Whatever bytes fit are on disk.
  - A network destination dropped and the copy stopped short.

Nothing about those runs looks wrong from the outside, which is why they get
noticed at restore time. Actually decompressing the artifact is what separates
them from a good run: compression containers carry checksums and end-of-stream
markers, and archive formats carry end-of-archive markers, so reading one to
completion is a real test that the writer finished.

Scope, deliberately narrow and stated the same way everywhere in this venture:
`intact` means the container decompressed and/or parsed to its end without
error and every checksum the format carries matched. It does **not** mean the
backup is complete, correct, or restorable -- an archive can be perfectly
intact and contain the wrong database. Formats this cannot check with the
standard library are reported `unsupported`, never quietly passed.

Everything here is read-only and local: files are opened for reading, streamed
in chunks, and discarded. Nothing is extracted to disk and no network call is
made.
"""

from __future__ import annotations

import bz2
import gzip
import lzma
import sqlite3
import tarfile
import zipfile
import zlib
from pathlib import Path
from typing import Any, Callable, IO

# Outcome vocabulary. Kept disjoint from the run-status vocabulary in report.py
# so a reader is never in doubt about which layer a word came from.
INTACT = "intact"
CORRUPT = "corrupt"
UNSUPPORTED = "unsupported"
INCONCLUSIVE = "inconclusive"
SKIPPED = "skipped"

CHUNK_SIZE = 1 << 20  # 1 MiB

# Offset/value of the POSIX tar magic inside a tar header block.
_TAR_MAGIC_OFFSET = 257
_TAR_MAGICS = (b"ustar\x0000", b"ustar  \x00", b"ustar\x00")

# Enough bytes to cover the tar magic at offset 257 plus room for the text
# sniffing below.
_PEEK_BYTES = 4096

_SQLITE_MAGIC = b"SQLite format 3\x00"

# What to call a tar once we know which codec wraps it, so the report names the
# thing the user recognises rather than just "gzip".
_TAR_LABELS = {"gzip": "tar.gz", "bzip2": "tar.bz2", "xz": "tar.xz"}

# Trailers that a *complete* logical dump ends with. Their absence on a file
# that clearly started as one of these dumps is direct evidence of truncation
# -- the single most valuable check available for plain-text dumps, which carry
# no checksum of their own.
_TEXT_DUMP_TRAILERS = (
    ("PostgreSQL", b"-- PostgreSQL database dump complete"),
    ("MySQL", b"-- Dump completed"),
)
_TEXT_DUMP_HEADS = (
    ("PostgreSQL", b"-- PostgreSQL database dump"),
    ("MySQL", b"-- MySQL dump"),
    ("MySQL", b"-- MariaDB dump"),
)
# How much of the tail to search for a dump trailer. Generous enough to survive
# trailing comments/blank lines, small enough to stay a constant-cost read.
_TRAILER_WINDOW = 8192


class _LimitReached(Exception):
    """Raised internally when a caller-supplied byte budget is exhausted.

    Carries the byte count so the caller can report how far it actually got
    rather than just restating the limit back at the user.
    """

    def __init__(self, read: int) -> None:
        super().__init__(read)
        self.read = read


# Corruption surfaces as a different exception type per codec; this is the full
# set the decompressors here can raise for "the bytes are wrong or ran out".
_DECOMPRESS_ERRORS = (EOFError, gzip.BadGzipFile, lzma.LZMAError, zlib.error)


def _result(
    outcome: str,
    fmt: str,
    detail: str,
    *,
    bytes_read: int | None = None,
    members_checked: int | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {"result": outcome, "format": fmt, "detail": detail}
    if bytes_read is not None:
        out["bytes_read"] = bytes_read
    if members_checked is not None:
        out["members_checked"] = members_checked
    return out


def _read_header(path: Path, size: int = _PEEK_BYTES) -> bytes:
    with path.open("rb") as handle:
        return handle.read(size)


def _has_tar_magic(header: bytes) -> bool:
    block = header[_TAR_MAGIC_OFFSET : _TAR_MAGIC_OFFSET + 8]
    return any(block.startswith(magic) for magic in _TAR_MAGICS)


def detect_format(path: Path, header: bytes) -> str:
    """Name the container from its magic bytes, never from its extension.

    Extensions on backup artifacts lie routinely -- `.bak` and `.dump` say
    nothing, and a `.tar.gz` written by a misconfigured job is sometimes a
    plain tar. The bytes do not lie, so they decide.
    """
    if path.is_dir():
        return "directory"
    if header.startswith(b"\x1f\x8b"):
        return "gzip"
    if header.startswith(b"BZh"):
        return "bzip2"
    if header.startswith(b"\xfd7zXZ\x00"):
        return "xz"
    if header.startswith(b"\x28\xb5\x2f\xfd"):
        return "zstd"
    if header.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        return "zip"
    if header.startswith(_SQLITE_MAGIC):
        return "sqlite"
    if header.startswith(b"PGDMP"):
        return "postgres-custom"
    if _has_tar_magic(header):
        return "tar"
    for name, marker in _TEXT_DUMP_HEADS:
        if marker in header[:_PEEK_BYTES]:
            return f"{name.lower()}-text-dump"
    return "unknown"


def _decompressor(fmt: str) -> Callable[[Path], IO[bytes]] | None:
    if fmt == "gzip":
        return lambda p: gzip.open(p, "rb")
    if fmt == "bzip2":
        return lambda p: bz2.open(p, "rb")
    if fmt == "xz":
        return lambda p: lzma.open(p, "rb")
    return None


def _drain(stream: IO[bytes], max_bytes: int | None) -> int:
    """Read a stream to EOF, discarding it, and return the byte count.

    Raises `_LimitReached` if `max_bytes` is hit first, so the caller can
    distinguish "read it all, it was fine" from "stopped early, unknown".
    """
    total = 0
    while True:
        chunk = stream.read(CHUNK_SIZE)
        if not chunk:
            return total
        total += len(chunk)
        if max_bytes is not None and total >= max_bytes:
            raise _LimitReached(total)


def _limit_detail(fmt: str, read: int, limit: int) -> str:
    return (
        f"read {read} bytes of the {fmt} stream without error, then stopped at the "
        f"{limit}-byte limit before reaching the end of the archive -- the tail, "
        "where truncation shows up, was not checked"
    )


def _text_dump_kind(header: bytes) -> tuple[str, bytes] | None:
    """Return `(label, trailer)` if `header` looks like a known logical dump."""
    for name, marker in _TEXT_DUMP_HEADS:
        if marker in header:
            trailer = next((item for item_name, item in _TEXT_DUMP_TRAILERS if item_name == name), None)
            if trailer is not None:
                return name, trailer
    return None


def _opaque_payload_format(inner: bytes) -> str | None:
    """Name a payload we can recognise inside a compressed file but cannot verify.

    A clean decompression proves the *wrapper* finished, not the payload. For a
    payload with no structure we can read (plain text, a raw dump), the wrapper
    is the only claim available and `intact` is the honest answer. But when the
    payload is itself a checksummed container we simply cannot check in-stream
    -- a SQLite database needs a seekable file, and `pg_dump -Fc` needs
    PostgreSQL's reader -- reporting `intact` would repeat the exact overclaim
    that decompressing a truncated dump used to make. `gzip app.db` is a common
    enough backup that this is worth naming rather than glossing.
    """
    if inner.startswith(_SQLITE_MAGIC):
        return "a SQLite database"
    if inner.startswith(b"PGDMP"):
        return "a PostgreSQL custom-format dump"
    return None


def _check_compressed_stream(
    path: Path,
    fmt: str,
    max_bytes: int | None,
    opaque_payload: str | None = None,
) -> dict[str, Any]:
    """Decompress a non-tar compressed file to its end and discard the output."""
    opener = _decompressor(fmt)
    assert opener is not None  # callers only route compressible formats here
    read = 0
    try:
        with opener(path) as stream:
            read = _drain(stream, max_bytes)
    except _LimitReached as limit:
        return _result(
            INCONCLUSIVE,
            fmt,
            _limit_detail(fmt, limit.read, max_bytes or 0),
            bytes_read=limit.read,
        )
    except _DECOMPRESS_ERRORS as exc:
        return _result(
            CORRUPT,
            fmt,
            f"the {fmt} stream did not decompress to a clean end ({type(exc).__name__}: {exc}). "
            "A truncated or checksum-failing stream means the writer did not finish -- "
            "the artifact is incomplete.",
            bytes_read=read,
        )
    except OSError as exc:
        # bz2/lzma surface several corruption modes as plain OSError; a genuinely
        # unreadable file (permissions, vanished mid-check) also lands here, and
        # the two are not worth conflating into "corrupt" without evidence.
        return _result(
            INCONCLUSIVE,
            fmt,
            f"could not read the {fmt} stream to its end ({type(exc).__name__}: {exc})",
            bytes_read=read,
        )
    if opaque_payload is not None:
        return _result(
            UNSUPPORTED,
            fmt,
            f"the {fmt} wrapper decompressed to a clean end and its checksum matched, but the "
            f"payload is {opaque_payload}, which cannot be checked from a stream without "
            "extracting it. The wrapper being intact does not mean the payload is: decompress "
            "it and run verify on the result for a real answer.",
            bytes_read=read,
        )
    return _result(
        INTACT,
        fmt,
        f"decompressed {read} bytes to a clean end of stream; the format's own checksum matched",
        bytes_read=read,
    )


def _check_compressed_text_dump(
    path: Path,
    fmt: str,
    kind: tuple[str, bytes],
    max_bytes: int | None,
) -> dict[str, Any]:
    """Decompress a dump stream and require both a clean wrapper and its trailer.

    The motivating failure is `pg_dump | gzip` without `pipefail`: the compressor
    sees EOF, writes a valid footer, and exits 0, so the on-disk file is a
    CRC-valid gzip whose payload is an incomplete SQL dump. Checking only the
    wrapper would report that file intact.
    """
    label, trailer = kind
    opener = _decompressor(fmt)
    assert opener is not None
    read = 0
    tail = b""
    try:
        with opener(path) as stream:
            while True:
                chunk = stream.read(CHUNK_SIZE)
                if not chunk:
                    break
                read += len(chunk)
                tail = (tail + chunk)[-_TRAILER_WINDOW:]
                if max_bytes is not None and read >= max_bytes:
                    raise _LimitReached(read)
    except _LimitReached as limit:
        return _result(
            INCONCLUSIVE,
            fmt,
            _limit_detail(fmt, limit.read, max_bytes or 0),
            bytes_read=limit.read,
        )
    except _DECOMPRESS_ERRORS as exc:
        return _result(
            CORRUPT,
            fmt,
            f"the {fmt} stream did not decompress to a clean end ({type(exc).__name__}: {exc}). "
            "A truncated or checksum-failing stream means the writer did not finish -- "
            "the artifact is incomplete.",
            bytes_read=read,
        )
    except OSError as exc:
        return _result(
            INCONCLUSIVE,
            fmt,
            f"could not read the {fmt} stream to its end ({type(exc).__name__}: {exc})",
            bytes_read=read,
        )
    if trailer in tail:
        return _result(
            INTACT,
            fmt,
            f"decompressed {read} bytes to a clean end of stream and found "
            f"{label}'s dump-complete marker",
            bytes_read=read,
        )
    return _result(
        CORRUPT,
        fmt,
        f"the {fmt} stream decompressed cleanly, but a {label} dump that finishes writes "
        f"{trailer.decode()!r} at the end; the payload does not contain it in its final "
        "bytes, so the dump was cut short.",
        bytes_read=read,
    )


def _check_tar(path: Path, fmt: str, max_bytes: int | None) -> dict[str, Any]:
    """Walk a tar (optionally compressed) to its end, reading every member's data.

    Reading member payloads rather than just headers is the point: it forces the
    whole file through the decompressor, so a tar whose *gzip* wrapper is fine
    but whose *tar* stream was cut short -- the pipeline-without-pipefail case --
    is still caught, and so is a bad gzip CRC at the very end.

    Nothing is extracted. Member data is streamed into memory in chunks and
    dropped, and member names are never used for a filesystem operation, so the
    usual tar path-traversal hazards do not apply.
    """
    read = 0
    members = 0
    try:
        # "r|*" is the streaming reader: it refuses to seek, which means it
        # genuinely reads the file through rather than trusting an index.
        with tarfile.open(path, mode="r|*") as archive:
            for member in archive:
                members += 1
                if not member.isfile():
                    continue
                payload = archive.extractfile(member)
                if payload is None:
                    continue
                try:
                    read += _drain(payload, None if max_bytes is None else max_bytes - read)
                except _LimitReached as limit:
                    raise _LimitReached(read + limit.read) from None
    except _LimitReached as limit:
        return _result(
            INCONCLUSIVE,
            fmt,
            _limit_detail(fmt, limit.read, max_bytes or 0),
            bytes_read=limit.read,
            members_checked=members,
        )
    except tarfile.ReadError as exc:
        return _result(
            CORRUPT,
            fmt,
            f"the tar stream ended or failed mid-archive after {members} member(s) "
            f"({exc}). A complete tar ends with its end-of-archive marker; this one "
            "does not, so the writer did not finish.",
            bytes_read=read,
            members_checked=members,
        )
    except _DECOMPRESS_ERRORS as exc:
        return _result(
            CORRUPT,
            fmt,
            f"the {fmt} stream wrapping this tar failed after {members} member(s) "
            f"({type(exc).__name__}: {exc}) -- the artifact is incomplete.",
            bytes_read=read,
            members_checked=members,
        )
    except OSError as exc:
        return _result(
            INCONCLUSIVE,
            fmt,
            f"could not read the tar to its end ({type(exc).__name__}: {exc})",
            bytes_read=read,
            members_checked=members,
        )
    return _result(
        INTACT,
        fmt,
        f"walked all {members} member(s) to the end-of-archive marker and read "
        f"{read} bytes of member data without error",
        bytes_read=read,
        members_checked=members,
    )


def _check_zip(path: Path) -> dict[str, Any]:
    """CRC-check every member. `testzip` decompresses each one to compare."""
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            bad = archive.testzip()
    except zipfile.BadZipFile as exc:
        return _result(
            CORRUPT,
            "zip",
            f"the zip central directory is unreadable ({exc}) -- a zip is finalized by "
            "writing that directory last, so this file was never finished.",
        )
    except OSError as exc:
        return _result(INCONCLUSIVE, "zip", f"could not read the zip ({type(exc).__name__}: {exc})")
    if bad is not None:
        return _result(
            CORRUPT,
            "zip",
            f"member {bad!r} failed its CRC check -- its stored contents do not match "
            "the checksum recorded when it was written.",
            members_checked=len(names),
        )
    return _result(
        INTACT,
        "zip",
        f"all {len(names)} member(s) passed their stored CRC checks",
        members_checked=len(names),
    )


def _check_sqlite(path: Path) -> dict[str, Any]:
    """Ask SQLite itself whether the file's pages hang together.

    Opened read-only through a URI so the check cannot modify, journal, or
    recover the file it was pointed at -- a verification tool that mutates the
    artifact it is verifying would be worse than no tool.

    `quick_check` is used rather than `integrity_check`: it catches the damage
    that matters here (torn pages, truncation) at a fraction of the cost on a
    multi-gigabyte database, and this runs after every backup.
    """
    try:
        # as_uri() percent-encodes #, ?, spaces, and the rest so they cannot
        # be read as a URI fragment or query and drop mode=ro.
        connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    except sqlite3.Error as exc:
        return _result(INCONCLUSIVE, "sqlite", f"could not open the database read-only ({exc})")
    try:
        rows = connection.execute("PRAGMA quick_check").fetchall()
    except sqlite3.DatabaseError as exc:
        return _result(
            CORRUPT,
            "sqlite",
            f"SQLite rejected the file ({exc}) -- it carries a SQLite header but does not "
            "read back as a usable database.",
        )
    finally:
        connection.close()
    findings = [str(row[0]) for row in rows]
    if findings == ["ok"]:
        return _result(INTACT, "sqlite", "SQLite's own quick_check reported ok")
    return _result(
        CORRUPT,
        "sqlite",
        "SQLite's quick_check reported: " + "; ".join(findings[:5]),
    )


def _check_text_dump(path: Path, fmt: str, header: bytes) -> dict[str, Any]:
    """Look for the trailer a complete plain-text SQL dump ends with.

    Plain-text dumps carry no checksum, so this is the only structural evidence
    available -- but it is exactly the right evidence, because the failure being
    hunted (the dump stopped early) is precisely the one that removes the
    trailer.
    """
    kind = _text_dump_kind(header)
    if kind is None:
        return _result(UNSUPPORTED, fmt, "no known completion marker for this dump flavour")
    label, trailer = kind
    try:
        size = path.stat().st_size
        with path.open("rb") as handle:
            handle.seek(max(0, size - _TRAILER_WINDOW))
            tail = handle.read(_TRAILER_WINDOW)
    except OSError as exc:
        return _result(INCONCLUSIVE, fmt, f"could not read the end of the file ({exc})")
    if trailer in tail:
        return _result(
            INTACT,
            fmt,
            f"the file ends with {label}'s dump-complete marker, so the dump ran to completion",
        )
    return _result(
        CORRUPT,
        fmt,
        f"a {label} dump that finishes writes {trailer.decode()!r} at the end; this file "
        "does not contain it in its final bytes, so the dump was cut short.",
    )


_UNSUPPORTED_DETAIL = {
    "directory": (
        "a repository-style backup (restic, borg) is a directory whose integrity only its "
        "own tool can judge -- run `restic check` or `borg check` for this artifact"
    ),
    "zstd": (
        "zstd is not in the Python standard library for this version -- run `zstd -t` on "
        "the file for the equivalent check"
    ),
    "postgres-custom": (
        "the file carries a PostgreSQL custom-format dump header, but validating it needs "
        "PostgreSQL's own reader -- run `pg_restore --list` on it for the equivalent check"
    ),
    "unknown": (
        "no compression or archive container was recognised from the file's magic bytes, "
        "so there is no structure to check; size and age remain the only signals"
    ),
}


def inspect_artifact(path: str | Path, *, max_bytes: int | None = None) -> dict[str, Any]:
    """Inspect one artifact and report a structural-integrity outcome.

    Returns a dict with `result` (one of the module constants), `format`, and a
    `detail` sentence written to be readable in an alert with no other context.
    Never raises on a caller-supplied path: an artifact that cannot be inspected
    is reported, not thrown.
    """
    path = Path(path)
    try:
        if not path.exists():
            return _result(INCONCLUSIVE, "unknown", f"no such path: {path}")
        if path.is_dir():
            return _result(UNSUPPORTED, "directory", _UNSUPPORTED_DETAIL["directory"])
        header = _read_header(path)
    except OSError as exc:
        return _result(INCONCLUSIVE, "unknown", f"could not read {path} ({type(exc).__name__}: {exc})")

    if not header:
        return _result(
            CORRUPT,
            "empty",
            "the artifact is zero bytes -- the job produced a file but never wrote anything into it",
        )

    fmt = detect_format(path, header)

    if fmt in ("gzip", "bzip2", "xz"):
        # Decide tar-vs-not from the decompressed head rather than the filename,
        # so a tar.gz named `.bak` is still walked as a tar.
        opener = _decompressor(fmt)
        assert opener is not None
        try:
            with opener(path) as stream:
                inner = stream.read(_PEEK_BYTES)
        except (OSError, *_DECOMPRESS_ERRORS):
            # Whatever went wrong reading the first block will be reported with
            # a better message by the full check below.
            inner = b""
        if _has_tar_magic(inner):
            return _check_tar(path, _TAR_LABELS[fmt], max_bytes)
        dump_kind = _text_dump_kind(inner)
        if dump_kind is not None:
            return _check_compressed_text_dump(path, fmt, dump_kind, max_bytes)
        return _check_compressed_stream(
            path, fmt, max_bytes, opaque_payload=_opaque_payload_format(inner)
        )

    if fmt == "tar":
        return _check_tar(path, "tar", max_bytes)
    if fmt == "zip":
        return _check_zip(path)
    if fmt == "sqlite":
        return _check_sqlite(path)
    if fmt.endswith("-text-dump"):
        return _check_text_dump(path, fmt, header)

    return _result(UNSUPPORTED, fmt, _UNSUPPORTED_DETAIL.get(fmt, _UNSUPPORTED_DETAIL["unknown"]))
