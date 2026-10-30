# Babysitting Business Kit: the back office for a one-person babysitting business

After using this, a babysitter who runs their own business can **answer the right inquiries first, quote and schedule sits without double-booking, know who still owes them, set aside the right amount for taxes, collect references with consent, and publish their own website**. Before, that meant a notes app, a spreadsheet, a paper calendar, guesswork at tax time, or a monthly fee for software built for daycare centers.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/ · **Guide:** [Babysitting taxes, explained](babysitting-taxes.html)

Free and MIT. A browser app with no build step and no account, plus an optional one-file Node 22 server with zero dependencies that the sitter runs on their own hosting account.

## Who it is for

A babysitter who works for themselves (a student, a parent, a church-nursery volunteer turning it into a business) and finds families by word of mouth, church, school, Nextdoor or their own website. It was started for a Christian sitter, so it has an **optional** faith section: a statement on the website and faith-based activities (Bible stories, prayers at bedtime) offered **when parents ask**. A family's beliefs are never scored or used to filter leads; asking for those activities only counts as a match.

## Why someone would use it

| Today | Cost / catch | This kit |
|---|---|---|
| Care.com, Sittercity, UrbanSitter | Find you families; charge families or sitters, own the relationship, do not run your books | Runs the business once families find you, including the ones from word of mouth |
| Daycare software (Brightwheel, Procare, HiMama) | Built for centers: rooms, staff, state ratios; monthly per-site pricing | Built for one person: leads, sits, payments, taxes |
| Generic CRMs and booking apps (HoneyBook, Calendly, Square Appointments) | Monthly fees; no babysitting rates (extra child, late, holiday), no tax set-aside, no family statements | All of it, free, and the data stays with you |
| Notes app + spreadsheet + paper calendar | Free; double-bookings, missed follow-ups, a shoebox at tax time | Today list, conflict checks, quarterly reminders |

Not affiliated with any of the products named above; they are named only to say what this is and is not.

## What it does

