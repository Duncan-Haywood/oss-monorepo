# PyPI Provenance Check

Free, read-only checker: paste a `requirements.txt`, a PEP 621
`pyproject.toml`, or a plain list of package names, and see which of your
Python dependencies were published with a PyPI **provenance attestation** —
[PEP 740](https://docs.pypi.org/attestations/) trusted publishing (OpenID
Connect from a supported CI, no long-lived API token to steal) — and which
still depend on a classic upload token.

Live: `https://duncan-haywood.github.io/monorepo-projects/pypi-provenance-check/`

## What it does

PyPI's integrity API (PEP 740) serves a per-file `attestation_bundles` array
for any release published via trusted publishing. Unlike npm, this is a
**two-step** lookup: resolve the package's version and its distribution
files, then ask the integrity API about the chosen file.

1. `GET /pypi/<name>[/<version>]/json` — resolves the version and its files
2. `GET /integrity/<name>/<version>/<filename>/provenance` — the attestation

- **Browser page** (`index.html`): paste a requirements file/pyproject.toml/
  list, click Check. Parsing happens in your browser; the only network
  traffic is two `GET`s per package to `pypi.org`, the same public API `pip`
  and `pypi-attestations` already talk to.
- **CLI** (`cli.mjs`): zero dependencies, Node 18+.

```
node cli.mjs requirements.txt
node cli.mjs requirements.txt --json
node cli.mjs requirements.txt --without-provenance-only
node cli.mjs pyproject.toml                     # unpinned deps: checks the latest published version
echo "pip\nsix==1.17.0" | node cli.mjs -        # freeform list on stdin
```

## Why this exists alongside `pypi-attestations verify`

PyPA's own tool already verifies an attestation — this tool doesn't compete
with it, it fills three gaps it leaves:

1. It needs one already-resolved artifact (a URL or a local file); this tool
   works from a pasted requirements file before you've downloaded anything.
2. It's one artifact at a time; this CLI's `--json` output is built to be
   scripted across many repos.
3. Its output is a pass/fail on one file's cryptographic bundle, not a
   dependency-tree report; `--without-provenance-only --json` returns just
   the gap, ready for a spreadsheet or CI gate.

See [why-not-just-pypi-attestations-verify.html](why-not-just-pypi-attestations-verify.html)
for the full comparison, including what `pypi-attestations verify` checks
that this tool deliberately does not (full cryptographic re-verification of
the Sigstore bundle and certificate chain).

## What it is not

- **Not a malware scanner.** It reports a publishing-mechanism fact, not a
  verdict on whether any given version is safe.
- **Not evidence a package lacking provenance is risky.** PyPI attestations
  only shipped in November 2024; most of the index, including popular and
  actively maintained packages, has not migrated yet.
- **Not a guarantee.** A provenance attestation proves how and where a
  package was built and published — not that its source code is free of
  vulnerabilities or intentionally malicious logic. A May 2026 worm shipped
  malicious PyPI and npm packages carrying valid, verifiable attestations.
- **Not a cryptographic verifier.** It reports presence/absence and the
  publisher named in the attestation's certificate; it does not itself
  re-verify the Sigstore bundle or certificate chain the way
  `pypi-attestations verify` does.

## Privacy

Everything runs in your browser. The file you paste is never uploaded. Each
package check is two read-only GET requests, from your browser, to the
public PyPI API — no account, no PyPI token, nothing about your project
beyond the package names and versions you asked about. Anonymous feature
events (`check_run`, `example_loaded`) are counted only in `localStorage`
and can be turned off from the page. Do Not Track and Global Privacy
Control are honoured.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review. It reports one factual field PyPI's integrity API
publishes about each release you asked about — nothing more. You are
responsible for reviewing and verifying its output before relying on it. To
the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** Free, experimental, may move or go offline
without notice. Do not use this as a system of record — the CLI is the
thing that will still work if the hosted page ever doesn't.

## License

MIT — see [LICENSE](LICENSE).

Free and open source. [Sponsor](https://github.com/sponsors/Duncan-Haywood)
is entirely optional and never changes what the tool does.
