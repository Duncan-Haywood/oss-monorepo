#!/usr/bin/env python3
"""List or fetch single members of a large remote zip by HTTP range requests, without downloading it.

Datasets on Zenodo, Figshare and similar hosts often ship as one multi-GB zip, while an
experiment needs a few members. Reading the zip's central directory (at the end of the
file) and then one range per member fetched 1 GB of a 55 GB LibriWASN release in minutes
(research/capture-sync, 2026-11-13). That project's hand-written reader, made shared, with
CRC checks, resumable output and a plain error for hosts that ignore Range.

    python3 research/_shared/remote_zip.py list URL [--match REGEX]
    python3 research/_shared/remote_zip.py get URL OUTDIR [--match REGEX] [--threads 8]

`--match` is a Python regex searched in each member name (e.g. 'Pixel7_.*\\.wav$').
`get` skips members already in OUTDIR at the right size, writes `<name>.part` then renames,
checks each member's CRC-32, and refuses names that would escape OUTDIR. Stored and
deflated members are supported (the two zip methods datasets use); others are reported.
The host must answer `Range:` with 206: `list` says so plainly if it does not.

From Python:

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_shared"))
    from remote_zip import members, fetch
    for info in members(url, r"speaker\\.csv$"):
        fetch(url, info, out_dir)

Stdlib only. Probe the host first in cloud sessions: many data hosts 403 through the proxy.
"""
import argparse
import io
import os
import re
import struct
import sys
import urllib.request
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "remote-zip/1 (research data fetch)"}


class RangeError(RuntimeError):
    pass


def _open(url, start=None, end=None, timeout=120):
    headers = dict(UA)
    if start is not None:
        headers["Range"] = f"bytes={start}-{'' if end is None else end}"
    r = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout)
    if start is not None and r.status != 206:
        r.close()
        raise RangeError(f"{url}: asked for a byte range, got HTTP {r.status} (host ignores Range)")
    return r


def size_of(url):
    """Total size in bytes, from a one-byte range request's Content-Range (works where HEAD is refused)."""
    with _open(url, 0, 0, timeout=60) as r:
        cr = r.headers.get("Content-Range", "")
    m = re.search(r"/(\d+)\s*$", cr)
    if not m:
        raise RangeError(f"{url}: no total size in Content-Range {cr!r}")
    return int(m.group(1))


class HTTPFile(io.RawIOBase):
    """Read-only, seekable file over HTTP range requests: enough for zipfile to read the directory."""

    def __init__(self, url, size=None):
        self.url, self.pos = url, 0
        self.size = size if size is not None else size_of(url)

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def readinto(self, buf):
        if self.pos >= self.size or len(buf) == 0:
            return 0
        end = min(self.size, self.pos + len(buf)) - 1
        with _open(self.url, self.pos, end) as r:
            d = r.read()
        buf[:len(d)] = d
        self.pos += len(d)
        return len(d)


def members(url, match=None):
    """ZipInfo for every file member (directories left out) whose name matches the regex `match`."""
    pat = re.compile(match) if match else None
    with zipfile.ZipFile(io.BufferedReader(HTTPFile(url), buffer_size=1 << 20)) as z:
        infos = z.infolist()
    return [i for i in infos if not i.is_dir() and (pat is None or pat.search(i.filename))]


def _target(out, name):
    root = os.path.realpath(out)
    dst = os.path.realpath(os.path.join(root, name))
    if os.path.commonpath([root, dst]) != root:
        raise ValueError(f"member {name!r} would be written outside {out}")
    return dst


def fetch(url, info, out, log=print):
    """Fetch one member into out/<name>; returns the path. Skips a file already there at full size."""
    dst = _target(out, info.filename)
    if os.path.exists(dst) and os.path.getsize(dst) == info.file_size:
        return dst
    if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
        raise ValueError(f"{info.filename}: compression method {info.compress_type} not supported")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    h = info.header_offset
    with _open(url, h, h + 29) as r:
        head = r.read()
    if head[:4] != b"PK\x03\x04":
        raise ValueError(f"{info.filename}: no local file header at offset {h}")
    n, m = struct.unpack("<HH", head[26:30])  # local header's own name and extra-field lengths
    start = h + 30 + n + m
    dec = zlib.decompressobj(-15) if info.compress_type == zipfile.ZIP_DEFLATED else None
    crc, size = 0, 0
    with open(dst + ".part", "wb") as g:
        if info.compress_size:
            with _open(url, start, start + info.compress_size - 1, timeout=600) as r:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    d = dec.decompress(b) if dec else b
                    g.write(d)
                    crc, size = zlib.crc32(d, crc), size + len(d)
        if dec:
            d = dec.flush()
            g.write(d)
            crc, size = zlib.crc32(d, crc), size + len(d)
    if size != info.file_size or crc != info.CRC:
        os.remove(dst + ".part")
        raise ValueError(f"{info.filename}: got {size} bytes crc {crc:08x}, "
                         f"expected {info.file_size} crc {info.CRC:08x}")
    os.replace(dst + ".part", dst)
    log(f"got {info.filename} ({size} bytes)")
    return dst


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    ls = sub.add_parser("list", help="print matching members with sizes")
    ls.add_argument("url")
    ls.add_argument("--match")
    g = sub.add_parser("get", help="fetch matching members into OUTDIR")
    g.add_argument("url")
    g.add_argument("out")
    g.add_argument("--match")
    g.add_argument("--threads", type=int, default=8)
    a = ap.parse_args(argv)
    try:
        infos = members(a.url, a.match)
    except (RangeError, zipfile.BadZipFile, OSError) as e:
        print(f"remote_zip: {e}", file=sys.stderr)
        return 2
    if a.cmd == "list":
        for i in infos:
            print(f"{i.file_size:>14}  {i.compress_size:>14}  {i.filename}")
        total = sum(i.compress_size for i in infos)
        print(f"{len(infos)} member(s), {total / 1e9:.3f} GB to fetch")
        return 0
    failed = 0
    with ThreadPoolExecutor(max(1, a.threads)) as ex:
        futs = {ex.submit(fetch, a.url, i, a.out, lambda s: print(s, flush=True)): i for i in infos}
        for f, i in futs.items():
            try:
                f.result()
            except Exception as e:  # report every failure, then exit 1
                failed += 1
                print(f"FAILED {i.filename}: {e}", file=sys.stderr, flush=True)
    print(f"DONE {len(infos) - failed}/{len(infos)}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
