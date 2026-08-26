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

## Where snapshots live

Each browser keeps its own snapshots, in `localStorage` under
`vendor-watch:baselines:v1` (up to 50 URLs, least-recently-fetched evicted).
The page sends its stored baseline with each check and stores the returned
one; the server never persists it. That means a snapshot survives a deploy,
belongs to one visitor, and is never used to answer someone else's check —
and it also means clearing site data, opening a private window, or switching
devices starts the watch over. It is a change record, not an archive of
record. When a browser refuses to store (quota, blocked site data), the check
still returns its diff and the page says the snapshot could not be saved.

An **inconclusive** check returns no snapshot at all, so a failed fetch never
replaces the last page text actually seen.

The server keeps a small in-memory store as well — capped, evicted, wiped on
restart, and shared across visitors. It is the fallback for a caller that
sends no `baseline` field (`checkUrl(url, fetchImpl)` with the third argument
omitted). The browser always sends the field, including as `null`, so it
never reads or writes that store.

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

The URLs you watch and their page text stay in your browser. They are sent to
the server only as the baseline for the check you asked for, and are used to
compute that one diff — not stored, not logged, not shown to anyone else.
`Forget` removes a URL; clearing the site's data removes all of them.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
does not change what the tool does.

MIT licensed; see `LICENSE`.
