# Job Application Tracker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/job-application-tracker/>

A free job application tracker that lives in your browser. Log each
application once; it tells you which follow-ups are due today, flags
applications that have been silent for 30+ days, and shows your reply and
interview rate by source (LinkedIn, referral, company site…) so you can see
where your effort is paying off. No account, no sync, nothing uploaded.

After using this, you can **see who to follow up with today and which job
source actually replies**, which used to mean maintaining your own
spreadsheet formulas or signing up for an account-gated tracker.

## Try it

Open [`index.html`](index.html). Add an application, or click **Load example
data**. Export to CSV whenever you like; download a `.ics` file to put pending
follow-ups in your calendar.

- Guide: [`when-to-follow-up-on-a-job-application.html`](when-to-follow-up-on-a-job-application.html)
- Comparison: [`vs-a-spreadsheet.html`](vs-a-spreadsheet.html)

## How it works

[`tracker.mjs`](tracker.mjs) holds every rule as pure functions (dates passed
in, never read from the clock), tested in [`tracker.test.mjs`](tracker.test.mjs):

- Default follow-up: 7 days after applying, 3 days after a screen or
  interview; any explicit date overrides it; offers and closed applications
  have none.
- "Quiet" = still *applied* with no activity for 30 days. It is a suggestion;
  nothing changes status automatically.
- A reply is any move to screen, interview, offer or rejection — a rejection
  is an answer too.
- CSV export prefixes cells starting with `= + - @` with a quote so a note
  cannot run as a spreadsheet formula; import removes the prefix.
- Import accepts CSV (columns `company, role, source, link, salary, status,
  applied, followUp, notes`, any order) or the JSON backup, skipping
  duplicates.

```
node --test
```

## Privacy

Everything runs in your browser. Your applications are stored in local
storage on your device and never uploaded. There are no accounts, cookies, or
analytics vendors. Anonymous feature events are counted in local storage only
and can be turned off from the page.

## Limits

Data lives in one browser; clearing site data deletes it, so export now and
then. The page sends no notifications — use the calendar file. Follow-up gaps
and reply-rate figures are conventions and summaries of what you entered, not
predictions about any employer.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not career, legal, or any other professional
advice. **You are responsible for reviewing and verifying its output before
relying on it.** To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record.

Licensed MIT. Optional support: <https://github.com/sponsors/Duncan-Haywood>.
