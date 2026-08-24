# Vendor Change Evidence

If a vendor changes its privacy, terms, subprocessors, or security page, this local CLI gives procurement and security teams a dated, portable review record. It compares customer-supplied snapshots and never contacts a vendor or uploads content.

```bash
PYTHONPATH=src python3 -m vendor_change examples/before.json examples/after.json --format markdown --output review.json
```

Use `fetch_status: "timeout"`, `"blocked"`, or another non-`ok` value when a fetch failed. The report is `inconclusive`, never falsely stable. The tool reports evidence only; it does not decide whether a contract, security posture, or compliance status changed.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Privacy and usage

Everything runs locally. Snapshots and reports are never uploaded. There are no accounts, cookies, or analytics vendors. `--usage-log` is optional and writes only an event name and day to a local file; do not enable it if you do not want aggregate usage counting.

This is a prototype for customer-authorized public pages. Preserve the source URL, capture time, and fetch result in each snapshot. Review raw source text before acting. MIT licensed; see `LICENSE`.
