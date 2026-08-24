# Sponsor Ready

A free, client-side checklist that scores a public GitHub repo against the
signals that correlate with attracting GitHub Sponsors, and returns a ranked
"fix this first" list. No account, no server, no stored data — every check
runs in the visitor's own browser, calling `api.github.com` directly.

See [`portfolio/pipeline/candidates/oss-sponsor-readiness.md`](../../portfolio/pipeline/candidates/oss-sponsor-readiness.md)
for the scoring writeup this venture graduated from.

## What it checks

Ten signals, weighted 0–100 (see [`scoring.js`](scoring.js) for the exact
weights and copy):

- A valid `FUNDING.yml` (the file that turns on the Sponsor button at all)
- A visible sponsorship ask in the README
- Recent push activity
- README substance (not a stub)
- Repo description, topics, license, homepage/demo link
- `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`

This is deliberately narrower than GitHub's own `community/profile` health
score: it is scoped to signals that specifically correlate with sponsorship,
not generic OSS hygiene.

## Running it

No build step, no dependencies. Serve the directory statically and open it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Testing

Pure scoring and parsing logic is separated from the DOM/fetch code
specifically so it can be tested with zero dependencies:

```bash
npm test        # node --test — scoring.test.js + app.test.js
```

`scoring.js` (the checklist and weights) and the pure helpers in `app.js`
(`parseRepoInput`, `fundingYmlHasEntries`, `containsSponsorshipAsk`) are
covered directly. The fetch/DOM orchestration in `app.js` was verified
manually against a real repo via a headless-browser run against GitHub's
live API (see the venture's hypotheses in `VENTURE.yaml`).

## Privacy and disclaimers

- No backend. Nothing about a scanned repo is transmitted anywhere by this
  tool beyond the browser's direct request to `api.github.com`.
- `track()` in `app.js` is a no-op unless `window.SPONSOR_READY_ANALYTICS_ENDPOINT`
  is set at deploy time, and even then sends only an event name and a
  timestamp — never the repo scanned.
- Informational heuristic only. Not affiliated with GitHub. Does not
  guarantee any sponsorship outcome — see the in-app disclaimer.

## Status

Built and tested 2026-08-24. Not yet deployed to a public URL — publishing
under the portfolio's public name (a production domain) is owner-gated per
`portfolio/DIRECTION.md`. Until then: `npm test` for the logic, or serve it
locally to try the full flow against any public repo.

## Deploying (when authorized)

Static files only — no environment variables required for the free tier.
Any static host works (GitHub Pages, Cloudflare Pages, Vercel). The one
optional integration point is `window.SPONSOR_READY_ANALYTICS_ENDPOINT` in
`index.html`, for wiring up a privacy-respecting analytics endpoint later.
