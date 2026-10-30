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
- **Insights** (`insights.mjs`): what each family really pays per hour once the round-trip drive (time typed per family, or miles at an assumed speed the sitter sets) and the car (miles at the IRS rate) are counted, best to worst, with the minimum-hours padding called out; earnings by weekday and season; booked hours against the weekly availability, by day, for the last 8 and next 4 weeks; a **rate-raise planner** (change per family per month and a kind advance-notice message to each; any local comparison is one the sitter types, never a guessed market rate); a printable **year-to-date income letter** for a landlord or lender from recorded payments, signed by the sitter and marked a self-prepared summary, not a tax document; and this year against the same stretch of last year once there are two years of data.
- **References & testimonials:** request drafts, a five-day follow-up, separate yes/no consent for "may new families call you" and "may your words go on my website". Only quotes marked yes reach the website, as first name and last initial. With the server, each person gets a private link where they write their own words and tick the two consents themselves; the answer is kept with its timestamp and the exact wording shown, and they can withdraw through the same link (the quote leaves the site at the next build; a sitter cannot re-tick a consent the referee withdrew). Request templates for a parent, teacher, church leader, coach or employer, follow-ups at 5 and 12 days then stop, and a printable **reference packet** for a new family that lists only people who agreed to be contacted, with the sitter's certifications.
- **Website** (`site.mjs`): a small site built only from the sitter's own words, in three themes (warm, bright, simple; every text colour tested at WCAG AA 4.5:1), mobile first. Home (story, rates, towns served, optional faith section, consented testimonials, inquiry form), about (what a sit looks like, first sit, safety, certifications with dates; expired ones are hidden), rates and policies (cancellation, payment, sick child) and an FAQ answered from those fields. Empty fields hide their section. Local SEO: title and description from town + "babysitter", `ChildCare` JSON-LD with `areaServed`, Open Graph, `FAQPage` data, canonical links, `robots.txt` and `sitemap.xml` for the sitter's own address. "Download all files (.zip)" (a store-only zip written in-house) drops onto Netlify, Cloudflare Pages or GitHub Pages. A "get found locally" checklist (Google Business Profile, Nextdoor, Facebook page, church and school directories) gives plain steps and promises nothing.
- **Content:** twelve weeks of seasonal post ideas rotated across Facebook, Nextdoor, Instagram, a church or school bulletin and the website, plus rebooking, referral and testimonial messages per family. Drafts leave room for a real moment in the sitter's words, never an invented one.
- **Intake and pipeline** (`intake.mjs`): a printable [meet-and-greet kit](meet-and-greet.html) (questions on routines, discipline, screens, allergies and medications, emergencies, pick-up, pets, house rules, driving and pay) with a red-flag checklist about **safety and payment only**, never beliefs or demographics; flags the records suggest (no emergency contact, money still owed, "pay later" or "no car seat" in the notes); a family info sheet (kids, allergies, meds, bedtimes, emergency contacts, doctor, a medical-consent note marked "a template, not legal advice") on paper or as a one-time link; and pipeline stats in the Leads tab: leads by channel (church, school, Nextdoor, referrals, website, social, marketplaces) and stage, inquiry-to-booked conversion and median days to book.
- **Print:** offline lead generation for church and library bulletin boards, school newsletters, coffee shops and doors: a letter flyer with ten tear-off phone tabs, a 10-up business card sheet (Avery 8371 layout), a quarter-page bulletin ad (four per sheet), a door hanger, and **referral cards** a family hands to friends ("Mention the Rivera family", code `RIVERA-A77`). Each piece carries a QR code to the sitter's site, tagged with where it came from (`?ref=flyer`, `?ref=RIVERA-A77`); the site copies that into "How did you hear about me?", and a lead whose answer holds a family's code (or names exactly one family) is credited to that family, gets the referral bonus in its score, and shows in a leads-by-source table. The QR encoder (`qr.mjs`, byte mode, level M, versions 1-10) has no dependencies and matches Project Nayuki's qrcodegen module for module on 11 reference symbols. Faith wording appears only if the sitter turned it on, as the first sentence of their own statement.
- **Posts & blog** (`content.mjs`): a bank of 76 topics for parents (safety, activities, routines, date nights, back-to-school, holidays; 10 faith topics that appear only when the sitter turns faith on), each with an outline, a local search phrase ("date night babysitter in {town}") and captions fitted to Facebook, Instagram, Nextdoor, a bulletin and a blog description. The sitter's own blog: posts are stored in the desk, and only ones the sitter approves are published, at `/site/blog` on the server and as `blog/*.html` in the website download (.zip). Approval is refused while a draft still holds `[add your real moment here]` or names a child from the desk without the parents' written yes. Optional AI drafting on the sitter's own key (Anthropic, OpenAI, any OpenAI-compatible endpoint, or Ollama / LM Studio on their own computer), through the repo's shared `byok.mjs`; only the sitter's public profile and the topic are sent, never family data.
- **Backup and sync:** a JSON backup file; or sync with the sitter's own server.
- **Automations (with the server):** six follow-through rules you turn on one by one (confirmation, day-before reminder, thank-you with a testimonial ask, rebook nudge, unpaid reminders, opt-in birthday notes), by email or text, with quiet hours, opt-outs and a preview of what would go out now. Details below.
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
| `/site/` | the sitter's website (`index.html`, `about.html`, `policies.html`, `faq.html`, `robots.txt`, `sitemap.xml`), with the form posting to `/inquiry` |
| `POST /inquiry` | form or JSON; honeypot field, 10 per IP per hour, 64 KB cap |
| `GET/POST /book` | open times only (no family names or details); a request becomes a lead with status `requested` that holds its time until you approve or decline it in the Schedule tab. Never auto-confirmed. Honeypot, 10 per IP per hour. `BOOK_WEEKS` (default 2, max 8) sets how far ahead |
| `/ref/<token>` | a referee's private link (made in the References tab, 30 days, one answer): their own words plus two separate consents, stored with the time and exact wording; the same link later only offers withdrawal (`references.mjs`) |
| `/calendar.ics?t=CAL_TOKEN` | a feed a phone calendar can subscribe to |
| `/intake/<token>` | a family's one-time info sheet: the app's Families tab makes the 128-bit token, Sync puts it on the server, the family's answers merge into their record once (32 KB cap, escaped output, `no-store`), and the next Sync keeps them |
| `GET/PUT /api/desk`, `GET /api/today` | `Authorization: Bearer ADMIN_KEY` |
| `GET /api/automations/preview` | what the automations would send now, and what they hold back and why (admin key; `?at=` an ISO time) |
| `/unsubscribe?e=&t=` | the link in automated emails: a page with one button, plus one-click `List-Unsubscribe-Post` |
| `POST /twilio/inbound` | Twilio's incoming-text webhook: STOP and START opt a number out and back in; other texts are forwarded to you |
| `/site/blog`, `/site/blog/<slug>` | the blog posts you approved |
| `POST /api/draft` `{"topicId": "..."}` | an AI blog draft on your `LLM_*` key, saved as a draft (admin key) |

