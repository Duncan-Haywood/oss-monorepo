# Small-business owners and their delegates: strategy and plans of attack

The working plan behind the owner's 2026-11-24 direction ("smb owner/delegated
users as a target audience for most work going forward"; "creating marketing
sales outreach plans of attack and strategies product strategies etc.").
The direction itself is in [`prompts/goals.md`](../../prompts/goals.md),
"Direction: small-business owners and their delegates". **This file is the
one runs update**: when a campaign, a price or a product's fit is tested,
write the result here with the date and the evidence, and change the plan.

Nothing below is a measured number. Usage is unmeasured
(`portfolio/usage/usage.yaml`) and MRR is $0 until the owner records a reading
(`portfolio/monetization/mrr.yaml`). Product fit is read from each venture's
`VENTURE.yaml` description on 2026-11-24, not from customers.

## 1. Who we sell to

Two people, usually in one business:

| | The owner | The delegate |
|---|---|---|
| Who | Owner-operator of a business of roughly 1 to 50 staff: salon, cafe, trade contractor, shop, clinic, agency, online seller, landlord, nonprofit | Office manager, bookkeeper, shift lead, assistant, outside accountant, VA, the contractor's estimator |
| Role in the sale | Finds the problem, decides, pays | Uses it every week; often the one who searched for it and recommends it |
| What they want | Less time on admin, fewer mistakes that cost money, to see it was done | A tool that is fast, doesn't need the owner's password, and makes them look good |
| Where they are | Google and AI search for their exact problem, trade groups, local business groups, their accountant | Google for the task, bookkeeping and admin communities, the tools they already use |

**The delegate is also a channel.** An outside bookkeeper, accountant or VA
works for many small businesses at once. A product that lets them run all of
their clients from one login, and invite each owner to see and approve, sells
to many businesses through one person. Partner seats for advisers are the
highest-leverage sales idea in this file (§4, play B).

**Buying triggers** to aim content and outreach at: a deadline (quarter end,
tax filing, an e-invoicing mandate date, a grant due date), a new hire or a
staff member leaving, a new location, a failed audit or a penalty, growing out
of a spreadsheet, the owner going on holiday.

## 2. Product strategy

### 2.1 What every SMB product gets (the shared layer)

Built once, in `private-monorepo`, and reused by every paid app (Grant
Autopilot already has tenants, plans and Paddle billing to start from:
`private-monorepo/apps/grants/docs/ARCHITECTURE.md`, `PRICING.md`):

1. **One business, many people.** An organisation with roles: owner, staff,
   outside adviser. Invite by email; no shared passwords.
2. **Adviser workspace.** One adviser login across many client organisations,
   each owner able to see what was done and revoke access.
3. **Owner digest.** A weekly email of what was done, what is waiting for the
   owner's approval and what is due. It is the retention loop and the reason
   the owner keeps paying for a tool a delegate uses.
4. **Approve, don't do.** Delegates prepare; owners approve the things that
   move money or go to a customer or regulator. The same principle as the
   sales agent's "every outbound message is a draft someone approves".
5. **Import what they already have.** Bank and card CSVs, POS and payment
   exports, spreadsheets. The free MIT tools that already parse these
   (sales-export-to-journal reads Airbnb, Amazon, eBay, Etsy, Gumroad, PayPal,
   Shopify, Square and Stripe exports) are the import layer.
6. **Pricing a small business can expense.** Per business per month, with
   annual at a discount; staff seats included up to a cap, adviser seats free
   (they are the channel). Cost-plus floor as in Grant Autopilot's `PRICING.md`
   (1.3x to 2.0x of loaded cost).

### 2.2 The products, by fit

**Tier A: SMB back office, build and sell first.** A weekly job an owner pays
someone, or themselves, to do.

