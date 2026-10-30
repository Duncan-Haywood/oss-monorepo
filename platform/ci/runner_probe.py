#!/usr/bin/env python3
"""Measure the machine this session runs on: specs plus quick benchmarks.

Prints one JSON object (or a table with --table). Standard library only, so a
bare python3 in a cloud session runs it. The benchmarks take about a minute.

    python3 platform/ci/runner_probe.py --table
    python3 platform/ci/runner_probe.py --json-out docs/reports/data/runner-probe/<id>.json

Written for the Claude Code cloud runner (a Firecracker microVM, see
docs/reports/claude-code-runner-resources.md), but it runs on any Linux box.
"""
import argparse
import hashlib
import json
import multiprocessing as mp
import os
import platform
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request


# (family, model) -> name, for the Intel parts seen so far behind the runner.
INTEL_MODELS = {
    ("6", "85"): "Skylake-SP / Cascade Lake (stepping 7 = Cascade Lake)",
    ("6", "106"): "Ice Lake-SP",
    ("6", "143"): "Sapphire Rapids",
    ("6", "207"): "Emerald Rapids",
    ("6", "173"): "Granite Rapids",
}


def _read(path, default=""):
    try:
        with open(path) as fh:
            return fh.read().strip()
    except OSError:
        return default


def _sh(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""


def _bash_mem_limit():
    """Memory limit of this process's cgroup (v1 or v2), or None if unlimited."""
    for line in _read("/proc/self/cgroup").splitlines():
        _, ctrl, path = line.split(":", 2)
        for f in (f"/sys/fs/cgroup/memory{path}/memory.limit_in_bytes", f"/sys/fs/cgroup{path}/memory.max"):
            if ("memory" in ctrl.split(",") or ctrl == "") and os.path.exists(f):
                v = _read(f)
                if v.isdigit() and int(v) < 1 << 60:
                    return int(v)
    return None


def specs():
    cpuinfo = _read("/proc/cpuinfo")
    model = re.search(r"model name\s*:\s*(.+)", cpuinfo)
    flags = re.search(r"flags\s*:\s*(.+)", cpuinfo)
    flags = set(flags.group(1).split()) if flags else set()
    mhz = re.search(r"cpu MHz\s*:\s*([\d.]+)", cpuinfo)
    meminfo = dict(
        (k, int(v.split()[0])) for k, v in (line.split(":", 1) for line in _read("/proc/meminfo").splitlines())
    )
    root = shutil.disk_usage("/")
    cmdline = _read("/proc/cmdline")
    lscpu = _sh("lscpu")

    def lscpu_field(name):
        m = re.search(rf"^{name}:\s*(.+)$", lscpu, re.M)
        return m.group(1).strip() if m else None

    gpu = _sh("ls /dev/nvidia* 2>/dev/null; lspci 2>/dev/null | grep -i -E 'vga|3d|nvidia'")
    return {
        "hostname": socket.gethostname(),
        "kernel": platform.release(),
        "hypervisor": lscpu_field("Hypervisor vendor"),
        "firecracker": "--firecracker-init" in cmdline,
        "cpu_model": model.group(1) if model else None,
        "cpu_mhz_reported": float(mhz.group(1)) if mhz else None,
        "cpu_family_model_stepping": [lscpu_field("CPU family"), lscpu_field("Model"), lscpu_field("Stepping")],
        "vcpus": os.cpu_count(),
        "threads_per_core": lscpu_field(r"Thread\(s\) per core"),
        "l2": lscpu_field("L2 cache"),
        "l3": lscpu_field("L3 cache"),
        "avx2": "avx2" in flags,
        "avx512f": "avx512f" in flags,
        "avx512_vnni": "avx512_vnni" in flags,
        "amx": any(f.startswith("amx") for f in flags),
        # SHA-NI makes hashlib.sha256 ~5x faster, so the hash benchmark is
        # only comparable between hosts that agree on this flag.
        "sha_ni": "sha_ni" in flags,
        "cpu_generation_guess": INTEL_MODELS.get((lscpu_field("CPU family"), lscpu_field("Model"))),
        "mem_total_gib": round(meminfo.get("MemTotal", 0) / 2**20, 2),
        "mem_available_gib": round(meminfo.get("MemAvailable", 0) / 2**20, 2),
        "process_cgroup_mem_limit_gib": round(_bash_mem_limit() / 2**30, 2) if _bash_mem_limit() else None,
        "swap_gib": round(meminfo.get("SwapTotal", 0) / 2**20, 2),
        "shm_gib": round(shutil.disk_usage("/dev/shm").total / 2**30, 1) if os.path.exists("/dev/shm") else None,
        "root_fs_size_gib": round(root.total / 2**30, 1),
        "root_fs_used_gib": round(root.used / 2**30, 1),
        "root_fs_avail_gib": round(root.free / 2**30, 1),
        "gpu": gpu or None,
        "uptime_s": float(_read("/proc/uptime", "0 0").split()[0]),
        "loadavg": _read("/proc/loadavg"),
        "cpu_pressure": _read("/proc/pressure/cpu"),
        "python": platform.python_version(),
        "node": _sh("node --version") or None,
    }


def _spin(seconds):
    """Hash work for `seconds`; return MB hashed. Pure CPU, one core."""
    buf = os.urandom(1 << 20)
    end = time.perf_counter() + seconds
    n = 0
    while time.perf_counter() < end:
        hashlib.sha256(buf).digest()
        n += 1
    return n


def cpu_bench(seconds=4.0):
    single = _spin(seconds) / seconds
    out = {"sha256_mb_s_1core": round(single, 1)}
    for workers in sorted({2, os.cpu_count() or 1, 2 * (os.cpu_count() or 1)}):
        with mp.Pool(workers) as pool:
            total = sum(pool.map(_spin, [seconds] * workers)) / seconds
        out[f"sha256_mb_s_{workers}proc"] = round(total, 1)
        out[f"scaling_{workers}proc"] = round(total / single, 2)
    # Interpreter-bound loop: closer to what a test suite does than hashing.
    t = time.perf_counter()
    acc = 0
    for i in range(10_000_000):
        acc += i * i % 7
    out["py_loop_10m_s"] = round(time.perf_counter() - t, 2)
    return out


def mem_bench(size_mb=512):
    """First-touch versus warm memory speed.

    In a fresh Firecracker VM the guest's pages are backed lazily by the host,
    so the first write to each page costs a fault on both sides. The
    first-touch figure is what a fresh session feels when a process grows;
    the warm figure is the RAM itself.
    """
    out = {}
    t = time.perf_counter()
    src = bytearray(size_mb << 20)
    src[:: 4096] = b"\x01" * len(src[:: 4096])
    out["first_touch_gib_s"] = round(size_mb / 1024 / (time.perf_counter() - t), 2)
    dst = bytearray(size_mb << 20)
    dst[:] = src  # fault dst in before timing
    t = time.perf_counter()
    for _ in range(4):
        dst[:] = src
    out["warm_memcpy_gib_s"] = round(4 * size_mb / 1024 / (time.perf_counter() - t), 2)
    del dst, src
    # How much can one process actually allocate and touch? Stop at 70 % of
    # the smaller of MemAvailable and the cgroup limit: there is no swap, and
    # an earlier 85 % target was OOM-killed when a test suite ran alongside.
    avail = int(_read("/proc/meminfo").split("MemAvailable:")[1].split()[0]) * 1024
    limit = _bash_mem_limit()
    target = int(min(avail, limit or avail) * 0.7)
    chunks, got = [], 0
    t = time.perf_counter()
    try:
        while got < target:
            chunks.append(bytearray(256 << 20))
            got += 256 << 20
    except MemoryError:
        pass
    out["allocated_and_touched_gib"] = round(got / 2**30, 2)
    out["alloc_gib_s"] = round(got / 2**30 / (time.perf_counter() - t), 2)
    del chunks
    return out


def disk_bench(size_mb=1024):
    out = {}
    block = os.urandom(1 << 20)
    with tempfile.TemporaryDirectory(dir=os.path.expanduser("~")) as d:
        path = os.path.join(d, "probe.bin")
        t = time.perf_counter()
        with open(path, "wb") as fh:
            for _ in range(size_mb):
                fh.write(block)
            fh.flush()
            os.fsync(fh.fileno())
        out["seq_write_fsync_mb_s"] = round(size_mb / (time.perf_counter() - t), 1)
        try:
            fd = os.open(path, os.O_RDONLY)
            os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
            os.close(fd)
        except (AttributeError, OSError):
            pass
        t = time.perf_counter()
        with open(path, "rb") as fh:
            while fh.read(1 << 20):
                pass
        out["seq_read_mb_s"] = round(size_mb / (time.perf_counter() - t), 1)
        # Small synced writes: what git, npm and sqlite feel.
        small = os.path.join(d, "small.bin")
        n = 300
        t = time.perf_counter()
        fd = os.open(small, os.O_WRONLY | os.O_CREAT)
        for _ in range(n):
            os.write(fd, block[:4096])
            os.fsync(fd)
        os.close(fd)
        out["fsync_4k_per_s"] = round(n / (time.perf_counter() - t))
        # Many small files: what a node_modules install or a git checkout feels.
        t = time.perf_counter()
        for i in range(5000):
            with open(os.path.join(d, f"f{i}"), "wb") as fh:
                fh.write(block[:2048])
        out["create_small_files_per_s"] = round(5000 / (time.perf_counter() - t))
    return out


def net_bench():
    out = {}
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    out["https_proxy_set"] = bool(proxy)
    url = "https://registry.npmjs.org/react"
    try:
        lat = []
        for _ in range(3):
            t = time.perf_counter()
            with urllib.request.urlopen(url, timeout=20) as r:
                body = r.read()
            lat.append(time.perf_counter() - t)
        out["npm_registry_fetch_s_median"] = round(sorted(lat)[1], 3)
        out["npm_registry_body_kb"] = round(len(body) / 1024)
        out["npm_registry_mb_s"] = round(len(body) / 2**20 / min(lat), 1)
    except Exception as exc:  # network policy varies by environment
        out["npm_registry_error"] = f"{type(exc).__name__}: {exc}"[:200]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json-out", help="also write the JSON here")
    ap.add_argument("--table", action="store_true", help="print a readable table instead of JSON")
    ap.add_argument("--quick", action="store_true", help="specs only, no benchmarks")
    ap.add_argument("--label", default=None, help="free-text label stored in the result")
    args = ap.parse_args()

    result = {"label": args.label, "probed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    result["specs"] = specs()
    if not args.quick:
        result["cpu"] = cpu_bench()
        result["memory"] = mem_bench()
        result["disk"] = disk_bench()
        result["network"] = net_bench()

    text = json.dumps(result, indent=2)
    if args.json_out:
        os.makedirs(os.path.dirname(os.path.abspath(args.json_out)), exist_ok=True)
        with open(args.json_out, "w") as fh:
            fh.write(text + "\n")
    if args.table:
        for section, values in result.items():
            if isinstance(values, dict):
                print(f"[{section}]")
                for k, v in values.items():
                    print(f"  {k:32} {v}")
            else:
                print(f"{section:34} {values}")
    else:
        print(text)


if __name__ == "__main__":
    main()
