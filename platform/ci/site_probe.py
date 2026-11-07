#!/usr/bin/env python3
"""Time the live site with no retries, keep the history, and summarise it.

The owner, 2026-11-06: "Lots of downtimes and painfully slow load speeds".
`verify-live.sh` retries every request up to five times and times nothing,
and `check_site_fresh.py` reads build age, so neither can see a site that
fails one request in twenty or answers in three seconds. This does: each
probe is one fresh connection per path (DNS, TCP, TLS, then the request, as
a first visit pays them), one attempt, timed in phases, and appended as one
JSON line per path to a history file.

    python3 platform/ci/site_probe.py probe [--out FILE] [--rounds N --interval S]
    python3 platform/ci/site_probe.py report FILE [--hours H]

`probe` prints each result and appends it to FILE when given; it exits 0
even when the site is down, since a probe's job is to record that. `report`
prints availability and p50/p95/max per path over the window. The paths
cover both Workers: `/writing/` and `/research/` run `router.mjs` and the
shard Worker (`platform/pages/cloudflare/README.md`), the rest are plain
static assets, so a failure that hits only one group points at the Worker
request budget (`site-perf-worker-budget` in `portfolio/work/tasks.yaml`).

Standard library only, so it runs on a bare runner. It honours HTTPS_PROXY
(CONNECT tunnel) and SSL_CERT_FILE, and sends its own User-Agent:
Cloudflare's browser integrity check answers 403 (error 1010) to Python's
default one.
"""
import argparse
import http.client
import json
import math
import os
import random
import socket
import ssl
import sys
import time
import zlib
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

SITE = "https://marisstella.app"
# (path, group). "shard" paths run router.mjs and the shard Worker; "static"
# paths are served from assets without running code.
PATHS = [
    ("/", "static"),
    ("/wall-framing-takeoff/", "static"),
    ("/pf-site.css", "static"),
    ("/version.json", "static"),
    ("/writing/", "shard"),
    ("/writing/what-a-tack-costs/", "shard"),
    ("/research/", "shard"),
    ("/research/marine-hull/", "shard"),
]
USER_AGENT = "marisstella-site-probe/1 (+https://github.com/duncan-haywood/oss-monorepo)"
TIMEOUT = 20.0
# A page this slow to its last byte counts as a miss for availability: it is
# up in the sense of a status code, down in the sense of a person waiting.
SLOW_SECONDS = 3.0


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def _proxy_for(host):
    """(proxy host, port) from HTTPS_PROXY unless NO_PROXY covers host."""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if not proxy:
        return None
    for entry in (os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or "").split(","):
        entry = entry.strip().lstrip("*").lstrip(".")
        if entry and (host == entry or host.endswith("." + entry)):
            return None
    p = urlsplit(proxy if "://" in proxy else "http://" + proxy)
    return p.hostname, p.port or 80


def probe_one(base, path, group="static", timeout=TIMEOUT, ctx=None, clock=time.perf_counter):
    """One request on a fresh connection, no retries. Returns a result dict.

    Phases (seconds from the start): `connect` (TCP to the server, or to the
    proxy), `tls` (handshake done), `ttfb` (status line and headers read),
    `total` (body read). Through a proxy the connect phase includes the
    proxy's own connection, so compare like with like.
    """
    u = urlsplit(base)
    host, port = u.hostname, u.port or 443
    rec = {"t": _now_iso(), "path": path, "group": group, "status": None,
           "connect": None, "tls": None, "ttfb": None, "total": None,
           "bytes": None, "cache": None, "ray": None, "error": None}
    ctx = ctx or ssl.create_default_context()
    start = clock()
    sock = None
    try:
        proxy = _proxy_for(host)
        if proxy:
            sock = socket.create_connection(proxy, timeout=timeout)
            sock.sendall(f"CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n".encode())
            head = b""
            while b"\r\n\r\n" not in head:
                chunk = sock.recv(4096)
                if not chunk:
                    raise OSError("proxy closed the tunnel")
                head += chunk
            line = head.split(b"\r\n", 1)[0].decode("latin-1")
            if " 200" not in line:
                raise OSError(f"proxy refused the tunnel: {line}")
        else:
            sock = socket.create_connection((host, port), timeout=timeout)
        rec["connect"] = round(clock() - start, 4)
        sock = ctx.wrap_socket(sock, server_hostname=host)
        rec["tls"] = round(clock() - start, 4)
        conn = http.client.HTTPSConnection(host, port, timeout=timeout, context=ctx)
        conn.sock = sock
        conn.request("GET", path, headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Accept-Encoding": "gzip",
            "Cache-Control": "no-cache",
            "Connection": "close",
        })
        resp = conn.getresponse()
        rec["ttfb"] = round(clock() - start, 4)
        body = resp.read()
        rec["total"] = round(clock() - start, 4)
        rec["status"] = resp.status
        rec["bytes"] = len(body)
        if resp.getheader("Content-Encoding", "") == "gzip":
            rec["bytes_raw"] = len(zlib.decompress(body, 16 + zlib.MAX_WBITS))
        if path.endswith("version.json") and resp.status == 200:
            # Which build answered, so a failure can be lined up with a deploy.
            try:
                text = body if resp.getheader("Content-Encoding", "") != "gzip" else zlib.decompress(body, 16 + zlib.MAX_WBITS)
                rec["sha"] = str(json.loads(text).get("sha", ""))[:12] or None
            except (ValueError, zlib.error):
                pass
        rec["cache"] = resp.getheader("cf-cache-status")
        rec["ray"] = resp.getheader("cf-ray")
        if resp.status >= 400:
            # Cloudflare's own errors (1027 Worker limit, 1010 integrity
            # check, 52x origin) name themselves in the first bytes.
            rec["error"] = body[:120].decode("utf-8", "replace").strip()
        conn.close()
    except (OSError, ssl.SSLError, http.client.HTTPException) as e:
        rec["error"] = f"{type(e).__name__}: {e}"[:200]
        rec["total"] = round(clock() - start, 4)
    finally:
        if sock is not None:
            try:
                sock.close()
            except OSError:
                pass
    return rec