| Product | Job for the owner / delegate | Model | Next step that moves MRR |
|---|---|---|---|
| Grant Autopilot (`private-monorepo/apps/grants`) | Find and draft grant applications from the business's own facts | subscription, live billing code | Delegate and adviser seats; trade-specific grant landing pages |
| ai-bookkeeper | Double-entry books from bank/card CSVs, learns the owner's corrections | subscription | Hosted app with adviser workspace; bookkeeper-led onboarding |
| sales-export-to-journal | Turn marketplace and payment payouts into journal entries | one-off | Fold into ai-bookkeeper as its import layer and upsell |
| einvoice-preflight | Catch e-invoice errors before an EU buyer or portal rejects them | subscription | Mandate-date landing pages per country; accountant seat |
| shift-roster-builder | Weekly staff roster within availability, hour limits and wages | subscription | Staff invite and shift swaps (the delegate is the shift lead) |
| local-site-studio | A website for a local business, preview before buying | one-off $500 + hosting | Monthly site care plan (hosting, edits, local SEO) as the recurring line |
| babysitting-business-kit | Back office for a one-person care business | subscription | Generalise to "solo service business kit" if the babysitting niche tests small |

**Tier B: small firms in a trade.** Real SMB buyers, but a specialist
delegate (estimator, scheduler, photographer).

| Product | Buyer | Next step |
|---|---|---|
| wall-framing-takeoff, shed-designer | Small builders and framers | Bid-ready output (cut list plus a priced quote) for the owner |
| xer-schedule-check, ifc-quantity-takeoff, ids-model-check | Small contractors and consultants on larger projects | Sell per project or per firm; adviser seat for the scheduler or consultant |
| real-estate-agent-photo-app (Listing Lens) | Solo agents and small brokerages | Brokerage plan with assistant seats |
| photo-editing (ShootFlow), ig-media-pipeline | Small studios, creators, local businesses doing their own social media | Package for local businesses' social posting |
| clothing-design-studio, print-atelier | Independent brands, artists | Keep; SMB angle is the independent brand owner |
| retail-pilot-intel | Small-format shops | Pilot store first, then small retail chains |

**Tier C: not SMB-first.** league-schedule-generator (volunteer leagues;
office leagues are the SMB edge), changepoint-detector and quick-pick-survey
(analysts and researchers). Keep them and their buyers. Don't rewrite them for
SMBs without a real angle.

**What to build new.** Before adding a product, check `portfolio/pipeline/`
and the website requests (`portfolio/requests/`). New candidates should be
SMB back-office jobs with a deadline or a cost of error: quotes and invoices
for trades, sales-tax and VAT filing prep, payroll prep handed to an
accountant, review requests and replies for local businesses, supplier price
tracking, compliance logs (food safety, HACCP, licences). Each still names its
niche (`PRODUCT_PLAYBOOK.md` §1).

## 3. Marketing plan

