#!/usr/bin/env python3
"""Measure whether each pipeline candidate's *runtime data feed* is reachable
from an agent session in this environment.

Prior reachability work (#166, #177) asked "can we publish to a channel?".
#232/#139 s2c asked "can we read the primary legal source to verify a claim?".
This asks a third question neither covers: can the product's own input data be
fetched at all? A business whose feed is unreachable cannot be built or tested
here, regardless of how it scores on the pipeline's eight dimensions.

Two outcomes are distinguished, and the distinction is the whole measurement:

  origin_answered  - any HTTP status came back from the host itself. The host is
                     permitted by the egress gateway. A 401/403/404 here is an
                     origin-side answer (auth, user-agent, bad path), NOT a
                     network denial.
  proxy_denied     - curl exit 56 / "CONNECT tunnel failed, response 403", i.e.
                     the gateway refused to open the tunnel. The host is not
                     permitted and no credential can change that from here.
  scope_denied     - the host answered, but the session's GitHub proxy refused
                     the path because sessions are bound to their configured
                     repositories. Reachable host, unreachable data.

Run: python3 probe_reachability.py [--json results.json]
No credentials, no account, no spend. Read-only GETs.
"""

import argparse
import json
import subprocess

# A descriptive User-Agent matters: crates.io answers 403 to curl's default UA,
# which reads identically to a policy denial if you only look at the status code.
UA = "monorepo-portfolio-research/1.0 (reachability probe; read-only)"
TIMEOUT = 15

TARGETS = [
    # (candidate, host label, url, what the candidate needs it for)
    ("control", "generic public web", "https://example.com",
     "control: is non-registry web reachable at all?"),
    ("control", "generic public web (2)", "https://www.wikipedia.org",
     "control: arbitrary-host fetch, the shape an a11y scanner needs"),

    ("mcp-supply-chain-watch", "npm registry",
     "https://registry.npmjs.org/-/v1/search?text=mcp&size=1",
     "server manifests + version history (the monitored population)"),
    ("mcp-supply-chain-watch", "PyPI", "https://pypi.org/pypi/requests/json",
     "Python-packaged MCP servers"),
    ("mcp-supply-chain-watch", "GitHub API", "https://api.github.com/rate_limit",
     "source repos behind each server, for tool-description diffs"),

    ("cra-evidence-desk", "GitHub API", "https://api.github.com/rate_limit",
     "dependency manifests for SBOM generation"),
    ("cra-evidence-desk", "GitHub advisories",
     "https://api.github.com/advisories?per_page=1",
     "the vulnerability half of the CRA evidence record"),
    ("cra-evidence-desk", "OSV.dev", "https://api.osv.dev/v1/query",
     "cross-ecosystem vulnerability feed"),
    ("cra-evidence-desk", "NVD (NIST)",
     "https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1",
     "CVE records of record"),

    ("eaa-remediation-pipeline", "arbitrary customer site",
     "https://www.gov.uk",
     "the customer's own pages: the thing being scanned"),
    ("eaa-remediation-pipeline", "W3C WCAG 2.2", "https://www.w3.org/TR/WCAG22/",
     "the success criteria the evidence is written against"),
    ("eaa-remediation-pipeline", "ETSI EN 301 549",
     "https://www.etsi.org/deliver/etsi_en/301500_301599/301549/",
     "the EU harmonised standard the EAA points at"),

    ("shopify-a11y-evidence", "Shopify dev docs",
     "https://shopify.dev/docs/apps/launch", "app requirements + Admin API docs"),
    ("shopify-a11y-evidence", "merchant storefront", "https://www.shopify.com",
     "a storefront page, the thing being scanned"),

    ("public-record-watch", "CourtListener API",
     "https://www.courtlistener.com/api/rest/v4/",
     "docket/filing feed for the watched vertical"),

    ("tender-radar", "TED (EU tenders)", "https://ted.europa.eu/en/",
     "the tender notices being matched"),
    ("tender-radar", "SAM.gov", "https://api.sam.gov/opportunities/v2/search",
     "US federal opportunity feed"),

    ("einvoice-preflight", "Peppol BIS spec",
     "https://docs.peppol.eu/poacc/billing/3.0/",
     "the validation rules being preflighted against"),

    ("graduation gate (#139 s2c)", "EUR-Lex",
     "https://eur-lex.europa.eu/homepage.html",
     "EAA/CRA obligation dates, per pipeline/README.md's own standard"),
    ("graduation gate (#139 s2c)", "Federal Register",
     "https://www.federalregister.gov/api/v1/documents.json?per_page=1",
     "US rulemaking dates"),

    ("publish channels (#166/#177)", "crates.io",
     "https://crates.io/api/v1/crates?q=cli&per_page=1", "publish + demand signal"),
    ("publish channels (#166/#177)", "RubyGems",
     "https://rubygems.org/api/v1/gems/rails.json", "publish + demand signal"),
    ("publish channels (#166/#177)", "Packagist",
     "https://repo.packagist.org/p2/symfony/console.json",
     "publish + demand signal"),
    ("publish channels (#166/#177)", "WordPress.org (Ask 7)",
     "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information"
     "&request[slug]=akismet",
     "active_installs, the one business-buyer demand signal"),
]


def probe(url):
    """Return (verdict, detail). Never raises."""
    # -g (globoff): some URLs contain [] query params curl would treat as ranges.
    proc = subprocess.run(
        ["curl", "-sS", "-g", "-w", "\n%{http_code}",
         "-A", UA, "--max-time", str(TIMEOUT), url],
        capture_output=True, text=True,
    )
    stderr = proc.stderr.strip()
    if "CONNECT tunnel failed" in stderr or proc.returncode == 56:
        return "proxy_denied", "gateway refused CONNECT (403)"
    if proc.returncode != 0:
        return "error", stderr or f"curl exit {proc.returncode}"
    body, _, status = proc.stdout.rpartition("\n")
    status = status.strip()
    if "sessions are bound to their configured repositories" in body:
        return "scope_denied", f"HTTP {status} (GitHub proxy: repo-scoped)"
    return "origin_answered", f"HTTP {status}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write results to this path")
    args = ap.parse_args()

    results = []
    for candidate, host, url, need in TARGETS:
        verdict, detail = probe(url)
        results.append({
            "candidate": candidate, "host": host, "url": url,
            "needed_for": need, "verdict": verdict, "detail": detail,
        })
        print(f"{verdict:<16} {detail:<24} {candidate:<28} {host}")

    denied = sum(r["verdict"] == "proxy_denied" for r in results)
    print(f"\n{len(results)} probed / {denied} denied by egress policy")

    if args.json:
        with open(args.json, "w") as fh:
            json.dump({"targets": results}, fh, indent=2)
        print(f"wrote {args.json}")


if __name__ == "__main__":
    main()
