# ICP Lens

Learn who your best customers are from your own won and lost list, then rank
the prospects you already have by how much they look like them. For founders
and small B2B sales teams who today decide "who do I email first" by gut.
MIT, no dependencies, runs in a browser tab, in Node 18+, or from a terminal.
It never sends anything and holds no contact database.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/icp-lens/

Try it: open `index.html` (nothing is uploaded) and press the demo button.

## Why use this instead of what you have today

| Today | Problem for a small team | ICP Lens |
|---|---|---|
| HubSpot predictive scoring, Salesforce Einstein | Top-tier plans, per-seat, wants thousands of records | Learns from a few dozen of your own deals, free |
| Apollo, ZoomInfo, Clay, Lusha | Sell you other people's contact data and enrichment credits; "scoring" is a filter you write by hand | No data to sell. Works on a list you already have and are allowed to use |
| MadKudu, Breadcrumbs | Built and priced for product-led-growth companies with big usage data | One narrow job, CSV in, ranking out |
| A spreadsheet of gut-feel columns | Never checked against what actually closed | Shows which columns matter and how accurate the ranking is |

If you have thousands of closed deals and a data team, build a proper model. This
is for the first few hundred.

## How it works

1. **Read.** A CSV with a `status` column: `won`/`lost` (or customer/churned and
   similar) on past deals, blank on prospects. Names, emails, domains and free
   text are never signals; columns that are mostly blank or look like ids are
   dropped, and the page says which and why.
2. **Bucket.** Numbers (employees, revenue) are split into quartiles from your
   data; text columns are lower-cased categories; blanks are their own value.
3. **Learn.** Naive Bayes with Laplace smoothing: for each value, how much more
   common is it among wins than losses. A prospect's score is the sum, shown as a
   percentile and an A/B/C tier, with the three facts that raised it and the two
   that lowered it.
4. **Check.** Every labelled row is re-scored with itself held out
   (leave-one-out). The page reports the AUC (0.50 is a coin flip) and how much
   more often the top fifth were wins than average. Below 0.60 it warns that the
   ranking is noise.
5. **Draft.** Pick a prospect, get a first email from a template, or from your own
   model key. The footer carries your name, postal address and an opt-out line,
   and a checker flags missing identification or opt-out, fake urgency, fake
   `Re:` headers, absolute claims and leftover placeholders.

Fewer than 8 won or 8 lost rows: it refuses to learn and tells you the counts. Use
the manual rules box instead (`employees >= 20`, `industry in saas, fintech`).

## Use it

```js
import { analyze, applyRules } from "./engine.mjs";
const r = analyze(csvText);   // r.validation.auc, r.profile, r.prospects[i].because
```

```
node cli.mjs leads.csv > ranked.json
node cli.mjs leads.csv --rules rules.txt > ranked.json
```

Bring your own AI key (optional): the page has fields for provider, model and
key; the key stays in the tab. In Node, `outreach.mjs` reads the standard
variables through `byok.mjs` (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`GEMINI_API_KEY`, or `LLM_PROVIDER`/`LLM_MODEL`/`LLM_BASE_URL`/`LLM_API_KEY`).
`byok.mjs` is a byte-identical copy of `platform/llm/byok.mjs`; a test fails if
they drift. Only the prospect's name, the fit reasons and your offer line are sent.

## Deploy your own copy

It is static files: fork the repository and publish this folder on GitHub Pages,
Netlify, Cloudflare Pages or any web host, or serve it with
`python3 -m http.server`. Put your name on it and sell or give it away; MIT.

## Limits

- Naive Bayes treats columns as independent, so two columns that say the same
  thing (industry and SIC code) double count.
- It ranks; it does not give a probability of closing.
- Only decided deals are labelled, so it learns who you already sell to, not
  everyone you could. Treat it as a tiebreaker for who to contact first, not as a
  reason to ignore a promising outlier.
- Needs about 8 of each outcome to run and a few dozen of each to be stable.
- The compliance checker looks at the message only. It cannot know your
  jurisdiction or whether you have a lawful basis to contact a person.

## Tests

`node --test`

## Disclaimer

Free and MIT, provided as-is with no warranty and no uptime guarantee. Fit scores
are statistical rankings from the data you provide and can be wrong; they are not
a prediction that anyone will buy, and not legal, tax or financial advice.
AI-written drafts are drafts for you to check. You are responsible for who you
contact and how, including CAN-SPAM, PECR, GDPR, CASL, TCPA and the terms of every
platform you use. If it helps,
[sponsor the author](https://github.com/sponsors/Duncan-Haywood).
