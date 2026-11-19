# Contractor Bid Readiness

Contractors can now turn a scattered RFP into an owner-by-owner checklist,
copy a shareable link to it, or download a private Markdown handoff before the
submission deadline. That used to mean searching email, a shared drive, and a
spreadsheet while a bid clock was running.

**Live tool:** https://marisstella.app/contractor-bid-readiness/

Open `index.html` in a browser. Add the solicitation's requirements, assign
owners, mark each item ready, attention, or blocked, then check readiness and
download the report. Press "Copy shareable link" to hand the whole checklist —
opportunity, due date, and every requirement row — to a subcontractor or
co-bidder as a link they can open and keep editing, instead of retyping it
from a PDF or the Markdown export. It is free, requires no account or API key,
and keeps bid details in the browser.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are no
accounts, tracking cookies, or analytics vendors. "Copy shareable link" encodes
the checklist into the URL fragment (the part after `#`), which browsers never
send to a server or record in a Referer header — nothing leaves your browser
when you share it, but only send the link to people you trust with those
details. If enabled, the app stores only anonymous feature counters in your
browser: `readiness_checked`, `report_downloaded`, `share_link_copied`, and
`shared_link_opened`. Uncheck the usage option to turn counting off. Counting
is also disabled when the browser sends Do Not Track or Global Privacy Control.

## Limits

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, financial, or contracting advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting any
obligation it helps you prepare for. To the maximum extent permitted by law,
the authors accept no liability for any loss or damage arising from its use.

The report is a private working record, not a determination that a bid is
complete, compliant, or likely to win. Review the original solicitation and
confirm requirements with the issuing authority.

## Known gaps (quality audit 2026-11-19)

From [`portfolio/quality/audits/2026-11-19-contractor-bid-readiness.json`](../../portfolio/quality/audits/2026-11-19-contractor-bid-readiness.json):

- **The deadline is a date, not a time.** A bid due at 2:00 pm today still
  reads "urgent" at 3:00 pm, after it can no longer be filed. A due-time and
  issuing-office time-zone field is the fix; until then the days page says so.
- **The urgency label is computed but not shown on the page** (the Markdown
  report now carries it), though several pages describe it.
- **Checklist rows are not saved** between visits unless a share link is copied.
- **The DST test only bites when the runner's time zone observes DST**; run
  `TZ=America/New_York node --test '*.test.mjs'` as well.
- **Share links cut notes at 120 characters and rows past 100** without saying so.
