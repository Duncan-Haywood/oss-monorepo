# What the theme-recoverable share actually resolves to

Built and measured 2026-08-20. Re-runnable:

```bash
cd portfolio/research/a11y-theme-resolution
python3 -m unittest discover                                  # 58 tests, offline
python3 resolve.py --recompute-from results-2026-08-20.json   # offline
python3 resolve.py --verify                                   # population check
python3 resolve.py --out results.json                         # re-fetch corpus
```

## Why this was built

Three passes stack here, each closing the gap the last one named:

1. [`a11y-evidence-record/`](../a11y-evidence-record/) audits storefront
   templates and measures that **63.2%** of what it touches is *undecidable* —
   `aria-label="{{ 'cart.title' | t }}"` has a name nothing can read from the
   file alone.
2. [`a11y-render-recovery/`](../a11y-render-recovery/) asks *whose data fills
   each one* and splits "rendering closes almost all of it" into three shares:
   **50.5% theme-recoverable** (a build step, no store data), 11.0% merchant
   (per-store), 38.5% context (undecidable even as to provenance).
3. That directory's own "What could not be measured here" names this gap:

   > **No actual render.** This is a static classification of what each
   > expression points at. […] This measures the ceiling on what rendering
   > *can* recover from the template alone.

So the theme-recoverable share is a **ceiling**, and nobody had measured what it
recovers *to*. That is the whole commercial question for the pipeline's
top-ranked candidate,
[`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md),
whose distribution wedge is a free qualification audit run before quoting:

- If the theme-recoverable share resolves overwhelmingly to **names that are
  present**, the build step is a *clearing* step. It raises the audit's honest
  coverage and hands the merchant nothing new to look at.
- If a material share resolves to **no name at all**, those are blocking
  failures shipped in the theme itself — present at *every* store that installs
  it, findable at zero marginal cost, and exactly what a free qualification pass
  exists to put in front of a buyer.

This pass measures which. It does not render. It resolves each name-giving
expression against the data the theme package itself ships — its locale files,
its settings-schema defaults, and its other partials — which is precisely the
data a build-time render would have, and no more.

## What is here

| File | What it is |
|---|---|
| [`resolve.py`](resolve.py) | The resolver. Takes the 248 theme-recoverable undecidables verbatim from `classify.py` and resolves each against its own package |
| [`test_resolve.py`](test_resolve.py) | 58 tests, standard-library `unittest`, no install step, no network |
| [`results-2026-08-20.json`](results-2026-08-20.json) | Every per-package row behind the numbers below |

Standard library only. Reads only the public npm registry, sends nothing, needs
no credentials, writes nothing outside its `--out` path.

## The five outcomes, and why there are five

| Outcome | Means |
|---|---|
| **named** | Resolves to a determinate non-empty human name. A pass: the build step settles it and there is nothing to report |
| **unnamed** | Resolves to a determinate *empty* name. A blocking failure shipped in the theme, identical at every store that installs it |
| **placeholder** | Resolves non-empty, to a machine artifact — a translation key with no entry in the theme's own locale file (Liquid renders `Translation missing: en.a.b`, Vue i18n echoes the key), or a structural id used as a name. Not counted as a barrier: the control *has* a name. Separating it is what keeps `unnamed` honest |
| **merchant_deferred** | A theme setting with no default. The rendered name is whatever the merchant types, so the element leaves the theme share and joins the per-store share |
| **unresolved** | The package alone does not settle it |

`unnamed` is claimed only when **every** name-giving expression on the element
resolved and all of them render empty. One unresolved expression alongside an
empty one withdraws the defect claim, because the render might still produce a
name. The defect count is therefore a lower bound by construction.

## Finding 1 — the build step clears; it does not find

**248 theme-recoverable undecidables. 72.2% settle. 2.0% are defects.**

| Outcome | n | share of theme-recoverable |
|---|---:|---:|
| named | 170 | 68.5% |
| unnamed | **5** | **2.0%** |
| placeholder | 4 | 1.6% |
| merchant_deferred | 4 | 1.6% |
| unresolved | 65 | 26.2% |

The first bullet of the two above is the one that is true. Rendering the theme
at build time takes 68.5% of the theme-recoverable population from "unknown" to
"there is a name here", and produces **five** findings across twelve packages.

That matters for how the candidate's free qualification pass is sold. The
qualification artifact's substance is the **286 direct findings**
`a11y-evidence-record` already reports without rendering anything; adding a
render stage improves the *coverage statement* the record carries — it converts
half the "we could not tell" column into "we checked" — but it is not a
finding-generator. A pitch built on "our render finds what scanners miss" is
not supported by this measurement. A pitch built on "our record states honestly
what was checked and what was not" is, and that was already the candidate's
stated liability position.

## Finding 2 — every defect found is one mechanism, and it is mechanically detectable

All five `unnamed` results are the same defect class: **a form control whose
`<label for>` reference does not resolve.** None came from an expression
resolving empty; the expression half of the population produced *zero* defects.

| Package | File | Line | What is wrong |
|---|---|---:|---|
| `fassbender-shopify-theme` | `theme/sections/newsletter.liquid` | 69 | `<label for="mce-NAME">` against `id="{{ idPrefix }}_mce-NAME"` |
| `fassbender-shopify-theme` | `theme/sections/newsletter.liquid` | 83 | `<label for="mce-EMAIL">` against `id="{{ idPrefix }}_mce-EMAIL"` |
| `fassbender-shopify-theme` | `theme/templates/search.liquid` | 22 | same pattern on the search field |
| `@nuskin/ns-shop-elements` | `src/market-banner-uploader/…html` | 530 | `<label>Banner Image</label>` has no `for` and does not wrap the `<input type="file">` |
| `@nuskin/ns-shop-elements` | `src/ns-stripe-donation/…html` | 88 | `<input id="donationAmount">` has only a `placeholder` binding |

All five were read by hand in the source before being reported here. The
fassbender three are the sharpest: the theme prefixes the control's id with a
section-scoped expression and forgets to prefix the label's `for`, so the
reference is dead in the rendered page while looking correct in the file. A
screen-reader user meets an unnamed newsletter field and an unnamed search box
on **every store running that theme**.

This is a genuinely good artifact for a cold qualification pass — specific, high
confidence, reproducible from a public tarball, and expressible without a
compliance claim ("this `for` attribute points at an id that is not generated"
is a fact, not a warranty). It is also thin: five findings across twelve themes,
concentrated in two of them.

## Finding 3 — most of the "cross-partial label" share was never cross-partial

`a11y-render-recovery` measured 69 undecidables (14.1%) in a
`theme_structural` bucket described as *"a `<label for>` in another partial of
the same page […] assembling the page closes it"*. Resolved:

| | n |
|---|---:|
| Label found **in the same file**, matched on identical template text | 64 |
| Label found in another partial | 0 |
| No label anywhere in the package | 5 |

**Sixty-four of sixty-nine were in the same file all along.** The mechanism is
not page assembly; it is that `audit.py` compares expression-*stripped* strings.
It records `id="{{ id_prefix }}FirstName"` as `FirstName` and skips any
`<label for>` whose target contains an expression, so a control and its label
can sit six lines apart in one file and still be reported undecidable.

Comparing the raw template text instead settles them: identical expressions
render identically in one render context, so `id="{{ id_prefix }}FirstName"`
and `for="{{id_prefix}}FirstName"` are a match. That is **64 of 491 undecidables (13.0%) resolvable inside their own file**,
which restates `a11y-evidence-record`'s 63.2% undecidable headline as **59.9%**
(427 undecidable against 286 findings, rather than 491 against 286) — and, more
useful, a concrete improvement available to
[`pipeline/probes/eaa-wcag-triage/`](../../pipeline/probes/eaa-wcag-triage/) and
to `audit.py`: match label references on raw expression text, and flag the
mismatch case as a finding rather than an undecidable.

The correction cuts both ways, which is why it is worth having. It removes 64
false undecidables *and* it is what exposes the fassbender defect: a
literal-only comparison sees `for="mce-NAME"` and an id it cannot read, and
reports "undecidable"; a raw-text comparison sees two strings that cannot ever
be equal, and reports a defect.

## Finding 4 — the quarter that stays unresolved is not the tool's fault

| Reason | n | What it is |
|---|---:|---|
| `no_locale_data` | 42 | The package uses `$t(…)` / `i18n(…)` / `_.dictionary(…)` and ships no locale file. The strings live in the application, not the theme |
| `runtime_theme_object` | 41 | `{{ shop.name }}`, `{{ routes.root_url }}`, `{{ forloop.index }}` — theme-owned in the sense that the merchant does not type them, but supplied by the platform per request and absent from the tarball |
| `dynamic_translation_key` | 2 | The translation key is itself a variable |

Both dominant causes are *determinate on a running store and undeterminable
from the package*. That is a real limit on the build-step-only offer and not a
gap a better parser closes: 26.2% of the theme-recoverable share needs the
theme installed somewhere, which is the same access dependency the merchant
share has, arriving one step earlier.

Four packages — `@ecomplus/storefront-template`, `@vue-storefront/theme-default`,
`@ecomplus/storefront-app`, `@vue-storefront/nuxt-theme` — resolve to **zero**
across 52 undecidables between them, entirely for this reason. The
Shopify-shaped packages (`@zalify`, `fassbender`, `bootstrap-shopify-theme`)
resolve at 93.3% (181 of 194), because Shopify's convention is to ship `locales/*.json` and
`config/settings_schema.json` inside the theme. **The offer is buildable against
themes that ship their own strings and not against themes that do not**, and
that split follows the platform, not the vendor.

## Finding 5 — the merchant share is confirmed as a lower bound, and it moved

`a11y-render-recovery` predicted the direction: *"the 11.0% merchant share is a
lower bound on per-store residual."* Four elements classified `theme` there
resolve here to a settings key with no default — the rendered name is whatever
the merchant types. They move from the theme share to the per-store share,
taking the measured merchant residual from 54 to 58 of 491 (11.0% → 11.8%) and
the theme-recoverable share from 50.5% to 49.7%.

Small, and in the predicted direction, which is the useful part: the prediction
was falsifiable and it held.

## Per-package

Packages with no theme-recoverable undecidables are omitted (four of twelve).

| Package | in scope | named | unnamed | placeholder | merchant | unresolved |
|---|---:|---:|---:|---:|---:|---:|
| `@zalify/theme-templates` | 105 | 94 | 0 | 0 | 3 | 8 |
| `fassbender-shopify-theme` | 73 | 64 | 3 | 4 | 0 | 2 |
| `@ecomplus/storefront-template` | 24 | 0 | 0 | 0 | 0 | 24 |
| `@vue-storefront/theme-default` | 24 | 0 | 0 | 0 | 0 | 24 |
| `bootstrap-shopify-theme` | 16 | 12 | 0 | 0 | 1 | 3 |
| `@ecomplus/storefront-app` | 3 | 0 | 0 | 0 | 0 | 3 |
| `@nuskin/ns-shop-elements` | 2 | 0 | 2 | 0 | 0 | 0 |
| `@vue-storefront/nuxt-theme` | 1 | 0 | 0 | 0 | 0 | 1 |

## Faithfulness

The population is taken verbatim from `a11y-render-recovery/classify.py`: same
corpus, same pinned versions, same per-element provenance verdicts, same
match-by-`(tag, line)`. `python3 resolve.py --verify` compares the selected
population against that directory's committed rows package by package —
**12/12 match, 248/248 elements**, and `structural_unmatched` is 0, so every
structural item found its node. `test_resolve.py` asserts the same invariant
against the committed results file, so a future edit that silently changes the
population fails the test suite.

Nothing here re-decides what is undecidable, and nothing here edits the sibling
directories' results.

## What could not be measured here

- **The corpus is npm, and npm is the wrong shelf** — the same limitation both
  sibling directories carry. The themes EU shops actually run are on the
  Shopify theme store and the WordPress.org directory, and both are
  egress-denied from this environment (see
  [`egress-reachability/`](../egress-reachability/)). What generalises is the
  *mechanism* — dead `for` references, unprefixed labels, themes that ship no
  strings — not the mix.
- **Component libraries are weaker evidence than themes.** The two
  `@nuskin/ns-shop-elements` defects are in a web-component package whose
  consumer might supply the labels. They were read by hand and both look like
  real omissions (a `<label>` with no `for` at all; an input with only a
  placeholder), but "no label anywhere in the package" means less for a library
  than for a complete theme.
- **YAML locale files are not read.** `@fleetbase/storefront-engine` ships
  `translations/*.yaml` and stdlib has no YAML parser. It has **zero**
  theme-recoverable undecidables, so this costs nothing on this corpus; it
  would matter on a Rails or Ember corpus.
- **A locale file that ships empty is treated as no locale data.**
  `bootstrap-shopify-theme` ships `locales/en.default.json` containing
  `{"general": {}}`. A running store would render `Translation missing:` for
  those keys, which would make them placeholders rather than unresolved; the
  conservative reading is used because the npm package is plausibly just not
  shipping the built locale files.
- **No render.** Still true, one level up: this resolves the *data* a render
  would use, not the DOM a render would produce. CSS-hidden labels, ARIA
  applied by scripts, and names composed at runtime are all outside it.

## What this does and does not do to the pipeline

**Does not.** No candidate is added, no score is changed, no `ventures/`
directory is created, nothing is published, no account is registered, no
credential is used, nothing is spent beyond agent time.

No score changes, deliberately, and this follows the rule
[`rescore-2026-08-20.md`](../../pipeline/rescore-2026-08-20.md) set for itself
when it declined to score `runtime-data-reachability`'s finding: the thing
measured here is the *yield of a build step*, and no scored dimension asks
about it. `ai_leverage` is unchanged (the resolution is deterministic lookup,
which the candidate never claimed as model work). `distribution` is unchanged:
the qualification artifact's substance was always the 285 direct findings, and
those are untouched. Recording that explicitly is cheaper than a later pass
moving a score by reflex.

**Does.** It converts the top candidate's build-step share from a ceiling into
a yield (finding 1), identifies the one defect class that yield actually
produces and verifies all five instances by hand (finding 2), corrects the
sibling pass's account of its own `theme_structural` bucket with a fix both
audit engines can adopt (finding 3), and shows that the residual quarter is a
platform-access limit rather than a tooling limit (finding 4).

It also continues the pattern
[`rescore-2026-08-20.md`](../../pipeline/rescore-2026-08-20.md) identified —
*"this pipeline's screening scores are optimistic about the businesses"* — one
step further down. The optimistic reading of the 50.5% theme-recoverable share
was that a render stage would surface defects a scanner misses. Checked, it
surfaces five across twelve themes, and the honest version of the claim is
about coverage rather than about findings.

## Status of these claims

Primary measurement against the same public data both sibling directories used,
on the same standard: the population is verified 12/12 against the sibling's
committed rows, every number re-derives offline via `--recompute-from`, every
verdict in the taxonomy has a named test, the two corpus cases that decided
finding 3 are locked as named regressions, and all five reported defects were
read in their source files before being written down.

What is uncertain is generalisation — whether the resolve-rate and defect-rate
on npm storefront themes resemble those on the Shopify and WordPress themes EU
shops actually run. This document says so rather than papering over it.
