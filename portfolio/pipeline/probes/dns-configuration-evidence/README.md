# DNS configuration evidence probe

This probe tests the `dns-configuration-evidence` candidate's narrowest
claim: a pair of multi-resolver DNS snapshots for a customer-authorized
domain can produce a source-linked, per-record-type change report, without a
resolver timeout or resolver disagreement reading as "unchanged".

Run it with:

```sh
python3 -m pytest -q portfolio/pipeline/probes/dns-configuration-evidence/test_dns_diff.py
python3 portfolio/pipeline/probes/dns-configuration-evidence/dns_diff.py \
  portfolio/pipeline/probes/dns-configuration-evidence/fixtures/unchanged-before.json \
  portfolio/pipeline/probes/dns-configuration-evidence/fixtures/txt-changed-after.json \
  /tmp/dns-report.json
```

The fixtures stand in for captured resolver answers and contain only a
domain, a capture timestamp, and a list of per-resolver `{resolver,
query_status, records}` entries — no live DNS is queried and no real domain
is resolved. A snapshot side only yields comparable records when every
resolver in it returned `ok` and every `ok` resolver agrees; a timeout,
refusal, servfail, or cross-resolver disagreement on either side forces
`inconclusive`, never `observed` with an empty diff.

Result on 2026-08-24: on the `unchanged` fixture pair (two resolvers, three
record types, identical across capture dates) the probe reports `observed`
with zero changes. Against the same `before` snapshot, a changed SPF `TXT`
value and a changed `NS` delegation are each reported as a single `changed`
entry naming the record type, the before value, and the after value, and
adding/removing a record type entirely (`MX` removed, `CAA` added) is
reported as `added`/`removed` rather than folded into a `changed` entry. A
snapshot pair where one resolver times out, and a separate pair where two
resolvers return different `TXT` answers for the same domain, both report
`inconclusive` with the specific resolver and reason named — neither is
reported as `unchanged`. A domain mismatch between the two snapshots reports
`unknown`.

The candidate's boundary names four failure states, not one, so the rule is
written against `query_status != "ok"` rather than against a list: `refused`,
`servfail`, and `dnssec_failure` are each asserted to force `inconclusive`
alongside `timeout`, and a status the candidate has not thought of yet
behaves the same way rather than falling through to `observed`. The loader
rejects a snapshot missing its domain/timestamp context, and a resolver entry
missing its status, rather than reading an absent field as a passing one.

All twelve cases are asserted in `test_dns_diff.py`
(`python3 -m pytest -q` → 12 passed).

This is a local diff experiment over hand-written fixtures, not a live
resolver poller and not demand evidence. The candidate write-up's first
experiment — a scheduled fetch/hash/snapshot loop against real resolvers,
and ten conversations with MSP/agency/domain-operations practitioners to
find a recurring review workflow — is unstarted, and so is any customer
contact. That step needs an owner decision (who to contact, and whether to
run scheduled outbound DNS queries from this environment) and is not
something this probe can close on its own.
