# Software Evidence Provenance

A free, local CLI that answers a question a green checkmark on a release review
cannot: **exactly which bytes were examined, and which ones couldn't be
resolved?**

When someone reviews a release — a manifest, a lockfile, the built artifact, an
SBOM, a commit — the approval usually survives as a checkmark, not as a record
of the exact inputs. A month later nobody can say whether the artifact that
shipped is the artifact that was reviewed, or whether a dependency was swapped
in between. This tool records the **SHA-256 of every input you name** into a
reproducible *evidence bundle*, and lets you (or an auditor) **reproduce that
bundle later** to confirm nothing moved.

It never runs your build, never signs anything, never contacts a code host, and
never says a release is secure, licensed correctly, or compliant. It records
what a set of local files and their hashes show — and every input it could not
resolve is reported as exactly that, never folded into a passing result.

## Run

```bash
python3 -m unittest discover -s tests -v

# Build an evidence bundle from a release descriptor (see examples/):
PYTHONPATH=src python3 -m provenance_ledger.cli bundle \
  examples/release-descriptor.json --format markdown --output bundle.md

# Later — reproduce the bundle against the files on disk now:
PYTHONPATH=src python3 -m provenance_ledger.cli verify bundle.json
```

`verify` exits `0` only when **every** recorded input reproduces byte-for-byte.
A changed, missing, or unresolved input exits non-zero — wire it into your own
CI or release gate as the pass/fail signal.

### The release descriptor

You write a small JSON file naming the inputs for a release. Nothing in it is
fetched — paths are local, and `source` is recorded as a reference only:

```json
{
  "release": "acme-api@1.4.2",
  "source": {
    "commit": "9f3a1c7d…",
    "url": "https://github.com/acme/api/commit/9f3a1c7d…"
  },
  "inputs": [
    {"role": "manifest", "path": "package.json"},
    {"role": "lockfile", "path": "package-lock.json"},
    {"role": "artifact", "path": "dist/acme-api-1.4.2.tgz", "declared_sha256": "802dfcd5…"}
  ]
}
```

`declared_sha256` is optional. If you supply it, the tool reports `matched` or
`mismatch`; if you don't, the hash is recorded but the check is `unresolved` —
an observation, never a pass.

### What the states mean

**In a bundle**, each derived check is `pass` / `fail` / `unresolved`:

- `all_inputs_present`, `<role>_present` — did the named files exist?
- `declared_hashes_matched` — did every supplied `declared_sha256` match disk?
  (`unresolved` if you supplied none.)
- `source_commit_recorded` — is a commit recorded? (Recorded, **not** verified
  against any repository — nothing here contacts a code host.)

**In a verification**, each input is `reproduced` / `changed` / `missing` /
`unresolved`, and the overall result is `reproduced` **only** when every input
reproduced. Reproduction is anchored on content hashes, so a checkout that
changes file modification times does not break it.

## What this is not

- **Not an SBOM generator, vulnerability scanner, or license checker.** It
  records the hashes of the files you point it at; it does not parse
  dependencies or assert anything about their contents.
- **Not a signing authority or attestation service.** It does not sign, and a
  bundle is not a Sigstore/SLSA/in-toto attestation. If you already produce
  those, keep producing them — this is a lightweight review record beside them.
- **Not a source-of-truth check.** A recorded `source.commit` is a
  customer-supplied string. The tool never confirms it exists, matches the
  artifact, or is the commit the artifact was built from.
- **Not a hosted service.** There is no server, no account, no scheduler, and no
  network call anywhere in this slice.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. A `reproduced` result means the recorded files still
hash to the same bytes — **not** that those bytes are complete, uncorrupted at
their source, free of vulnerabilities, correctly licensed, or safe to ship.
**You remain responsible for the release decision** and for any security,
licensing, or compliance conclusion. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use. See
[`LICENSE`](LICENSE) for the full terms.

## Privacy

Everything here runs locally and makes **no network calls**. The optional
`--usage-file` flag appends one local JSON file recording event *names and
counts only* (`bundle_built`, `bundle_verified`) — never release names, file
paths, hashes, or contents. Omit the flag and nothing is written. There are no
cookies, identifiers, or third-party services.

## Support

This tool is free. If it saves you a headache and you'd like to support its
upkeep, GitHub Sponsors is the only channel — entirely optional, and it never
changes what the tool does.
