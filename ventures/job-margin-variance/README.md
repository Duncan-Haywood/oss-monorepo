# Job Margin Variance

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/job-margin-variance/>

Job Margin Variance is a free, local-first completed-job review for independent
contractors. Enter the estimate and actual hours and costs to see where the job
drifted, what the variance means in the same currency, and which assumption is
worth reviewing before the next quote.

Two fields are optional and add depth without changing the required
worksheet: a labor rate converts the hours row into dollars so "largest
movement" compares like units instead of comparing a raw hours count against
raw dollars (a 20-hour labor overrun can otherwise lose to a $50 materials
swing purely because 20 < 50, even when the labor overrun is actually the
more expensive line). Adding a job/bid price alongside the labor rate turns
cost variance into the margin swing the product is named for — estimated
margin, actual margin, and the point/dollar change between them — not just
"costs ran $60 over."

After using this, you can identify the cost or time assumption that changed a
job's result, which used to take a spreadsheet comparison.

Open [`index.html`](index.html) directly. No account, API key, accounting
integration, or network connection is needed. The report can be copied for a
job folder; all arithmetic runs in the browser.

The calculator page carries its own **Common questions** section (what counts
as "other costs," what a negative variance means, whether any data leaves the
browser, and when to run the review) so the same page that does the
arithmetic also answers what a visitor searches for — `platform/pages/build.mjs`
turns that section into `FAQPage` structured data automatically. A second
page, [`why-did-my-job-cost-more-than-i-estimated.html`](why-did-my-job-cost-more-than-i-estimated.html),
targets the search phrase directly with a worked example.

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not financial or business advice, and it does
not replace a qualified professional. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any obligation it
helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are no
accounts, tracking cookies, or analytics vendors. An optional anonymous local
counter records only `report_generated`; it stores no job name, values, or
identity and can be disabled in the footer.

## Opportunity fit

This is intentionally not another pre-sale bid calculator. Existing portfolio
tools help choose a price; this tool helps a contractor learn from completed
work. The narrow search wedge is “job cost variance calculator” and “estimated
vs actual labor hours.” A future business model could be a hosted history or
accounting import, but the free local workflow remains useful without either.
