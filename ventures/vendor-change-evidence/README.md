# Vendor Change Evidence

Capture a customer-selected SaaS terms, privacy, security, or subprocessor page and compare it with the previous snapshot. The local CLI produces a dated, source-linked diff for procurement and security review without claiming what the change means legally.

## Use it

```bash
python3 vendor_evidence.py capture --url https://vendor.example/privacy --store snapshots
python3 vendor_evidence.py diff --store snapshots --url https://vendor.example/privacy --format markdown
```

The first capture records a baseline. A later capture records the new source and `diff` reports added and removed lines. Use `--file` instead of `--url` for an offline fixture or a page exported by your own process.

This is an evidence and drafting aid, not legal advice, a contract review, or a compliance determination. **No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. You are responsible for reviewing and verifying its output before relying on it, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Privacy and costs

The CLI stores the selected URL, fetch timestamp, response status, content hash, and page text in the directory you choose. It makes no hosted service calls and has no accounts, cookies, paid APIs, or analytics vendor. Optional usage counting writes only aggregate event names to a local file and can be disabled by omitting `--usage-file`. Hosting and inference cost is zero in this local-first slice.

## Scope boundary

Only monitor public pages you are authorized to review. A changed page is not necessarily a changed contract or policy. Inspect the raw evidence and decide what action, if any, is appropriate. Failed fetches are recorded as inconclusive rather than treated as no change.

## License

MIT. See [`LICENSE`](LICENSE).
