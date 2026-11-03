# Fixing or improving a tool

Every tool lives in its own directory, `ventures/<slug>/`, and its live page is
`https://marisstella.app/<slug>/` (the old
`https://duncan-haywood.github.io/oss-monorepo/<slug>/` address redirects there). So the page you were
using tells you the directory to open. The catalogue,
[`ventures/README.md`](../../ventures/README.md), lists every tool with links
to both.

Tools come in three main shapes. Look at the files in the directory to tell
which one you have.

## Browser calculators

Example: [`ventures/roofing-bid-calculator/`](../../ventures/roofing-bid-calculator/).

| File | What it is |
|---|---|
| `calc.mjs` (sometimes another name) | The arithmetic, as pure functions: no DOM, no network, no state. Every rate is an input; defaults and presets are named constants with a comment saying they are starting points |
| `calc.test.mjs` | Tests of that arithmetic with `node:test`. Each test name states the rule it pins ("a second tear-off layer doubles dump and tear-off hours, not the new covering") |
| `index.html` | The page: form, results, FAQ, the no-warranty footer, and one `<script type="module">` that imports `calc.mjs` |
| `page.test.mjs` | Structural checks on the HTML (an unclosed `<textarea>` once swallowed a page's script while the arithmetic tests stayed green) |
| `usage.mjs` | Anonymous usage counting that stays in the visitor's browser and honours Do Not Track. Leave it as it is |
| `*.html` beside `index.html` | Explainer and comparison pages ("vs-acculynx.html"), each usually with its own test |
| `VENTURE.yaml` | Who the tool is for, the hypotheses it tests, and when it would be retired |
| `README.md`, `LICENSE`, `robots.txt`, `sitemap.xml` | What they say |

There is no build step and no dependency. `node --test` in the directory runs
every test.

## Command-line checkers

Example: [`ventures/actions-timeout-check/`](../../ventures/actions-timeout-check/).

`check.py` is a standard-library Python CLI (`--help`, `--format json`,
`--fail-on-risk` for CI) with its tests in `test_check.py`. Most also have a
browser version on their page: `classify.mjs` is a port of `check.py`'s logic
for pasted text, and `classify.test.mjs` includes a parity test that runs
`python3 check.py` on the same input and requires the same findings. **Change
both files together**, or the parity test fails. Several checkers are also
published as pre-commit hooks and Nix packages; those lists
(`.pre-commit-hooks.yaml`, `flake.nix`) are generated, so do not edit them by
hand.

## Self-hosted apps

Example: [`ventures/dunning-engine/`](../../ventures/dunning-engine/).

These have a browser page (`index.html`) plus a server (`server.mjs`, often
with zero dependencies) and deploy files (`Dockerfile`, `docker-compose.yml`,
`fly.toml`, `render.yaml`). They run in the deployer's own accounts with the
deployer's own keys: nothing ever routes through the maintainer, and payment
code stays off unless the deployer supplies keys
([`prompts/goals.md`](../../prompts/goals.md), "Guardrails"). The tool's
README says how to run it locally.

A few larger products (for example under `ventures/print-atelier/`) have a
`package.json` and their own CI; follow their READMEs.

## Worked example: a default that is wrong

Say you roof for a living and the roofing calculator's starting material
price for standing-seam metal looks far from what you pay.

1. **Find where the number lives.** It is a named preset in `calc.mjs`
   (`MATERIAL_PRESETS`). The comment above it says these are ballpark
   starting points, not a quote.
2. **Find everywhere the page quotes it.** Search the directory:
   `grep -rn "480" ventures/roofing-bid-calculator/`. Figures from the
   calculator are repeated in the FAQ text in `index.html`, in the FAQ's
   JSON-LD (what search engines read) and sometimes in the explainer pages. A
   change that updates `calc.mjs` but not the copy leaves the page
   contradicting itself.
3. **Bring a source.** A supplier price list, a published cost guide, or "my
   last six invoices averaged X, region Y". Put it in the PR description, and
   in a code comment if it is public. The ground rule is that a default is
   either sourced or honestly labelled as a ballpark; it is never a number
   that just looks plausible.
4. **Update the test.** If a test pins the old value, change it, and add a
   test for the behaviour you care about if there is none. A fix to the
   arithmetic itself should come with a test that fails before your change.
5. **Run `node --test`** in the directory and paste the summary lines in your
   PR.
6. **Open the page** (`python3 -m http.server` in the directory) and check
   that the first-load result and the FAQ now agree.

The same pattern applies to tax and fee tools, where the source is usually a
government rate table or a platform's published fee page: link the page and
note the date you read it, because those figures change every year.

## Other changes that are welcome

- A test for an edge case you hit (zero, a negative, a huge input, a
  different locale's number format).
- A clearer explanation, label or FAQ answer, in plain language.
- Accessibility fixes: labels, focus order, contrast, keyboard use.
- A broken link or layout on a phone.

## Changes to discuss in an issue first

- A new tool. Describe who would use it and what they use today; the
  maintainer decides what to add.
- Anything touching `platform/` (the site build, CI) or many tools at once.
- Adding a dependency, a network call, an account, analytics or payment code
  to a browser tool. The default answer is no: the tools are private and free
  to run because they have none of these.

## Things that will not be merged

Fake reviews, testimonials or user counts; code or text copied from a project
under an incompatible license; secrets or personal data; removing the
disclaimer; anything that sends what a user types to a server. See
[`CONTRIBUTING.md`](../../CONTRIBUTING.md), "Ground rules".
