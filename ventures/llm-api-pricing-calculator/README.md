# LLM API Pricing Calculator

After using this, you can now compare the monthly dollar cost of calling
different LLM APIs for your own workload side by side — modelling fresh
input, cached input, and output tokens as three separately priced numbers
instead of one blended per-token guess — which used to take separately
opening each provider's pricing page and doing the multiplication by hand,
usually while forgetting that cached tokens exist at all.

**Browser tool** (no install, nothing uploaded): open
[`index.html`](index.html) directly in a browser, or serve this directory
statically. It is live at
[`llm-api-pricing-calculator`](https://duncan-haywood.github.io/monorepo-projects/llm-api-pricing-calculator/)
in the portfolio's GitHub Pages catalogue — see `VENTURE.yaml`'s
`links.production`. The static surface includes crawlable `robots.txt` and
`sitemap.xml` files and a [guide on why cached tokens usually dominate an
agentic workload's bill](why-prompt-caching-changes-the-math.html).

## What it does

1. **Takes your monthly token workload once.** Fresh input tokens, cached
   input tokens, and output tokens per month — the same three numbers priced
   against every provider, since the workload doesn't change, only the rate
   it's billed at.
2. **Prices it across up to four providers.** Type in each provider's name
   and its currently quoted input, cached-input, and output rates ($ per
   million tokens) — the calculator does not fetch or assert any vendor's
   price on its own. Three rows come pre-filled with clearly labelled
   **example** rates for Anthropic, OpenAI, and Google to make the tool
   usable immediately; a fourth row is blank for any custom or open-weight
   provider. It totals a monthly estimate per provider and ranks them
   cheapest first.
3. **Shows the cached-token share and what caching is worth.** How much of
   your input volume is cached, and (against the first named provider's
   rates) how much cheaper that made the bill versus billing every cached
   token at the fresh-input rate.
4. **Copies a decision summary** to paste into a ticket, PR description, or
   team note.

No accounts, no server, no network calls. Everything computed in `calc.mjs`
is unit-tested in `calc.test.mjs` and driven from `index.html`'s form.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not financial, procurement, or vendor-pricing advice, and
does not replace verifying current rates directly with each provider. **You
are responsible for reviewing and verifying its output before relying on
it**, and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which buttons get used, never the numbers you typed) — see
[Usage](#usage) to turn it off.

## Usage

Opt-in, on by default, `localStorage`-only, and never transmitted anywhere.
It counts two events — `compare_run` and `summary_copied` — with no inputs,
identifiers, cookies, or third-party service involved. Toggle the checkbox on
the page to turn it off; Do Not Track and Global Privacy Control disable it
automatically. See `usage.mjs` / `usage.test.mjs`.

Free and open source. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.

## Tests

```
node --test
```

`calc.test.mjs` covers the token-pricing and provider-comparison arithmetic
(including the cached-token share and cache-savings helpers), `usage.test.mjs`
covers the opt-out counter, and `page.test.mjs` checks the published page
carries the required disclaimers and valid structured data.
