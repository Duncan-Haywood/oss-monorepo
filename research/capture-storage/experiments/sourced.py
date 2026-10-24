"""Re-runs the storage model on sourced figures and measures checksum speed. Writes experiments/sourced_results.txt.

    PYTHONPATH=src python experiments/sourced.py     (about 10 s; the hash timings vary a few percent per run)
Stdlib only.
"""
import hashlib
import os
import time
import zlib
from pathlib import Path
from capture_storage import model
from capture_storage.sourced import PARAMS, sourced_set, use, hash_limited_readers

HERE = Path(__file__).resolve().parent
out = []
P = out.append
CAMS4 = ["360 camera", "action camera", "phone telephoto", "mirrorless body"]

P("== A. parameters (value, source, status)")
for k, (v, unit, src, status) in PARAMS.items():
    P("%-24s %-10s %-8s %s | %s" % (k, v if not isinstance(v, dict) else "3 sizes", status, unit, src))

P("")
P("== B. headline rig (4 cameras, 4 h/day, 7 days, 2 SSD copies, 1 h evening limit): assumed vs sourced figures")
P("figures                          day_GB  cards_only_g  plan_g readers offload_h  1-reader-1-copy_h")
rows = [("assumed (model.py)", None),
        ("sourced, reader at 90 MB/s", sourced_set(90.0)),
        ("sourced, UHS-I ceiling 104", sourced_set(104.0)),
        ("sourced, UHS-II ceiling 312", sourced_set(312.0)),
        ("sourced, UHS-I, mirrorless full SD", sourced_set(104.0, full_sd=True))]
for name, fig in rows:
    def run():
        co = model.cards_only(CAMS4, 4, 7)
        of = model.offload(CAMS4, 4, 7)
        one = model.offload_hours(CAMS4, 4)
        P("%-32s %6.0f  %12.2f  %6.1f %7d %9.2f  %17.2f" % (name, model.day_gb(CAMS4, 4), co.grams,
          of.grams, of.readers, of.offload_h, one))
    if fig is None:
        run()
    else:
        with use(fig):
            run()

P("")
P("== C. does 'offload time, not card weight, binds' survive the reader speed? (sourced figures, 1 h limit)")
P("reader_MB/s  min_readers_for_1h_x2copies  plan_g  battery_g/h  card_g/h(action cam)")
for r in (45, 90, 104, 156, 312):
    with use(sourced_set(float(r))):
        of = model.offload(CAMS4, 4, 7)
        bat = model.battery_g_per_hour("action camera")
        card = model.storage_g_per_hour("action camera")
        P("%11d  %27s  %6s  %11.1f  %20.3f" % (r, of.readers if of else "none within 8",
          "%.0f" % of.grams if of else "-", bat, card))

P("")
P("== D. checksum throughput on this container (%s cores, one thread per hash)" % os.cpu_count())
with open("/proc/cpuinfo") as f:
    cpu = next((l.split(":", 1)[1].strip() for l in f if l.startswith("model name")), "unknown")
P("cpu: %s; python hashlib (OpenSSL), 256 MiB buffer in 1 MiB chunks, best of 3" % cpu)
buf = os.urandom(1 << 20)
N = 256


def rate(update):
    best = 0.0
    for _ in range(3):
        t = time.perf_counter()
        for _ in range(N):
            update(buf)
        best = max(best, N * len(buf) / 1e6 / (time.perf_counter() - t))
    return best


hash_mbs = {}
for name in ("md5", "sha1", "sha256", "sha512", "blake2b"):
    h = hashlib.new(name)
    hash_mbs[name] = rate(h.update)
crc = [0]
hash_mbs["crc32"] = rate(lambda b: crc.__setitem__(0, zlib.crc32(b, crc[0])))
P("algorithm   MB/s   readers_one_core_can_feed_at_104MB/s   at_312MB/s")
for name, v in hash_mbs.items():
    P("%-10s %6.0f   %36.1f %12.1f" % (name, v, hash_limited_readers(v, 104.0), hash_limited_readers(v, 312.0)))

P("")
P("== E. checksum cost added to the evening for the sourced 4-camera rig (UHS-I ceiling, 1 reader, 1 copy)")
with use(sourced_set(104.0)):
    day = model.day_gb(CAMS4, 4)
    copy_h = model.offload_hours(CAMS4, 4)
P("one day = %.0f GB; copy alone %.2f h" % (day, copy_h))
P("scheme                                   extra_h  total_h")
s = hash_mbs["sha256"]
# hashing inline while the bytes pass costs nothing extra if the hasher is faster than the reader.
P("%-40s %7.2f  %7.2f" % ("hash while copying (sha256, 1 core)", max(0.0, day * 1000 / min(s, 104.0) / 3600 - copy_h), max(copy_h, day * 1000 / s / 3600)))
# a separate verify pass re-reads the SSD copy at its own speed, assumed 400 MB/s here.
P("%-40s %7.2f  %7.2f" % ("re-read SSD copy afterwards at 400 MB/s*", day * 1000 / min(s, 400.0) / 3600, copy_h + day * 1000 / min(s, 400.0) / 3600))
P("%-40s %7.2f  %7.2f" % ("re-read the cards too (104 MB/s)", day * 1000 / 104.0 / 3600, 2 * copy_h))
P("* 400 MB/s is an assumed SSD read rate (no spec text was reachable); the result is hash-bound or SSD-bound, whichever is lower.")

(HERE / "sourced_results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
