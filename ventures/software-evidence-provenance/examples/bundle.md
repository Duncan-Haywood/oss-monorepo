# Software evidence bundle

A record of the input files examined for this release, not a security, license, or compliance conclusion.

**Release:** acme-api@1.4.2
**Source commit (recorded, not verified):** `9f3a1c7d2e5b4a80f1c6d3e2a9b8c7d6e5f40312`
**Source reference:** https://example.test/acme/api/commit/9f3a1c7d2e5b4a80f1c6d3e2a9b8c7d6e5f40312

## Inputs

| Role | Path | SHA-256 | Declared hash |
|---|---|---|---|
| manifest | `project/package.json` | `fb0809e51e691a37…` | unresolved |
| lockfile | `project/package-lock.json` | `6889fe286634c18b…` | unresolved |
| artifact | `project/acme-api-1.4.2.tgz` | `802dfcd5c1f06b46…` | matched |

## Checks

| Check | State | Detail |
|---|---|---|
| source_commit_recorded | **pass** | source.commit recorded as '9f3a1c7d2e5b4a80f1c6d3e2a9b8c7d6e5f40312' (not verified against any repository) |
| all_inputs_present | **pass** | every named input file exists |
| declared_hashes_matched | **pass** | every declared_sha256 matched the file on disk |
| manifest_present | **pass** | manifest input present |
| lockfile_present | **pass** | lockfile input present |
| artifact_present | **pass** | artifact input present |

## Limits

- This bundle records the SHA-256 and stat of the input files it was given. It does not prove those inputs are complete, uncorrupted, unmodified at their source, or free of vulnerabilities, and it is not a bill of materials, a signature, or a license or security conclusion.
- source.commit and source.url are recorded as customer-supplied references. Nothing here contacts a code host, so a recorded commit is not verified to exist, to match the artifact, or to be the commit the artifact was built from.
- A check is only ever about inputs the descriptor named. A role that was not described is reported as unresolved, never as passing -- an absent input is not evidence that nothing is missing.
- The customer remains responsible for the release decision and for any security, licensing, or compliance conclusion drawn from these facts.
