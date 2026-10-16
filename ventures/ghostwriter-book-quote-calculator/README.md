# Ghostwriter Book Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ghostwriter-book-quote-calculator/>

A free browser tool: **type a book's word count and how long each part of the job takes, and get a flat fee that
holds your target hourly rate.** It shows the per-word and per-page rate that results, a deposit and milestone
schedule, the price of one extra revision round, your real hourly if the job runs over, and what a client's lower
budget pays you and how many words of book it buys. Nothing is uploaded.

After using this, you can **quote the book from your hours instead of from a guess**, and answer "can you do it for
less?" with a shorter scope instead of a discount.

## Model

- Hours = drafting (words / finished words per hour) + interviews with prep + research + revision rounds (a share of
  drafting hours each) + management.
- Fee = hours x hourly x (1 + confidentiality premium) x (1 + rush premium) + expenses, divided by (1 - commission).
- Effective hourly = (invoice x (1 - commission) - expenses) / hours actually worked.

All defaults are placeholders, not market rates. Not modelled: contract terms, rights and royalties, kill fees, taxes.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