Everything outside the box is **off until you set it, on your own accounts**:

| Variable | Effect |
|---|---|
| `NOTIFY_WEBHOOK_URL`, `NOTIFY_FORMAT` (`ntfy` default, `slack`, `discord`) | a ping for each lead and the morning digest; ntfy.sh gives a free phone push |
| `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFY_EMAIL` | email through Resend (free tier) |
| `AUTO_REPLY=1` | email the reply draft to a family as soon as they inquire (email contacts only, never to a decline) |
| `AUTO_FOLLOW_UP=1` | email due follow-ups with the morning digest |
| `DIGEST_HOUR` (default 7), `TZ` | when the digest goes; `TZ` is also the clock for quiet hours |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | texts through Twilio, for the automations below |
| `PUBLIC_URL` (`https://...`) | your server's address: puts an unsubscribe link in automated emails and is the URL Twilio signs (set the number's incoming-message webhook to `PUBLIC_URL/twilio/inbound`) |
| `LLM_PROVIDER` (`anthropic`, `openai`, `openai-compatible`, `ollama`), `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | blog drafts from your own model account or a local model; with none set, drafts come from the topic template |

**Deploy:** `render.yaml` (Render, starter plan with a 1 GB disk; it generates `ADMIN_KEY` and `CAL_TOKEN`), `fly.toml` (Fly.io, one always-on machine with a volume), `docker-compose.yml` (any box with Docker), or the [one-click deploy page](https://duncan-haywood.github.io/oss-monorepo/deploy/?app=babysitting-business-kit), which builds all three from `render.yaml`. Nothing runs on the author's accounts. Step by step, with costs: [self-host.html](self-host.html).

**Data safety (`backup.mjs`):** atomic writes; a daily snapshot beside the state file (newest 14 kept); at startup a state file that does not parse is moved to `desk.json.corrupt-<time>` and logged, never overwritten, and the newest good snapshot loads instead; `GET /api/backup` downloads the desk, `GET /api/backups` lists snapshots, `POST /api/restore` takes a desk JSON or `{"snapshot": "desk-YYYY-MM-DD.json"}` and saves the current desk first; `/admin` (admin key, sent as a header) shows versions, lead counts, last digest, which integrations are on (names only), disk use and the snapshots. Optional off-site copy to your own S3-compatible bucket (`BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, plus `BACKUP_S3_ENDPOINT`/`BACKUP_S3_REGION` for R2, B2 or MinIO), signed with AWS Signature V4 in plain `node:crypto` and tested against AWS's published SigV4 test suite.

### Automations (sales follow-through)

`automations.mjs` plans the messages, `automations-server.mjs` sends them, every five minutes on the server's tick. Each rule is off until you tick it in **Settings, Automations**:

