# Donor Retention Analyzer

Free, browser-only tool for small nonprofits. Paste one row per gift (donor, date,
amount). It computes donor retention by fiscal year with a seeded bootstrap range,
splits first-time from repeat donors, reports dollar retention, and lists your
LYBUNT and SYBUNT donors ranked by expected dollars: the chance a donor in the same
position gave again within a year in your own history, times their typical gift. A
hold-out check says when the ranking should not be read as a forecast. Nothing is
uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/donor-retention-analyzer/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - parsing, fiscal-year retention, snapshot probability model, hold-out, CSV.
- `usage.mjs` - local-only feature counters with an opt-out.

**No warranty.** Free and as-is; a statistical estimate from data you supply, not
advice. It does not model why donors lapsed, gift type, capacity or consent, and you
remain responsible for the privacy and solicitation rules that apply to your donors.
Unverified against a published dataset: tested on simulated donors with known giving
odds and hand-counted examples.

MIT licence, see `LICENSE`.
