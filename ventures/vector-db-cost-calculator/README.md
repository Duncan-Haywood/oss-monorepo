# Vector Database Cost Calculator

After using this, you can now estimate your vector index's real storage
footprint in gigabytes and its monthly cost across up to three vector
database providers side by side — which used to take separately opening each
vendor's own pricing calculator and manually converting your vector count and
dimension into a storage figure by hand.

**Browser tool** (no install, nothing uploaded): open
[`index.html`](index.html) directly in a browser, or serve this directory
statically. It is live at
[`vector-db-cost-calculator`](https://duncan-haywood.github.io/monorepo-projects/vector-db-cost-calculator/)
in the portfolio's GitHub Pages catalogue — see `VENTURE.yaml`'s
`links.production`. The static surface includes crawlable `robots.txt` and
`sitemap.xml` files, a [comparison against Pinecone's own pricing
page](vs-pinecone.html), and a [reference page on index
overhead](what-is-vector-index-overhead.html).

## What it does

1. **Sizes your index.** From vector count, embedding dimension, and any
   per-vector metadata size, it computes the raw byte size
   (`vectorCount * dimension * 4` for float32, plus metadata), then applies
   an **index overhead multiplier you set yourself** — the calculator never
   asserts a value for you, because how much extra space a deployed index
   actually needs depends on the engine, its index type (HNSW graphs are
   the common case), and its tuning, and any single number this tool
   guessed would be wrong for most configurations and go stale the moment a
   vendor changed a default. See
   [`what-is-vector-index-overhead.html`](what-is-vector-index-overhead.html)
   for how to derive a real multiplier by measuring your own deployment.
2. **Prices it across up to three providers.** Type in each provider's name
   and its currently quoted storage ($/GB-month) and query ($/million
   queries) rates, plus any free allowance — the calculator does not fetch
   or assert any vendor's price on its own. It totals a monthly estimate per
   provider, above each one's free allowance, and ranks them cheapest first.
3. **Copies a decision summary** to paste into a ticket, PR description, or
   team note.

No accounts, no server, no network calls. Everything computed in `calc.mjs`
is unit-tested in `calc.test.mjs` and driven from `index.html`'s form.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not financial or engineering advice, and it does not
replace a qualified professional or a vendor's own documented pricing. **You
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
It counts two events — `calculation` and `summary_copied` — with no inputs,
identifiers, cookies, or third-party service involved. Toggle the checkbox on
the page to turn it off; Do Not Track and Global Privacy Control disable it
automatically. See `usage.mjs` / `usage.test.mjs`.

Free and open source. [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
is optional and never changes what the tool does.

## Tests

```
node --test
```

`calc.test.mjs` covers the storage-sizing and cost-comparison arithmetic,
`usage.test.mjs` covers the opt-out counter, `page.test.mjs` and
`vs-pinecone.test.mjs` check the published pages carry the required
disclaimers and valid structured data.
