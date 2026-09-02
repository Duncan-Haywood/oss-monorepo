# Grant Reporting Tracker

**Track nonprofit grant reporting deadlines without a grant-management subscription.** Add awards, reporting intervals, and spend to get a sorted review queue, see restricted balances, and export a CSV for your team. The app runs entirely in the browser; grant data never leaves your device.

After using this, you can now see which grant report needs attention next and hand your team an export, which used to require a spreadsheet assembled by hand.

## Use it

Open `index.html` in a browser. Add one row per award, enter the award date and reporting interval in months, then select **Review grants**. The date is a planning calculation, not a filing deadline determination. Export the resulting queue when you need to share it.

See [when-is-my-grant-report-due.html](when-is-my-grant-report-due.html) for a worked example of how the review queue is sorted, or [vs-granthub.html](vs-granthub.html) for how this narrow, free tracker differs from Foundant's paid GrantHub grant-management platform.

## Privacy and usage

Everything runs in your browser. Grant data is never uploaded, and there are no accounts, cookies, or analytics vendors. The optional usage switch counts only local feature events (`grant_added`, `reviewed`, `sample_loaded`, `exported`) in this browser; it stores no grant names, amounts, dates, IPs, or identifiers. It is off by default, and counting stops automatically when the browser sends Do Not Track or Global Privacy Control.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial, legal, or tax advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The tracker produces a planning queue. It does not determine a funder's rules, file a report, certify allowability, or confirm compliance. Check the award agreement and ask your grant professional about the obligations that apply.

## Development

```sh
node --test
```
