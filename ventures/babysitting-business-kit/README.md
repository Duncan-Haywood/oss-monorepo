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
- **Openings and the week view** (`slots.mjs`): free windows for the next weeks (weekly availability minus booked sits, a travel buffer each side and pending requests, at least the minimum-hours long), a copy-ready "Openings this week: Tue 3-10pm, Thu 3-6pm, Sat all day" post, a 7-day grid with sits as blocks and allergies on them, and a Skip/Restore button for one date of a weekly repeat.
- **Money & taxes:** payments by family and method, expenses by Schedule C category, mileage at the IRS rate, net profit, self-employment tax (15.3% on 92.35%, Social Security capped at the wage base), a set-aside at the sitter's own brackets, the four quarterly due dates with a suggested payment each, unpaid sits, and flags: the $400 filing line, the household-employee threshold ($3,000 from one family in 2026, Publication 926), payment-app income and the 1099-K, missing mileage, and the EIN tip. A **year-end statement per family** gives parents what they need for Form 2441 or a dependent-care FSA.
- **Federal estimate, safe harbor and Schedule C** (`taxes.mjs`): beside the set-aside, a real federal estimate for a single, head-of-household or married-joint filer (2026 brackets and standard deduction, SE tax, the half-SE deduction, the 20% QBI deduction under the threshold, optional W-2 wages and withholding, the year so far projected to a full year); the safe-harbor plan (the smaller of 90% of this year and 100% of last year, 110% above $150,000 AGI) with what is needed by each due date, what has been paid and what to pay next; estimated payments recorded; a Schedule C worksheet (income to line 1, mileage to line 9, each category to its line) as a CSV for a preparer; and a printable year summary.
- **References & testimonials:** request drafts, a five-day follow-up, separate yes/no consent for "may new families call you" and "may your words go on my website". Only quotes marked yes reach the website, as first name and last initial.
- **References & testimonials:** request drafts, a five-day follow-up, separate yes/no consent for "may new families call you" and "may your words go on my website". Only quotes marked yes reach the website, as first name and last initial. With the server, each person gets a private link where they write their own words and tick the two consents themselves; the answer is kept with its timestamp and the exact wording shown, and they can withdraw through the same link (the quote leaves the site at the next build; a sitter cannot re-tick a consent the referee withdrew). Request templates for a parent, teacher, church leader, coach or employer, follow-ups at 5 and 12 days then stop, and a printable **reference packet** for a new family that lists only people who agreed to be contacted, with the sitter's certifications.
- **Website** (`site.mjs`): a small site built only from the sitter's own words, in three themes (warm, bright, simple; every text colour tested at WCAG AA 4.5:1), mobile first. Home (story, rates, towns served, optional faith section, consented testimonials, inquiry form), about (what a sit looks like, first sit, safety, certifications with dates; expired ones are hidden), rates and policies (cancellation, payment, sick child) and an FAQ answered from those fields. Empty fields hide their section. Local SEO: title and description from town + "babysitter", `ChildCare` JSON-LD with `areaServed`, Open Graph, `FAQPage` data, canonical links, `robots.txt` and `sitemap.xml` for the sitter's own address. "Download all files (.zip)" (a store-only zip written in-house) drops onto Netlify, Cloudflare Pages or GitHub Pages. A "get found locally" checklist (Google Business Profile, Nextdoor, Facebook page, church and school directories) gives plain steps and promises nothing.
- **Content:** twelve weeks of seasonal post ideas rotated across Facebook, Nextdoor, Instagram, a church or school bulletin and the website, plus rebooking, referral and testimonial messages per family. Drafts leave room for a real moment in the sitter's words, never an invented one.
- **Intake and pipeline** (`intake.mjs`): a printable [meet-and-greet kit](meet-and-greet.html) (questions on routines, discipline, screens, allergies and medications, emergencies, pick-up, pets, house rules, driving and pay) with a red-flag checklist about **safety and payment only**, never beliefs or demographics; flags the records suggest (no emergency contact, money still owed, "pay later" or "no car seat" in the notes); a family info sheet (kids, allergies, meds, bedtimes, emergency contacts, doctor, a medical-consent note marked "a template, not legal advice") on paper or as a one-time link; and pipeline stats in the Leads tab: leads by channel (church, school, Nextdoor, referrals, website, social, marketplaces) and stage, inquiry-to-booked conversion and median days to book.
- **Backup and sync:** a JSON backup file; or sync with the sitter's own server.

