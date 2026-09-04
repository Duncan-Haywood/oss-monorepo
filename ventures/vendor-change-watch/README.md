# Vendor Change Watch

A free command-line tool that watches the vendor pages you choose — terms of
service, privacy policy, subprocessor list, security page — and shows you a
source-linked diff when the text changes. Built for security, procurement,
and privacy practitioners who already track a handful of vendors by hand.

**What it is not:** legal advice, a contract review, or a compliance
attestation. It reports what changed in the text of pages you configured,
with the source URL and the fetch timestamp on every report. You decide what
a change means.

## Why this exists

Security and procurement teams re-check the same vendor pages by memory or a
calendar reminder. This tool automates the boring, error-prone part —
fetching the page and telling you precisely what section changed — without
claiming to interpret the change for you. See
[`portfolio/pipeline/candidates/vendor-change-evidence.md`](../../portfolio/pipeline/candidates/vendor-change-evidence.md)
for the market write-up this venture graduated from.

## Quickstart

```sh
cd ventures/vendor-change-watch
pip install -e .

vendor-watch add --vendor "Acme SaaS" --url https://acme.example/legal/terms --type terms
vendor-watch add --vendor "Acme SaaS" --url https://acme.example/legal/subprocessors --type subprocessors

# Run this on a schedule (cron, a CI job, launchd) -- each run fetches, stores
# a snapshot, and diffs against the previous one.
vendor-watch check
```

First run on a page always says "First snapshot captured... nothing to
compare yet" — there is nothing to diff against until a second fetch exists.
Run `vendor-watch check` again (immediately, or on your normal schedule) to
see a real report.

`vendor-watch report --vendor "Acme SaaS" --type terms` re-prints the diff
between the two most recently stored snapshots without fetching again.

All data — the watchlist, every snapshot, and the local usage log — lives
under `~/.vendor-watch` (override with `--data-dir`). Nothing is uploaded
anywhere; delete the directory to delete everything.

## Disclaimers

This tool reports what changed in the text of pages you configured, with
source URLs and timestamps. **It is not legal advice**, does not review
contracts, and **does not assert that a vendor is or is not compliant** with
anything, before or after a detected change. A missing or blocked fetch is
reported as `inconclusive`, never as "no change" — a failed check must never
look like stability. Only public pages you explicitly add are ever fetched;
this tool does not scrape, crawl, or collect personal data.

## Privacy-conscious usage tracking

`vendor-watch usage` prints locally recorded counts (how many checks you've
run, how many changes were detected) so *you* can see your own usage. The
same file is the only usage signal this venture has: it is never transmitted
anywhere. Vendor names, URLs, and page content are never written to the
usage log — only event names and counts. Set `VENDOR_WATCH_NO_TELEMETRY=1`
to disable local logging entirely.

## Development

```sh
pip install -e . pytest
python3 -m pytest -q
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diffing engine is
adapted from the validated probe in
[`portfolio/pipeline/probes/vendor-change-evidence/`](../../portfolio/pipeline/probes/vendor-change-evidence/);
this venture adds the live page fetcher, the watchlist, local storage, and
the CLI the probe's own README named as unbuilt. No customer contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
