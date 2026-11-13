"""remote_zip against a local HTTP server that honours Range, and one that does not."""
import http.server
import io
import os
import re
import tempfile
import threading
import unittest
import zipfile

import remote_zip

# Local test server: keep urllib off any egress proxy the environment sets.
os.environ["no_proxy"] = os.environ["NO_PROXY"] = "127.0.0.1,localhost"


def _server(blob, ranges=True):
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            m = re.match(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            if ranges and m:
                a = int(m.group(1))
                b = int(m.group(2)) if m.group(2) else len(blob) - 1
                b = min(b, len(blob) - 1)
                body = blob[a:b + 1]
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {a}-{b}/{len(blob)}")
            else:
                body = blob
                self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/data.zip"


def _zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, (data, method) in files.items():
            z.writestr(zipfile.ZipInfo(name), data, compress_type=method)
        z.writestr(zipfile.ZipInfo("dir/"), b"")
    return buf.getvalue()


FILES = {
    "set/a/Pixel7_1.wav": (os.urandom(300_000), zipfile.ZIP_STORED),
    "set/a/speaker.csv": (b"id,name\n" * 5000, zipfile.ZIP_DEFLATED),
    "set/b/Nexus_1.wav": (b"\x00" * 200_000, zipfile.ZIP_DEFLATED),
    "set/b/empty.txt": (b"", zipfile.ZIP_DEFLATED),
}


class RemoteZipTest(unittest.TestCase):
    def setUp(self):
        self.srv, self.url = _server(_zip(FILES))
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.tmp.cleanup()

    def test_members_filters_and_skips_dirs(self):
        names = [i.filename for i in remote_zip.members(self.url)]
        self.assertEqual(sorted(names), sorted(FILES))
        wav = [i.filename for i in remote_zip.members(self.url, r"\.wav$")]
        self.assertEqual(sorted(wav), ["set/a/Pixel7_1.wav", "set/b/Nexus_1.wav"])

    def test_get_writes_every_member_byte_exact_and_resumes(self):
        self.assertEqual(remote_zip.main(["get", self.url, self.tmp.name, "--threads", "3"]), 0)
        for name, (data, _) in FILES.items():
            with open(os.path.join(self.tmp.name, name), "rb") as f:
                self.assertEqual(f.read(), data, name)
        logs = []
        for i in remote_zip.members(self.url):
            remote_zip.fetch(self.url, i, self.tmp.name, log=logs.append)
        self.assertEqual(logs, [])  # all present at full size: nothing re-fetched

    def test_crc_mismatch_is_refused_and_leaves_no_file(self):
        info = remote_zip.members(self.url, "speaker")[0]
        info.CRC ^= 1
        with self.assertRaises(ValueError):
            remote_zip.fetch(self.url, info, self.tmp.name, log=lambda s: None)
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, "set/a/speaker.csv")))
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, "set/a/speaker.csv.part")))

    def test_name_escaping_outdir_is_refused(self):
        info = remote_zip.members(self.url, "speaker")[0]
        info.filename = "../../evil.csv"
        with self.assertRaises(ValueError):
            remote_zip.fetch(self.url, info, self.tmp.name)

    def test_host_without_range_support_fails_plainly(self):
        srv, url = _server(_zip(FILES), ranges=False)
        try:
            with self.assertRaises(remote_zip.RangeError):
                remote_zip.members(url)
            self.assertEqual(remote_zip.main(["list", url]), 2)
        finally:
            srv.shutdown()
            srv.server_close()


if __name__ == "__main__":
    unittest.main()
