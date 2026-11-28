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

## Reporting lag, award end and final report

Three optional fields on each award (added 2026-11-28 after the quality re-audit, [`portfolio/quality/audits/2026-11-28-grant-reporting-tracker.json`](../../portfolio/quality/audits/2026-11-28-grant-reporting-tracker.json)):

- **Report due, days after each period.** Blank keeps the original meaning (due on award date plus each interval). With a number, each period ends the day before the next starts and its report is due that many days later: 30 for federal quarterly or semiannual reports, 90 for annual (2 CFR 200.329).
- **Award period ends.** The last period's report becomes the final report, due 120 days after the end (2 CFR 200.344) or after the days you enter. Filing it shows "All reports filed".
- Spending above the award is flagged "overspent" in the queue and in the CSV.

## Known gaps

- One report stream per award. Agreements that set different schedules for financial (SF-425) and performance reports need two rows.
- Reporting periods run from the award date. A federal award reporting on calendar quarters from a mid-quarter start needs its award date set to the first quarter start.
- The tool does not read the award agreement; the dates are only as right as the fields typed in.

## Development

```sh
node --test
```
