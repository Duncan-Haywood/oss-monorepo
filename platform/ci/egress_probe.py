#!/usr/bin/env python3
"""Probe, in parallel, which outbound hosts this session's proxy lets through.

Cloud sessions run behind a per-environment allow-list, so whether irs.gov or
ecfr.gov answers changes from one session to the next. Runs kept probing the
same official hosts by hand, one curl at a time, and rediscovering the same
fallbacks (seven doc_friction reports on 2026-11-25 alone). This does it in
one call, about 15 s:

    python3 platform/ci/egress_probe.py                 # every host in egress_hosts.json
    python3 platform/ci/egress_probe.py ecfr irs        # hosts whose name contains a word
    python3 platform/ci/egress_probe.py https://example.org/path   # any URL
    python3 platform/ci/egress_probe.py --json

Each line says "ok" (the site answered; its HTTP status follows), "blocked"
(the proxy refused the tunnel: not the site's answer), or "no answer"
(timeout or DNS). For a blocked host with a known fallback in
egress_hosts.json, the fallback is printed and probed too. Uses curl, so the
proxy and CA bundle are picked up the way every other tool here picks them up.
Exit code is always 0: a blocked host is information, not a failure.
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REGISTRY = os.path.join(HERE, "egress_hosts.json")


def load_registry(path=REGISTRY):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["hosts"]


def url_for(entry):
    return entry.get("url") or "https://%s/" % entry["host"]


def classify(returncode, code, stderr):
    """Turn one curl result into (state, detail)."""
    if returncode == 0 and code and code != "000":
        return "ok", code
    err = (stderr or "").strip().splitlines()
    last = err[-1] if err else "curl exit %s" % returncode
    if "CONNECT tunnel failed" in last:
        return "blocked", "proxy refused the tunnel"
    if returncode == 28:
        return "no answer", "timeout"
    if returncode == 6:
        return "no answer", "DNS"
    return "no answer", last[:80]


def curl_probe(url, timeout=15):
    cmd = ["curl", "-sS", "-o", "/dev/null", "--compressed", "-r", "0-1023",
           "-m", str(timeout), "-w", "%{http_code}", url]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 5)
    except (OSError, subprocess.TimeoutExpired) as e:
        return "no answer", type(e).__name__
    return classify(p.returncode, p.stdout.strip(), p.stderr)


def select(entries, words):
    """Registry entries matching any word, plus ad-hoc entries for URLs."""
    if not words:
        return list(entries)
    out = []
    for w in words:
        if "://" in w:
            out.append({"host": w.split("://", 1)[1].split("/", 1)[0], "url": w, "what": "(given)"})
            continue
        hits = [e for e in entries if w.lower() in e["host"].lower()]
        if hits:
            out.extend(h for h in hits if h not in out)
        else:
            out.append({"host": w, "what": "(not in egress_hosts.json)"})
    return out


def run(entries, probe=curl_probe, workers=16):
    urls = []
    for e in entries:
        urls.append(url_for(e))
        if e.get("fallback_probe"):
            urls.append(e["fallback_probe"])
    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = dict(zip(urls, ex.map(probe, urls)))
    rows = []
    for e in entries:
        state, detail = results[url_for(e)]
        row = {"host": e["host"], "what": e.get("what", ""), "state": state, "detail": detail}
        if state != "ok" and e.get("fallback"):
            row["fallback"] = e["fallback"]
            if e.get("fallback_probe"):
                row["fallback_state"] = "%s (%s)" % results[e["fallback_probe"]]
            if e.get("source"):
                row["source"] = e["source"]
        rows.append(row)
    return rows


def render(rows):
    w = max([len(r["host"]) for r in rows] + [4])
    lines = []
    for r in rows:
        lines.append("%-9s %-*s %-26s %s" % (r["state"], w, r["host"], r["detail"], r["what"]))
        if "fallback" in r:
            lines.append("          -> fallback: %s" % r["fallback"])
            if "fallback_state" in r:
                lines.append("             fallback probe now: %s" % r["fallback_state"])
            if "source" in r:
                lines.append("             recorded in: %s" % r["source"])
    blocked = sum(r["state"] != "ok" for r in rows)
    lines.append("")
    lines.append("%d of %d reachable. A blocked host is the proxy's answer, not the site's: "
                 "say which figure could not be checked; never cite from memory." % (len(rows) - blocked, len(rows)))
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("hosts", nargs="*", help="words matched against registry hosts, or full URLs")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--timeout", type=int, default=15)
    a = ap.parse_args(argv)
    rows = run(select(load_registry(), a.hosts), probe=lambda u: curl_probe(u, a.timeout))
    print(json.dumps(rows, indent=1) if a.json else render(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
