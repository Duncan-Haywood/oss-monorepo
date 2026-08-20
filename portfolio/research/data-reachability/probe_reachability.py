#!/usr/bin/env python3
"""Probe which candidate input feeds this environment can actually fetch.

Prior passes (#232, #240, #250) tested feeds by their canonical host — the
API endpoint or the human-facing website — and marked a feed unreachable when
that host was denied. #250 found one counter-example (npm advisory data is
reachable as bulk/git distribution even though the OSV API is denied) but
treated it as a one-off correction.

This script tests the generalisation: for each feed, probe *every distribution
channel it publishes*, not just the canonical one. A feed counts as reachable
if any channel carrying the same data answers.

Read-only. Issues GET/HEAD to public endpoints only. No credentials, no writes,
no personal data. Run:  python3 probe_reachability.py > results-<date>.json
"""

import json
import sys
import urllib.error
import urllib.request

TIMEOUT = 25

# (feed, channel-kind, url, which candidate depends on it)
PROBES = [
    # --- vulnerability / advisory data (cra-evidence-desk, mcp-supply-chain-watch)
    ("osv", "canonical API", "https://api.osv.dev/v1/vulns/GHSA-4342-x723-ch2f", "cra-evidence-desk"),
    ("osv", "bulk object store", "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip", "cra-evidence-desk"),
    ("nvd", "canonical API", "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1", "cra-evidence-desk"),
    ("cisa-kev", "canonical site", "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", "cra-evidence-desk"),
    ("cisa-kev", "git mirror", "https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json", "cra-evidence-desk"),
    ("epss", "canonical download", "https://epss.empiricalsecurity.com/epss_scores-current.csv.gz", "cra-evidence-desk"),
    ("euvd", "canonical API", "https://euvd.enisa.europa.eu/api/lastvulnerabilities", "cra-evidence-desk"),
    ("npm-advisories", "registry bulk", "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", "cra-evidence-desk"),
    ("npm-registry", "registry API", "https://registry.npmjs.org/next", "mcp-supply-chain-watch"),

    # --- accessibility rule data (eaa-remediation-pipeline, shopify-a11y-evidence)
    ("wcag", "canonical site", "https://www.w3.org/TR/WCAG21/", "eaa-remediation-pipeline"),
    ("wcag", "git mirror", "https://raw.githubusercontent.com/w3c/wcag/main/README.md", "eaa-remediation-pipeline"),
    ("axe-core", "git mirror", "https://raw.githubusercontent.com/dequelabs/axe-core/develop/package.json", "shopify-a11y-evidence"),

    # --- primary legal sources (the pipeline's own graduation gate, issue #139 §2c)
    ("eur-lex", "canonical site", "https://eur-lex.europa.eu/", "graduation gate"),
    ("ec.europa.eu", "canonical site", "https://ec.europa.eu/", "graduation gate"),
    ("eu-publications", "canonical site", "https://publications.europa.eu/", "graduation gate"),
    ("eu-open-data", "bulk portal", "https://data.europa.eu/", "graduation gate"),
    ("federal-register", "canonical site", "https://www.federalregister.gov/", "graduation gate"),
    ("ted", "canonical site", "https://ted.europa.eu/", "tender-radar"),

    # --- demand measurement channel (Ask 7)
    ("wordpress.org", "canonical API", "https://api.wordpress.org/plugins/info/1.2/", "Ask 7"),

    # --- controls: characterise the policy shape rather than assume it
    ("control", "generic website", "https://example.com", "control"),
    ("control", "github HTML", "https://github.com/github/advisory-database", "control"),
    ("control", "github API", "https://api.github.com/rate_limit", "control"),
    ("control", "github raw", "https://raw.githubusercontent.com/github/advisory-database/main/README.md", "control"),
    ("control", "github codeload", "https://codeload.github.com/w3c/wcag/tar.gz/refs/heads/main", "control"),
    ("control", "gcs root", "https://storage.googleapis.com/", "control"),
    ("control", "s3 root", "https://s3.amazonaws.com/", "control"),
    ("control", "gitlab", "https://gitlab.com/", "control"),
    ("control", "huggingface", "https://huggingface.co/", "control"),
]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Do not follow redirects: we are measuring whether *this* host answers.

    Following them conflates the probed host with its redirect target — an
    early version of this script reported s3.amazonaws.com and gitlab.com as
    unreachable when in fact both answered with a redirect to a host that is
    itself denied.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def probe(url):
    """Return (status, note). status 0 means the CONNECT never completed."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "portfolio-reachability-probe"})
    try:
        with _OPENER.open(req, timeout=TIMEOUT) as r:
            return r.status, r.headers.get("Last-Modified") or ""
    except urllib.error.HTTPError as e:
        # An HTTP error is still an *answer* — the host was reached.
        if e.code == 405:  # HEAD not allowed; retry as GET for a byte
            try:
                g = urllib.request.Request(url, headers={"Range": "bytes=0-64", "User-Agent": "portfolio-reachability-probe"})
                with _OPENER.open(g, timeout=TIMEOUT) as r:
                    return r.status, "GET fallback"
            except Exception as e2:
                return getattr(e2, "code", 0), f"GET fallback: {e2}"
        return e.code, str(e.reason)
    except Exception as e:
        return 0, str(e)


def main():
    out = []
    for feed, kind, url, dependent in PROBES:
        status, note = probe(url)
        # 0 = blocked at CONNECT (proxy policy denial); 403 from the proxy is
        # also a denial, but 403 from an origin is not — see README.md.
        out.append({
            "feed": feed,
            "channel": kind,
            "url": url,
            "needed_by": dependent,
            "status": status,
            "note": note,
            "reached": status != 0,
        })
        print(f"{feed:16} {kind:20} {status:>4}  {url}", file=sys.stderr)
    json.dump(out, sys.stdout, indent=2)
    print(file=sys.stdout)


if __name__ == "__main__":
    main()
