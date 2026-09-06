# Product playbook

How to take a product from nothing to something a stranger can use, in one
session. [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) says *what* the
portfolio is doing and [`AGENTS.md`](AGENTS.md) says how a session behaves;
this is the *how do I actually build one* half. Read those first if you
haven't.

The bar is not "a well-architected system". The bar is **a person in a specific
niche finds it, uses it, and gets something valuable out of it without talking
to us.**

---

## 1. Pick the niche before you pick the product

Most failures here were failures of aim, not of code. Narrow beats broad, and
narrow-with-money beats narrow-and-interesting.

A niche is good enough to build for when you can answer all four:

| Question | Bad answer | Good answer |
|---|---|---|
| Who exactly? | "Small businesses" | "Independent 3PL warehouses running under 20 staff" |
| What do they type into a search box? | "inventory software" | "how to prove FIFO pick order for an audit" |
| What does the problem cost them? | "It's annoying" | "A failed audit is a lost contract" |
| Why hasn't a big vendor solved it? | (no answer) | "The market is 4,000 firms — too small for a sales-led vendor, fine for us" |

Where to find them: places where a rule changed and nobody has shipped the
boring tool for it yet (a new reporting requirement, a deprecated format, a
platform migration); trades where the money is real and the software is
spreadsheets; and the long tail of "I do this manually every week" posts.
`portfolio/pipeline/` already holds screened candidates with `build-now`
verdicts — start there before inventing a new one.

**The value test:** finish this sentence in the product's own README — *"After
using this, you can now ___ , which used to take ___ ."* If you can't, the aim
is wrong, and no amount of code fixes it. The strongest version of that sentence
ends in the user earning more: a job they can now bid on, an invoice they can
now issue, a client they can now keep.

## 2. Choose a shape that costs us nothing per user

In rough order of preference:

1. **Static site / browser app.** All computation client-side, state in
   `localStorage` or a file the user downloads. GitHub Pages hosts it. Zero
   marginal cost, no data of theirs on our side, no outage we have to answer
   for.
2. **CLI or library.** Distributed through a package registry or a GitHub
   release; runs on the user's machine. Great for developer and technical-trade
   niches, and it makes the repo page the landing page.
3. **Generator / checker that runs in the user's own CI.** A GitHub Action or a
   script they schedule. Their compute, their secrets, their data.
4. **Small service on the Hetzner product box.** Only when the product
   genuinely cannot be any of the above. Keep it stateless, keep the data
   the user's, and include the no-SLA clause in §5b. Never host a public
   product on the agent box. Details: [`portfolio/hosting/README.md`](portfolio/hosting/README.md).

