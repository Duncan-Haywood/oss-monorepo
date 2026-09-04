# Tender Radar

Tender Radar is a free, local-first shortlist tool for small contractors who
need to review public tender listings without spending an afternoon in a
portal. Paste a CSV exported from a tender portal, filter by your trade and
minimum value, and download a shortlist ordered by deadline.

The v0 does not fetch portals, submit bids, or generate eligibility advice. The
contractor verifies every source listing, requirement, deadline, and declaration
before acting.

Open [`site/index.html`](site/index.html) directly or serve `site/` as a static
site. The expected CSV columns are `title, buyer, deadline, category, value,
url`. Dates use `YYYY-MM-DD`; value is a plain number in the currency shown by
the source portal.

The trade/category filter accepts a comma-separated list of terms
(`roofing, roof repair, reroof`) so a portal that spells the same trade three
different ways across rows only needs one pass — a row matches if any term
appears in its category or its title. It is still a plain substring match, not
a synonym dictionary, so a spelling you did not list is still missed.

The worked example (roofing, minimum 20,000) keeps the school roof and the
clinic reroof and drops the $12,000 painting hall.

Tenders whose deadline has already passed are hidden from the shortlist by
default — a portal export usually still contains last week's notices, and a
closed tender is not something anyone can act on. Uncheck "Hide tenders that
already closed" to see them anyway; a shown-but-closed row is still marked
Closed so it isn't mistaken for a live one.

Each row shows a "Days left" column alongside the deadline date, so the rows
that need action this week don't require doing the date arithmetic yourself.

Your pasted CSV and filter settings are saved to this browser's local storage
after you create a shortlist, and restored the next time you open the page —
this is meant to be a workflow you return to, not a one-off form. Nothing is
saved anywhere but your own browser; use "Clear saved data" to remove it and
go back to the worked example.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or procurement
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

Everything runs in your browser. Your listings are never uploaded, and there
are no accounts, cookies, or analytics vendors. Optional anonymous feature-use
events are counted only in localStorage, contain no listing content, honor Do
Not Track and Global Privacy Control, and can be turned off in the footer.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
does not change what the tool does.

```bash
cd ventures/tender-radar/site
node --test calc.test.mjs draft.test.mjs
node ../../../platform/pages/clauses.mjs tender-radar
```

MIT licensed; see [`LICENSE`](LICENSE).
