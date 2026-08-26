# Vendor Watch

Paste a vendor's public terms, privacy policy, or subprocessor page and get a
timestamped, source-linked, word-level diff when the text changes. Fetch
failures are labeled **inconclusive** — they never overwrite a good snapshot
and are never reported as "no change."

This is an evidence feed, not legal, compliance, or contract-review advice.
Only monitor pages you are authorized to monitor. Only public `http`/`https`
pages are supported. Private, loopback, and link-local addresses are refused.

```bash
cd ventures/vendor-watch
npm install
npm test
npm run dev
```

Open http://localhost:3000. There is no scheduled monitor in this version —
every check is triggered by a visitor.

The snapshot store is a small in-memory prototype shared by every visitor on
that process (capped, evicted, wiped on restart). It is not a per-customer
archive.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or compliance
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy and usage

Checks do not create accounts. Usage events store only an event name, a page
path, and a day in process memory — never the URL you checked, never page
text, never an IP. Counting honors Do Not Track and Global Privacy Control
and can be turned off with `localStorage.setItem("vendor-watch:usage-opt-out","1")`.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
does not change what the tool does.

MIT licensed; see `LICENSE`.
