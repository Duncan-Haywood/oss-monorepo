# npm Provenance Check

Free, read-only checker: paste a `package-lock.json`, a `package.json`, or a
plain list of package names, and see which of your dependencies were
published with an npm **provenance attestation** — [trusted
publishing](https://docs.npmjs.com/trusted-publishers/) (OpenID Connect from
a supported CI, no long-lived publish token to steal) or `npm publish
--provenance` — and which still depend on a classic publish token, the exact
mechanism the 2025–2026 Shai-Hulud worm abused to compromise maintainer
accounts and push malicious package versions.

Live: `https://duncan-haywood.github.io/monorepo-projects/npm-provenance-check/`

## What it does

The public npm registry publishes a `dist.attestations.provenance` field on
any package version that was published with trusted publishing or
`--provenance`. This tool reads that field, once per package you ask about,
and reports it plainly — present or absent, nothing inferred.

- **Browser page** (`index.html`): paste a lockfile/package.json/list, click
  Check. Parsing happens in your browser; the only network traffic is one
  `GET` per package to `registry.npmjs.org`, the exact registry `npm
  install` already talks to.
- **CLI** (`cli.mjs`): zero dependencies, Node 18+.

```
node cli.mjs package-lock.json
node cli.mjs package-lock.json --json
node cli.mjs package-lock.json --without-provenance-only
node cli.mjs package.json                      # unpinned: checks the latest published version
echo "vite\nleft-pad@1.3.0" | node cli.mjs -    # freeform list on stdin
```

## Why this exists alongside `npm audit signatures`

npm's own CLI already reports provenance via `npm audit signatures` — this
tool doesn't compete with it, it fills three gaps it leaves:

1. It needs a full local install; this tool works from a pasted lockfile
   before you've run `npm install`, or a lockfile someone else sent you.
2. It's one project at a time; this CLI's `--json` output is built to be
   scripted across many repos.
3. Its output is for a human terminal, not automation; `--without-provenance-only
   --json` returns just the gap, ready for a spreadsheet or CI gate.

See [why-not-just-npm-audit-signatures.html](why-not-just-npm-audit-signatures.html)
for the full comparison. Both tools read the exact same registry field, so
they will never disagree about a given package.

## What it is not

- **Not a malware scanner.** It reports a publishing-mechanism fact, not a
  verdict on whether any given version is safe.
- **Not evidence a package lacking provenance is risky.** Trusted publishing
  reached general availability in July 2025; most of the registry, including
  popular and actively maintained packages, has not migrated yet.
- **Not a guarantee.** A provenance attestation proves how and where a
  package was built and published — not that its source code is free of
  vulnerabilities or intentionally malicious logic. See ["Valid Provenance,
  Malicious Package"](https://matrixgard.com/blog/npm-pypi-provenance-attestation-supply-chain-2026/)
  for what attestations do and don't buy you.

## Privacy

Everything runs in your browser. The file you paste is never uploaded. Each
package check is one read-only GET request, from your browser, to the public
npm registry — no account, no npm token, nothing about your project beyond
the package names and versions you asked about. Anonymous feature events
(`check_run`, `example_loaded`) are counted only in `localStorage` and can be
turned off from the page. Do Not Track and Global Privacy Control are
honoured.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review. It reports one factual field the npm registry publishes
about each version you asked about — nothing more. You are responsible for
reviewing and verifying its output before relying on it. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** Free, experimental, may move or go offline
without notice. Do not use this as a system of record — the CLI is the
thing that will still work if the hosted page ever doesn't.

## License

MIT — see [LICENSE](LICENSE).

Free and open source. [Sponsor](https://github.com/sponsors/Duncan-Haywood)
is entirely optional and never changes what the tool does.
