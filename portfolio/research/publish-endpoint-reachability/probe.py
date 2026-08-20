#!/usr/bin/env python3
"""Classify why an outbound host is unreachable, endpoint by endpoint.

Three outcomes that prior probes in this chain collapsed into "EGRESS_DENIED":

  BLOCKED_PROXY_CONNECT   the CONNECT tunnel is refused by the agent proxy
  BLOCKED_EGRESS_FILTER   host bypasses the proxy (noProxy) and is refused by
                          the network filter, which names the host and the fix
                          in an `x-deny-reason` header
  REACHED                 the origin answered; the status code is the origin's
                          own opinion (200/401/403/404/405/410), not a denial

The distinction decides whether a channel is blocked by policy the account
owner controls, by a missing credential, or by nothing at all.

Read-only. Sends no credentials, creates nothing, publishes nothing.

  python3 probe.py                     # probe live, write results.json
  python3 probe.py --recompute-from results.json   # re-derive summary offline
"""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results.json"

# crates.io returns 403 to requests without a descriptive User-Agent. That is
# its documented crawler policy, not a network denial -- see README.
UA = "monorepo-projects-reachability-probe (duncan.andrew.haywood@gmail.com)"

TARGETS = [
    # (channel, role, url)
    ("npm", "registry read", "https://registry.npmjs.org/"),
    ("npm", "auth/whoami", "https://registry.npmjs.org/-/whoami"),
    ("npm", "user API (publish auth path)", "https://registry.npmjs.org/-/npm/v1/user"),
    ("npm", "search API", "https://registry.npmjs.org/-/v1/search?text=mcp"),
    ("npm", "web signup", "https://www.npmjs.com/signup"),

    ("RubyGems", "site", "https://rubygems.org/"),
    ("RubyGems", "gem push endpoint", "https://rubygems.org/api/v1/gems"),
    ("RubyGems", "api_key endpoint", "https://rubygems.org/api/v1/api_key"),

    ("Packagist", "site", "https://packagist.org/"),
    ("Packagist", "package list API", "https://packagist.org/packages/list.json?vendor=symfony"),
    ("Packagist", "create-package API", "https://packagist.org/api/create-package"),

    ("crates.io", "sparse index", "https://index.crates.io/config.json"),
    ("crates.io", "crate read", "https://crates.io/api/v1/crates/serde"),
    ("crates.io", "publish endpoint", "https://crates.io/api/v1/crates/new"),

    ("Hex", "packages API", "https://hex.pm/api/packages"),
    ("Hex", "repo (tarball host)", "https://repo.hex.pm/"),

    ("PyPI", "index read", "https://pypi.org/simple/"),
    ("PyPI", "JSON API", "https://pypi.org/pypi/requests/json"),
    ("PyPI", "file host", "https://files.pythonhosted.org/"),
    ("PyPI", "upload endpoint", "https://upload.pypi.org/legacy/"),

    ("NuGet", "service index", "https://api.nuget.org/v3/index.json"),
    ("NuGet", "push endpoint", "https://www.nuget.org/api/v2/package"),

    ("Docker Hub", "repositories API", "https://hub.docker.com/v2/repositories/mcp/"),

    ("JSR", "site", "https://jsr.io/"),
    ("JSR", "API", "https://api.jsr.io/"),

    ("WordPress.org", "plugin directory", "https://wordpress.org/plugins/"),
    ("WordPress.org", "plugin SVN", "https://plugins.svn.wordpress.org/"),
    ("WordPress.org", "login", "https://login.wordpress.org/"),

    ("Open VSX", "site", "https://open-vsx.org/"),
    ("Open VSX", "API", "https://api.open-vsx.org/"),

    ("VS Code Marketplace", "site", "https://marketplace.visualstudio.com/"),

    ("GitHub", "API", "https://api.github.com/"),
]


def probe(url):
    """Return (verdict, http_code, detail) for one URL."""
    proc = subprocess.run(
        ["curl", "-sS", "-o", "-", "-D", "/dev/stderr", "-A", UA,
         "--max-time", "25", url],
        capture_output=True, text=True,
    )
    headers, body, stderr = proc.stderr, proc.stdout, proc.stderr

    if "CONNECT tunnel failed" in stderr:
        return "BLOCKED_PROXY_CONNECT", None, "agent proxy refused the CONNECT tunnel"

    deny = None
    for line in headers.splitlines():
        if line.lower().startswith("x-deny-reason:"):
            deny = line.split(":", 1)[1].strip()
    if deny:
        return "BLOCKED_EGRESS_FILTER", None, f"{deny}: {body.strip()[:120]}"

    code = None
    for line in headers.splitlines():
        if line.startswith("HTTP/"):
            parts = line.split()
            if len(parts) > 1 and parts[1].isdigit():
                code = int(parts[1])
    if code is None:
        return "NO_RESPONSE", None, f"curl rc={proc.returncode}"
    return "REACHED", code, body.strip()[:120]


def run():
    rows = []
    for channel, role, url in TARGETS:
        verdict, code, detail = probe(url)
        rows.append({"channel": channel, "role": role, "url": url,
                     "verdict": verdict, "http_code": code, "detail": detail})
        print(f"{url:<58} {verdict} {code or ''}", file=sys.stderr)
    RESULTS.write_text(json.dumps({"targets": rows}, indent=2) + "\n")
    return rows


def summarize(rows):
    by_verdict = {}
    for r in rows:
        by_verdict.setdefault(r["verdict"], []).append(r)
    print(f"{len(rows)} endpoints probed across "
          f"{len({r['channel'] for r in rows})} channels")
    for verdict in sorted(by_verdict):
        hosts = sorted({r["url"].split("/")[2] for r in by_verdict[verdict]})
        print(f"  {verdict:<24} {len(by_verdict[verdict]):>2} endpoints, "
              f"{len(hosts)} hosts: {', '.join(hosts)}")

    reachable_write = [r for r in rows
                       if r["verdict"] == "REACHED" and "endpoint" in r["role"]]
    print(f"\nwrite/publish endpoints reached by the origin: "
          f"{len(reachable_write)}")
    for r in reachable_write:
        print(f"  {r['channel']:<12} {r['http_code']} {r['url']}")


if __name__ == "__main__":
    if "--recompute-from" in sys.argv:
        path = Path(sys.argv[sys.argv.index("--recompute-from") + 1])
        summarize(json.loads(path.read_text())["targets"])
    else:
        summarize(run())
