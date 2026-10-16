# Sponsor Ready

A free, client-side checklist that scores a public GitHub repo against the
signals that correlate with attracting GitHub Sponsors, and returns a ranked
"fix this first" list. No account, no server, no stored data — every check
runs in the visitor's own browser, calling `api.github.com` directly.

After using this, you can now see which sponsorship signals are missing and
in what order to fix them, which used to take a manual pass through
FUNDING.yml, README, About, and community-health files.

This is a different question than grant-deadline-tracker or
grant-reporting-tracker: those track funder deadlines and reports. This one
scores a public repo for GitHub Sponsors readiness.

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

```bash
npm test        # node --test — scoring, parse helpers, usage, page clauses
```

`scoring.js` (the checklist and weights) and the pure helpers in `app.js`
(`parseRepoInput`, `fundingYmlHasEntries`, `containsSponsorshipAsk`) are
covered directly.

## Privacy and disclaimers

- No backend of ours. The browser calls `api.github.com` for the repo you
  typed. Nothing about the scanned repo is sent anywhere else by this tool.
- "Copy link to this result" puts the repo name in the page's own URL
  fragment (after `#`), which browsers never include in an HTTP request —
  opening the link re-runs the scan in the recipient's browser rather than
  fetching anything from us. Only public repos can be scanned in the first
  place, so the link exposes nothing a visit to the repo's own GitHub page
  would not.
- Usage counting follows `portfolio/usage/README.md`: aggregate event names
  and a day, kept local-first in your `localStorage`. Honor Do Not Track and
  Global Privacy Control. The page has an opt-out. We never store which repo
  you scanned.
- Informational heuristic only. Not affiliated with GitHub. Does not
  guarantee any sponsorship outcome.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, or financial advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
export your inputs and run it yourself.

Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
Refusing does not change the checklist.

## Status

Salvaged from closed #922 onto current main. Not yet deployed to a public
URL — publishing under the portfolio's public name is owner-gated per
`portfolio/DIRECTION.md`. Until then: `npm test` for the logic, or serve it
locally to try the full flow against any public repo.

## Deploying (when authorized)

Static files only — no environment variables required. The intended host is
GitHub Pages (see `platform/pages/`). The Pages build discovers this
directory automatically.
