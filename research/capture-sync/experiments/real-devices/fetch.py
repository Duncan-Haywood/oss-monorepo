"""Download only the five smartphone channels (and speaker.csv) of LibriWASN subsets from Zenodo
(CC BY 4.0, doi:10.5281/zenodo.10952434), by HTTP range requests into the 4.4-4.8 GB zips: about 1 GB
for 200_0S plus 800_0S, a few minutes with 8 threads.

    python experiments/real-devices/fetch.py <out dir> 200_0S 800_0S
"""
import io
import os
import re
import struct
import sys
import urllib.request
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor

RECORD = "https://zenodo.org/api/records/10952434/files/LibriWASN_{}.zip/content"
PHONE = re.compile(r"/(Xiaomi|Pixel7|Pixel6a|Pixel6b|Nexus)_[^/]*\.wav$")


class HTTPFile(io.RawIOBase):
    """Read-only, seekable file over HTTP range requests (enough for zipfile to read the directory)."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        r = urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60)
        self.size = int(r.headers["Content-Length"])

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
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        d = urllib.request.urlopen(req, timeout=120).read()
        buf[:len(d)] = d
        self.pos += len(d)
        return len(d)


def members(url):
    z = zipfile.ZipFile(io.BufferedReader(HTTPFile(url), buffer_size=1 << 20))
    return [i for i in z.infolist() if PHONE.search(i.filename) or i.filename.endswith("speaker.csv")]


def get(out, url, info):
    dst = os.path.join(out, info.filename)
    if os.path.exists(dst) and os.path.getsize(dst) == info.file_size:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    h = info.header_offset
    head = urllib.request.urlopen(urllib.request.Request(url, headers={"Range": f"bytes={h}-{h + 29}"}),
                                  timeout=120).read()
    n, m = struct.unpack("<HH", head[26:30])  # local header: file name and extra field lengths
    start = h + 30 + n + m
    r = urllib.request.urlopen(urllib.request.Request(
        url, headers={"Range": f"bytes={start}-{start + info.compress_size - 1}"}), timeout=600)
    dec = zlib.decompressobj(-15) if info.compress_type == zipfile.ZIP_DEFLATED else None
    with open(dst + ".part", "wb") as g:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            g.write(dec.decompress(b) if dec else b)
        if dec:
            g.write(dec.flush())
    assert os.path.getsize(dst + ".part") == info.file_size, info.filename
    os.replace(dst + ".part", dst)
    print("got", info.filename, flush=True)


def main():
    out = sys.argv[1]
    jobs = [(RECORD.format(sub), i) for sub in sys.argv[2:] for i in members(RECORD.format(sub))]
    with ThreadPoolExecutor(8) as ex:
        for f in [ex.submit(get, out, u, i) for u, i in jobs]:
            f.result()
    print("DONE")


if __name__ == "__main__":
    main()
