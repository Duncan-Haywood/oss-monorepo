# Grant Deadline Tracker

Small nonprofits can track grant applications, reporting dates, and remaining award funds without rebuilding a fragile spreadsheet every month. Open `index.html` in a browser, add your grants, and export a private CSV for a board or finance meeting.

The tracker is free, browser-only, and works without an account, API key, or network connection. It highlights overdue and next-30-day obligations, but it is a planning record, not a filing system or grant compliance determination.

## Privacy and safety

Everything runs in your browser. Your grant data is never uploaded, and there are no accounts, tracking cookies, or analytics vendors. Opt-in draft storage stays in local storage on this device. We count anonymous feature events only, never people, content, IPs, or cookies; turn counting off in the page. Do Not Track and Global Privacy Control disable counting automatically.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Tests

```bash
node --test calc.test.mjs
```

Future paid options could add maintained funder templates, team history, or reminders, but this launch has no payment collection and no paid dependency.
