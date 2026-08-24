# Shopify Permission Drift Record

Shopify agencies and merchants can compare two customer-authorized app inventories and see exactly which scopes, webhook topics, or authorization states changed.

The tool is a local, read-only evidence record. It does not connect to Shopify,
request credentials, inspect orders or customers, declare an app unsafe, or
recommend removing a vendor. Start with the included fixture:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json
```

Use JSON output for an approval queue or CI artifact:

```bash
python3 src/permission_drift.py examples/before.json examples/after.json --format json --usage-log usage.jsonl
```

Each inventory contains the store's own exported evidence: app identifiers,
requested scopes, webhook topics, authorization state, API version, source, and
capture time. Missing or redacted fields are reported as `inconclusive`; the
tool never turns an unavailable response into an unchanged result.

## Customer workflow

1. Export only app metadata from a store the customer owns or is authorized to administer.
2. Keep exports, reports, and the optional usage log in customer-controlled storage.
3. Review every change with the merchant. The report is evidence, not a security certification or Shopify policy interpretation.

Usage is opt-in with `--usage-log`; it records only an event name, day, and
aggregate finding count. It never records store names, app names, scopes,
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
