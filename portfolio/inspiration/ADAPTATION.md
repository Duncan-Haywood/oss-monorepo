# Adapt successful businesses — legally and ethically

A working plan for this portfolio. **Mimic the customer’s leftover
spreadsheet, not the company.** Ship a narrower free tool. Do not clone
their product, crawl their site, or wear their brand.

This is how to pick and adapt. How to *build* the tool is still
[`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md). Idea rows already
written down live in [`portfolio-ideas.md`](portfolio-ideas.md). Do not
open a second inventory.

---

## 1. Thesis

A funded company is evidence that **someone with money has a recurring
job**. The copyable piece is almost never their app. It is the arithmetic
or checklist their user still does in a spreadsheet because the vendor
optimizes for the marketplace, the payroll run, or the two-sided network.

We improve that leftover job:

- narrower buyer (one salon, one opening wholesale order, one live show)
- clearer math (first-order fee amortized across reorders)
- no account, no scrape, rates the user types and verifies
- searchable in the words they already use

That is viable. Competing with Stripe, Rippling, Faire-the-marketplace, or
a 2026 agent runtime is not.

Worked example: Faire (YC W17) stays theirs. `ventures/faire-wholesale-calculator`
is first-order vs reorder vs Direct vs own invoice on **one invoice**, with
editable rates and a disclaimer. Not affiliated. Never logged into Faire.

---

## 2. What “mimic” may and may not mean

| Allowed | Not allowed |
|---|---|
| The *job*: “what do I keep after fees?” | Their storefront, listings, matching, or payouts |
| A *fee shape* published in a help article you can cite | Their live schedule claimed as ours; their help prose copied |
| A *narrower* buyer or geography | Their trademark, logo, or “official calculator” framing |
| Better UX on the same arithmetic | Their UI, screenshots, or directory write-ups |
| User-typed rates, local-only data | Their API, logged-in pages, or scraped catalogue |
| Optional GitHub Sponsors on *our* tool | Their payment rail, insurance, or payroll product |

**Improve** means: faster to first answer, more honest about the line they
hide (first-order fee, unsold units, payout speed), shareable inputs, tests
that lock the formula. It does not mean “same product, cheaper.”

---

## 3. Legal and ethics gate (before any URL)

Run this gate **every session**, on the specific host you are about to
open. History does not waive it.

1. **robots.txt** — fetch `https://<host>/robots.txt`. Do not request any
   `Disallow` path. Query-string blocks count (`/companies?*`).
2. **Terms of use** — open the public legal page. Stop if they forbid
   scraping, data mining, commercial reuse of Site Content, or “mining
   information about companies/users.” Public *names* as facts are fine;
   their blurbs, tables, and HTML are not ours to republish.
3. **Copyright** — do not copy help articles, marketing sentences, images,
   or code. Cite the URL. Rewrite the *formula* in our words. Rates in the
   UI stay editable so we are not republishing their schedule.
4. **Trademark** — use the name as a noun in search copy (“Faire seller
   fees”) plus **“Not affiliated with …”** in the footer and README. No
   logos, no official-looking chrome, no `@faire` email tone.
5. **Their product ToS** — binding if we *use* their service. A calculator
   that never logs in, never calls their API, and never stores their
   catalogue is not using their service.
6. **Personal data** — no job-board or Upwork scrape, no lead lists, no
   PII. A human-pasted listing is problem discovery only; do not contact
   the poster.
7. **Advice-of-record** — output is a worksheet or evidence. Never “you
   are compliant,” never tax/medical/trading/legal advice, never file on
   the user’s behalf.
8. **Ethics scale test** — if the product gets worse for the other party
   as it grows (cold email, interview cheating, scraped enrichment), skip.
   Already listed in `portfolio/pipeline/screened-out.md`.

If any step is unclear, **do not fetch**. Use a name the user already
pasted or a fact you already have, and build the worksheet.

Record the gate outcome in the venture README (one paragraph: what you
cited, what you did not open). Do not open a ledger-only PR for “we
checked robots.txt again.”

---

## 4. Selection filter

A successful business is a candidate to *adapt* only if all of these are
true:

| Filter | Pass | Fail |
|---|---|---|
| Someone still spreadsheets a leftover job | Fee stack, take-home, rent-vs-buy, landed cost | The vendor *is* the workflow (payroll, ATS, PMS) |
| Super-niche with money | Brand on Faire, salon on GlossGenius, tutor on Preply | “SMBs,” “creators,” “AI teams” |
| $0 variable cost for us | Browser arithmetic, user’s own key if AI | Per-user inference, two-sided liquidity, insured marketplace |
| Searchable phrase | “Faire first order fee,” “ClassPass studio payout” | Their brand as the only query |
| We can cite a public fee article | Help center, published rate card | Need an account to see the numbers |
| Not already shipped | Check `ventures/` and `portfolio-ideas.md` “already shipped” | Rebuild eBay/Etsy/Shopify/Faire |
| Not screened out | Not in `screened-out.md` | GEO, token-margin, legal/medical/tax advice |

Prefer a **product line** on an existing calculator (`where-to-sell-calculator`,
`3pl-quote-normalizer`, `no-show-fee-calculator`) when the buyer is the
same. A new `ventures/<slug>/` only when the buyer and the search phrase
are distinct.

---

## 5. Adaptation patterns (how we improve)

Use one primary pattern per v0:

1. **Unhide the line they bury.** Headline 15% vs first-order fee +
   payout-speed processing (Faire).
2. **Same invoice, several paths.** Marketplace vs Direct vs own invoice;
   rent vs buy; SMS vs email at user-typed rates.
3. **Lifetime / amortization.** One-time fee across expected repeats.
4. **Unsold / unused stays in cost.** Opening-order units that do not
   sell; booth rent on a slow week.
5. **Target price backward.** “What wholesale hits 40% on a first order?”
6. **Shareable inputs.** URL + local restore; nothing uploaded.

Do not add AI unless the leftover job is language, not arithmetic. If you
add it, the product must work fully without a key (playbook §3).

---

## 6. Session procedure

Named task (“adapt Whatnot seller fees”) skips `session_gate.py`. A vague
“continue” brief still runs the gate, then **builds** — this file is not
permission to write another list.

1. **Pick one row** from [`portfolio-ideas.md`](portfolio-ideas.md)
   “Ranked next to ship,” or a `build-now` pipeline candidate. Do not
   rescreen the inventory.
2. **Glance at open PRs.** Extend a live branch for that venture; do not
   open a duplicate calculator.
3. **Run the legal gate (§3)** on every host you will open (their help
   article, not their company directory).
4. **Write the value sentence** in the README first:
   *After using this, you can now ___, which used to take ___.*
5. **Choose home:** new venture vs `product_lines` on a host.
6. **Implement the smallest worksheet** that completes the job. Copy
   disclaimer, privacy, usage opt-out (honor DNT/GPC), LICENSE,
   discoverability from the playbook. Cite the help URL; every rate
   editable; “Not affiliated.”
7. **Tests lock the formula** the public article describes, plus share
   links and the disclaimer-on-page check.
8. **Run the product** (browser or CLI). Then playbook §7 definition of
   done.
9. **Do not grow `portfolio-ideas.md`.** If you learned a new *legal*
   constraint, add one line to [`accelerator-niches.md`](accelerator-niches.md).
   If you shipped, mark the row **Shipped**.

Owner-only still applies: no live Stripe, no store listing, no domain,
no unattended paid APIs, no breaking deployable `ventures/*` while Ask 9
is open. Building privately is always allowed.

---

## 7. Default build order (do not reshuffle)

Ship these before inventing a sixteenth row. Prefer a channel on an
existing tool when the table says so.

1. Whatnot livestream seller take-home (`where-to-sell-calculator` or standalone)
2. ClassPass studio / GlossGenius salon weekly take-home (or extend `no-show-fee-calculator`)
3. Tutor take-home (Preply / Outschool / Cambly)
4. Rent vs buy — **one** asset class (Grover *or* EquipmentShare, not both)

After a public URL exists, **usage decides**. A tool with return visits
outranks this list.

---

## 8. Anti-patterns

- Republishing an accelerator or VC directory “for reference”
- Fetching `/companies?batch=…` or a “Load all” portfolio
- Pasting help-center prose into the UI
- Hard-coding fees as “current as of …” without an edit box
- “Official [Brand] calculator” title or their hex/logo
- Logging into their product to “get accurate rates”
- Advice-of-record framing to sound more valuable
- Opening a pipeline candidate or scoring a new list instead of shipping
  row 1

---

## 9. Done for this plan

The plan is in use when a session picks a ranked row, passes the gate,
and ships a worksheet — not when this file gets another section.