- **Today:** one list, most urgent first: new inquiries and follow-ups (day 0, 2, 7 by default), unpaid sits, references to chase, families to invite back after 30 days, estimated-tax deadlines two weeks out, tomorrow's sits. Each item has a drafted message to copy.
- **Leads:** each inquiry is scored 0-100 against the sitter's own limits (travel radius, most children at once, youngest age, weekly availability, rate), with the reasons, and gets a reply draft: a warm yes with rates, or a kind no that names the reason. Recurring work and referrals score higher. One click turns a lead into a family.
- **Families:** kids with birth dates and allergies (allergies show as a red pill everywhere), emergency contact, house notes.
- **Schedule:** a live quote from the rate card (hourly, extra child, minimum hours, late-night extra, holiday multiplier, last-minute fee, late-cancellation fee), weekly repeats, double-booking and travel-gap warnings, and an `.ics` calendar file.
- **Money & taxes:** payments by family and method, expenses by Schedule C category, mileage at the IRS rate, net profit, self-employment tax (15.3% on 92.35%, Social Security capped at the wage base), a set-aside at the sitter's own brackets, the four quarterly due dates with a suggested payment each, unpaid sits, and flags: the $400 filing line, the household-employee threshold ($3,000 from one family in 2026, Publication 926), payment-app income and the 1099-K, missing mileage, and the EIN tip. A **year-end statement per family** gives parents what they need for Form 2441 or a dependent-care FSA.
- **References & testimonials:** request drafts, a five-day follow-up, separate yes/no consent for "may new families call you" and "may your words go on my website". Only quotes marked yes reach the website, as first name and last initial.
- **Website:** a one-file site built from the profile: story, certifications, rates, policies, the optional faith section, consented testimonials, `ChildCare` JSON-LD and an inquiry form (email by default, or the sitter's server). Download it and host it free anywhere.
- **Content:** twelve weeks of seasonal post ideas rotated across Facebook, Nextdoor, Instagram, a church or school bulletin and the website, plus rebooking, referral and testimonial messages per family. Drafts leave room for a real moment in the sitter's words, never an invented one.
- **Backup and sync:** a JSON backup file; or sync with the sitter's own server.
- **On a phone:** installable from the browser (Add to Home Screen): `manifest.webmanifest`, icons rendered from `icon.svg` by `make-icons.mjs`, and `sw.js`, which caches the app and every module `index.html` imports (it follows the imports itself, so new modules need no edit) and never caches `/api/*`, `/inquiry` or the calendar feed. On narrow screens the tab bar sits at the bottom and controls are at least 44 px tall. Tabs follow the WAI-ARIA pattern (`tabs.mjs`: arrow keys, Home, End, `aria-controls`), focus is always visible, and text colours meet WCAG AA contrast (checked in `a11y.test.mjs`).
- **Guides for searchers:** [How to start a babysitting business](how-to-start-a-babysitting-business.html), [How much to charge for babysitting](how-much-to-charge-for-babysitting.html) (the rate-card logic, with worked examples the tests recompute with `quote()`; no invented national averages) and [Babysitting references](babysitting-references.html).

## The optional server (automated sales)

`server.mjs` turns the website into an intake funnel: the form posts to `/inquiry`, the inquiry becomes a scored lead, the family can get the reply email at once, and the sitter gets a phone alert. Each morning it sends the Today list, and can send the due follow-ups for them.

```
ADMIN_KEY=$(openssl rand -hex 16) CAL_TOKEN=$(openssl rand -hex 12) STATE=desk.json node server.mjs
```

| Path | What |
|---|---|
| `/` | the app; Settings, "Sync" stores the desk on the server |
| `/site` | the sitter's website, with the form posting to `/inquiry` |
| `POST /inquiry` | form or JSON; honeypot field, 10 per IP per hour, 64 KB cap |
| `/calendar.ics?t=CAL_TOKEN` | a feed a phone calendar can subscribe to |
| `GET/PUT /api/desk`, `GET /api/today` | `Authorization: Bearer ADMIN_KEY` |

Everything outside the box is **off until you set it, on your own accounts**:

| Variable | Effect |
|---|---|
| `NOTIFY_WEBHOOK_URL`, `NOTIFY_FORMAT` (`ntfy` default, `slack`, `discord`) | a ping for each lead and the morning digest; ntfy.sh gives a free phone push |
| `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFY_EMAIL` | email through Resend (free tier) |
| `AUTO_REPLY=1` | email the reply draft to a family as soon as they inquire (email contacts only, never to a decline) |
| `AUTO_FOLLOW_UP=1` | email due follow-ups with the morning digest |
| `DIGEST_HOUR` (default 7), `TZ` | when the digest goes |

**Deploy:** `render.yaml` (Render, starter plan with a 1 GB disk; it generates `ADMIN_KEY` and `CAL_TOKEN`) or the `Dockerfile` anywhere. Nothing runs on the author's accounts.

Honest limits: one sitter per server; no payments or card capture (families pay the way they already do); no SMS yet; the website is one page; follow-ups are email only.

## Taxes: what the numbers are

US federal rules for 2026, with constants from sibling ventures that checked them: SS wage base $184,500 (ai-bookkeeper/payroll.mjs, ssa.gov), household-employee threshold $3,000 (nanny-tax-calculator), 1099-K $20,000 and 200 payments (1099-k-threshold-checker), mileage 72.5¢ and a reported 76¢ from 2026-07-01 (ai-bookkeeper/deductions.mjs, which notes irs.gov was not reachable to confirm the raise). The set-aside ignores the standard deduction and credits, so it errs high; it is an amount to save, not a return.

## Run and test

- **Page:** open `index.html` from a local server (`npx serve .`, or the server above). Data lives in this browser's localStorage under `babysitting-business-kit-desk`.
- **Tests:** `node --test ventures/babysitting-business-kit/*.test.mjs` (engine, server, page, deploy, usage).
- **Browser end-to-end:** `e2e.test.mjs` drives the app in Chromium at 390 px and 1280 px (load the example, add a lead, make it a family, book a sit, record a payment, check the tax panel, reload), checks keyboard tabs, 44 px targets, the guide pages and offline start-up. It skips itself when Playwright or its Chromium is missing, as on the CI venture runner, so run it locally after UI changes.

## Privacy

Everything runs in your browser. Your data is never uploaded by the page, and there are no accounts, tracking cookies or analytics vendor. We count anonymous events (which tabs and features get used, nothing about who) in this browser's localStorage; the footer button turns it off, and Do Not Track / Global Privacy Control are honoured. If you run the server, your desk and the inquiries your website collects live in one JSON file on your hosting account, and leave it only through the services you configure.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for, including taxes, licensing and child-safety rules where you live. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licence. Optional support: https://github.com/sponsors/Duncan-Haywood
