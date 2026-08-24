# DNS Configuration Evidence

A local, free-first recorder for customer-authorized DNS observations. Give it
two JSON snapshots and it emits a source-linked change report that distinguishes
changed, unchanged, and inconclusive observations.

This is operational evidence, not a DNS or security authority. It does not
write records, send mail, test uptime, or claim that a domain is secure,
deliverable, or compliant. The customer remains responsible for authorization
and deciding whether a change needs remediation.

## Run

```bash
python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m dns_evidence.cli --before before.json --after after.json --format markdown
```

The input is customer-supplied JSON. It must contain `authorized: true`, a
`domain`, and observations with `name`, `type`, `resolver`, `observed_at`, and
either `answers` or an explicit `status` such as `timeout` or `refused`.

The CLI writes one anonymized local usage counter when `--usage-file` is given.
It records event names and counts only, never domains, answers, IP addresses,
or request content.

## Cost and limits

The current slice has no hosted service, credentials, paid APIs, or network
calls. A later scheduler can use a customer-selected resolver and schedule,
but must retain resolver identity and uncertainty states. DNS caching,
split-horizon DNS, regional views, and transient failures can make two valid
observations differ.
