#!/usr/bin/env python3
"""Which vulnerability feeds can this environment actually reach?

Re-run this before trusting the reachability table in README.md — the egress
policy is the thing being measured, and it can change without notice.
"""
import subprocess

FEEDS = [
    # (label, url, method)
    ("npm bulk advisories (what `npm audit` uses)",
     "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", "POST"),
    ("GitHub Advisory DB over raw.githubusercontent",
     "https://raw.githubusercontent.com/github/advisory-database/main/README.md", "GET"),
    ("PyPA Advisory DB over raw.githubusercontent",
     "https://raw.githubusercontent.com/pypa/advisory-database/main/vulns/requests/PYSEC-2023-74.yaml", "GET"),
    ("GitHub API", "https://api.github.com/rate_limit", "GET"),
    ("PyPI JSON API", "https://pypi.org/pypi/requests/json", "GET"),
    # --- the ones this candidate's stated differentiator depends on ---
    ("EUVD (ENISA) — the candidate's wedge",
     "https://euvd.enisa.europa.eu/api/lastvulnerabilities", "GET"),
    ("ENISA site", "https://www.enisa.europa.eu", "GET"),
    ("NVD", "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1", "GET"),
    ("OSV.dev", "https://api.osv.dev/v1/query", "GET"),
    ("EPSS (FIRST.org)", "https://api.first.org/data/v1/epss?limit=1", "GET"),
    # control, per PR #232: a plain host proves the denial is policy, not the host
    ("CONTROL: example.com", "https://example.com", "GET"),
]

for label, url, method in FEEDS:
    cmd = ["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "20"]
    if method == "POST":
        cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", '{"lodash":["4.17.11"]}']
    cmd.append(url)
    code = subprocess.run(cmd, capture_output=True, text=True).stdout.strip() or "000"
    status = "OK " if code.startswith("2") else "DENIED"
    print(f"{status:7s} {code:>3s}  {label}")