**A. Search and AI answers by trade and job (organic, the base).**
A matrix of *trade × job* pages ("roster template for a 12-person cafe",
"bookkeeping from Square exports for a salon", "Peppol e-invoice rejected:
what the error means"). Each page answers the question fully, links the free
MIT tool that does it once, and offers the paid app for doing it every week.
Start with Tier A products and the trades they already name (restaurants,
cafes, salons, shops, clinics, online sellers). Every page meets the honest
marketing limit: claims a file can back, no invented customers or reviews.

**B. Lead magnets that capture an email.** The 1,415 free MIT tools are the
top of the funnel (`LICENSING_TRANSITION.md`). For the SMB-relevant ones, add
"email me this result / remind me next month" with explicit opt-in. That list
is the inbound nurture audience. Rank which free tools to wire first by fit to
a Tier A product.

**C. Nurture by trigger.** Short sequences tied to the buying triggers in §1:
quarter-end books, mandate dates, the roster before a holiday season, grant
deadlines. Opt-in only, unsubscribe in every message.

**D. Write about the work for owners.** The blog keeps its agent-to-agent
posts, and adds posts a business owner would read: what a tool found on real
data, worked examples by trade, "what changed in rule X this quarter".

**E. Partners and communities.** Bookkeepers, accountants and VAs (adviser
seats, §2.1); trade associations and local business groups, offering a free
talk or template, never spam; marketplaces where SMB tools are listed (app
directories of the tools they already use: accounting, POS, e-commerce).
Listing under the portfolio's name is an owner step.

## 4. Sales outreach: plans of attack

The rules are the pivot's item 7 in `goals.md` and they do not bend:
CAN-SPAM in the US, GDPR/PECR in the EU and UK, a real sender and a working
unsubscribe, no deceptive subject lines, no bought or scraped personal lists
where the law forbids them, no fake engagement. Sending under the portfolio's
name and any paid send volume are switched on by the owner once. Agents build
everything up to that switch. The tooling is [`ventures/sales-agent/`](../../ventures/sales-agent/README.md)
and the sales-tools ventures (`portfolio/sales-tools/README.md`).

**Play A: trigger-based outbound to owners (one Tier A product at a time).**
1. Pick one product and one trade (e.g. shift-roster-builder × independent
   cafes in one region).
2. Build the account list from lawful public business sources: business
   websites' published contact addresses, public registries, directories whose
   terms allow it. Record each source and its terms in the list's README.
3. Find a visible trigger per account where one exists (hiring post, new
   location, a public grant round they qualify for).
4. A three-touch sequence over two weeks: the specific problem, a free result
   made for them (a sample roster, a grant shortlist), a plain ask. Every
   message is a draft a person approves until the owner turns on unattended
   sending.
5. Measure replies, demos and trials per 100 sends, by trade. Write the
   reading here.

**Play B: adviser partners (one conversation, many businesses).**
Bookkeepers, accountants, VAs and agencies who serve SMBs. Offer: free
adviser workspace, client billing through the owner's plan or a partner
discount, co-branded onboarding. Outreach is B2B to their business address,
same rules as play A. Products first: ai-bookkeeper, einvoice-preflight,
Grant Autopilot.

**Play C: inbound to sales.** Every free-tool result page and trade page
carries a "talk to us / start a trial" path. Inbound replies get a same-day
answer drafted by the sales agent and approved by a person.

**Play D: local-site-studio as a door opener.** The pre-built site preview
(made before the owner pays) is itself the outreach: "here is your site".
Then the care plan, then the back-office products, to the same owner.

## 5. Plan of attack, first 90 days

| Weeks | Product | Marketing and sales |
|---|---|---|
| 1-2 | Shared layer spec (§2.1) in `private-monorepo`, starting from Grant Autopilot's tenancy and billing; delegate/adviser roles there first | Trade × job page list for Tier A; pick two free tools per Tier A product for email capture |
| 3-6 | Hosted ai-bookkeeper and shift-roster-builder on the shared layer, checkout shipped dark | First 20 trade pages; opt-in capture live; play A list and sequence for one product × one trade, ready for the owner's switch |
| 7-10 | einvoice-preflight hosted with accountant seat; owner digest email | Play B partner page and outreach drafts; first nurture sequences |
| 11-13 | Retention: digest, reminders, import from the formats users actually sent | Read the funnel; double down on the trade and channel with the best reply and trial rates; record results here |

Each row is the first draft of a plan. Runs reorder it on evidence and say
why in their run record.

## 6. How we know it is working

Per product and per trade, measured and never typed in: page visits, email
opt-ins, outbound sends, replies, trials, paid conversions, churn. Revenue
readings come only from the owner (`mrr.yaml`). Until a reading exists, a
cell is "unmeasured", not zero.

## 7. Owner decisions this plan needs

Already-queued asks are in `python3 portfolio/ledger/decision_queue.py`;
add only what is new:

- the sending domain and mailbox for outbound, and switching on send volume;
- whether adviser seats are free or discounted, and any partner revenue share;
- listing the apps in third-party app directories under the portfolio's name.

## Log

- 2026-11-24: file created from the owner's direction. Fit tiers read from
  `VENTURE.yaml` descriptions. No campaign run yet.
