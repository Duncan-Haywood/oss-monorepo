# Tender Radar

Tender Radar is a free, local-first shortlist tool for small contractors who
need to review public tender listings without spending an afternoon in a
portal. Paste a CSV exported from a tender portal, filter by your trade and
minimum value, and download a shortlist ordered by deadline.

The v0 does not fetch portals, submit bids, or generate eligibility advice. The
contractor verifies every source listing, requirement, deadline, and declaration
before acting. A future optional AI draft feature would use the user's own key;
the deterministic shortlist remains complete without one.

Open [`site/index.html`](site/index.html) directly or serve `site/` as a static
site. The expected CSV columns are `title, buyer, deadline, category, value,
url`. Dates use `YYYY-MM-DD`; value is a plain number in the currency shown by
the source portal.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, financial, or procurement
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

Everything runs in your browser. Your listings are never uploaded, and there
are no accounts, cookies, or analytics vendor. Optional anonymous feature-use
events are counted only in localStorage, contain no listing content, and can be
turned off in the footer.

MIT licensed; see [`LICENSE`](LICENSE).
