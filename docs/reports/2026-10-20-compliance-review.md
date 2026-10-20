# Compliance review: laws, platform terms and ethics

**Date:** 2026-10-20. **Asked by:** the owner ("is anything on my repo
violate any laws or tos or ethics or anything? do a review", then "make a
report and add action items to fix these things. also add this review as a
regularly recurring thing"). **Method:** a read-only review of `main` at
`b8946f12`, split into three parts:

- distribution, SEO, automation and platform terms;
- consumer protection, professional advice, claims and privacy;
- licensing, data, research ethics and security tooling.

All 1,304 ventures, `research/`, 537 workflows, `platform/distribution/` and
the site generator were in scope. The checks were sampled, plus greps across
the whole tree. The mechanical part of this review is now a script,
`platform/ci/compliance_scan.py`. Its counts are recorded below as the
baseline. The next review is `.github/prompts/compliance-review.md`, on a
monthly schedule.

This is an engineering review, not legal advice. For A1 and A6, ask a lawyer
if the answer matters.

## The short version

- **No High findings.** Nothing found clearly breaks a law or a platform's
  terms today.
- **Six Medium items:**
  - third-party human-written text republished in a public repo;
  - near-duplicate comparison pages;
  - competitor figures with no source;
  - brand-named pages with no "not affiliated" line;
  - a 60-day referral cookie with no consent guidance;
  - an Italian in-store camera pilot whose docs miss the labour-law rule.
- **The guardrails that matter are in place and enforced in code:**
  - the "no warranty" disclaimer is on every venture page, and the build
    refuses a page without it;
  - there are no third-party trackers;
  - distribution is off by default, with labelled bot accounts;
  - there are no fake reviews, ratings or user counts.

## Baseline from `compliance_scan.py`

| check | count | what it means |
|---|---:|---|
| `secret` | 0 | No credential in the tree. Placeholders like `AKIAIOSFODNN7EXAMPLE` are excluded. Git history was not scanned. |
| `brand-disclaimer` | 122 pages in 15 ventures | Brand-named venture pages with no "not affiliated with" line. |
| `third-party-request` | 3 | All three are Google Fonts tags in `ventures/retail-pilot-intel/apps/portal/index.html`. |
| `tracking-cookie` | 3 | `referral-keeper`: affiliate cookie, needs consent. `trade-bid-studio`: admin session, strictly necessary. `feedback-board`: one-year voter cookie used to stop duplicate votes, functional. |
| `unsourced-competitor-figure` | 25 | All of them are `vs-jobber.html` pages saying "over 200,000 users", with no date. |

## Findings

### Medium

**M1. Third-party human-written text is republished under MIT.**
`research/mimic-contexts/data/suite.jsonl.gz` (2.5 MB, 4,800 rows) holds
2,400 human texts from the RAID corpus:

- Reddit posts, some with personal health details;
- IMDb-style reviews and BBC-style news;
- Wikipedia-style plot summaries, which are CC BY-SA;
- poetry, recipes, arXiv abstracts and wiki text.

RAID itself is MIT, but its README notes that the underlying sources'
licences vary. The project's README contradicts itself: it says the texts
are "kept only in this repository … and never posted anywhere", but this
repository is public. The file also breaks the research track's own
guardrail (`research/PROJECTS.md:803-806`), which allows human reference text
only from "published corpora whose licence allows the use". The other
`mimic-*` projects read the same file.

**M2. Near-duplicate pages at scale.** Most of the 43
`ventures/*/vs-jobber.html` pages and the 101 `how-much-to-charge-*` pages
are one template with the trade name swapped. Sampled pairs share 49-84% of
their word sequences, and `duct-cleaning` vs `sewer-hydrojet` shares the same
Jobber paragraph word for word. Google's spam policies name scaled,
templated pages with little unique value ("scaled content abuse", doorway
pages), and a penalty would hit the whole site. The main calculator pages
are not affected: they share 6-40% and each has its own engine and tests.

**M3. Competitor figures with no source.** The `vs-jobber.html` pages say
Jobber "says it serves over 200,000 users". The sentence attributes the
claim, but it has no link and no date, so it will go stale silently. Stale
or wrong claims about a named competitor are the comparative-advertising
risk.

**M4. Brand-named pages don't say they aren't affiliated.** These 15 ventures
use a brand in their name and have pages with no not-affiliated line:

- marketplaces: `amazon-fba-calculator`, `ebay-fee-calculator`,
  `etsy-profit-calculator`, `poshmark-fee-calculator`,
  `reverb-fee-calculator`, `tiktok-shop-fee-calculator`,
  `walmart-marketplace-calculator`, `whatnot-seller-payout`;
- Shopify: `shopify-a11y-evidence`, `shopify-fee-calculator`,
  `shopify-permission-drift`;
- Stripe: `stripe-churn-cohort-analyzer`,
  `stripe-failed-payment-recovery-analyzer`;
- creators: `twitch-payout-calculator`, `youtube-sponsorship-rate-calculator`.

Naming a brand to say what a tool works with is nominative fair use, and no
logos are copied. But `platform/pages/clauses.mjs` requires the disclaimer
only on `vs-*.html` pages. `ventures/airbnb-payout-to-journal/index.html:136`
shows the right wording.

**M5. `ventures/referral-keeper` sets a 60-day affiliate cookie with no
consent guidance.** The cookie is set at `pages.mjs:68-69`. EU and UK
ePrivacy and PECR rules need consent before a non-essential cookie is set,
and the README doesn't say so or offer an opt-in hook. It also doesn't tell
operators that their affiliates owe an FTC disclosure.

**M6. `ventures/retail-pilot-intel` (in-store camera analytics, Italian
pilot).** The docs require a signed GDPR impact assessment before go-live
(`AGENTS.md:64-65`, `docs/PRODUCT.md:26`), which is good. They miss Art. 4
of Italy's Statuto dei Lavoratori: cameras that can film staff need a union
agreement or labour-inspectorate authorisation. Its portal also loads Google
Fonts, which sends visitors' IP addresses to Google (LG München, 2022, found
that unlawful without consent).

