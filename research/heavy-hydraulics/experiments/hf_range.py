"""Read the small arrays of a remote HDF5 file by HTTP range requests (milestone 5y).

The excavator-motion files are 1 to 5 GB because they carry camera and elevation images; the
pressure, joint-angle and timestamp arrays are a few MB. h5py reads a seekable file object, so a
range-request reader with a 1 MB block cache fetches only the blocks the small arrays live in.
"""
import io
import os
import urllib.request

import numpy as np


class HTTPFile(io.RawIOBase):
    BS = 1 << 20

    def __init__(self, url):
        self.pos, self.cache, self.fetched = 0, {}, 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            self.size, self.url = int(r.headers["Content-Length"]), r.url

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def _block(self, b):
        if b not in self.cache:
            lo = b * self.BS
            hi = min(self.size, lo + self.BS) - 1
            req = urllib.request.Request(self.url, headers={"Range": f"bytes={lo}-{hi}"})
            for k in range(4):
                try:
                    with urllib.request.urlopen(req, timeout=120) as r:
                        self.cache[b] = r.read()
                    break
                except OSError:
                    if k == 3:
                        raise
            self.fetched += len(self.cache[b])
        return self.cache[b]

    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0:
            return 0
        out, p = bytearray(), self.pos
        while len(out) < n:
            b = p // self.BS
            blk = self._block(b)
            take = blk[p - b * self.BS:p - b * self.BS + n - len(out)]
            out += take
            p += len(take)
        buf[:n] = out
        self.pos += n
        return n


REPO = "https://huggingface.co/datasets/fuxi-robot/excavator-motion"


def list_files(folder):
    import json
    with urllib.request.urlopen(f"https://huggingface.co/api/datasets/fuxi-robot/excavator-motion/tree/main/data/{folder}",
                                timeout=60) as r:
        return sorted(x["path"] for x in json.load(r))


def small_arrays(path, cache):
    """Every non-image dataset of one file, cached as .npz under `cache` (outside the repository)."""
    import h5py
    os.makedirs(cache, exist_ok=True)
    out = os.path.join(cache, path.replace("/", "_").rsplit(".", 1)[0] + ".npz")
    if not os.path.exists(out):
        h = h5py.File(HTTPFile(f"{REPO}/resolve/main/{path}"), "r")
        d = {}
        h.visititems(lambda n, o: d.__setitem__(n.replace("/", "__"), o[()])
                     if isinstance(o, h5py.Dataset) and "images" not in n else None)
        np.savez(out, **d)
    return dict(np.load(out))
