# pay-app-guides: the first Spanish page, and how to add the next (2026-11-27)

Bet #1 (PayApps) had every ROADMAP Next item waiting on demand, so this run took a front-door slice
no run had touched: Spanish. Before it, no page in `pay-app-guides`, the payapps site or the app
had `lang="es"`. Some subcontractor owners read Spanish more easily than English, while the forms
they bill on (G702/G703-style pay apps, GC portals, lien waivers) are in English. So the page explains
each English form line in Spanish and keeps the English name beside it, the way the reader will see
it on paper.

## What landed

- `ventures/pay-app-guides/es-como-llenar-una-solicitud-de-pago.html`: the "how to fill out a pay
  application" guide in Spanish, same worked example (a test holds its summary figures to the
  English page's), FAQ with FAQPage JSON-LD, `hreflang` pair both ways with the English page.
- `cta.mjs`: a page whose `<html lang="es">` gets a Spanish lead and status (`statusEs`), which
  says the app is in English for now. Same launch switches (`APP_URL`, `PAID_PLANS_ON`).
- `page.test.mjs`: the disclaimer checks accept the Spanish clauses (`Sin garantía.`,
  `No es asesoría legal`, `Sin afiliación con el American Institute of Architects`) on `lang="es"`
  pages only; a new test checks each `es-*.html` page's pair, its "app is in English" line and its
  "not yet read by a native speaker" note.
- `nav.mjs`: an "En español" group; the construction industry page lists the page.

## Adding another Spanish page

1. Copy the English page to `es-<spanish-slug>.html`, `<html lang="es">`, with both `hreflang`
   alternates, and add the `en` self and `es` alternates to the English page.
2. Leave the CTA's `cta-status` block empty and start the paragraph "PayApps es un servicio en
   línea"; run `node cta.mjs`.
3. Add the pair to `pairs` in the Spanish-page test, the page to `FAQ_PAGES`, the "En español"
   group in `nav.mjs` (`node nav.mjs`), `sitemap.xml`, `llms.txt`, the README table and
   `platform/pages/industry-construction.mjs`; then `node platform/pages/llms-answers.mjs
   ventures/pay-app-guides`.

Good next candidates, by what a Spanish-speaking sub most needs explained: conditional vs
unconditional lien waivers (the costliest mistake to make in a language you read less well) and
retainage.

## Owed

A native Spanish speaker's read of the page. The footer says it is agent-translated and that the
English page is the reference; take that line out only after such a read.