| Rule | When | Sent once per |
|---|---|---|
| Booking confirmation | a sit (or weekly series) is saved and synced; again if its date or time changes | booking and time |
| Reminder, "anything new I should know?" | inside the 24 hours before each sit | sit |
| Thank-you with a testimonial ask | 1 to 14 days after the first sit with a family; links your testimonial page if you set one, else asks in the message | family |
| Rebook nudge | a family has no sit booked and their last was N to N+90 days ago (N = your "invite back" days) | quiet spell |
| Unpaid reminder | 3 days, then 10 days, after an unpaid sit (stops after 30 days: that is your call) | sit and step |
| Birthday note | a child's birthday, only for families you tick "birthday notes" for | child and year |

How it behaves: nothing goes out in quiet hours (8pm to 8am by default, in `TZ`); every send, and every failure, is written to the desk, so a restart or a sync from the app never sends twice (the server merges its sent log and opt-outs into each `PUT /api/desk`); a failing message is retried and dropped after three tries; at most 40 sends per tick. Email goes by default and texts when there is no email ("send by" can be texts first, or both). A family's beliefs play no part in any of it.

Opt-outs: every automated email ends with an unsubscribe link (or "reply unsubscribe" without `PUBLIC_URL`) and your mailing address if you enter one; every text ends "Reply STOP to opt out". A STOP (or quit, end, revoke, opt out, cancel, unsubscribe) to your Twilio number marks that number opted out at once; START or UNSTOP undoes it. A family that opts out of one channel is not moved to the other. You can also tick "no automated messages" per family. Replies that are not keywords are forwarded to you, and you decide whether they mean "stop".

**Consent, in plain words. This is not legal advice; read the sources.**

- **Texts (TCPA).** The FCC's rules require the recipient's prior express written consent for texts that advertise or market, sent with automated equipment (47 CFR 64.1200(a)(2)), and ban telephone solicitations before 8 a.m. or after 9 p.m. at the recipient's location (64.1200(c)(1)). A reply of "stop," "quit," "end," "revoke," "opt out," "cancel" or "unsubscribe" revokes consent (64.1200(a)(10)). Source: [eCFR, 47 CFR 64.1200](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200). Practical reading: only text families who gave you their mobile number for babysitting and agreed to texts; keep a note of when they said yes; the rebook and birthday rules are the most "marketing" of the six.
- **Email (CAN-SPAM).** The FTC's [compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) says commercial email needs honest headers and subject lines, a valid postal address (a P.O. box is allowed), and a working opt-out honoured within 10 business days; messages that confirm or update an existing transaction, like a booking confirmation, are "transactional or relationship" messages with fewer requirements. This kit honours an unsubscribe at once.
- State laws can add rules (some states have their own telemarketing and texting laws). If you are unsure, keep the rebook and birthday rules off.

Honest limits: one sitter per server; no payments or card capture (families pay the way they already do); quiet hours use your time zone, not the family's; inquiry follow-ups are email only.

## Taxes: what the numbers are

US federal rules for 2026, with constants from sibling ventures that checked them: SS wage base $184,500 (ai-bookkeeper/payroll.mjs, ssa.gov), household-employee threshold $3,000 (nanny-tax-calculator), 1099-K $20,000 and 200 payments (1099-k-threshold-checker), mileage 72.5¢ and a reported 76¢ from 2026-07-01 (ai-bookkeeper/deductions.mjs, which notes irs.gov was not reachable to confirm the raise). The set-aside ignores the standard deduction and credits, so it errs high; it is an amount to save, not a return. The federal estimate in `taxes.mjs` copies the 2026 and 2025 brackets, standard deductions and QBI thresholds from ai-bookkeeper/estimatedtax.mjs (checked there against Rev. Proc. 2025-32 and 2024-40 on 2026-10-23) and leaves out credits and itemised deductions; the safe harbor follows IRC 6654(d), (e)(1) and (g). Married filing separately is not modelled.

## Run and test

- **Page:** open `index.html` from a local server (`npx serve .`, or the server above). Data lives in this browser's localStorage under `babysitting-business-kit-desk`.
- **Tests:** `node --test ventures/babysitting-business-kit/*.test.mjs` (engine, taxes, slots, intake, references, site, print, qr, automations, server, page, deploy, usage).
- **Browser end-to-end:** `e2e.test.mjs` drives the app in Chromium at 390 px and 1280 px (load the example, add a lead, make it a family, book a sit, record a payment, check the tax panel, reload), checks keyboard tabs, 44 px targets, the guide pages and offline start-up. It skips itself when Playwright or its Chromium is missing, as on the CI venture runner, so run it locally after UI changes.

## Privacy

Everything runs in your browser. Your data is never uploaded by the page, and there are no accounts, tracking cookies or analytics vendor. We count anonymous events (which tabs and features get used, nothing about who) in this browser's localStorage; the footer button turns it off, and Do Not Track / Global Privacy Control are honoured. If you run the server, your desk and the inquiries your website collects live in one JSON file on your hosting account, and leave it only through the services you configure.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for, including taxes, licensing and child-safety rules where you live. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licence. Optional support: https://github.com/sponsors/Duncan-Haywood
