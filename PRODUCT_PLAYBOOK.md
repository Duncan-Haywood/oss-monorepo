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

## 2. Choose the shape that fits the user; keep our cost per user at zero

**A menu, not a ranking.** There is no static-only or static-first rule
(owner, 2026-10-21: "applications can and should be distributable in a
variety of ways to a variety of platforms"; `prompts/goals.md`, "Direction:
every platform"). Pick the form the user would actually reach for, and ship
the same engine through several of them where that helps (web page, CLI,
MCP server, desktop and mobile packages in `platform/distribution/`). An
earlier static-first ordering, read as a recipe, produced 121 near-identical
`<trade>-bid-calculator` ventures
([`docs/reports/2026-10-16-calculator-glut.md`](docs/reports/2026-10-16-calculator-glut.md)). Before adding
a product in an existing template family, don't. Start no new calculators and
spend no runs deepening existing ones beyond fixes; already-built work can
still merge (owner, 2026-10-21; `prompts/goals.md`, "Depth
over calculators"). A browser tool's engine should be one a chatbot can't
reproduce in one reply and a maths graduate can't follow at a glance.

1. **Browser app.** Computation client-side, state in `localStorage` or a
   file the user downloads. GitHub Pages hosts it at no cost to us.
2. **CLI or library.** Distributed through a package registry or a GitHub
   release; runs on the user's machine. Great for developer and technical-trade
   niches, and it makes the repo page the landing page.
3. **Generator / checker that runs in the user's own CI.** A GitHub Action or a
   script they schedule. Their compute, their secrets, their data.
4. **Native, desktop or mobile app; browser or editor extension.** Built by
   the packagers in `platform/distribution/`; runs on the user's device.
5. **A service, with a server, database or long-running process.** Fine when
   the product is better for it. We run no product servers on the owner's
   bill (the Hetzner box was retired on 2026-10-01), so ship it for others to
   run: a container image, a one-click self-deploy (below), or a package the
   user runs locally, with the no-SLA clause in §5b. Details:
   [`portfolio/hosting/README.md`](portfolio/hosting/README.md).

Rules that keep the cost floor at zero: no per-user paid API on our account, no
per-user database we pay for, no per-user human step, no account system unless
the product is useless without one (and if you need one, prefer "bring your own
GitHub login" over storing credentials). GitHub Pages hosts our web surfaces
at $0; another host (Cloudflare, Vercel) means an account only the owner can
open, so it needs a stated reason Pages cannot meet.

### Rule of thumb: anyone can deploy it themselves (owner, 2026-10-15)

Build every app so that a stranger can run their own copy of it, in their own
cloud account, without us. That lets other people set up businesses from
this repo. The flow is: pick an app, pick a cloud provider, paste in
credentials, click **Deploy**. This is a direction for future work, not a
feature that exists yet.

The model here is that we don't host anything. Each app is an open-source
business that anyone can host in one click. The code is already MIT, at the
root and in all 1,236 ventures. MIT lets anyone copy, modify, host and sell
it, so no license change is needed. The deployer keeps the copyright notice,
and the license's no-warranty clause protects us. Whoever clicks Deploy
becomes the operator of their copy. They are responsible for its domain,
terms, privacy policy and users, and for any changes they make. The deploy
page must say so before the button. The §5b disclaimers ship in the deployed
copy, but they are the operator's to keep accurate, not ours.

When someone builds it, these rules apply:

- **All IaC, no backend of ours.** The deploy page is a static page like
  every other one. The page creates a small deploy repo in the visitor's
  GitHub account using their own GitHub token, then stores their cloud
  credentials there as Actions secrets. The page encrypts the credentials in
  the browser with the repo's public key (a libsodium sealed box) before
  sending them. It then dispatches a workflow that runs OpenTofu. Keep the
  OpenTofu state encrypted (OpenTofu's native state encryption) and in the
  visitor's own repo. Also offer "download the IaC" so a visitor can run
  `tofu apply` locally and never give GitHub a credential.
- **OpenTofu is the IaC tool, and it is set up the same way everywhere.**
  Write modules for OpenTofu (`tofu`), not Terraform. The two have different
  licenses, and state encryption is OpenTofu-only. Set it up like this:
  - Pin the version: `required_version` in each module, and the same version
    in the workflow's `opentofu/setup-opentofu` step.
  - Pin every provider in `required_providers` and commit
    `.terraform.lock.hcl`.
  - Configure state encryption from an Actions secret (a passphrase the
    deploy page generates in the browser). A plain-text state file is never
    committed.
  - Use `tofu apply` for deploys and `tofu destroy` in a separate workflow.
    Teardown is one click too.
  - Write each module's outputs (the live URL) to the job summary.
  - Our own CI runs `tofu fmt -check` and `tofu validate` on every module, so
    a broken module fails here and not in a stranger's account.
  - Each module's README gives the local commands (`tofu init`, then
    `tofu apply -var-file=...`) for the download path.
- **Several providers, chosen by the visitor.** Static apps can go to GitHub
  Pages, AWS (S3 + CloudFront), Google Cloud Storage, Azure Storage static
  websites or DigitalOcean Spaces. Apps that need a running process get a
  cloud-init VM on Hetzner, DigitalOcean or AWS. "Not Cloudflare, not Vercel"
  is about where *we* host. It does not limit where a visitor deploys their
  own copy.
- **One platform feature, not 1,200 per-venture ones.** Build it once under
  `platform/deploy/`. Derive the list of apps from `discoverSurfaces()` in
  `platform/pages/build.mjs`. Avoid keeping a second list. Giving each venture
  its own deploy button is the fleet-parity trap.
- **Credentials never touch anything of ours.** Nothing we run or log ever
  sees them. The page states exactly where they go: GitHub, encrypted, and
  then the visitor's cloud provider. The visitor pays their own cloud bill,
  and the no-SLA clause in §5b applies to their copy too.
- **Money stays donations.** The only ask is a Buy Me a Coffee link, beside
  the existing GitHub Sponsors link, as a plain link with no embedded
  widget (a third-party script would break the privacy line in §5c). This
  is an owner-approved exception to
  §6's "no third-party donation links", for Buy Me a Coffee only. The owner
  gave the handle on 2026-10-15. The URL is exactly
  `https://buymeacoffee.com/duncanhaywood`; use no other handle or spelling.

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

> AI summaries are off. Add your own Anthropic or OpenAI key in Settings, or
> point it at a model running on your own computer (Ollama, LM Studio), to
> turn them on. Nothing is ever sent to us.

Why this shape matters: it ships today at zero cost, it is honest about who
pays for inference, and it converts into a paid tier later by changing who
holds the key — no rewrite.

Never commit a key. Never embed one of ours in a client. Never make a paid API
a hard dependency of the main flow.

**Local models are a first-class switch position** (owner, 2026-10-18).
Wherever a key is offered, offer "a model on your own computer" beside it:
no key, no per-call cost, and the user's data never leaves their machine.
The same applies to image and video generation when a product adds it: a
local server (ComfyUI, Stable Diffusion WebUI, LocalAI) is offered next to
any hosted API, and neither is required for the main flow.

Use the shared client rather than writing another:
[`platform/llm/byok.mjs`](platform/llm/README.md) talks to Anthropic, OpenAI,
Gemini, any `/chat/completions` endpoint, or a local Ollama, LM Studio or
llama.cpp server, and its `withFallback` is the shape above.

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

### Rule of thumb: every way in: see, type, speak, delegate (owner, 2026-10-20)

People would often rather say "2,400 square feet, 8/12 pitch" than click
through twenty fields, and an AI agent should be able to use a tool as
easily as a person. So voice, chat and agent use are primary interfaces, not
add-ons (`prompts/goals.md`, "Direction: voice, chat and agents"). For a
browser tool on the Pages site most of this comes free from the site
assistant (`platform/pages/assistant.mjs`): the header's Ask link, a
"Speak or type" button on every tool page, voice-only mode, and WebMCP
tools for agents. A product's part is:

- **Keep the form readable by machines.** Every control has a real
  `<label>` that names it in a user's words ("Shipping label cost", not
  "Cost 2"), a `type="number"` with honest `min`/`max`/`step` where it is a
  number, and real `<option>` text. The reader matches what people say to
  these labels, and agents get them as a JSON Schema.
- **Put the result where it can be read aloud**: an `aria-live` region, an
  `<output>`, or an element with id `results`/`summary`. A result announced
  to a screen reader is one the assistant can speak.
- **Recompute on `input`/`change`**, so a value written by voice or by an
  agent updates the result the same way typing does.
- **Opt in to anything heavy.** A model, a speech recogniser, a voice: none
  of these loads until the person clicks something that names the download
  size and where their words go. The page without any of it stays fast and
  fully usable. Never use cloud speech recognition silently. It sends audio
  to a third party.
- **Show your work.** Every value written by voice, chat or an agent is listed
  with its source words and an Undo. Every reply names the engine that made
  it. Accuracy is measured on real sentences (`platform/pages/assistant/evals.json`),
  and the measured score is published beside the limitations. When a real
  sentence fails, add it there.

### Language: pick what fits the product (2026-10-21)

There is no required language or file format for venture code. The owner,
2026-10-21, lifted the 2026-10-16 rule that venture code must be build-free
`.mjs`: choose the language and tooling that make the product best, the way a
competent engineer would. What still holds is physical, not a style rule:

- **The site serves committed files.** `platform/pages/build.mjs` copies a
  venture's files as they are and drops source-only extensions (`.ts`,
  `.tsx`, `.py`, …; `NON_WEB_EXTENSIONS`). Whatever the browser loads has to
  be in the tree, or produced by a step you add to the Pages build in the
  same PR. A compile step nobody runs means a broken page.
- **The $0-marginal-cost shapes and the five things in §5 apply whatever the
  language.**

Plain `.mjs` is still what most of the portfolio is written in and what the
shared tooling (tests, `clauses.mjs`, `regen.mjs`) is most used to, so it is
the easy path for a small calculator, not an obligation. If you write plain
JavaScript, TypeScript's checker is cheap insurance:

- **Start new `.mjs` files with `// @ts-check`.** Add JSDoc types only
  where tsc asks for them (`/** @type {HTMLFormElement} */` on a
  `querySelector`, a `@typedef` for an object that is built up after its
  literal). Keep the JSDoc true: a `@param {number}` the form actually passes
  as `''` misleads the next session.
- **A file you edit gets the pragma too, if it already passes.**
  `node platform/pages/typecheck.mjs --candidates <slug>` lists which of the
  venture's files pass today. Prefer not to retrofit files that fail or add
  `--checkJs` across the tree.
- **CI keeps opted-in files clean.** `node platform/pages/typecheck.mjs <slug>`
  runs in `ventures-tests` on every venture a PR touches. It exits 1 on any
  diagnostic in an opted-in file.

Why opt-in and not everywhere: across all 3,410 venture product files,
`--checkJs` reported 3,911 diagnostics and one user-visible bug. That bug was
a duplicate object key that blanked a transaction count. With the two
privacy-signal globals declared, 80% of files (two thirds of `calc.mjs`)
already pass with no other edit. Opting a file in costs nothing, and it
catches the renamed field, duplicate key or misspelled method in the edit
that introduces it. Measurement:
[`portfolio/research/js-typecheck/`](portfolio/research/js-typecheck/README.md).

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

The no-SLA paragraph is required on every hosted surface (GitHub Pages or a
self-deployed copy). It covers availability. It does **not** let us store personal
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

`ventures-tests.yml` runs it for every venture a PR touches
(`clauses.mjs --changed-since <base>`), so it fails on your PR, names your
venture and annotates the page in the diff. You needn't add it to a
`<slug>-ci.yml`; until 2026-10-20 each of those carried a copy. Avoid relying
on the Pages suite for it, which runs only on `platform/pages/**` and so
first catches the page *after* the merge, on `main`, red in a workflow you
never touched. Six pages across
three ventures reached `main` that way before the clause was injected — all
of them copied a sibling's footer instead of this file.

Non-negotiable positioning, because it is what keeps the liability containable:
the product produces **evidence, drafts, checks, and monitoring**. The user
remains the filer, the signer, and the decision-maker. Never phrase output as a
determination made on the user's behalf ("You are compliant") — phrase it as an
observation they act on ("3 of 12 checks did not pass — here is each one").

### c. A privacy line, honestly stated

One short section that says what the product actually does. The rules behind
it are the law's, not stricter ones (owner, 2026-10-20;
[`portfolio/usage/README.md`](portfolio/usage/README.md), rule 1): a cookie or
`localStorage` entry a feature needs is fine, and is named here; an identifier
used for analytics needs consent from EU/UK visitors first. If everything is
client-side, say so. It is a feature:

