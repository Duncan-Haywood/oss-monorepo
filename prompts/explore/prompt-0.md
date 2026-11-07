# Explore track, prompt 0

The free-choice sub-prompt, in the spirit of Google's "20% time". The master
prompt (`prompt.md`) routes about 5% of runs here (`routing.json` weight
0.05). The goals and guardrails in [`prompts/goals.md`](../goals.md) bind
every version of this prompt, exactly as they bind the other tracks.

"Merge when done" below means: open a pull request for your work and merge it
yourself, every session. This is the explicit request to create that PR. A
pushed branch is not done. Steps:
[`.github/prompts/land-your-work.md`](../../.github/prompts/land-your-work.md).

---

This run is yours to spend. Work on whatever you find most interesting and
worth doing in this repository, with your own approach: a product idea nobody
has screened, an unusual algorithm or technique, a research question outside
the tracks in `research/PROJECTS.md`, a tool that would make every other run
faster, or a bold rework of something that exists. Curiosity and taste are
the point; the usual priority lists (`session_gate.py`, `DIRECTION.md`'s
deploy-first ranking, `PROJECTS.md`'s tracks) are optional here, not binding.

What still holds:

- **Every guardrail in `goals.md`.** Never fabricate, nothing secret, only
  code we can relicense, owner-only actions stay with the owner, and the
  research integrity rules for anything research-shaped.
- **Land it.** Pick something you can finish, test and merge in one run, and
  merge it with the same checks as any other PR (`CLAUDE.md`, "Ship without
  review ceremony"). Work under `research/` follows `research/CLAUDE.md`,
  including its mirror rule.
- **The same bar.** A venture meets `PRODUCT_PLAYBOOK.md`'s definition of
  done (disclaimer, usage tracking); a research project has a complete README
  and passing tests.
- **Say why.** In the PR description, give one or two sentences on why this
  seemed worth doing and what you would do next if it pays off.
- **Skip audits that earlier explore runs already found clean.** Sitemap
  coverage, duplicate titles and h1s, canonical and og tags, venture README
  live links, `.md` links and anchors, and unnamed form controls, plus html `lang`, viewport, image `alt` and `rel`
  attributes (three runs, 2026-10-26, found nothing), have each been
  swept (`platform/ci/check_*.py`, `serp_snippets.py`, `venture_live_links.py`,
  `page-identity.mjs`, `page-seo-audit`); re-run the tool if you doubt one, but
  there is no need to rebuild the sweep. Meta descriptions over 320 characters are clean too
  (`serp_snippets.py --desc-max 320` reports 0 of 2,830 venture pages, 2026-10-20).
  `llms.txt` link targets are clean too (`platform/ci/check_llms_txt_links.py`, 0 dead of 16 files, 2026-10-28).
  Untyped `<button>` inside forms (5 of 1,300 venture pages, all intended submit buttons), `href="#"` anchors (7 files, all script-wired) and missing `rel="icon"` (1 page, bid-price-engine, a PWA with manifest icons) are clean too (2026-10-29).
  JSON-LD syntax is clean too (4,771 blocks on 3,286 venture pages, 0 invalid; `platform/ci/check_jsonld.py`, 2026-11-01).
  Missing local `src`/`href` files are clean too (3,307 venture pages, 0 missing; `platform/ci/check_local_assets.py`, 2026-11-01).
  Plain-`http://` loaders (`platform/ci/check_insecure_refs.py`, 0 of 3,321 pages), stale `©` years and `lorem ipsum`/`FIXME` placeholders in venture pages are clean too (2026-11-02).
  Positive `tabindex`, `autofocus`, meta refresh, `user-scalable=no`, obsolete tags (`marquee`, `center`, `font`) and `<img>` without width/height are clean too (0 real hits across venture pages; the two `<img>` matches are a user-supplied preview and demo text, 2026-11-02).
  Relative links and images in `docs/posts/` are clean too (1,312 checked, 0 broken; `platform/ci/check_post_links.py`, 2026-11-03).
  Duplicate ids and dangling `for`/`aria-*` targets are clean too (3,422 pages, 0; `platform/ci/check_dom_ids.py`, 2026-11-04).
  Links and buttons with no accessible name are clean too (3,422 pages, 0; the three empty buttons are filled by script; `platform/ci/check_empty_controls.py`, 2026-11-04).
  In-page `href="#frag"` links to a missing id or name are clean too (3,476 pages, 0; `platform/ci/check_fragment_links.py`, 2026-11-05).
  Page-load `NaN`/`Infinity`/`undefined` text and uncaught script errors are clean too (1,333 pages, 0 real; `platform/ci/check_page_runtime.js`, 2026-11-07). Blank, `0` and `-1` in every text/number/range input are clean too (1,333 pages, 1,116 with inputs, 0 new NaN/Infinity/undefined or page errors; `platform/ci/check_input_edges.js`, 2026-11-07). Next open: button clicks with default inputs, and number inputs given very large values.
  Only sweeps of a kind not listed are open.
- **Not more admin.** A free-choice run that only writes plans, ledger prose
  or direction documents has wasted the slot. Build something.

Record the run with `--track explore`. Its `notes` should name the idea, so
the review track can tell whether free-choice runs pay off and which ideas
graduate into a regular track.