### Low

- **L1. Licence scope is not stated at the root.** `LICENSE` and
  `CITATION.cff` don't say that third-party data and quoted text keep their
  own licences. Only `research/marriage-divorce-evidence/DATA_SOURCES.md`
  says so.
- **L2. HCMST data-use terms ask users to notify the principal
  investigator.** This is at
  `research/marriage-divorce-evidence/DATA_SOURCES.md:10`. Nothing records
  that the notice was sent. Only aggregates are committed, which is the right
  handling.
- **L3. Self-hosted tools that store or email other people's personal data**
  (`form-inbox`, `support-desk`, `waitlist-keeper`, `slot-keeper`,
  `cancel-flow`, `trial-converter`, `license-keeper`, `status-keeper`,
  `proposal-maker`). Each README should tell the operator they are the data
  controller and need their own privacy notice. `support-desk` already does
  this well.
- **L4. The reviewer apps are not independent.** Four reviewer Apps run the
  same scripted checks (`platform/ci/agent_review/`), so two approvals are
  not two independent reviews. GitHub's terms allow this on your own repo,
  and `ventures/*` is excluded from auto-merge. The README's idea of
  "reusing Kilo's/Cursor's app" is not possible, because we cannot hold
  another company's App key.
- **L5. `claude-routine-trigger.yml` works around GitHub's scheduling
  limit.** It wakes every 20 minutes and sleeps inside the job to fire about
  every 4 minutes, getting around GitHub's 5-minute minimum. It is gated
  off (`vars.ROUTINE_TRIGGER_ENABLED`), and its cost note still says the
  repository is private.
- **L6. Planned npm names include brand names.** The plan is 142 unscoped
  names such as `amazon-fba-calculator`, which can draw name disputes.
  Publishing is gated off. `NPM_SCOPE` exists.

### Checked and fine

- **Disclaimers:** all 1,283 venture pages carry the PRODUCT_PLAYBOOK §5b
  text, enforced at `platform/pages/check.mjs:144`. Every tax, legal,
  finance, insurance and health-adjacent tool also says "not … advice".
- **No advice tools in the risky categories:** no dosage or diagnosis tools,
  and no will, power-of-attorney or immigration-form generators. The one
  contract generator says to have a lawyer read it.
- **No fake social proof:** no `AggregateRating` or `Review` markup outside
  the validators, no invented user counts or "trusted by" claims, no
  false urgency, and no undisclosed affiliate links. FAQ markup must be
  visible, enforced by `platform/pages/faq-visible.test.mjs`.
- **Privacy:** no third-party scripts on served pages. The counter
  (`platform/counter/`) sets no cookies, stores no IPs, honours DNT and GPC,
  and is currently off. With bring-your-own-key AI, keys go straight from the
  browser to the provider and are never stored.
