# Shopify Permission Drift Record

Shopify agencies and merchants can compare two customer-authorized app inventories and see exactly which scopes, webhook topics, or authorization states changed.

After using this, you can now hand a merchant a before-and-after permission
record in one page load, which used to take a side-by-side JSON diff or a
local Python run.

Open `site/index.html` in a browser (or serve the `site/` directory). The
page loads the shipped fixture so you can see a changed record immediately,
then paste or file-load your own exports. Comparison, the JSON report, and
the ticket summary all stay in the browser.

The same comparison is a local, read-only CLI. It does not connect to Shopify,
request credentials, inspect orders or customers, declare an app unsafe, or
recommend removing a vendor. From the command line:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json
```

Most agency reviews start from an Admin GraphQL `appInstallations` dump, not
that inventory shape. Normalize the dump first — locally, with no Shopify
call:

```bash
python3 src/capture_inventory.py examples/app-installations.json --output /tmp/before.json
```

A sufficient Admin GraphQL query (run in a store you are authorized to
administer; do not include orders or customers):

```graphql
{
  appInstallations(first: 50) {
    edges {
      node {
        app { handle }
        accessScopes { handle }
        webhookSubscriptions(first: 50) { edges { node { topic } } }
      }
    }
  }
}
```

Or open [`site/capture.html`](site/capture.html) in a browser, paste the dump,
and download `shopify-app-inventory.json`. Granted `accessScopes` become
`scopes`. Requested/declared scopes stay on `declared_scopes` and are never
copied into the granted list. If webhooks were omitted, the inventory records
a `webhooks_not_in_export` limitation instead of pretending the app has none.
GraphQL enum topics such as `APP_UNINSTALLED` are stored as `app/uninstalled`
so a later REST-shaped inventory does not look like a webhook change.

Use JSON output for an approval queue or CI artifact:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --format json --usage-log usage.jsonl
```

Use Markdown output for a ticket or human approval queue:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --format markdown
```

Save a portable JSON evidence artifact for a ticket or approval queue:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --output permission-drift-report.json
```

`--output` always writes the structured JSON artifact atomically, independently
of `--format`, which controls only what is printed to the terminal. A failed
write never replaces an existing report with a partial file. That keeps a
Markdown ticket review from overwriting the machine-readable evidence file.

Use the report directly in a GitHub Actions log. Each changed app, scope, or
webhook is emitted as a warning annotation, and the command exits successfully
so the merchant or workflow owner can decide whether to block a deployment:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --format github
```

For a workflow that should block on drift, combine this output with the JSON
report and check its `review_required` field rather than treating a warning as
a security certification.

The saved report contains only the comparison result and source/capture metadata
already present in the exports. It does not copy app scopes, webhook topics, or
any merchant data into the optional usage log.

Each inventory contains the store's own exported evidence: app identifiers,
scopes, webhook topics, authorization state, API version, source, and capture
time. Malformed or incomplete exports are rejected; the tool never turns an
unavailable response into an unchanged result. Captures where the purported
after export predates the before export are marked inconclusive. If a source
cannot provide a field, preserve that limitation in the source record and treat
the comparison as inconclusive rather than fabricating a value.

Shopify distinguishes scopes declared by an app from scopes actually granted to
an installation. Capture preserves that distinction (`scopes` vs
`declared_scopes`) and will not fill a missing granted list from requested
scopes. It does not query Shopify or infer either value from an app's name. A
later live API adapter, if added, should keep the same rule and may also record
the `app/scopes_update` signal when available.

## Customer workflow

1. Export only app metadata from a store the customer owns or is authorized to administer. An Admin GraphQL `appInstallations` response with `accessScopes` and `webhookSubscriptions` is enough; do not include orders or customer records. Normalize that dump with `src/capture_inventory.py` or [`site/capture.html`](site/capture.html). Pass `--api-version` when the dump omitted it — the tool will not guess.
2. Keep exports, reports, and the optional usage log in customer-controlled storage.
3. Review every change with the merchant. The report is evidence, not a security certification or Shopify policy interpretation.

Usage is opt-in. The CLI records only when you pass `--usage-log` — an event
name, day, and aggregate finding count. The browser page keeps the same shape
in `localStorage` (event name and day only) and honors the on-page opt-out
plus Do Not Track / Global Privacy Control. Neither surface records store
names, app names, scopes, webhooks, customer data, IP addresses, or
identifiers. There are no accounts, cookies, network calls, paid APIs, or
analytics vendors.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what the tool does.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, financial, security, or compliance
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

The customer remains responsible for authorization, retention, and every Git or
Shopify operation taken after reviewing a report.
