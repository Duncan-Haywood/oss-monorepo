#!/usr/bin/env python3
"""Measure the free-substitute supply behind each pipeline candidate's core functions.

Context
-------
Four of the eight candidates in ``portfolio/pipeline/`` justify their
``defensibility`` score with a prose assertion that free substitutes already
exist:

* ``cra-evidence-desk``      -- "SBOM generation is commodity and partly open source"
* ``einvoice-preflight``     -- "Open-source validators exist for most of these formats"
* ``shopify-a11y-evidence``  -- "The scan is commodity and the category is crowded"
* ``agent-permission-harness`` -- "free tooling sets the anchor at zero"

None of those four claims has ever been measured, and the other four candidates
make no claim either way -- which is not the same as having checked. The claim
is load-bearing: ``defensibility`` is what
``portfolio/pipeline/rescore-2026-08-20.md`` records as falling on every
candidate anyone has actually measured, for the same reason both times ("the
named durable asset turns out to be public / already available").

Question
--------
For each core function a candidate's product performs, does a **live,
widely-adopted, free** implementation of that function already exist as an
installable package?

This is deliberately not "is there a competitor". A competing business is a
market fact this environment cannot observe. A free package with six figures of
monthly installs is an observable fact about the *price floor* the candidate
would be selling above, and it is exactly what the four prose claims above
assert without measuring.

Method
------
npm's search API (``registry.npmjs.org/-/v1/search``) returns, per package,
monthly download counts, keywords, description and last-updated date -- enough
to characterise a function's substitute supply with one request per query and no
per-package fetches.

Each candidate is decomposed into **core functions** taken from the wording of
its own write-up, and each function carries a query plus a relevance rule.

Three filters define what counts, and they matter more than the statistics:

* **Relevance is a two-tier AND-of-ORs, not the search ranking.** npm's
  ``searchScore`` happily returns anything whose README mentions the words. A
  package counts for a function only if:

  - every **domain** group matches the package's own ``name`` or ``keywords``
    -- not its description, because a description is marketing prose and
    mentioning a standard is not implementing it; and
  - every **action** group matches anywhere in name, keywords or description.

  Matching is on **whole tokens**, not substrings. The first version of this
  script matched substrings and reported ``jest`` as a free substitute for an
  agent evaluation harness and ``helmet`` as one for prompt-injection testing,
  because ``"ai"`` occurs inside ``"domain"`` and ``"agent"`` inside
  ``"user-agent"``. Every headline number in an earlier draft of this study was
  wrong for that reason. Tokens are split on non-alphanumerics, and a
  hyphenated term such as ``prompt-injection`` is matched as an adjacent token
  pair.

  The rule is stated per function below so a reviewer can disagree with a
  specific group rather than with the number, and every counted package is
  saved in the results file so the classification can be audited rather than
  trusted.

* **Live only.** A package whose last publish predates the recency window is not
  a substitute a buyer would adopt today; unmaintained packages in these
  categories still carry install traffic from pinned lockfiles and CI.

* **Adopted only.** The adoption threshold is 10,000 monthly downloads.
  ``portfolio/research/free-listing-demand/`` measured the median monthly
  downloads of a *leaf* listing in three of these same categories at 68, 205 and
  2,399. 10,000 is well above the top of that range, so a package clearing it is
  not a cold listing -- it is something people actually install.

  Because that threshold is the one judgement call that could carry the result,
  the summary reports each function's substitute count at 1k, 10k and 100k so
  the finding can be read at a threshold the reader picks rather than the one
  this script picked.

* **Leaf/library packages are NOT filtered out here**, unlike in
  ``free-listing-demand``. That study asked what a new *listing* earns, where a
  transitively-installed library's count measures its parents' popularity. This
  study asks whether a free implementation of a function exists and is used, and
  a library pulled in by a framework is still a free implementation the buyer
  already has. The dependents count is recorded per package so a reader can
  re-derive the leaf-only view from the saved results.

Known limits, stated because they bound the conclusion
------------------------------------------------------
* **One ecosystem.** npm is the only reachable registry that publishes download
  counts in a search response (crates.io publishes them but covers a different
  ecosystem; PyPI publishes none at all -- ``pypistats.org`` is egress-denied
  from this environment). For the two accessibility candidates npm is the
  *right* ecosystem -- the buyer's site is JavaScript. For ``einvoice-preflight``
  (a Java/.NET market) and ``tender-radar`` (no software ecosystem at all) npm
  **understates** substitute supply, so a low count there is not evidence of
  scarcity. Per-function ``ecosystem_fit`` records which case each function is.

* **Absence is weak evidence; presence is strong evidence.** Finding a 1.9M/month
  free SBOM generator settles that SBOM generation is commodity. Finding nothing
  for tender monitoring settles nothing, because npm is not where that software
  would live.

* This measures the *function*, not the *product*. Every candidate in the
  pipeline sells a service wrapped around its functions -- a record, a
  monitoring feed, a contractor step. A commodity function does not make the
  service unsellable; it makes the service the *entire* sale, which is a
  materially different business than the write-up describes.

Usage
-----
    python3 probe_substitutes.py --json results-2026-08-20.json
    python3 probe_substitutes.py --recompute-from results-2026-08-20.json

Read-only. Standard library only. No credentials, no writes to any remote, no
spend.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

SEARCH_URL = "https://registry.npmjs.org/-/v1/search"
USER_AGENT = (
    "monorepo-projects-portfolio-research/1.0 "
    "(+https://github.com/Duncan-Haywood/monorepo-projects)"
)
PAGE_SIZE = 250

# Adoption thresholds in monthly downloads. The middle one is the headline; the
# other two exist so the finding can be read at a threshold the reader chooses.
THRESHOLDS = (1_000, 10_000, 100_000)
HEADLINE_THRESHOLD = 10_000

# A package is "live" if it published within this many days of the run date.
LIVE_WINDOW_DAYS = 548  # 18 months

# ``ecosystem_fit`` values, and what a low count means for each:
#   native      -- npm is where this software lives; a low count is real evidence
#   partial     -- npm holds some of it; a low count is weak evidence
#   foreign     -- this software lives elsewhere; a low count is NO evidence
FIT_NATIVE, FIT_PARTIAL, FIT_FOREIGN = "native", "partial", "foreign"


def fn(name, query, domain, action, fit, note):
    return {
        "function": name,
        "query": query,
        "domain_groups": domain,    # must match in name or keywords
        "action_groups": action,    # may match in name, keywords or description
        "ecosystem_fit": fit,
        "note": note,
    }


# Each candidate's core functions, taken from the wording of its own write-up in
# portfolio/pipeline/candidates/. ``require_groups`` is an AND of ORs over the
# package's own name + description + keywords.
CANDIDATES = {
    "eaa-remediation-pipeline": [
        fn(
            "wcag-audit",
            "wcag accessibility audit",
            [["wcag", "a11y", "accessibility", "aria", "axe"]],
            [["audit", "scan", "test", "check", "lint", "report", "validator"]],
            FIT_NATIVE,
            "The write-up scores ai_leverage 8 on 'audit and prioritisation are model work "
            "against a well-specified standard'. This asks whether the audit half is already free.",
        ),
        fn(
            "a11y-fix-generation",
            "accessibility automatic fix remediation",
            [["wcag", "a11y", "accessibility", "aria"]],
            [["fix", "remediation", "autofix", "repair"]],
            FIT_NATIVE,
            "The 'AI-generated theme fixes' half of the deliverable.",
        ),
    ],
    "shopify-a11y-evidence": [
        fn(
            "storefront-a11y-scan",
            "shopify theme accessibility",
            [["shopify", "liquid", "storefront"], ["wcag", "a11y", "accessibility", "aria"]],
            [],
            FIT_NATIVE,
            "The write-up already asserts 'the scan is commodity and the category is crowded' "
            "(defensibility 4). This measures the Shopify-specific slice of that.",
        ),
    ],
    "cra-evidence-desk": [
        fn(
            "sbom-generation",
            "sbom cyclonedx spdx generate",
            [["sbom", "cyclonedx", "spdx", "bill-of-materials", "bom"]],
            [["generate", "create", "build", "produce", "export", "cli", "tool", "plugin", "generator"]],
            FIT_NATIVE,
            "Directly tests the write-up's 'SBOM generation is commodity and partly open source'.",
        ),
        fn(
            "advisory-matching",
            "vulnerability audit dependencies advisory",
            [["vulnerability", "vulnerabilities", "advisory", "advisories", "cve", "cvss"]],
            [["audit", "scan", "check", "monitor", "detect", "match"]],
            FIT_NATIVE,
            "The 'EU vulnerability-database matching' half, minus the EUVD mapping that is "
            "egress-denied (see research/data-reachability/).",
        ),
        fn(
            "vex-attestation",
            "vex provenance slsa in-toto supply chain",
            [["vex", "provenance", "in-toto", "slsa"], ["supply-chain", "supply", "sbom", "cyclonedx", "spdx", "attestation", "attestations", "vulnerability"]],
            [],
            FIT_PARTIAL,
            "The part of the technical file that is not SBOM. Domain requires a supply-chain "
            "attestation term AND a supply-chain context term, so device/crypto attestation "
            "(Android key attestation, iOS App Attest) does not count. Thinner on npm than in Go.",
        ),
    ],
    "mcp-supply-chain-watch": [
        fn(
            "mcp-tool-introspection",
            "mcp model context protocol server tools",
            [["mcp", "model-context-protocol", "modelcontextprotocol"]],
            [["inspect", "inspector", "tools", "client", "list", "schema", "registry", "server"]],
            FIT_NATIVE,
            "Reading a server's declared tool surface -- the input step of the product.",
        ),
        fn(
            "change-monitoring",
            "monitor changes diff notify alert",
            [["monitor", "watch", "watcher", "diff"]],
            [["change", "changes", "alert", "notify", "diff", "watch"]],
            FIT_NATIVE,
            "The generic diff-and-alert engine. research/mcp-archive-defensibility/ already "
            "refuted the archive mitigation; this asks whether the mechanism is free too.",
        ),
    ],
    "agent-permission-harness": [
        fn(
            "prompt-injection-testing",
            "prompt injection jailbreak llm security",
            [["prompt-injection", "jailbreak", "prompt", "llm-security"]],
            [["injection", "attack", "red-team", "redteam", "adversarial", "guard", "test"]],
            FIT_NATIVE,
            "Directly tests the write-up's 'free tooling sets the anchor at zero' "
            "(distribution 4).",
        ),
        fn(
            "agent-eval-harness",
            "llm evaluation harness agent testing",
            [["llm", "agent", "genai", "prompt"], ["eval", "evals", "evaluation", "benchmark", "harness"]],
            [],
            FIT_NATIVE,
            "The regression-suite mechanism the candidate proposes to sell. Requires an "
            "LLM/agent domain term AND an eval term in name or keywords -- so a generic "
            "test runner (jest) does not count.",
        ),
    ],
    "einvoice-preflight": [
        fn(
            "einvoice-validation",
            "invoice validation ubl xrechnung facturx peppol",
            [["invoice", "ubl", "xrechnung", "facturx", "factur-x", "peppol", "zugferd", "en16931", "e-invoice", "einvoice"]],
            [["valid", "validate", "validator", "check", "schema", "schematron", "parse", "verify"]],
            FIT_FOREIGN,
            "npm is NOT this market's ecosystem -- the reference validators are Java "
            "(Schematron/Mustang) and .NET. A low count here is not evidence of scarcity.",
        ),
    ],
    "tender-radar": [
        fn(
            "tender-monitoring",
            "tender procurement notices contracts",
            [["tender", "procurement", "ted", "contracts-finder"]],
            [["notice", "monitor", "search", "api", "client", "feed"]],
            FIT_FOREIGN,
            "No software ecosystem for this exists on npm. Recorded for completeness only.",
        ),
    ],
    "public-record-watch": [
        fn(
            "register-change-monitor",
            "website change detection monitor scrape",
            # Two required domain terms so a device-detection library that
            # happens to keyword 'crawler' does not count as a change-monitor.
            [["change-detection", "changedetection", "change", "changes", "diff"],
             ["website", "webpage", "web-page", "scrape", "scraper", "crawl", "crawler", "rss", "monitor", "monitoring"]],
            [["monitor", "watch", "detect", "track", "change", "changes", "diff", "poll", "polling"]],
            FIT_NATIVE,
            "The polling-and-diffing engine for a fetched document, not a filesystem watcher "
            "or an APM: the domain term must be web/scrape/feed. The registers themselves are "
            "egress-denied from here (research/runtime-data-reachability/), the mechanism is not.",
        ),
    ],
}


def http_get_json(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def search(query):
    """One npm search request. Returns the raw objects list.

    Raises on any failure. This environment denies egress in three signatures
    (see research/egress-reachability/), two of which are ordinary-looking 403s,
    so the caller records the exception text rather than a status code.
    """
    url = f"{SEARCH_URL}?{urllib.parse.urlencode({'text': query, 'size': PAGE_SIZE})}"
    return http_get_json(url).get("objects", [])


def tokenize(text):
    """Whole-token set: split on non-alphanumerics, plus adjacent-token bigrams
    so a hyphenated term like 'prompt-injection' matches 'prompt injection'."""
    raw = [t for t in "".join(c if c.isalnum() else " " for c in text.lower()).split() if t]
    tokens = set(raw)
    tokens.update(f"{a} {b}" for a, b in zip(raw, raw[1:]))
    return tokens


def name_kw_tokens(pkg):
    parts = [pkg.get("name", "")]
    parts.extend(pkg.get("keywords") or [])
    return tokenize(" ".join(parts))


def full_tokens(pkg):
    return name_kw_tokens(pkg) | tokenize(pkg.get("description", "") or "")


def term_matches(term, tokens):
    """A term matches if it (or, for a hyphenated term, its space-joined form) is
    a whole token / bigram in the set."""
    t = term.lower()
    return t in tokens or t.replace("-", " ") in tokens


def group_matches(group, tokens):
    return any(term_matches(term, tokens) for term in group)


def relevant(pkg, spec):
    """Two-tier AND-of-ORs on whole tokens:

    * every domain group must match in name or keywords (not description), and
    * every action group must match anywhere (name, keywords or description).
    """
    nk = name_kw_tokens(pkg)
    full = full_tokens(pkg)
    if not all(group_matches(g, nk) for g in spec["domain_groups"]):
        return False
    return all(group_matches(g, full) for g in spec["action_groups"])


def collect(spec, now):
    """Search one function and classify its hits. Returns the per-function record."""
    try:
        objects = search(spec["query"])
        error = None
    except Exception as exc:  # noqa: BLE001 -- the text is the measurement
        objects, error = [], f"{type(exc).__name__}: {exc}"

    cutoff = now - timedelta(days=LIVE_WINDOW_DAYS)
    hits = []
    for obj in objects:
        pkg = obj.get("package", {})
        if not relevant(pkg, spec):
            continue
        updated_raw = obj.get("updated") or pkg.get("date") or ""
        try:
            updated = datetime.fromisoformat(updated_raw.replace("Z", "+00:00"))
        except ValueError:
            updated = None
        monthly = int((obj.get("downloads") or {}).get("monthly") or 0)
        try:
            dependents = int(obj.get("dependents") or 0)
        except (TypeError, ValueError):
            dependents = 0
        hits.append(
            {
                "name": pkg.get("name"),
                "description": (pkg.get("description") or "")[:200],
                "monthly_downloads": monthly,
                "dependents": dependents,
                "updated": updated_raw,
                "live": bool(updated and updated >= cutoff),
            }
        )

    hits.sort(key=lambda h: h["monthly_downloads"], reverse=True)
    live = [h for h in hits if h["live"]]
    return {
        **{k: spec[k] for k in ("function", "query", "domain_groups", "action_groups", "ecosystem_fit", "note")},
        "error": error,
        "returned_by_search": len(objects),
        "relevant": len(hits),
        "relevant_live": len(live),
        "substitutes_at_threshold": {
            str(t): sum(1 for h in live if h["monthly_downloads"] >= t) for t in THRESHOLDS
        },
        "top_live": live[:8],
    }


def measure(now):
    results = {}
    for candidate, specs in CANDIDATES.items():
        print(f"  {candidate}", file=sys.stderr)
        results[candidate] = []
        for spec in specs:
            print(f"    - {spec['function']}", file=sys.stderr)
            results[candidate].append(collect(spec, now))
    return {
        "measured_at": now.isoformat(),
        "source": SEARCH_URL,
        "page_size": PAGE_SIZE,
        "live_window_days": LIVE_WINDOW_DAYS,
        "thresholds": list(THRESHOLDS),
        "headline_threshold": HEADLINE_THRESHOLD,
        "candidates": results,
    }


def verdict(record):
    """One of: commoditised / contested / no-evidence / not-measurable-here."""
    if record["error"]:
        return "not-measurable-here"
    n = record["substitutes_at_threshold"][str(HEADLINE_THRESHOLD)]
    if n == 0:
        # Absence is only evidence where npm is the right ecosystem.
        return "no-substitute-found" if record["ecosystem_fit"] == FIT_NATIVE else "not-measurable-here"
    return "commoditised" if n >= 3 else "contested"


def summarise(data):
    hl = str(data["headline_threshold"])
    print()
    print(f"Free-substitute supply, npm, measured {data['measured_at'][:10]}")
    print(f"Adoption threshold: {data['headline_threshold']:,}/month, published within "
          f"{data['live_window_days']} days.")
    print()
    header = f"{'candidate / function':<46}{'rel':>5}{'live':>6}{'>=1k':>6}{'>=10k':>7}{'>=100k':>8}  {'top free substitute':<34}{'top/mo':>10}  verdict"
    print(header)
    print("-" * len(header))
    for candidate, records in data["candidates"].items():
        print(candidate)
        for r in records:
            top = r["top_live"][0] if r["top_live"] else None
            counts = r["substitutes_at_threshold"]
            print(
                f"  {r['function']:<44}"
                f"{r['relevant']:>5}{r['relevant_live']:>6}"
                f"{counts['1000']:>6}{counts['10000']:>7}{counts['100000']:>8}  "
                f"{(top['name'] if top else '-'):<34}"
                f"{(top['monthly_downloads'] if top else 0):>10,}  "
                f"{verdict(r)}"
                + ("" if r["ecosystem_fit"] == FIT_NATIVE else f"  [{r['ecosystem_fit']}]")
            )
    print()
    print("verdicts: commoditised = 3+ live free packages over the threshold; contested = 1-2;")
    print("          no-substitute-found = 0 and npm is the right ecosystem;")
    print("          not-measurable-here = 0 but npm is not where this software lives, or the query errored.")
    print()

    native = [r for recs in data["candidates"].values() for r in recs if r["ecosystem_fit"] == FIT_NATIVE and not r["error"]]
    com = [r for r in native if verdict(r) == "commoditised"]
    print(f"Of {len(native)} functions measurable on npm, {len(com)} are commoditised "
          f"({100 * len(com) / len(native):.0f}%).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", metavar="PATH", help="write raw results here")
    ap.add_argument("--recompute-from", metavar="PATH", help="re-derive the summary from saved results, no network")
    args = ap.parse_args()

    if args.recompute_from:
        with open(args.recompute_from, encoding="utf-8") as fh:
            data = json.load(fh)
    else:
        print("Probing npm search (read-only, no credentials)...", file=sys.stderr)
        data = measure(datetime.now(timezone.utc))
        if args.json:
            with open(args.json, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=1, sort_keys=False)
            print(f"wrote {args.json}", file=sys.stderr)

    summarise(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
