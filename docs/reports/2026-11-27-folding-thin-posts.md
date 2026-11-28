---
kind: note
date: 2026-11-27
---
# Folding thin posts: `folded_into:` front matter

`prompts/goals.md` ("Consolidate, for search") asks runs to fold thin posts
into one page "and point the others at it". Until now nothing could point a
post anywhere: deleting one 404s its URL and every link to it, and keeping it
leaves two pages competing for one search. This run added the pointer.

## How to fold a post

Add one front-matter line to the thin post, and leave the body as it is (the
source stays on GitHub as the record):

```
folded_into: einvoice-preflight/cyprus-e-invoice-mandate
```

The value is a site path relative to the site root: `<venture>/<page>`
(extensionless, as the site serves it), `<venture>/` or `writing/<post-slug>/`
(fold into a consolidated post). What happens (`platform/pages/writing.mjs`,
`loadPosts`, `loadFoldedPosts`, `foldTargetProblem`, `writeFolded`):

- the post leaves the blog index, topic and project pages, feeds, the search
  index, the podcast, llms.txt and the sitemap (`loadPosts` no longer returns it);
- its URL `writing/<slug>/` becomes a redirect page (`foldedStub`: canonical,
  zero-second refresh and `location.replace` to the target, as
  `redirect-stubs.mjs` does for the old GitHub Pages origin), `noindex`, with
  what the site checks ask of every page: its own title ("<title> (moved)"),
  one `<h1>`, a `data-pf-to="hub"` link and the "no warranty" line;
- `check.mjs` (`isRedirectPage`) and `build.test.mjs` accept a canonical that
  points off the page only when the page is noindex and its zero-second
  refresh names that same canonical, and it must still be on this site. The
  first CI run failed 55 checker problems and 9 tests on plain stubs (no
  `<h1>`, a repeated "Moved" title, the canonical rule): reuse `foldedStub`,
  not `stubPage`;
- a build that does not publish the target's venture (the custom-domain test
  fixtures) writes no redirect and warns once;
- the target must resolve: a live post, or a file under `ventures/<venture>/`.
  A missing one fails the build on a PR (on
  `main`, with `PAGES_SKIP_BAD_POSTS=1`, it warns and skips the stub). The
  value must match a strict path pattern, so a post cannot become an open
  redirect (`writing-fold.test.mjs`).

Before folding, check the target carries every fact the post states. Here a
script pulled each post's dates and figures and looked for them on the target
page; every miss was a formatting difference (the pages write "30 Jun 2028")
or a page that had since been corrected from the primary text (Slovenia's
gazette, Luxembourg's bill dossier). Do not fold a post whose analysis is its
own (a measurement, a bug story): extend a consolidated post with it instead.

## What was folded this run

27 one-country "E-invoice Preflight adds X" and country-status posts
(2026-10-25 to 2026-11-05, 104 to 235 words each) into their country mandate
pages in `ventures/einvoice-preflight/` (bet #3's public side). Each page is
longer, newer and dated against its sources. Left alone: the two-country posts
(Peru and Argentina, Colombia and Chile), whose single URL cannot point at
both pages, and every post with analysis of its own (check-digit blind spots,
rounding bugs, the rule authors' good cases). `grep -l '^folded_into:'
docs/posts/*.md` lists them.

## Next candidates

- The ten 2026-11-10 VAT-number posts (`einvoice-vat-*`,
  `einvoice-preflight-*-vat*`, about 100 to 190 words each) belong in one
  consolidated "VAT number checks" post, written first from their content,
  then folded into with `writing/<that-slug>/`.
- Other ventures with dozens of one-change posts: count with
  `ls docs/posts | grep -c <slug>`, fold announcements into the venture page,
  and fold change notes into the venture's consolidated post.

## Second pass, 2026-11-28: 46 more e-invoice country posts

The first pass stopped at 2026-11-05 and left the multi-country posts. This
pass folded the remaining country-status posts (2026-10-24 to 2026-11-13, 97 to
241 words each, tagged `einvoice-preflight`): 36 single-country posts into
their country mandate pages (Luxembourg four, the UK three, Poland's penalty
deferral two, Estonia, Latvia, Slovenia and Bulgaria two each, and one each
for 21 others), and 10 posts announcing several pages at once into the hub,
`einvoice-preflight/e-invoicing-mandates-by-country`, which links every one of
those country pages.

The fact check was a script (dates as "D Month YYYY" or "Month YYYY",
amounts and percentages pulled from each post, looked for on the target page
or pages after normalising month abbreviations, ISO dates and thousands
separators). The misses, all read by hand:

- page counts in the announcement posts ("now 53 country pages", "grows from
  79 to 80 rows"): the post's own news, not a fact about the country;
- Spain: the post's BOE publication date for Real Decreto-ley 15/2025
  (3 December 2025); the page names the decree and dates its reading of it
  (2 November 2026), and is newer;
- Denmark: the post's consultation deadline (17 August 2026); the page has
  since recorded the outcome (the consultation draft's date is gone);
- Poland: "before 31 December 2026" is the post's inference (the bill must
  pass before the old penalty date); the page carries the bill, print 3245.

Left alone, as before: posts about a rule, check or bug (ZATCA credit notes,
NLCIUS, Portuguese VAT codes, KSeF schema and transport block, India payload
checks, the Kazakhstan BIN check digit, the calendar feed). Those are change
notes for one consolidated "what the checker checks" post, the next candidate
here, written first and then folded into with `writing/<slug>/`.

Script, for the next pass: the fact check is short enough to rewrite, but its
rules are above; check the target with `foldTargetProblem` from
`platform/pages/writing.mjs` (a `writing/` target needs the live post set, so
call it with `live`, or run `node platform/pages/writing.mjs --out=<dir>`).
