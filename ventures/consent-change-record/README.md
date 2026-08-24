# Consent Change Record

Did that consent banner actually stop the tracking requests, or just hide the
banner? This free tool diffs two HAR (HTTP Archive) network captures — one
taken before a consent choice, one after — and reports exactly which requests
and cookies appeared or disappeared. Runs entirely in your browser.

Try it: open [`tool/index.html`](tool/index.html) in a browser (or serve it
locally, see below).

## Who this is for

Web agencies, privacy implementers, and site operators who need to verify
that a consent banner change actually did what it claims, rather than
re-reading network logs by eye every time. This is a manual, one-off tool for
now — point it at two exported HAR files and read the diff.

## What it answers

- "I changed the cookie banner's default — did the analytics script actually
  stop firing before consent, or does it still load?"
- "The privacy team says a vendor script was removed — is that request gone
  from the after-capture, or just relocated?"
- "What cookies actually got set, from which domain, before vs. after?"

## How to use it

1. Open your browser's DevTools → **Network** tab.
2. Reload the target page, make your consent choice (or don't), then
   right-click any request in the Network panel → **"Save all as HAR"**.
3. Do this twice on the same site: once before the consent action, once
   after.
4. Open [`tool/index.html`](tool/index.html), drop in both `.har` files, and
   read the report. Export it as a dated JSON evidence record if you want a
   file to keep.

Only test sites you own or are explicitly authorized to test.

## What this is not

- **Not a compliance determination.** It reports what two specific captures
  contained — not what every visitor, browser, region, or session sees, and
  not whether any site meets any law's requirements.
- **Not exhaustive tracker detection.** Requests are grouped against
  [`tool/trackers.mjs`](tool/trackers.mjs), a small, manually curated,
  non-exhaustive list of well-known analytics/advertising/session-recording
  domains. An "unclassified" domain is not a finding that it is safe — it
  means this list doesn't recognize it yet, and it is always shown in the
  report, never hidden.
- **Not live monitoring.** v0 is a manual before/after diff over files you
  provide; it does not crawl, schedule, or re-check anything on its own.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal advice, and it does not replace a qualified
privacy professional's review. **You are responsible for reviewing and
verifying its output before relying on it.** To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

## Privacy

Everything runs in your browser. HAR files are read locally with the File
API and are never uploaded — there is no server this page talks to. There
are no accounts, tracking cookies, or analytics vendor. The page counts
anonymous, local feature-use events (e.g. "a diff was generated") in your own
browser's `localStorage`, purely so the maintainers can tell whether the tool
gets used at all — nothing leaves your device. There's an in-page toggle to
turn it off, and it disables itself automatically on Do Not Track / Global
Privacy Control.

## Development

Pure ES modules, zero dependencies, zero build step:

- [`tool/har-diff.mjs`](tool/har-diff.mjs) — the HAR-parsing and diff logic,
  unit tested and reused unchanged by the browser UI.
- [`tool/trackers.mjs`](tool/trackers.mjs) — the curated tracker-domain list.
- [`tool/usage.mjs`](tool/usage.mjs) — the local-first usage counter.
- [`tool/index.html`](tool/index.html) — the UI; imports all three directly.

```sh
cd ventures/consent-change-record/tool
node --test
```

To try it locally in a browser (file inputs work with `file://`, but serving
avoids any browser quirks with local script modules):

```sh
cd ventures/consent-change-record/tool
python3 -m http.server 8000
# open http://localhost:8000
```

## Status and what's unvalidated

Graduated 2026-08-24 from `portfolio/pipeline/candidates/consent-change-record.md`
(scored `probe`, composite 6.125, floor 4 on distribution) directly to a
shippable v0, per the portfolio's product-first direction: ship free value
and measure real usage rather than running another pre-build validation
round. The candidate's own mitigation note — "requires a named web-agency or
privacy-implementation partner before graduation" — is **not yet satisfied**;
no partner or practitioner has seen this tool. Distribution is the open
question this ships to start answering, not a solved one. See
[`VENTURE.yaml`](VENTURE.yaml) for the standing hypotheses and kill criteria.

## License

[MIT](LICENSE).
