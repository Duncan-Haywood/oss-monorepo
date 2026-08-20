# What rendering actually recovers from the undecidable share

Built and measured 2026-08-20. Re-runnable:

```bash
cd portfolio/research/a11y-render-recovery
python3 -m unittest discover                              # 22 tests
python3 classify.py --recompute-from results-2026-08-20.json  # offline
python3 classify.py --out results.json                    # re-fetch corpus
```

## Why this was built

[`portfolio/research/a11y-evidence-record`](../a11y-evidence-record/) built the
audit pass for the pipeline's top-ranked candidate
([`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md))
and measured that **63% of what the audit touches on published storefront themes
is undecidable** — markup whose accessibility outcome is set by data outside the
file. Its own "What could not be measured here" section names the gap this
directory closes:

> "No rendered-page comparison. The 70.4% undecidable share is measured, but
> what a rendered audit would recover from it is inferred, not measured."

The honest way to answer that without inventing a render context is to ask, of
each undecidable expression, *whose data fills it*. That gives three shares
rather than one number, and they are what actually matter for the candidate's
economics — because "what rendering recovers" turns out not to be one thing.

## What is here

| File | What it is |
|---|---|
| [`classify.py`](classify.py) | Provenance classifier over the 491 undecidables `a11y-evidence-record` reported, matched back to their elements in an expression-preserving parallel parse |
| [`test_classify.py`](test_classify.py) | 22 tests, standard-library `unittest`, no install step |
| [`results-2026-08-20.json`](results-2026-08-20.json) | Every per-package row behind the numbers below |

Standard library only. Reads only the public npm registry, sends nothing, needs
no credentials. Imports the sibling `audit.py` so the *set* of undecidables is
taken verbatim from that pass — this directory classifies exactly the same 491,
it does not re-decide what is undecidable.

## The taxonomy

Each undecidable's deciding expression is placed in one bucket:

| Bucket | Rendered against | Recovered by |
|---|---|---|
| **theme** | The theme itself: translation strings (`{{ 'x' \| t }}`, `{{ $t('x') }}`, `_.dictionary('x')`), settings (`section.settings.title`), hardcoded literals, structural ids (`section.id`, `idPrefix`) | A build step, once per theme, with no store data |
| **theme_structural** | A `<label for>` in another partial of the same page (partial-assembly mechanism, not an expression) | Assembling the page from its templates |
| **merchant** | A specific store's content: `product.title`, `image.alt`, `collection.title`, `current_variant.id` | The store's own data, per store |
| **context** | A bare local (`title`, `<%= slug %>`, `child.url`) whose binding is loop or controller code, or a `{% if %}`-style statement | Neither — provenance itself is undecidable from the template |

**merchant wins over theme** at the element level: if any name-giving expression
reads merchant data, the rendered accessible name is per-store regardless of
what else is in the element. This is the pessimistic direction on purpose —
it makes the merchant share a lower bound rather than an average, so a rendered
audit sold on the theme-recoverable share cannot silently include names that
depend on a store the theme has never seen.

## Finding — rendering recovers half, not all, and the residual is where the risk is

**491 undecidables, 100% matched back to their elements.** Distribution across
the four buckets:

|  | n | share |
|---|---:|---:|
| theme | 179 | 36.5% |
| theme_structural | 69 | 14.1% |
| merchant | 54 | 11.0% |
| context | 189 | 38.5% |

Rolled up to the three shares that map onto delivery choices:

|  | share | means |
|---|---:|---|
| **Theme-recoverable** (theme + theme_structural) | **50.5%** | Rendering the theme with no store data closes it at build time. Automatable, priced at zero marginal cost, and the same for every install |
| **Merchant, per-store** | **11.0%** | Rendered against a specific store's data. This is where an empty `image.alt` becomes a real blocking failure — one that exists at that store and nowhere else |
| **Context-dependent** | **38.5%** | Undecidable *even as to provenance* from the template. Loop variables, controller bindings, or presence-only statements (`{% if %}`, `<% } else %>`). Neither rendering the theme nor a per-store render settles all of it without the framework code |

### What this changes in the candidate's economics

`a11y-evidence-record` finding 2 concluded that rendering would close *"almost
all"* of the 63% undecidable share, as a **build step, not a hire**. That is
half-true and worth splitting:

- **The build-step half holds and is measurable: 50.5%.** A remediation vendor
  that renders themes with no store data — the audit input the candidate can
  offer as a free qualification pass — recovers this share to a determinate
  pass or a defect the vendor owns.
- **The per-store half is a residual, not the same delivery: 11.0%.** These
  don't close on any static run; they require an accessibility check against
  the merchant's actual content. That is not a contractor cost — a contractor
  with a screen reader will find the same missing alt text — it is a
  data-access dependency. The remediation offer either includes it (with the
  customer's data in the loop) or scopes around it.
- **The 38.5% context-dependent share is the honest ceiling on template-only
  claims.** Half of "you must render" turns out to be *"you must have the code
  the template calls into"*. This is not shrinkable by building better tools;
  it is fixed by whether the theme's controller/framework code is in scope.

For the candidate's `autonomous ops: 6` and its priced contractor step: the
free qualification pass can honestly cover the 50.5% theme-recoverable share.
Anything sold beyond that ("what accessibility defects does this store have")
requires access the qualification pass doesn't have.

### The two dominant defect classes split differently

`a11y-evidence-record` finding 3 named the two checks that carry 58% of all
findings and 71% of blocking ones — unnamed buttons and unlabelled form
controls. In the undecidable population they behave very differently:

| check | n | theme % | merchant % | context % |
|---|---:|---:|---:|---:|
| `button-no-accessible-name` | 156 | 62.8% | 1.9% | 35.3% |
| `link-no-accessible-name`   | 222 | 34.7% | 15.3% | 50.0% |
| `control-no-label`          |  70 | 98.6% | 1.4% | 0.0% |
| `img-alt-missing`           |  43 | 9.3% | 37.2% | 53.5% |

- **Unlabelled controls are entirely theme-recoverable.** All but one are the
  partial-assembly mechanism (the `<label for>` lives in another partial of
  the same page). Assembling the page closes it; a per-store audit is the
  wrong tool.
- **Unnamed buttons are majority theme-recoverable** (translation-string
  labels).
- **Unnamed links split three ways.** Half are context-bound (`<%= link %>`,
  `{{ child.url }}` — loop variables). This is where the theme-only claim
  breaks first.
- **Missing image alt is where the merchant share concentrates**, and the
  merchant share is the smallest of the four but the one where real blocking
  failures live: an `image.alt` that renders empty at a specific store is a
  screen-reader user encountering an unnamed image, not a false alarm.

## Per-package spread

Rendering-recovery is not uniform across themes. Percentage of each package's
undecidables that are theme-recoverable (0% means rendering the theme alone
recovers none of them; 100% means it recovers all):

| Package | undecidable | theme% | merchant% | context% |
|---|---:|---:|---:|---:|
| `@nuskin/ns-shop-elements` | 2 | 100.0 | 0.0 | 0.0 |
| `@vue-storefront/theme-default` | 26 | 92.3 | 0.0 | 7.7 |
| `fassbender-shopify-theme` | 99 | 73.7 | 23.2 | 3.0 |
| `@zalify/theme-templates` | 158 | 66.5 | 13.9 | 19.6 |
| `bootstrap-shopify-theme` | 29 | 55.2 | 6.9 | 37.9 |
| `@vue-storefront/nuxt-theme` | 2 | 50.0 | 0.0 | 50.0 |
| `@ecomplus/storefront-template` | 69 | 34.8 | 0.0 | 65.2 |
| `@ecomplus/storefront-app` | 25 | 12.0 | 4.0 | 84.0 |
| `@ecomplus/storefront-components` | 45 | 0.0 | 0.0 | 100.0 |
| `@fleetbase/storefront-engine` | 34 | 0.0 | 17.6 | 82.4 |
| `@pradip1995/create-storefront-app` | 1 | 0.0 | 0.0 | 100.0 |
| `pinelab-storefront` | 1 | 0.0 | 0.0 | 100.0 |

The two packages carrying the most undecidables (`@zalify` and
`fassbender-shopify-theme`) are the ones where rendering the theme actually
buys most of what could be bought. The Vue-storefront and ecomplus packages
are dominated by framework bindings and EJS locals, and are context-heavy
because the accessible name is set in controller code the template file does
not contain — an important caveat for anyone quoting the 50.5% share against a
specific customer without checking their stack.

## What could not be measured here

- **The corpus is npm, and npm is the wrong shelf** — same limitation as the
  sibling directory. The themes EU shops actually run are on the Shopify theme
  store and the WordPress.org directory, neither reachable from this
  environment. The *mix* of theme/merchant/context measured here is a fact
  about these 12 npm packages, not a market estimate. What generalises is the
  mechanism: rendering-recovery is three shares, not one.
- **~~No actual render.~~** This is a static classification of what each
  expression points at. A real render might close more (a Vue-storefront
  controller in scope collapses "context" toward "theme") or expose defects
  invisible here (an alt that renders as `"undefined"` because the merchant
  hasn't set one). This measures the ceiling on what rendering *can* recover
  from the template alone, and where the ceiling lives.

  Closed 2026-08-20 by [`../a11y-theme-resolution/`](../a11y-theme-resolution/),
  which resolves each of the 248 theme-recoverable undecidables against the data
  the package itself ships. **68.5% resolve to a name that is present and 2.0%
  (5 of 248) to a real blocking failure** — so the build step is a coverage
  step, not a finding-generator. It also corrects this directory's account of
  its own `theme_structural` bucket: **64 of those 69 were in the same file all
  along**, reported undecidable only because `audit.py` compares
  expression-*stripped* strings (`id="{{ id_prefix }}FirstName"` against
  `for="{{ id_prefix }}FirstName"`). Matching on the raw template text settles
  them — and is what exposes the five that are genuinely broken. The
  merchant-share lower-bound prediction below held: four elements moved theme →
  merchant, 11.0% → 11.8%.
- **The 11.0% merchant share is a lower bound on per-store residual.** The
  taxonomy calls something merchant only when the root is unambiguously a
  merchant object; a bare `title` used as `product.title` in the controller is
  counted `context`, not `merchant`. So real per-store rendering can produce
  *more* store-specific findings than 11.0%, not fewer.

## What this does and does not do to the pipeline

**Does not.** No candidate is added, no score is changed, no `ventures/`
directory is created, nothing is published, no account is registered, no
credential is used, and nothing is spent beyond agent time. The findings above
are inputs to the next scoring pass, in the same style as the amendment tables
in `distribution-first.md`; the scores in
[`candidates.yaml`](../../pipeline/candidates.yaml) are untouched, deliberately,
because a score edit from a rendering-recovery measurement would collide with
edits currently in flight.

**Does.** It closes an open measurement the sibling directory named as its
first uncovered gap, and it puts three shares under a claim that was previously
one bulk number ("almost all") — with the piece that isn't recoverable at
build time (the merchant share) separated from the piece that isn't
recoverable at all (the context share), so the top candidate's
free-qualification-pass proposition is quantified rather than asserted.

## Status of these claims

Primary measurement against the same public data the sibling directory used,
on the same standard: 100% of the 491 undecidables in
`a11y-evidence-record/results-2026-08-20.json` matched back to their element
and classified, every number in this document re-derives offline from the
committed per-package rows via `classify.py --recompute-from`, and every
verdict in the taxonomy has a named test in `test_classify.py`.

What is uncertain is generalisation — whether the theme/merchant/context mix
on npm resembles the mix on Shopify and WordPress themes — and this document
says so above rather than papering over it.
