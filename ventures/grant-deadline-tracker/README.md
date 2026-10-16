# Grant Deadline Tracker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/grant-deadline-tracker/>

Small nonprofits can track grant applications, reporting dates, and remaining award funds without rebuilding a fragile spreadsheet every month. Open `index.html` in a browser, add your grants, and export a private CSV for a board or finance meeting.

**After using this, you can now** see which report or application is overdue, how much of each award remains, whether a contract grant writer still costs less than the cash a late report puts at risk, hand finance a CSV, and drop a calendar file with a reminder for every obligation into Google Calendar, Outlook, or Apple Calendar — which used to take a hand-maintained spreadsheet and a calendar reminder you set yourself, one grant at a time.

The tracker is free, browser-only, and works without an account, API key, or network connection. It highlights overdue and next-30-day obligations. It is a planning record, not a filing system or grant compliance determination.

If a funder wants a report every six months from the award date, enter the award date and interval and the tracker fills the current (possibly overdue) due date. You can also type the next date yourself.

If the report is the gate on a remaining draw, open [Should I hire a grant writer to file this report?](should-i-hire-a-grant-writer-to-file-this-report.html). The tracker compares missing it, writing it yourself, and hiring a writer against the unspent award, next installment, optional renewal, and optional clawback you type. It does not file the report or decide what the funder will withhold.

## Run it

Open `index.html` directly, or:

```sh
python3 -m http.server 8876 --directory ventures/grant-deadline-tracker
```

Then open `http://localhost:8876`.

## Privacy and safety

Everything runs in your browser. Your grant data is never uploaded, and there are no accounts, tracking cookies, or analytics vendors. Opt-in draft storage stays in local storage on this device. We count anonymous feature events only, never people, content, IPs, or cookies; turn counting off on the page. Do Not Track and Global Privacy Control disable counting automatically.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or compliance advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```

Future paid options could add maintained funder templates or team history, but this launch has no payment collection and no paid dependency.
