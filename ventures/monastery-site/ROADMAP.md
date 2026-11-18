# Monastery site: roadmap

A multi-session build (owner, 2026-11-03: "a template website for catholic monks
and nuns for their communities. like all the features of the best ones but
customizable for their personal community. well supported set up for receiving
donations vocations inquiry about section etc." and "highly opinionated website
builder"). Each slice lands with tests and a demo update.

## Landed

- 2026-11-03: engine (`site.mjs`), twelve page types, six AA-checked
  palettes, launch checklist, CLI, no-code builder with live preview and .zip
  download, two fictional demo sites, 39 tests.

## Next, in order

1. **A form handler the community owns.** A Cloudflare Worker (free plan) in
   `worker/` with an OpenTofu module, deployed on the community's own account. It
   receives the vocation, prayer, stay and contact forms and emails them through
   Cloudflare Email Routing or the community's SMTP. Spam: honeypot plus
   Turnstile. The builder fills `forms.action` with its URL.
2. **One-click deploy.** A "Deploy to Cloudflare Pages" path and a GitHub
   template repository so the site rebuilds when `community.json` changes.
3. **A Mass intention and enrollment request form** on the giving page, routed to
   the office, with the offering paid through the community's own link.
   Shares its data model with `ventures/parish-office`.
4. **Liturgical calendar.** Feasts of the order's proper and the General Roman
   Calendar on the horarium and events pages. Source the calendar from an
   official text, fetched in the run that uses it.
5. **Images.** Resize and compress photographs in the browser before they go in
   the zip, a gallery uploader with required alt text, and per-page photographs.
6. **Multilingual sites** (Spanish, French, Italian, German, Polish first): page
   chrome strings in a table, `hreflang` links, one config per language.
7. **More page types:** oblates and associates; a letters-from-the-abbot archive
   with an RSS feed; a chant and homily recordings page; a "pray the Office
   with us" page; a vocation story series.
8. **Giving depth:** a needs list with a fulfilled state, a dated campaign
   history, a year-end receipt request form, guidance on monthly giving
   (honest, sourced, no invented numbers).
9. **Accessibility audit** with axe-core in CI on the demo sites, and a
   print stylesheet for the horarium.
10. **Import an existing site:** read a community's current pages (with their
    permission) and prefill `community.json`.

## Measuring

- Builder use: the page's own anonymous counters (`site_downloaded`,
  `example_loaded`, `config_imported`).
- Real adoption: sites carrying the footer credit link. Count them only by
  communities telling us, or by a search for the credit, never by tracking
  their visitors.
