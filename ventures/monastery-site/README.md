# Monastery site

A free, **opinionated website builder for Catholic monks and nuns**. A community
fills in one form (or one `community.json`) and gets a complete static website.
It has a horarium, a vocations page with an inquiry form, a giving page that
sends gifts straight to the community's own donation page, prayer requests,
visiting and the guesthouse, retreats and events, news, a shop, contact and
privacy pages. It also writes the sitemap, structured data and llms.txt a search
engine or AI assistant reads.

**Live builder:** https://marisstella.app/monastery-site/ (also at https://duncan-haywood.github.io/oss-monorepo/monastery-site/, which forwards there)
· examples (made-up communities): [monks](https://marisstella.app/monastery-site/demo/abbey/), [nuns](https://marisstella.app/monastery-site/demo/sisters/)

After using this, a community that had no website, or an old one nobody can
edit, can **publish a fast, legible site with a working vocation inquiry form
and online giving in an afternoon, with no developer and no monthly fee**.

## Use

- **Builder page:** `index.html` (serve the folder, for example
  `python3 -m http.server`, because it loads `site.mjs` as a module). Fill in
  the form, watch the preview and the launch checklist, then download the
  website as a .zip and upload it to any static host. What you type stays in
  this browser.
- **CLI:** `node build.mjs community.json --out site/` writes the site;
  `--zip site.zip` writes one archive; `--check` prints only the checklist;
  `--json` prints it as JSON. Exit 1 on a high finding, so it can gate a deploy.
  `node build.mjs --demo` rebuilds `demo/` from `examples/`.
- **Engine:** `site.mjs` exports `buildSite(config)` (returns every file as a
  `Map`), `checkSite(config)` (the launch checklist), `THEMES`, `contrast`,
  `parseLines`/`toLines` (the builder's one-per-line lists). It is pure, with no
  clock, network or file system, so the same config always builds the same site.
- **Config format:** `examples/abbey.json` (monks) and `examples/sisters.json`
  (nuns) use every option. Any section left out drops its page; `"giving": false`,
  `"vocations": false` or `"prayer": false` turn those pages off.
- **Tests:** `node --test site.test.mjs zip.test.mjs page.test.mjs cli.test.mjs usage.test.mjs`.

## The opinions, and why

| Opinion | Why |
|---|---|
| A fixed set of pages, in a fixed order | The pages every good monastery site has, and no others. An empty section removes its page, so there are no dead menu items. |
| Vocations and giving in the first screen | They are the two things a community most needs its website to do. |
| Six palettes, each checked to WCAG AA (4.5:1) for every pair text is drawn in | Older visitors and older members read these sites. A custom accent is checked too, and the checklist says when it fails. |
| Money never passes through the site | The giving page links (over https only) to the community's own donation page and prints cheque and bequest details. No payment code, no keys, nothing to breach. |
| Nothing is invented | The template never writes a tax-deductibility statement, a total or a promise. The checklist asks the community for them, in its accountant's words. |
| Forms work on day one | With no form service, a form opens the visitor's email program with the message ready, addressed to the right person (vocation director, guestmaster). With `forms.action` set, forms post to that service (Formspree, Basin, Netlify, or the community's own). A honeypot field catches robots. |
| No external scripts, fonts, cookies or analytics | Fast on a rural connection, nothing to update, and an honest privacy page. The tests enforce this. |
| A drawn cloister arcade instead of a stock photo | A site with no photograph still looks like a monastery. With a photograph, the hero uses it. |

## Launch checklist (what `checkSite` reports)

- **High:** no community name; no or malformed general email; a giving link
  that is not https or not a link; a form service that is not https; any link
  with a scheme the site drops (`javascript:`, `data:`).
- **Medium:** no postal address; no vocation director email; no stages of
  formation or requirements; no monthly giving option; no bequest section, or
  one without the legal name; a campaign total with no "as of" date; an event
  with no date or that ends before it starts; a photograph with no description;
  no horarium; a custom accent below 4.5:1.
- **Low:** no site URL yet; forms using email instead of a form service; no
  vocation FAQ or retreats; no cheque payee; no tax statement; no hero photograph;
  no hour marked open to the public.

## Verification

- 39 tests: contrast of every palette pair; every internal link and anchor
  resolves on the examples and a minimal config; every form control is labelled
  and ids are unique; JSON-LD parses and matches the page (Organization +
  PlaceOfWorship with DonateAction, Event, FAQPage, NewsArticle); hostile input
  (`<script>`, `javascript:` links, `data:` links) is escaped or dropped; no
  external resources or storage in generated pages; determinism; the committed
  demos equal the engine's output; the zip round-trips and opens with the system
  `unzip`; the CLI's exit code.
- Driven in Chromium (2026-11-03): editing a field updates the preview; an
  http giving link raises a high finding; links inside the preview change the
  previewed page; the .zip downloads and unzips to the full site plus
  `community.json`; the form survives a reload; list edits keep fields the form
  does not show (event times, multi-paragraph news). No console errors.

## Not done yet

See `ROADMAP.md`: a form-handling Cloudflare Worker the community deploys on
its own account, a liturgical calendar, multilingual sites, image resizing in
the builder, more page types (oblates, a Mass intention request form, a
newsletter archive), and one-click deploys.

## Outreach

`OUTREACH.md` holds drafts and rules for the owner's own personal emails to
communities. Agents never send them (`portfolio/distribution/README.md`).

Not affiliated with any order, diocese or the Holy See. MIT licensed.
