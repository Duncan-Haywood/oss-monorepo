# Media Kit Generator

A free, no-signup tool that builds a creator sponsorship media kit — the
one-page summary content creators send to brands considering a partnership —
from a short form. Runs entirely in your browser.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/influencer-media-kit-generator/

After using this, you can now **have a send-ready sponsorship media kit in a
few minutes**, which used to take assembling one by hand in a slide deck or
document editor, or paying for a subscription creator-marketing tool just to
get a clean one-pager.

## Why this exists

A content creator pitching a brand, or replying to a brand's own intake
form, is routinely asked for "a media kit" — and the honest options today
are a subscription creator-marketing platform with its own account and
(often) a watermark or gated export on the free tier, or assembling one by
hand in whatever slide tool is on the machine. Neither is free-and-instant
the way this portfolio's other generators are. The content a media kit
needs — bio, platform reach and engagement, audience breakdown, past brand
work, a rate card — is the same for almost every creator; what's missing is
a free tool that turns it into a clean page without an account.

**What this is not:** a talent manager, an analytics service, or a judge of
whether your numbers or photo are any good — that stays entirely your call.
It does not pull your stats from any platform automatically; you type in
what you already know from your own dashboard. It also does not accept file
uploads; you link to a photo you already host somewhere, so nothing you
haven't already made public ever leaves your device. See the disclaimers
below.

## Try it

Open [`index.html`](index.html). Fill in as much as you have — only your
name and a bio are required, everything else (photo, contact, platforms,
audience, past partnerships, testimonials, rate card) is optional and
simply omitted from the output if left blank. Click **Build my media kit**
to preview it, then either:

- **Download** a self-contained HTML page you can host anywhere or attach to
  an email, or
- **Copy** a plain-text one-sheet for pasting into an email body or a
  brand's partnership-intake form that doesn't accept HTML.

The form autosaves to your own browser as you type (`state.mjs`), so closing
the tab doesn't lose your draft.

## How it's built

`generator.mjs` is the pure, dependency-free module that turns your form
data into the two outputs (`buildMediaKitHtml`, `buildOneSheetText`) and
checks completeness (`validateMediaKit`) — no network call, no DOM, fully
unit-tested. `index.html` is the only thing that touches the DOM: it reads
the form, calls the generator, and renders the result. `state.mjs` autosaves
the draft to `localStorage`; `usage.mjs` is the same anonymous, opt-out
event counter every venture in this portfolio uses.

## Disclaimers

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, or business advice, and
it does not replace an agent, manager, or lawyer. **You are responsible for
reviewing and verifying everything in the generated media kit before
sending it anywhere** — including that any stats you enter are accurate and
that any photo link you provide is one you have the right to use. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record — download your generated media kit and
keep your own copy.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Arriving from the brand deal rate calculator

The two things this tool's own validator warns about most often — "No
platforms listed" and "No rate card" — are exactly what
[`brand-deal-rate-calculator`](../brand-deal-rate-calculator/) works out. So
its report offers a link here carrying the platform line and a rate-card row
per deliverable, and [`prefill.mjs`](prefill.mjs) is the receiving half.

Three rules shape it, and each is a bug it is written not to have:

- **It never overwrites.** A creator can arrive with a draft they have spent
  twenty minutes on. The page shows a banner with exactly what the link is
  carrying and inserts nothing until the button is pressed; inserting
  *appends* the lines the form does not already have, so following the same
  link twice does not duplicate a rate card and nothing typed by hand is
  touched.
- **It trusts nothing in the URL.** Only `platformsRaw` and `ratesRaw` can be
  filled — checked against `state.mjs`'s own `STRING_FIELDS`, imported rather
  than restated — so a link cannot write a bio or a partnerships email
  address. Control and bidi characters are stripped, and line count, line
  length and total size are capped.
- **Nothing is transmitted.** The values ride in the URL fragment, which
  browsers do not send to any server, and `prefill.mjs` does no I/O at all.

Events: `handoff_offered`, `handoff_accepted`, `handoff_dismissed` — counted
the same privacy-conscious way as everything below.

## Privacy-conscious usage tracking

Everything runs in your browser. What you type is never uploaded; there are
no accounts, cookies, or analytics vendors. Anonymous feature events
(`kit_built`, `one_sheet_copied`, `download_clicked`, `example_loaded`,
`draft_cleared`, and the three handoff events below) are counted only in
`localStorage`, never tied to what you typed. Do Not Track and Global Privacy Control are honoured, and a button on
the page turns counting off entirely.

## Development

```sh
node --test *.test.mjs
```

`generator.test.mjs` covers building, validation, the pipe-delimited list
parser, and XSS-safe escaping. `state.test.mjs` covers the autosave
round-trip. `usage.test.mjs` covers the opt-out event counter.
`page.test.mjs` checks the shipped markup: disclaimers, structured data, the
sponsor link, and the sibling docs-page link. `prefill.test.mjs` covers the
handoff described above — the field allowlist, the caps, and, most of all,
that merging never removes or rewrites what the creator already typed.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Untested hypothesis —
see kill criteria there.
