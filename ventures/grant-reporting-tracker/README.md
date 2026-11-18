# Grant Reporting Tracker

**Track nonprofit grant reporting deadlines without a grant-management subscription.** Add awards, reporting intervals, and spend to get a sorted review queue, see restricted balances, and export a CSV for your team. The app runs entirely in the browser; grant data never leaves your device.

**Live tool:** https://marisstella.app/grant-reporting-tracker/

After using this, you can now see which grant report needs attention next and hand your team an export, which used to require a spreadsheet assembled by hand.

## Use it

Open `index.html` in a browser. Add one row per award, enter the award date and reporting interval in months, then select **Review grants**. The date is a planning calculation, not a filing deadline determination. Export the resulting queue when you need to share it. Each row in the queue has its own **Remove** button, so correcting a mistyped award or dropping one whose reporting obligation ended no longer requires "Clear all saved awards" to wipe every other tracked grant along with it.

See [when-is-my-grant-report-due.html](when-is-my-grant-report-due.html) for a worked example of how the review queue is sorted, or [vs-granthub.html](vs-granthub.html) for how this narrow, free tracker differs from Foundant's paid GrantHub grant-management platform.

## Privacy and usage

Everything runs in your browser. Grant data is never uploaded, and there are no accounts, cookies, or analytics vendors. The optional usage switch counts only local feature events (`grant_added`, `reviewed`, `sample_loaded`, `exported`, `grant_removed`, `report_filed`) in this browser; it stores no grant names, amounts, dates, IPs, or identifiers. It is off by default, and counting stops automatically when the browser sends Do Not Track or Global Privacy Control.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, legal, or tax advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The tracker produces a planning queue. It does not determine a funder's rules, file a report, certify allowability, or confirm compliance. Check the award agreement and ask your grant professional about the obligations that apply.

## Known gaps

From the 2026-11-13 quality audit ([`portfolio/quality/audits/2026-11-13-grant-reporting-tracker.json`](../../portfolio/quality/audits/2026-11-13-grant-reporting-tracker.json)):

- The due date is the end of each reporting interval, with no lag after it. Federal awards are due a set number of days after each period ends (30 days for quarterly or semiannual reports, 90 for annual, under 2 CFR 200.329), so the tracker flags them earlier than the rule requires. Enter your agreement's actual due dates if they differ.
- There is no award end date and no final report. Under 2 CFR 200.344 the final report is due 120 days after the period of performance ends.
- Spending above the award shows as a negative balance with no warning.

## Development

```sh
node --test
```
