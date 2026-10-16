# Patent Maintenance Fee Planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/patent-maintenance-fee-planner/>

**Which US patent maintenance fees are due, when does the surcharge start, when does the patent expire, and what will the portfolio cost?** Paste patents with grant dates and entity size. The planner shows, for the next fee on each patent, the window-open date, the no-surcharge due date, the end of the surcharge period and the expiry date if unpaid; a multi-year fee budget; what letting chosen patents lapse would save; and exports a CSV and an `.ics` calendar file with a reminder and a last-day event per fee.

Open `index.html` in a browser. No account, network request or API key.

## The rules it models

- Utility patents granted on or after 1980-12-12 (35 U.S.C. 41(b), 37 CFR 1.362). Design and plant patents have no maintenance fees.
- Fees fall due 3y6m, 7y6m and 11y6m after grant. Each is payable without surcharge from 3y, 7y and 11y; a further six months allows payment with a surcharge; an unpaid patent expires at the end of the 4th, 8th or 12th anniversary of grant.
- Deadlines on a Saturday or Sunday roll to Monday. Federal holidays are not modelled; the page says so.
- Month arithmetic clamps to the end of a short month (grant 31 Aug + 6 months = 28/29 Feb).
- A fee whose grace period ended before the as-of date is assumed paid.

The fee table is editable. Defaults are the USPTO schedule effective 2025-01-19 as the author understood it and could not be re-verified when written; confirm against the current USPTO fee schedule and overwrite any that differ.

## Privacy and usage

Everything runs in your browser. Unless opted out, the page stores only an aggregate event name and day in local storage (`plan_calculated`, `csv_exported`, `calendar_exported`, `share_link_copied`), never patent data. Do Not Track and Global Privacy Control disable counting. A shared link contains the patent list and fee table it was made from.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal advice and is not a docketing system of record; it does not replace a registered patent attorney or agent, or the USPTO's own records. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Development

`calc.mjs` is a pure ES module. Run tests with `node --test`.