## The optional server (automated sales)

`server.mjs` turns the website into an intake funnel: the form posts to `/inquiry`, the inquiry becomes a scored lead, the family can get the reply email at once, and the sitter gets a phone alert. Each morning it sends the Today list, and can send the due follow-ups for them.

```
ADMIN_KEY=$(openssl rand -hex 16) CAL_TOKEN=$(openssl rand -hex 12) STATE=desk.json node server.mjs
```

| Path | What |
|---|---|
| `/` | the app; Settings, "Sync" stores the desk on the server |
| `/site/` | the sitter's website (`index.html`, `about.html`, `policies.html`, `faq.html`, `robots.txt`, `sitemap.xml`), with the form posting to `/inquiry` |
| `POST /inquiry` | form or JSON; honeypot field, 10 per IP per hour, 64 KB cap |
| `GET/POST /book` | open times only (no family names or details); a request becomes a lead with status `requested` that holds its time until you approve or decline it in the Schedule tab. Never auto-confirmed. Honeypot, 10 per IP per hour. `BOOK_WEEKS` (default 2, max 8) sets how far ahead |
| `/ref/<token>` | a referee's private link (made in the References tab, 30 days, one answer): their own words plus two separate consents, stored with the time and exact wording; the same link later only offers withdrawal (`references.mjs`) |
| `/calendar.ics?t=CAL_TOKEN` | a feed a phone calendar can subscribe to |
| `/intake/<token>` | a family's one-time info sheet: the app's Families tab makes the 128-bit token, Sync puts it on the server, the family's answers merge into their record once (32 KB cap, escaped output, `no-store`), and the next Sync keeps them |
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

Honest limits: one sitter per server; no payments or card capture (families pay the way they already do); no SMS yet; follow-ups are email only.

## Taxes: what the numbers are

US federal rules for 2026, with constants from sibling ventures that checked them: SS wage base $184,500 (ai-bookkeeper/payroll.mjs, ssa.gov), household-employee threshold $3,000 (nanny-tax-calculator), 1099-K $20,000 and 200 payments (1099-k-threshold-checker), mileage 72.5¢ and a reported 76¢ from 2026-07-01 (ai-bookkeeper/deductions.mjs, which notes irs.gov was not reachable to confirm the raise). The set-aside ignores the standard deduction and credits, so it errs high; it is an amount to save, not a return. The federal estimate in `taxes.mjs` copies the 2026 and 2025 brackets, standard deductions and QBI thresholds from ai-bookkeeper/estimatedtax.mjs (checked there against Rev. Proc. 2025-32 and 2024-40 on 2026-10-23) and leaves out credits and itemised deductions; the safe harbor follows IRC 6654(d), (e)(1) and (g). Married filing separately is not modelled.

## Run and test

- **Page:** open `index.html` from a local server (`npx serve .`, or the server above). Data lives in this browser's localStorage under `babysitting-business-kit-desk`.
- **Tests:** `node --test ventures/babysitting-business-kit/*.test.mjs` (engine, taxes, server, page, deploy, usage).

## Privacy

Everything runs in your browser. Your data is never uploaded by the page, and there are no accounts, tracking cookies or analytics vendor. We count anonymous events (which tabs and features get used, nothing about who) in this browser's localStorage; the footer button turns it off, and Do Not Track / Global Privacy Control are honoured. If you run the server, your desk and the inquiries your website collects live in one JSON file on your hosting account, and leave it only through the services you configure.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for, including taxes, licensing and child-safety rules where you live. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licence. Optional support: https://github.com/sponsors/Duncan-Haywood
