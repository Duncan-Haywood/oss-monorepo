# CRA evidence desk

**Find affected software components and assemble a customer-reviewed Cyber Resilience Act incident draft in minutes.** Give it a customer-owned SBOM and advisory export; it makes only exact name/ecosystem/version matches and produces JSON evidence or a copyable Article 14 draft.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/cra-evidence-desk/

Two surfaces, same rules:

- **In a browser** — [`site/index.html`](site/index.html). Nothing is uploaded; the page reads the files locally. Best for answering one question quickly, and there is a built-in example so you can see what a finding looks like before handing it your dependency map.
- **On the command line** — for CI, or for very large SBOMs.

```sh
cd ventures/cra-evidence-desk
PYTHONPATH=src python3 -m cra_evidence_desk examples/sbom.cyclonedx.json examples/advisories.osv.json --product "Demo service" --version 2026.08 --format draft
PYTHONPATH=src python3 -m unittest discover -s . -p 'test_*.py' -v
(cd site && node --test)
```

The CLI is the canonical implementation. `site/parity.test.mjs` holds the browser port to it by reading the Python source as text, so the ecosystem table, the coverage boundary and the draft's wording cannot drift between them.

The tool never contacts an authority, files a notification, claims compliance, infers affected version ranges, or retains input content. It is deliberately a reporting-readiness evidence tool, not conformity assessment.

## Input formats

| Input | Accepted |
|---|---|
| SBOM | CycloneDX JSON (`npm sbom`, syft, cdxgen, trivy), SPDX JSON, or a plain `{"components": [{"ecosystem", "name", "version"}]}` list |
| Advisories | OSV JSON (a bare list, or wrapped in `vulns`), or a plain `[{"ecosystem", "name", "version", "id", "summary", "source"}]` list |

Package URLs are read wherever present, which is what lets a CycloneDX SBOM and an OSV advisory meet: they spell the same registry differently (`golang` vs `Go`, `cargo` vs `crates.io`) and the same Maven artifact differently (`namespace/name` vs `group:artifact`). `src/cra_evidence_desk/normalize.py` folds both onto one spelling. Nested CycloneDX sub-components are walked.

Until 2026-09-03 only the plain component list was accepted, which nothing in the world emits — every real user had to hand-convert their SBOM first, in front of a tool whose entire value is not transcribing things by hand.

## Coverage boundary

The matcher requires exact component name, ecosystem, and version equality. It does not resolve aliases, ranges, reachability, exploitability, or whether a legal reporting obligation applies. Advisory source and coverage are printed so a reviewer can verify them against the authoritative source.

OSV states affected versions two ways: `versions` enumerates exact ones, `ranges` expresses a range. Only the enumerated list is read — resolving "everything below 1.4.2" means deciding how your ecosystem orders versions and whether a backport applies, which is a judgement about your product rather than a lookup. Advisories that carry ranges only are listed in the report under `advisories_not_evaluated` rather than dropped, because "no findings" means something very different when part of the export was never evaluated.

## Privacy and usage

Everything runs locally, on both surfaces. SBOMs, advisories, product names, and draft contents never leave the machine. On the CLI, `--usage-file` is optional and stores only the aggregate event `evidence_report_generated`; omit it to disable counting. In the browser, counting is local `localStorage` only, opt-outable on the page, and honours Do Not Track / Global Privacy Control — it records that a match was run, never what was in it. There are no accounts, cookies, IPs, or analytics vendors.

That restraint is the reason the tool is usable at all: an SBOM is a complete map of a product's dependencies, and a match list is a map of its exposure. Sending either to a stranger's server to ask "am I affected" is a disclosure most vendors would refuse if they thought about it for a second.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The customer remains responsible for deciding whether a report is required, reviewing the evidence, and submitting through the proper authority.

**Best-effort hosting, no SLA.** This CLI runs on your machine. Any hosted copy of these files is free, experimental, and may be moved or taken offline without notice. Do not use a hosted URL as a system of record. If a draft needs to survive, keep the generated JSON or text.

The tool is free and full-featured. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## FAQ

### Does this submit a CRA notification?

No. It creates a draft only; the customer reviews and submits it.

### Does a match prove a vulnerability is exploitable?

No. It is an exact inventory/advisory observation requiring independent review.
