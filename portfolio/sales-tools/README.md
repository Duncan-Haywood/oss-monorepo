# Sales, marketing and business tools (bring your own key)

**Direction set by the owner on 2026-10-16** (recorded in
[`prompts/goals.md`](../../prompts/goals.md), "Direction: sales, marketing and
business tools"). The owner's words:

> "lets add a potential direction sales tools and ai sales marketing etc tools
> for b2b b2c byok multi provider optionality. backend and frontend business
> tools. also consumer ones. these should be possible to spin up as an actual
> business incorporate into your own saas or stand up and sell as a standalone
> tool or portfolio of tools. multiple hosting options and potentially packagin
> ios android set ups etc."

This file is the working spec. It is a direction for many runs, not one run's
task.

## What the direction covers

Tools that help a business, or a person, sell and market. Each one has a
deterministic core that works with no key, and AI as an upgrade on the
user's own key from any provider.

- **B2B sales**: account and lead research from the user's own CRM export and
  public pages, ICP fit scoring, call-prep briefs, personalised first drafts
  of outreach the user sends themselves, proposals and quotes, follow-up
  timing, objection libraries, pipeline hygiene and forecast checks, win/loss
  notes, meeting notes to CRM fields.
- **Marketing**: SEO content briefs, ad and landing-page copy variants with a
  claims and compliance check, A/B test reading, email campaign drafts,
  review replies, competitor-page change watching, UTM and attribution.
- **B2C and consumer**: tailoring a CV and cover letter to a posting,
  marketplace listing copy (Etsy, eBay, Poshmark), freelance pitch writing,
  rate and negotiation prep, posts for a personal brand.
- **Backend and frontend**: each tool can be a page (frontend), an API or worker
  (backend), or both, so a SaaS can call it or a person can use it directly.

## Start from what already exists

The portfolio already has much of a sales and marketing stack. **Making these
better comes before adding near-copies** (`prompts/goals.md`, "Depth over
count"):

| Need | Existing venture to extend |
|---|---|
| Proposals and quotes | `proposal-maker`, `rfp-compliance-matrix`, `security-questionnaire-matcher` |
| Lifecycle email and win-back | `drip-keeper`, `cancel-flow`, `dunning-engine`, `trial-converter` |
| Prospecting cadence (email, call, LinkedIn, letter) | `sales-cadence-builder`, `icp-lens` |
| Lead capture and referrals | `waitlist-keeper`, `referral-keeper`, `form-inbox`, `link-keeper`, `freelance-lead-tracker` |
| Social proof and feedback | `testimonial-keeper`, `feedback-board`, `support-desk` |
| Attribution and measurement | `visit-keeper`, `mrr-pulse`, `ab-test-significance-calculator`, `lead-response-time-analyzer` |
| Reply handling and the agent that ties these together | `sales-agent` (the long-term AI sales agent; see its `ROADMAP.md`) |
| Consumer job search | `ats-resume-checker`, `job-application-tracker` |

The first concrete step for most of these is a BYOK AI feature on top of the
deterministic product. For example: a first draft of a proposal section, a
reply drafted from a support thread, subject-line variants in a drip
sequence. Build each one with [`platform/llm/byok.mjs`](../../platform/llm/README.md).

## Product shape

1. **Deterministic core, AI on the user's key.** It works fully with no key.
   With a key, AI features turn on, using Anthropic, OpenAI, Gemini or any
   `/chat/completions` endpoint (OpenRouter), or a model on the user's own
   machine (Ollama, LM Studio, llama.cpp: no key, no per-call cost). The
   page offers the local option next to the hosted ones and says which path
   ran. Use the shared client and never copy it into a venture.
2. **Three ways to use it.** Each tool should support all three, cheapest
   first:
   - **Standalone business:** a person deploys their own copy from the
     self-deploy page (`platform/deploy/`), puts their own name on it, and
     sells it or uses it. The MIT licence allows both.
   - **Embedded in someone's SaaS:** a documented HTTP API (`/v1/...`), an npm
     package for the engine, and where it fits a drop-in web component or
     iframe widget, so another product can wire it in.
   - **Portfolio of tools:** related tools deploy together as one suite (one
     compose file, one login, shared settings for the user's own keys), so a
     person can stand up a small sales-tools business in one step.
3. **Hosting options**, reusing what `platform/deploy/` already builds:
   GitHub Pages for browser-only tools (the key stays in the visitor's
   browser); Docker Compose, Fly.io and Render for anything with a process;
   AWS, Google Cloud and Azure through OpenTofu.
4. **Phones.** Android through the existing Capacitor template (debug APK, or
   a signed bundle with the deployer's own keystore). iOS needs the
   deployer's own Apple Developer account. Build the project and the
   store-listing kit (see `mileage-log`'s); never register an account in the
   owner's name.
5. **Payments** are off by default and run on the deployer's own Stripe keys,
   and the owner's own instances use only a merchant-of-record checkout link
   set outside the repo (`prompts/goals.md`, "Payments: the owner's merchant of record, never a key").

## Guardrails specific to sales and marketing

These are on top of the guardrails in `prompts/goals.md`:

- **The user sends, the tool drafts.** Never send bulk or unsolicited email,
  SMS or DMs, and never automate posting from a user's account where the
  platform forbids it. CAN-SPAM, GDPR/PECR, CASL and TCPA apply to anything
  the tool helps send: include unsubscribe and identity fields, and keep
  consent records where the tool stores contacts.
- **No scraping against terms.** Use the user's own exports, official APIs
  and public pages that allow it. No LinkedIn scraping, no bought lists, no
  guessing personal email addresses.
- **No fabricated social proof.** No generated reviews or testimonials passed
  off as real, and no invented case-study numbers. AI-drafted copy is marked
  as a draft for the user to check.
- **No customer data on our side.** Contacts and CRM data live in the
  deployer's copy or the visitor's browser. Our pages never see them.
- **Disclaimer and usage tracking** as on every product (`PRODUCT_PLAYBOOK.md` §5).

## Done, for one tool in this direction

- The deterministic path completes a real task with no key, and is tested.
- The AI path works with at least Anthropic and one `openai-compatible`
  endpoint, falls back cleanly, and says so in the interface.
- It is reachable in at least two of the three ways (standalone deploy, API
  or package, suite).
- It has a home page, a disclaimer and usage tracking, and is listed on the
  self-deploy page.

## How progress is measured

- Count of sales and marketing tools that meet the definition of done above.
- Count of those reachable as an API or package and as a standalone deploy.
- Usage, once measurable (`portfolio/usage/`). Until then, "never measured"
  is the honest reading.
