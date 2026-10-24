# Trial Conversion Timing Analyzer

Free, browser-only tool for SaaS and app founders. Paste the date each free
trial started and the date that user first paid (blank if they did not). It
shows on which day of the trial people convert, flags a last-two-days deadline
pile-up, and counts what a shorter trial would have lost, with a seeded
bootstrap range and a hold-out check that says when your conversion timing has
moved. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/trial-conversion-timing-analyzer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, finished-trial filter, conversion-by-day, shorter-trial what-if, bootstrap, hold-out.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; a statistical estimate from data you supply,
not advice. It cannot see what a different trial length does to sign-ups and
says nothing about trials longer than the one you ran. Unverified against a
published dataset: tested on simulated trials with known timing.

MIT licence, see `LICENSE`.
