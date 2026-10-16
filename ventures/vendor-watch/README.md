# Vendor Watch

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/vendor-watch/>

Paste a vendor's public terms, privacy policy, or subprocessor page and get a
timestamped, source-linked, word-level diff when the text changes. Fetch
failures are labeled **inconclusive** — they never overwrite a good snapshot
and are never reported as "no change."

This is an evidence feed, not legal, compliance, or contract-review advice.
Only monitor pages you are authorized to monitor. Only public `http`/`https`
pages are supported. Private, loopback, and link-local addresses are refused.

There are two ways to run it. The browser tool needs a server; the **command
line** needs nothing but Node — see [Command line](#command-line) below, which
is the one to reach for if you want to check a page from a cron job.

```bash
cd ventures/vendor-watch
npm install
npm test
npm run watch -- https://vendor.example/terms   # command line
npm run dev                                     # browser tool
```

Open http://localhost:3000. There is no scheduled monitor in this version —
every check is triggered by a visitor. A watched page 30+ days past its last
snapshot is flagged "Recheck due" and sorted to the top of the watch list, so
a returning visitor with several watches sees which ones are stale without
having to read every timestamp (`src/lib/recheck.ts`). It is a prompt, not a
notification — nothing runs in the background, and closing the tab does not
schedule anything.

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

## Command line

The browser tool needs a server — checking an arbitrary vendor page from a tab
is blocked by CORS, so the fetch has to happen somewhere the visitor is not.
The CLI is the version that needs no server at all: the same `checkUrl`, the
same refusals, your baselines on your own disk.

```bash
npm install
npm run watch -- https://vendor.example/terms
npm run watch -- https://a.example/privacy https://b.example/subprocessors
npm run watch -- --json --store ~/.vendor-watch.json https://vendor.example/dpa
```

Baselines go in `vendor-watch-baselines.json` in the working directory, or
wherever `--store` / `$VENDOR_WATCH_STORE` points. They are yours: nothing is
uploaded, no account exists, and the CLI records no usage events of any kind —
a local tool that phoned home about the vendors you watch would be a worse
product than one that does not.

The exit codes are the part worth wiring into a cron job or a CI step:

| code | meaning |
|---|---|
| `0` | every page was unchanged, or was seen for the first time |
| `1` | at least one page **changed** — the actionable outcome |
| `2` | bad usage: no URL, one that is not a public `http(s)` page, an unreadable store |
| `3` | nothing changed, but at least one check was **inconclusive** |

`3` is separate from `0` on purpose, and it is the same refusal the rest of this
tool makes. A monitor that reports "no change" when it could not reach the page
turns an outage, a block, or a moved URL into positive evidence that nothing
happened. A failed fetch never overwrites a good snapshot, so the next
successful check still compares against the last text actually seen.

```
$ npm run watch -- https://vendor.example/terms
CHANGED         https://vendor.example/terms  (2026-09-16T14:02:10.994Z, HTTP 200)
  CHANGED since 2026-08-19T09:41:02.133Z
- may
+ will
```

## Scheduled monitoring in your own fork (no server)

`deploy/scheduled-watch.yml` is a GitHub Actions workflow that runs the CLI
daily in *your* copy of this repository, on your Actions minutes, with no
secrets and nothing of ours in between:

1. Fork the repository.
2. Copy `deploy/scheduled-watch.yml` to `.github/workflows/vendor-watch.yml`.
3. List the public pages you are authorized to monitor in `deploy/watchlist.txt`.
4. Enable Actions.

Each run commits updated baselines to your repo (`deploy/baselines.json`, so
the history is a change record you own) and opens or updates a single issue,
"Vendor Watch: pages changed", when a page changed (exit `1`) or a check was
inconclusive (exit `3`). A usage error (exit `2`, e.g. an empty watchlist)
fails the run so it is not mistaken for a quiet week.

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
