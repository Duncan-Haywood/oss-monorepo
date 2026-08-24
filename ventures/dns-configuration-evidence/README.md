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
# Exit 2 if any DNS observation changed, suitable for a review gate:
PYTHONPATH=src python3 -m dns_evidence.cli --before examples/before.json --after examples/after.json --fail-on changed
# Exit 2 only if an SPF, DKIM, or DMARC record changed -- the DNS change most
# likely to silently break outbound mail delivery or open a spoofing gap:
PYTHONPATH=src python3 -m dns_evidence.cli --before before.json --after after.json --fail-on email-auth-changed
```

Every finding is tagged `email_auth: "SPF" | "DKIM" | "DMARC" | null` by name
and content convention (an apex TXT record starting `v=spf1`, `_dmarc.<domain>`,
or `<selector>._domainkey.<domain>`). This is a naming/content convention, not
validation — it flags which changes touch mail authentication, it does not
check whether the record is syntactically valid or whether mail actually
authenticates.

The input is customer-supplied JSON. It must contain `authorized: true`, a
`domain`, and observations with `name`, `type`, `resolver`, `observed_at`, and
either `answers` or an explicit `status` such as `timeout` or `refused`.

The CLI writes one anonymized local usage counter when `--usage-file` is given.
It records event names and counts only, never domains, answers, IP addresses,
or request content.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, medical, or
engineering advice, and it does not replace a qualified professional. **You
are responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

## CI and handoffs

Use `--fail-on changed` to turn a changed observation into a reviewable exit
status without claiming the change is harmful. Use `--fail-on inconclusive` to
prevent incomplete resolver evidence from passing silently. The JSON output is
portable and contains the resolver, timestamps, before/after answers, and
limitations needed for a customer handoff.

## Cost and limits

The current slice has no hosted service, credentials, paid APIs, or network
calls. A later scheduler can use a customer-selected resolver and schedule,
but must retain resolver identity and uncertainty states. DNS caching,
split-horizon DNS, regional views, and transient failures can make two valid
observations differ.
