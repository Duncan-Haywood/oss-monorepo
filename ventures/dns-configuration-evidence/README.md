# DNS Configuration Evidence

A local, free-first recorder for customer-authorized DNS observations. Capture
what named resolvers answer now, capture again after a change, and emit a
source-linked report that distinguishes changed, unchanged, and inconclusive
observations.

This is operational evidence, not a DNS or security authority. It does not
write records, send mail, test uptime, or claim that a domain is secure,
deliverable, or compliant. The customer remains responsible for authorization
and deciding whether a change needs remediation.

## Two interfaces, one evidence format

| | Where | Queries over | Use it when |
|---|---|---|---|
| **Browser tool** (`index.html`) | `/tools/dns-configuration-evidence/` on the portfolio front door | DNS-over-HTTPS, from the visitor's own browser | You want the record now, on a machine you did not set up, or you want to hand a customer a link |
| **Python CLI** (`src/dns_evidence/`) | Your machine | The DNS protocol, to resolvers you name by IP | You need a *specific* resolver (an internal one, a customer's own), or you are scripting captures |

Both read and write the same snapshot JSON and render the same report, so a
baseline captured in the browser compares with `python3 -m dns_evidence
compare`, and vice versa. `dns-evidence.test.mjs` pins that by diffing both
implementations' Markdown over the same snapshots.

The CLI stays canonical: only it can name an arbitrary resolver, because a
browser cannot open a UDP socket. The browser surface exists because that
limitation was costing the venture every user who was not already willing to
clone a repo mid-cutover.

**One caveat when mixing them.** DoH endpoints present record text with small
cosmetic differences from the wire format (trailing dots, TXT quoting). The
browser normalises what it receives, so two browser captures always compare
cleanly; mixing a CLI capture with a browser one can show a cosmetic `changed`
on a record that did not move. Capture both halves the same way.

## Run

```bash
# Browser tool — open it directly, or serve the directory
python3 -m http.server -d . 8000   # then http://localhost:8000/

# Its logic tests (Node 18+); the parity test also runs the Python CLI
node --test dns-evidence.test.mjs

# The primary customer journey through a real browser. Needs Playwright, so it
# is not in CI -- same convention as platform/pages/journey.mjs. Stubs the DoH
# endpoints, so it needs no network and no real domain.
node tests/journey.mjs

python3 -m unittest discover -s tests -v

# 1. Customer-authorized capture (writes a snapshot you can keep or share)
PYTHONPATH=src python3 -m dns_evidence capture \
  --plan examples/capture-plan.json \
  --output before.json

# 2. After the change window, capture again
PYTHONPATH=src python3 -m dns_evidence capture \
  --plan examples/capture-plan.json \
  --output after.json

# 3. Diff the two snapshots
PYTHONPATH=src python3 -m dns_evidence compare \
  --before before.json --after after.json --format markdown
# Exit 2 if any DNS observation changed, suitable for a review gate:
PYTHONPATH=src python3 -m dns_evidence.cli --before examples/before.json --after examples/after.json --fail-on changed
```

The same capture can be spelled with flags when you do not want a plan file.
`--authorized` is required in that form — the tool will not query a domain
without an explicit customer authorization:

```bash
PYTHONPATH=src python3 -m dns_evidence capture \
  --authorized --domain example.test \
  --query example.test:A --query example.test:TXT \
  --resolver 1.1.1.1 --resolver 8.8.8.8 \
  --output before.json
```

Queries are limited to the authorized apex and its subdomains. Timeouts,
refusals, and transport errors are stored as statuses (`timeout`, `refused`,
`error`) rather than empty answers, so a later compare cannot treat a failed
lookup as “unchanged.” Supported types: A, AAAA, MX, TXT, CNAME, NS.

A capture plan is customer-supplied JSON. It must contain `authorized: true`,
a `domain`, a `queries` list (`name`, `type`), and `resolvers` (address
strings or `{id, address}` objects). Compare input must contain `authorized:
true`, a `domain`, and observations with `name`, `type`, `resolver`,
`observed_at`, and either `answers` or an explicit status such as `timeout`
or `refused`.

`--usage-file` is opt-in. It writes one local JSON file of event names and
counts (`snapshot_captured`, `report_generated`) — never domains, answers, IP
addresses, resolver names, or request content. Omit the flag to record
nothing. Use `--no-usage` to keep the flag in a script but skip the counter
for one run. Report and usage files are replaced atomically so a CI consumer
never sees a half-written artifact.

Markdown reports include the observed before/after answers so a reviewer can
see what changed without opening the JSON snapshots. Pipe characters, backticks,
and newlines in DNS text are escaped so they cannot break the table.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, medical, or
engineering advice, and it does not replace a qualified professional. **You
are responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps prepare for. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
does not change what the tool does.

## CI and handoffs

Use `capture --fail-on timeout` (or `refused` / `error`) so a broken resolver
path fails the job instead of writing a snapshot that later compares as
inconclusive. Use `compare --fail-on changed` to turn a changed observation
into a reviewable exit status without claiming the change is harmful. Use
`--fail-on inconclusive` to prevent incomplete resolver evidence from passing
silently. The JSON output is portable and contains the resolver, timestamps,
before/after answers, and limitations needed for a customer handoff.

## Cost and limits

Capture talks only to the resolvers you name, from this machine, on UDP/TCP
port 53. There is no hosted service, no product API key, and no analytics
vendor. DNS caching, split-horizon DNS, regional views, and transient
failures can make two valid observations differ. A later scheduler can reuse
the same plan on a customer-selected timetable; it must still require
`authorized: true` and retain resolver identity and uncertainty states.
