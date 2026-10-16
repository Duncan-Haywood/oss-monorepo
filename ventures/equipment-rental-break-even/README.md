# Equipment Rental Break-Even

Free equipment-rental pricing calculator for independent tool, party, and
construction-equipment rental operators. Enter a proposed booking and see the
minimum price, contribution after variable costs, and monthly utilization you
need to recover ownership costs. Download a plain-text quote snapshot for your
records, or copy a share link that hands a live, editable copy of the same
scenario to a partner or customer.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/equipment-rental-break-even/

After using this, you can now price a rental booking with delivery, cleaning,
damage reserve, and idle-time costs included, which used to take a spreadsheet
and a guess at utilization.

Open `site/index.html` directly or serve this directory with any static HTTP
server. No build step or dependency is required.

## Privacy and Usage

Everything runs in your browser. Your data is never uploaded, and there are no
accounts, tracking cookies, or analytics vendors. The app counts anonymous
feature events in browser `localStorage` only (successful calculations and
exports); the counter is visible and can be disabled or cleared in the page.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial, tax, legal, or engineering
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

## Opportunity assessment

This is distinct from the portfolio's quote-margin and trade-bid calculators:
the buyer is an equipment owner pricing an asset's booking utilization, not a
service provider estimating labor. Existing alternatives are spreadsheets,
generic rental software, and daily-rate calculators; this wedge exposes the
often-missed idle inventory and ownership recovery math while staying useful
without an account. A future hosted tier could add saved fleet scenarios and
calendar utilization imports, but the free launch has zero variable cost.

Future revenue could be a low-cost per-fleet subscription for scenario history
or a bring-your-own-key AI assistant that explains imported booking patterns.
No payment or external integration is included now. Main risks are incorrect
user assumptions and false confidence, mitigated by showing every formula and
never claiming a booking is profitable.