Rules that keep the cost floor at zero: no per-user paid API on our account, no
per-user database we pay for, no per-user human step, no account system unless
the product is useless without one (and if you need one, prefer "bring your own
GitHub login" over storing credentials). Do not add Cloudflare or Vercel as
the way a new product goes live — GitHub Pages and the existing Hetzner
boxes are the host.

## 3. The API-key switch

Ship the product fully useful with **no key at all**, and let a key unlock the
extra:

```ts
// Deterministic path is the product. AI is an upgrade the user pays for
// with their own key — never with ours.
const key = process.env.ANTHROPIC_API_KEY ?? userSettings.apiKey ?? null;

export async function summarise(report: Report): Promise<Summary> {
  if (!key) return deterministicSummary(report);   // always works
  try {
    return await modelSummary(report, key);
  } catch {
    return deterministicSummary(report);           // never a hard failure
  }
}
```

And say so in the interface, rather than silently degrading:

> AI summaries are off. Add your own Anthropic or OpenAI key in Settings to
> turn them on — it stays in your browser and is never sent to us.

Why this shape matters: it ships today at zero cost, it is honest about who
pays for inference, and it converts into a paid tier later by changing who
holds the key — no rewrite.

Never commit a key. Never embed one of ours in a client. Never make a paid API
a hard dependency of the main flow.

## 4. Build the thing

One session should produce something usable. Concretely:

- **Scope to a v0 a stranger can complete a task with.** One workflow, done
  well, beats five half-workflows.
- **Traditional software first.** Deterministic code is testable, fast, cheap,
  and doesn't hallucinate. Reach for a model when the model *is* the feature.
- **Tests where they protect the user-visible behaviour**, not for coverage.
  The venture's existing test command is the bar — run it.
- **Run the product itself**, not just its tests. Open the page, run the CLI,
  execute the action. If you can't run it, you can't say it ships.
- **Leave `main` working.**

## 5. Every product ships these five things

A product is not done without them. They are cheap and they are what makes a
free product safe to give away and possible to find.

### a. A LICENSE

MIT unless there's a reason. It has to exist.

### b. A disclaimer the user actually sees

In the README *and* somewhere in the product (footer, about box, `--help`,
first-run notice). Copy this, adjusting only the bracketed part:

> **No warranty.** This tool is provided free and as-is, without warranty of
> any kind, express or implied. It is not [legal / tax / financial / medical /
> engineering] advice, and it does not replace a qualified professional.
> **You are responsible for reviewing and verifying its output before relying
> on it**, and for meeting any obligation it helps you prepare for. To the
> maximum extent permitted by law, the authors accept no liability for any
> loss or damage arising from its use.
>
> **Best-effort hosting, no SLA.** These tools are free, experimental, and
> may be slow, broken, moved, or taken offline without notice. We do not
> promise uptime, backups of anything you type, or that a URL will keep
> working. Do not use this as a system of record. If a tool needs to
> survive, export your inputs and run it yourself.

The no-SLA paragraph is required on every hosted surface (GitHub Pages or
Hetzner). It covers availability. It does **not** let us store personal
data on a box and call that fine — if anything leaves the browser, the
privacy line in §5c has to name it.

**You do not have to carry the no-SLA paragraph yourself.** The Pages build
injects it into any published page that lacks one, because how these pages are
hosted is the build's statement to make, not the venture's. Write it if you
want it visible when the page is opened from a clone; leave it out and the
hosted page still has it.

**The no-warranty paragraph is yours**, and the build cannot write it: what a
tool is not advice *about* — "not landscaping, construction, legal, tax, or
financial advice" — only the venture knows. Check every HTML page in the
venture, not just `index.html`:

```
node platform/pages/clauses.mjs <venture-slug>
```

Your venture's CI runs exactly that, so it fails on the PR. Do not rely on
the Pages suite for it: bot PRs authored with `GITHUB_TOKEN` do not trigger
Actions here, so that one first runs *after* the merge, on `main`, where it
turns the Pages build red in a workflow you never touched. Six pages across
three ventures reached `main` that way before the clause was injected — all
of them copied a sibling's footer instead of this file.

Non-negotiable positioning, because it is what keeps the liability containable:
the product produces **evidence, drafts, checks, and monitoring**. The user
remains the filer, the signer, and the decision-maker. Never phrase output as a
determination made on the user's behalf ("You are compliant") — phrase it as an
observation they act on ("3 of 12 checks did not pass — here is each one").

### c. A privacy line, honestly stated

One short section. If everything is client-side, say so — it is a feature:

> Everything runs in your browser. Your data is never uploaded, and we don't
> have accounts, tracking cookies, or an analytics vendor. We count anonymous
> events (which features get used, nothing about who used them) — see
> [Usage](#usage) to turn it off.

If anything does leave the machine, name what, where it goes, and how long it
lives. Never write a privacy claim you haven't checked against the code.

### d. Usage counting

Per [`portfolio/usage/README.md`](portfolio/usage/README.md). Count events,
never people. No PII, no IPs, no content, no cross-site identifiers. Make it
visible and switch-off-able. Then write the numbers into
`portfolio/usage/usage.yaml` so the router can see which products are alive.

### e. Discoverability

This is a build task and it ships with v0, not later:

- [ ] Landing page (or README as landing page) that names the problem in the
      user's words in the first sentence — before the install instructions.
- [ ] `<title>` and meta description carrying the actual search phrase.
- [ ] One docs page per specific question the niche asks, answering it directly.
- [ ] `schema.org` JSON-LD (`SoftwareApplication` / `HowTo` / `FAQPage`), a
      sitemap, and a `robots.txt` that lets assistants crawl. AI assistants are
      a first-class discovery channel now, and they read pages.
- [ ] Open Graph tags so a shared link renders.
- [ ] A launch date, so the tool enters the portfolio's Atom feed — `node
      platform/pages/launched.mjs --write`, then commit
      `platform/pages/launched.json`. The feed at `/feed.xml` is the only
      surface that answers "what is new" rather than "what exists", and it is
      how readers, aggregators and a niche community's own moderators pick a
      tool up without anyone publishing outward. One command, and it is the
      one discoverability step nothing else in the artifact reveals: a tool
      without a date has correct pages, a correct sitemap entry and a correct
      `llms.txt` line, and is simply never announced. `check.mjs` and
      `platform/pages/launched.test.mjs` both fail if you forget, so this is a
      reminder rather than a trap.
- [ ] Repo topics and a one-line description that reads like a search result.
- [ ] Prepare the listing artifact (description, screenshots, category) for any
      free channel the product fits — but **publishing under the portfolio's
      public name is owner-only** per `portfolio/DIRECTION.md`, and several
      channels that look free turned out to be egress- or scope-denied from
      here anyway (`portfolio/pipeline/channel-inventory.md`). Build the
      artifact, queue the one-line ask, ship the product regardless: search and
      AI discovery do not need anyone's permission.

### f. If the page names a competitor

Naming a specific commercial product to explain what your tool is and isn't
("this calculator vs. ServiceMonster") is normal here — 173 pages across the
portfolio do it, and it is good SEO: it answers the comparison question a
searcher actually types. It is also the one piece of marketing copy in this
playbook that names someone else's trademark, so it carries its own two rules,
not just the disclaimer in §5b.

1. **Nominative fair use only.** Name the product solely to describe what it
   is and what your free tool is not — never in a way a reader could take as
   affiliation, endorsement, or sponsorship. Say so explicitly:

   > Not affiliated with, endorsed by, or sponsored by **[Product]**.
   > **[Product]** is a trademark of its owner, named here only to describe
   > what this tool is and is not.

   `node platform/pages/clauses.mjs <slug>` fails the build if a
   `vs-<competitor>.html` page lacks this. If the page genuinely compares
   against a generic role rather than a named product or company — "your
   title company's net sheet" is nobody's trademark — add it to
   `COMPARISON_DISCLAIMER_EXEMPT` in `platform/pages/clauses.mjs` with why,
   rather than writing a disclaimer about a party that doesn't exist.

2. **Facts only, sourced, comparative rather than derogatory.** What the
   competitor's product does, cite its own public documentation or marketing.
   State it plainly rather than guessing or inferring reviews you haven't
   read. Never claim it is bad, broken, or a bad value — the honest and legally
   safer framing is "different job": what it does, what the free tool does,
   and when each is the right answer. A comparison that reads as an attack
   rather than a fact sheet is a defamation and false-advertising exposure
   for a page that costs nothing to make safe instead.

## 6. Money: donations only, and most of it already ships

No checkout, no card fields, no billing code, no merchant of record, not even
disabled. That is on the owner-only list in
[`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) because it needs a bank
account and a tax identity.

**Two separate things exist here — do not conflate them:**

1. **A per-product `github.com/sponsors/<owner>` link in the footer or about
   section.** This is agent-decidable, needs no owner action, and is already
   live: verified 2026-09-06, **184 of 185 ventures** (excluding two
   `NOT-A-VENTURE` scaffolding directories) now carry a working link, after
   `local-site-studio`, `quick-pick-survey`, and `retail-pilot-intel` were
   closed the same day — each is an app with no build-time footer injection,
   so the link went into that app's own layout/footer component
   (`site-footer.tsx`, `ProfileView.tsx`, `LoginGate.tsx` respectively). Add
   it the same way when you ship a new product.

   `photo-editing` is the one remaining exception, and it is not the same
   gap: it is a `stage: prototype` CLI pipeline with no LICENSE, no web
   surface, and per its own `kill_criteria` no external user has tried it
   yet. There is no footer to put a link in and no visitor to show it to —
   forcing one in now would be exactly the parity-for-its-own-sake habit
   `portfolio/DIRECTION.md` warns against. Add the link when this venture
   ships a user-facing surface, not before.
2. **The native repo-level GitHub "Sponsor this project" button**, via
   `.github/FUNDING.yml`, which is a separate, owner-only account-ownership
   decision (queued as `funding-sponsors-live`, PR #839 — read the queue with
   `python3 portfolio/ledger/decision_queue.py`; do not open a second one). It
   was merged once and reverted the same day (#862), so the safe state on
   `main` today is no `FUNDING.yml`. This only adds a second entry point on
   top of links that already work — it is not what turns donations on.

No third-party donation links, and never in front of a feature — a donation
prompt lives in the README and the footer, nowhere a user has to pass through.

What "free for now" is buying: usage data, which is the only evidence we have
about which product deserves more time. Design so that turning payment on later
is a change of who holds the key or a hosted tier — not a rewrite.

## 7. Definition of done

Ship when every line is true:

- [ ] A stranger in the niche can go from landing page to a completed task
      alone.
- [ ] It runs with no key, no account, and no paid dependency of ours.
- [ ] LICENSE, disclaimer, and privacy line are in the README **and** the
      product.
- [ ] Usage counting is in, and off-switchable.
- [ ] Discoverability checklist above is done.
- [ ] The venture's tests and linter pass, and you ran the product itself.
- [ ] The §5b **no-warranty** clause is on every page the venture publishes,
      not just the calculator, and any `vs-<competitor>.html` page carries the
      §5f **not-affiliated** trademark disclaimer — `node
      platform/pages/clauses.mjs <slug>` checks both. The venture's own CI runs
      this, so it fails on the PR rather than on `main`. (The no-SLA clause is
      injected by the Pages build and is not yours to carry; see §5b.)
- [ ] `VENTURE.yaml` exists (or the slug is under `product_lines` in its host
      venture's) so the router can see it — `python3 portfolio/router/validate.py`.
- [ ] CI green, merged, one ledger line in `portfolio/ledger/YYYY-MM.yaml`.
- [ ] A stranger can reach it without cloning this repo — a public URL or an
      install command. Merged-to-`main` is not deployed. Static products go
      to GitHub Pages; processes go to the Hetzner product box
      ([`portfolio/hosting/`](portfolio/hosting/README.md)). If Pages is
      still gated, the next session prepares that deploy and points at
      `deploy-settings`; it does not start a sibling product and does not
      add Cloudflare or Vercel.

## 8. After it ships

- **Deploy before you build the next one.** An undeployed product on `main`
  outranks every unbuilt candidate. Usage cannot be read from a file nobody
  can open.
- **Watch usage, not opinions.** A product with real users outranks every
  candidate in the pipeline. If people come back, put the fleet's time there.
- **If nobody uses it after a fair run**, say so plainly in one ledger line and
  move on. That is a real result and it costs nothing to admit.
- **Improve what users touch.** The next session's best move on a live product
  is the friction its actual users hit, not the tier chart in
  `DEVELOPMENT_QUALITY.md`.
