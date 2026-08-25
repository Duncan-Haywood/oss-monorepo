# Shopify Permission Drift Record

Shopify agencies and merchants can compare two customer-authorized app inventories and see exactly which scopes, webhook topics, or authorization states changed.

The tool is a local, read-only evidence record. It does not connect to Shopify,
request credentials, inspect orders or customers, declare an app unsafe, or
recommend removing a vendor. Start with the included fixture:

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
an installation. Capture preserves that distinction (`scopes` vs
`declared_scopes`) and will not fill a missing granted list from requested
scopes. It does not query Shopify or infer either value from an app's name. A
later live API adapter, if added, should keep the same rule and may also record
the `app/scopes_update` signal when available.

## Development

```sh
python3 -m unittest tests/test_permission_drift.py tests/test_capture_inventory.py
node --test site/capture.test.mjs site/capture-page.test.mjs
python3 -m http.server 8765 --directory ventures/shopify-permission-drift/site
```

Then open `http://127.0.0.1:8765/capture.html`.

## Customer workflow

1. Export only app metadata from a store the customer owns or is authorized to administer. An Admin GraphQL `appInstallations` response with `accessScopes` and `webhookSubscriptions` is enough; do not include orders or customer records.
2. Normalize that dump with `src/capture_inventory.py` or [`site/capture.html`](site/capture.html) so the file has `captured_at`, `api_version`, `source`, `authorization_state`, and `apps`. Pass `--api-version` when the dump omitted it — the tool will not guess.
3. Keep exports, reports, and the optional usage log in customer-controlled storage.
4. Compare the earlier inventory with the later one (`src/permission_drift.py` or the browser compare page when present). Review every change with the merchant. The report is evidence, not a security certification or Shopify policy interpretation.

Usage is opt-in with `--usage-log`; it records only an event name, day, and
an aggregate count (`finding_count` for compare, `app_count` for capture). It never records store names, app names, scopes,
webhooks, customer data, IP addresses, or identifiers. Omit the flag to disable
it entirely. There are no accounts, cookies, network calls, paid APIs, or
analytics vendors.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, financial, security, or compliance
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

The customer remains responsible for authorization, retention, and every Git or
Shopify operation taken after reviewing a report.
