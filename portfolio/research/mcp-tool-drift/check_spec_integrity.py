#!/usr/bin/env python3
"""Check whether the MCP spec or registry has closed the tool-pinning gap.

The `mcp-supply-chain-watch` candidate (PR #79) names its own most likely
ending:

    "Registry commoditisation. If the major MCP registries or an agent framework
    ship signed, versioned tool manifests, the mutable-declaration problem is
    fixed upstream and this candidate is obsolete rather than competed with.
    That is the most likely ending and it should be checked before building,
    not after."

This script performs that check against primary sources, both of which are
reachable from this environment (unlike the EU legal sources the regulatory
candidates depend on):

1. The normative JSON Schema for every published MCP spec revision, from the
   spec's own source repository. Asks: does the `Tool` object carry any field
   that would let a client pin what a server declared -- a version, hash,
   signature, or integrity attribute?

2. The live official MCP registry API. Asks: does a registry record contain the
   server's tool declarations at all?

Exit status is 0 whichever way the answers come out; this reports, it does not
assert. Re-run it before acting on the candidate -- a `False` in the first
column of the schema table would mean the gap has closed upstream and the
candidate is dead.

    python3 check_spec_integrity.py

No third-party dependencies; standard library only.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request

SCHEMA_URL = (
    "https://raw.githubusercontent.com/modelcontextprotocol/"
    "modelcontextprotocol/main/schema/{rev}/schema.json"
)
REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0/servers?limit=100"
UA = {"User-Agent": "monorepo-projects-portfolio-research/1.0"}

# Published revisions plus the in-progress draft. Add new dated revisions here.
REVISIONS = ["2025-03-26", "2025-06-18", "2025-11-25", "draft"]

# Fields that would let a client pin or verify a declaration.
INTEGRITY_FIELDS = {
    "version", "hash", "digest", "sha256", "checksum",
    "signature", "signed", "integrity", "provenance", "attestation", "etag",
}
# Word-boundary search, so "designed" does not count as "signed".
INTEGRITY_TERMS = [
    r"\bsignature\b", r"\bsigning\b", r"\bsigned\b", r"\bintegrity\b",
    r"\bchecksum\b", r"\bsha256\b", r"\bprovenance\b", r"\battestation\b",
    r"\blockfile\b", r"\bimmutable\b",
]


def fetch_json(url: str, timeout: int = 45):
    return json.loads(
        urllib.request.urlopen(
            urllib.request.Request(url, headers=UA), timeout=timeout
        ).read()
    )


def check_schemas() -> list[dict]:
    rows = []
    for rev in REVISIONS:
        try:
            schema = fetch_json(SCHEMA_URL.format(rev=rev))
        except Exception as exc:
            rows.append({"revision": rev, "error": str(exc)})
            continue
        # Older revisions use `definitions`; newer ones use `$defs`.
        defs = schema.get("$defs") or schema.get("definitions") or {}
        tool_props = sorted((defs.get("Tool") or {}).get("properties", {}))
        blob = json.dumps(schema)
        rows.append({
            "revision": rev,
            "n_definitions": len(defs),
            "tool_properties": tool_props,
            "integrity_fields_on_tool": sorted(set(tool_props) & INTEGRITY_FIELDS),
            "integrity_terms_anywhere": sorted(
                {t.strip("\\b") for t in INTEGRITY_TERMS if re.search(t, blob, re.I)}
            ),
        })
    return rows


def check_registry() -> dict:
    page = fetch_json(REGISTRY_URL)
    records = page.get("servers", [])
    blob = json.dumps(records)
    remote = sum(1 for r in records if r["server"].get("remotes"))
    packaged = sum(1 for r in records if r["server"].get("packages"))
    return {
        "records_sampled": len(records),
        "record_fields": sorted({k for r in records for k in r["server"]}),
        "occurrences_of_inputSchema": blob.count("inputSchema"),
        "records_with_remote_endpoint": remote,
        "records_with_package": packaged,
    }


def main() -> int:
    print("=== 1. Does the MCP spec let a client pin a tool declaration? ===\n")
    for row in check_schemas():
        if "error" in row:
            print(f"  {row['revision']:<12} unreachable: {row['error']}")
            continue
        print(f"  {row['revision']:<12} Tool properties: {', '.join(row['tool_properties']) or '(none)'}")
        print(f"  {'':<12} integrity/version field on Tool: "
              f"{row['integrity_fields_on_tool'] or 'NONE'}")
        print(f"  {'':<12} integrity terms anywhere in schema: "
              f"{row['integrity_terms_anywhere'] or 'NONE'}\n")

    print("=== 2. Does a registry record carry the server's tool declarations? ===\n")
    try:
        reg = check_registry()
    except Exception as exc:
        print(f"  registry unreachable: {exc}")
        return 0
    print(f"  records sampled:            {reg['records_sampled']}")
    print(f"  fields present on a record: {', '.join(reg['record_fields'])}")
    print(f"  'inputSchema' occurrences:  {reg['occurrences_of_inputSchema']}")
    print(f"  with a remote endpoint:     {reg['records_with_remote_endpoint']}")
    print(f"  with an installable package:{reg['records_with_package']}")
    print()
    if reg["occurrences_of_inputSchema"] == 0:
        print("  => The registry indexes servers, not their tool surfaces. Nothing in a")
        print("     record says what a server will declare when a client connects to it.")
    else:
        print("  => Registry records now carry tool schemas. Re-read the candidate: the")
        print("     'nobody retains what was declared' premise may no longer hold.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