def is_ok(rec, slow=SLOW_SECONDS):
    """Up for a person: 2xx or 3xx, and the whole body inside `slow` seconds."""
    s = rec.get("status")
    return s is not None and 200 <= s < 400 and (rec.get("total") or 0) <= slow


def percentile(values, q):
    """Nearest-rank percentile; None for no values."""
    if not values:
        return None
    v = sorted(values)
    k = max(0, min(len(v) - 1, math.ceil(q / 100 * len(v)) - 1))
    return v[k]


def summarise(records, since=None, slow=SLOW_SECONDS):
    """Per path: n, ok share, errors by kind, p50/p95/max of ttfb and total."""
    rows = {}
    for r in records:
        if since and r.get("t", "") < since:
            continue
        rows.setdefault((r.get("group", "?"), r["path"]), []).append(r)
    out = []
    for (group, path), rs in sorted(rows.items()):
        ok = sum(1 for r in rs if is_ok(r, slow))
        kinds = {}
        for r in rs:
            if r.get("status") is None:
                k = (r.get("error") or "no status").split(":")[0]
            elif r["status"] >= 400:
                k = f"HTTP {r['status']}"
            elif (r.get("total") or 0) > slow:
                k = f"over {slow:g} s"
            else:
                continue
            kinds[k] = kinds.get(k, 0) + 1
        ttfb = [r["ttfb"] for r in rs if r.get("ttfb") is not None]
        total = [r["total"] for r in rs if r.get("status") is not None]
        miss = sum(1 for r in rs if (r.get("cache") or "").upper() in ("MISS", "EXPIRED", "DYNAMIC"))
        out.append({
            "group": group, "path": path, "n": len(rs), "ok": ok,
            "availability": ok / len(rs), "failures": kinds,
            "ttfb_p50": percentile(ttfb, 50), "ttfb_p95": percentile(ttfb, 95),
            "total_p50": percentile(total, 50), "total_p95": percentile(total, 95),
            "total_max": max(total) if total else None,
            "cache_miss_share": miss / len(rs),
        })
    return out


def _fmt(x):
    return "   -  " if x is None else f"{x * 1000:6.0f}"


def render(summary):
    lines = [f"{'path':32} {'grp':6} {'n':>4} {'avail':>7} {'ttfb50':>6} {'ttfb95':>6} "
             f"{'tot50':>6} {'tot95':>6} {'max':>6} {'miss':>5}  failures (ms columns)"]
    for s in summary:
        fails = ", ".join(f"{k} x{v}" for k, v in sorted(s["failures"].items())) or "-"
        lines.append(f"{s['path'][:32]:32} {s['group']:6} {s['n']:4} {s['availability']:7.1%} "
                     f"{_fmt(s['ttfb_p50'])} {_fmt(s['ttfb_p95'])} {_fmt(s['total_p50'])} "
                     f"{_fmt(s['total_p95'])} {_fmt(s['total_max'])} {s['cache_miss_share']:5.0%}  {fails}")
    n = sum(s["n"] for s in summary)
    ok = sum(s["ok"] for s in summary)
    if n:
        lines.append(f"all paths: {ok}/{n} ok ({ok / n:.2%})")
    return "\n".join(lines)


def read_history(path):
    recs = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    recs.append(json.loads(line))
                except ValueError:
                    continue
    return recs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe", help="probe every path once per round")
    p.add_argument("--url", default=SITE)
    p.add_argument("--out", help="append JSON lines here")
    p.add_argument("--rounds", type=int, default=1)
    p.add_argument("--interval", type=float, default=60.0, help="seconds between rounds")
    p.add_argument("--quiet", action="store_true")
    r = sub.add_parser("report", help="summarise a history file")
    r.add_argument("file")
    r.add_argument("--hours", type=float, help="only the last H hours")
    r.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    if a.cmd == "probe":
        ctx = ssl.create_default_context()
        for i in range(a.rounds):
            t0 = time.monotonic()
            # Shuffled: the first connection of a round pays any warm-up (DNS,
            # a proxy's own connection), which in a fixed order always lands
            # on the same path and made `/` look 2.5x slower than it is.
            order = random.sample(PATHS, len(PATHS))
            batch = [probe_one(a.url, path, group, ctx=ctx) for path, group in order]
            if a.out:
                with open(a.out, "a", encoding="utf-8") as f:
                    for rec in batch:
                        f.write(json.dumps(rec, sort_keys=True) + "\n")
            if not a.quiet:
                for rec in batch:
                    ms = lambda k: "-" if rec[k] is None else f"{rec[k] * 1000:.0f}ms"
                    print(f"{rec['t']} {rec['status'] or 'ERR'} ttfb={ms('ttfb')} total={ms('total')} "
                          f"cache={rec['cache']} {rec['path']}"
                          + (f"  {rec['error']}" if rec["error"] else ""), flush=True)
            if i + 1 < a.rounds:
                time.sleep(max(0.0, a.interval - (time.monotonic() - t0)))
        return 0

    recs = read_history(a.file)
    since = None
    if a.hours:
        since = (datetime.now(timezone.utc) - timedelta(hours=a.hours)).strftime("%Y-%m-%dT%H:%M:%S")
    s = summarise(recs, since=since)
    print(json.dumps(s, indent=2) if a.json else render(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())
