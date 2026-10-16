# Redirect Map Check

Free browser tool that checks a site-migration redirect map (CSV, TSV or one old-new pair per line)
before launch: redirect loops and self-redirects, chains that should be one hop, the same old URL
sent to two places, a large share of rows redirected to the homepage (a soft-404 pattern), spaces,
#fragments, missing leading slashes, wildcards and other-host sources, temporary status codes, and
-- if the new site's URL list is pasted -- redirects that end on a 404, plus old URLs with no rule
at all, each with its line number. It then writes the map flattened, so every old URL points
straight at its final destination, as a Shopify CSV, Netlify or Cloudflare Pages _redirects, Apache
Redirect lines or an nginx map. The file is read locally and never uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/redirect-map-check/

## Run it

Open `index.html` in a browser. There is no build step, no account and no API
key; the work happens in your browser and nothing you paste is uploaded.

To run the tests (Node 20 or newer):

```
node --test ventures/redirect-map-check/
```

## Files

- `index.html`: the tool's page.
- `calc.mjs`: the logic, kept separate from the page so it can be tested.
- `usage.mjs`: anonymous, opt-in-only usage counters (off by default; see
  `portfolio/usage/README.md` in the monorepo).
- `*.test.mjs`: tests for the logic and the page.

## License

MIT. See `LICENSE`.

## No warranty

This tool is free and as-is. It is not legal, financial, tax or professional
advice and does not replace a qualified professional. You are responsible for
checking its output before relying on it. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.