> Everything runs in your browser. Your data is never uploaded, and we don't
> have accounts, tracking cookies, or an analytics vendor. We count anonymous
> events (which features get used, nothing about who used them) — see
> [Usage counting](#d-usage-counting) to turn it off.

If anything does leave the machine, name what, where it goes, and how long it
lives. Never write a privacy claim you haven't checked against the code.

### d. Usage counting

Per [`portfolio/usage/README.md`](portfolio/usage/README.md). Anonymous
aggregate counts are on by default. Anything that identifies a returning
browser goes behind the consent the law requires. No content, and nothing
personal committed to the repository. Make it visible and switch-off-able. Then write the numbers into
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
- [ ] Where the product fits a natural distribution channel (registry, store,
      directory, feed), build its publish pipeline off by default with a dry
      run, per [`portfolio/distribution/`](portfolio/distribution/README.md)
      (owner goal, 2026-10-15). Automated and unpaid, and never against a
      platform's terms.

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

## 6. Money: the deployer's keys, never the owner's

Payment code is allowed (the owner, 2026-10-15: "I think payment is okay I just
don't want mine. if other people want to fork and put their payment in it's
okay with me"). Build it so that:

- it is **off by default**: with no keys set, the product works and says
  payments are not configured;
- it reads every key, price id and link from **environment variables the
  deployer sets**, and names them in the README and the deploy page;
- it never carries a real account: no live keys, no Payment Link or
  hosted-button ids. `python3 platform/ci/check_payment_keys.py` catches
  those in CI;
- the README says plainly that whoever turns payments on is the merchant,
  with that role's tax, refund and dispute duties.

The owner's own instances (the GitHub Pages site) take donations only: the
GitHub Sponsors link below, and the one approved Buy Me a Coffee link.

**Two separate things exist here — keep them apart:**

1. **A per-product `github.com/sponsors/<owner>` link in the footer or about
   section.** This is agent-decidable, needs no owner action, and now ships
   on **all 185 ventures** (excluding two `NOT-A-VENTURE` scaffolding
   directories): 181 already carried it as of 2026-09-06, and the last four
   app-shaped ventures — `local-site-studio`, `photo-editing`,
   `quick-pick-survey`, `retail-pilot-intel` — were closed the same day by
   adding the link to each app's own layout/footer component. Add it the
   same way when you ship a new product.
2. **The native repo-level GitHub "Sponsor this project" button**, via
   `.github/FUNDING.yml`, which is a separate, owner-only account-ownership
   decision (queued as `funding-sponsors-live`, PR #839 — read the queue with
   `python3 portfolio/ledger/decision_queue.py`; there is no need to open a second one). It
   was merged once and reverted the same day (#862), so the safe state on
   `main` today is no `FUNDING.yml`. This only adds a second entry point on
   top of links that already work — it is not what turns donations on.

**Corrected 2026-09-06, same day: the link ships everywhere, and clicks on it
are now counted everywhere too — automatically, not venture by venture.**
This section used to read as a per-venture backlog item ("wire a `click`
listener into each venture's own `usage.mjs`"). That was overtaken a commit
later (#3511): `platform/pages/build.mjs`'s `markSponsorLinksIn` tags every
Sponsors anchor on every published page — tool, hub, category, and comparison
— across all 186 ventures, and the shared `pf-site.js` chrome those pages
already load counts a click into `portfolio-hub-usage` under the literal event
`sponsor_link_clicked`. See
[`portfolio/usage/README.md`](portfolio/usage/README.md) "Wired the same day,
on the published site, in one place rather than 186."

**Avoid hand-wiring a second listener into a venture's own `usage.mjs` for
this** — the build already covers the published site, and adding one anyway
is the fleet-parity trap described in `portfolio/DIRECTION.md`, not new
signal. The one legitimate reason to wire it in a venture's own code: that
venture's `index.html` is meant to be opened outside the published build (a
local clone, an offline copy), where the shared chrome never loads. That is
rare and worth naming explicitly rather than assuming.

Like every other counter in this portfolio, the click is `localStorage`-only
and never transmits — it is now *countable* on the visitor's own device, not
yet *counted for us*. Reading the aggregate back is the same open problem
`portfolio/usage/README.md` already describes for the rest of the fleet, not
something a venture's own PR can close.

No third-party donation links (one owner-approved exception: a plain link to
`https://buymeacoffee.com/duncanhaywood`; see §2's self-deploy rule), and never in front of a feature — a donation
prompt lives in the README and the footer, nowhere a user has to pass through.

What "free for now" is buying: usage data, which is the only evidence we have
about which product deserves more time. Design so that turning payment on later
is a change of who holds the key or a hosted tier — not a rewrite.

## 7. Definition of done

Ship when every line is true:

- [ ] A stranger in the niche can go from landing page to a completed task
      alone.
- [ ] It has a home/marketing page on the GitHub Pages site, linked from the
      portfolio homepage — CLIs, servers and apps included, not only browser
      tools (`prompts/goals.md`, web presence). The page says what it does and
      for whom, shows it (a screenshot or a demo), and links to try it and to
      the code.
- [ ] It has a marketing page aimed at the people who would use it (who it
      is for, their problem in their words, a worked example, when to use
      something else), and an `llms.txt` beside its page for assistants
      (`prompts/goals.md`, "LLM docs and a marketing page"). Every
      claim on them is one a file backs: no invented reviews, testimonials,
      ratings or user counts (Guardrails, "Honest marketing").
- [ ] It runs with no key, no account, and no paid dependency of ours.
- [ ] LICENSE, disclaimer, and privacy line are in the README **and** the
      product.
- [ ] Usage counting is in, and off-switchable.
- [ ] The sponsor link is present and reads `github.com/sponsors/Duncan-Haywood`
      (§6) — the `sponsor_link_clicked` counter itself needs no per-venture
      wiring: the published-site build counts every Sponsors anchor
      automatically (§6). Only wire it in the venture's own `usage.mjs` if the
      venture is meant to be opened outside that build (a local clone, an
      offline copy).
- [ ] Discoverability checklist above is done.
- [ ] The venture's tests and linter pass, and you ran the product itself.
- [ ] The §5b **no-warranty** clause is on every page the venture publishes,
      and any `vs-<competitor>.html` page carries the §5f **not-affiliated**
      disclaimer — `node platform/pages/clauses.mjs <slug>` checks both (the
      Pages build injects the no-SLA clause; see §5b).
- [ ] `VENTURE.yaml` exists (or the slug is under `product_lines` in its host
      venture's) so the router can see it — `python3 portfolio/router/validate.py`.
- [ ] Venture `*.test.mjs` suites need no workflow of their own:
      `ventures-tests.yml` runs `python3 platform/ci/run_venture_tests.py`
      for every venture a PR touches, and that same command (`--changed`, or
      the slug) is the local check. `validate_workflows.py` rejects a
      `<slug>-ci.yml` that only runs `node --test`. Add one only for work
      beyond that (pytest, a build, a service), record it in the **same
      commit** with `python3 platform/ci/publish_surface.py --write`, and say
      in the PR what it can publish (`none` for a test-only workflow);
      `--check` fails until the snapshot names it, by design.
- [ ] CI green, merged, one ledger line in `portfolio/ledger/YYYY-MM.yaml`.
- [ ] A stranger can reach it without cloning this repo — a public URL or an
      install command. Merged-to-`main` is not deployed. Static products go
      to GitHub Pages; processes ship as a self-deploy the user runs
      ([`portfolio/hosting/`](portfolio/hosting/README.md)).

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
