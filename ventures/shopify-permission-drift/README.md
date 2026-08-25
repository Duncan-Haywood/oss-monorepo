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

Use JSON output for an approval queue or CI artifact:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --format json --usage-log usage.jsonl
```

Save a portable JSON evidence artifact for a ticket or approval queue:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --output permission-drift-report.json
```

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
an installation. A future API adapter must preserve that distinction and should
also record the `app/scopes_update` signal when available. The local comparator
does not query Shopify or infer either value from an app's name.

## Customer workflow

1. Export only app metadata from a store the customer owns or is authorized to administer.
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