- **Distribution:** no unsolicited posting or email clients. Every channel is
  off by default. Bluesky posts say "Automated post", and Mastodon refuses to
  post from an account not flagged as a bot. dev.to and Hashnode get drafts
  only (`portfolio/distribution/README.md:88-109`).
- **Security tools:** each one checks a single user-named target from the
  user's machine and says to run it only on systems you own or are authorised
  to test. Nothing scans in bulk.
- **Licences and data:** everything is MIT. GPL tools are dependencies, not
  vendored. Restricted survey microdata (NSFG, NLSY, HCMST) is downloaded by
  script and never committed, and literature quotes are short.
- **Research integrity:** the reported numbers checked match files in the
  tree. Nothing is trained on API model outputs, and the evasion research has
  written guardrails.
- **Payments:** none beyond GitHub Sponsors. No lending, gambling, securities
  advice or money transmission.

## Action items

**Agent** items can go into any session's PR. **Owner** items need you.
Tick an item in the PR that fixes it. The next review carries open items
forward instead of rediscovering them.

| id | sev | action | who | done when |
|---|---|---|---|---|
| A1 | Med | Remove the human texts from `research/mimic-contexts/data/suite.jsonl.gz`. Commit RAID row IDs plus a fetch script (`build_suite.py` already reads RAID by range request), fix the README sentence, and add a data-licence note. Note that the old file stays in git history. | agent; history rewrite is owner-only | the file holds no third-party text, and the `mimic-*` projects rebuild from IDs |
| A2 | Med | Merge the 43 `vs-jobber.html` pages into one comparison page, or give each trade-specific substance. Do the same for `how-much-to-charge-*`. Redirect removed URLs to the survivor, update the sitemap and internal links, and add a near-duplicate guard to `platform/pages/`. | agent | a guard test fails the build when two served pages share most of their text |
| A3 | Med | Give every competitor figure a source link and an "as of" date, or delete it. | agent | `compliance_scan.py` `unsourced-competitor-figure` = 0 |
| A4 | Med | Add a not-affiliated line to every page of a brand-named venture, and extend `platform/pages/clauses.mjs` to require it when the slug names a brand. Use the `BRANDS` list in `compliance_scan.py`. | agent | `brand-disclaimer` = 0, enforced at build |
| A5 | Med | `referral-keeper`: make the cookie opt-in, through a `consent` hook that defaults to not setting it until the operator's banner allows it. Document the ePrivacy/PECR duty and the affiliate FTC disclosure duty in the README. | agent | cookie write is behind consent, and the README says why |
| A6 | Med | `retail-pilot-intel`: add Statuto dei Lavoratori Art. 4 (union agreement or inspectorate authorisation) to the go-live checklist next to the impact assessment. Self-host the fonts or use system fonts. | agent (docs, fonts); **owner** (signing with the pilot partner) | `third-party-request` = 0, and the checklist names Art. 4 |
| A7 | Low | Add a "third-party data and quoted text keep their own licences" line to `LICENSE`'s preamble or the README, and to `CITATION.cff`. | agent | text present |
| A8 | Low | Send the HCMST notice to the principal investigator, or record that it was sent. | **owner** | a line in `DATA_SOURCES.md` |
| A9 | Low | Add a "you are the data controller; publish a privacy notice" paragraph to the READMEs of the nine self-hosted personal-data tools. | agent | each README has it |
| A10 | Low | Fix `platform/ci/agent_review/README.md`: drop the claim about reusing another vendor's App, and say plainly that the four reviewers are not independent humans. | agent | text fixed |
| A11 | Low | `claude-routine-trigger.yml`: correct the "repository is private" cost note. If you turn it on, prefer the `*/5` single-fire variant described in the file. | agent (note); **owner** (whether to enable) | note fixed |
| A12 | Low | Set `NPM_SCOPE` before enabling npm distribution, so brand-named packages publish as `@scope/...`. | **owner** (at enable time) | scope set or recorded in `channels.yaml` |

## How this review recurs

- **Schedule:** a monthly scheduled Claude task runs
  `.github/prompts/compliance-review.md` in a fresh session.
- **Each run:**
  - runs `compliance_scan.py` and compares the counts with the latest
    report's baseline;
  - checks the open action items above;
  - re-reads the areas that changed since the last report;
  - writes `docs/reports/<date>-compliance-review.md`, then lands it with a
    PR like any other session.
- **When there's nothing new:** the run says so in the new report's first
  line and spends the rest of the session fixing the top open agent item.
- **Owner questions:** they go to `portfolio/ledger/decision_queue.py`
  only when a real owner decision exists, never as a duplicate.
