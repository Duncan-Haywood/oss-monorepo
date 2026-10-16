# EPK Generator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/epk-generator/>

A free, no-signup tool that builds an electronic press kit (EPK) — the
one-page summary independent musicians and bands send to venues, festivals,
blogs, and playlisters — from a short form. Runs entirely in your browser.

After using this, you can now **have a send-ready press kit in a few
minutes**, which used to take assembling one by hand in a word processor or
slide tool, or paying for a subscription press-kit builder (Sonicbids-style
tools, Presskit.to, a page on a paid site builder) just to get a one-pager.

## Why this exists

An unsigned or independent act applying to a festival, pitching a blog, or
emailing a venue talent buyer is routinely asked for "an EPK or press kit" —
and the honest options today are a subscription tool with its own account
and (often) a watermark on the free tier, or assembling one by hand in
whatever document editor is on the machine. Neither is free-and-instant the
way this portfolio's other generators are. The content an EPK needs — bio,
photo, streaming links, socials, a few tour dates, maybe a press quote — is
the same for almost every act; what's missing is a free tool that turns it
into a clean page without an account.

**What this is not:** a booking agent, a publicist, or a judge of whether
your bio or photo is any good — that stays entirely your call. It also does
not accept file uploads; you link to a photo you already host somewhere, so
nothing you haven't already made public ever leaves your device. See the
disclaimers below.

## Try it

Open [`index.html`](index.html). Fill in as much as you have — only your
name and a bio are required, everything else (photo, contact, streaming and
social links, tour dates, press quotes) is optional and simply omitted from
the output if left blank. Click **Build my press kit** to preview it, then
either:

- **Download** a self-contained HTML page you can host anywhere or attach
  to an email, or
- **Copy** a plain-text one-sheet for pasting into an email body or a
  festival submission form that doesn't accept HTML.

The form autosaves to your own browser as you type (`state.mjs`), so closing
the tab doesn't lose your draft.

## How it's built

`generator.mjs` is the pure, dependency-free module that turns your form
data into the two outputs (`buildEpkHtml`, `buildOneSheetText`) and checks
completeness (`validateEpk`) — no network call, no DOM, fully unit-tested.
`index.html` is the only thing that touches the DOM: it reads the form,
calls the generator, and renders the result. `state.mjs` autosaves the draft
to `localStorage`; `usage.mjs` is the same anonymous, opt-out event counter
every venture in this portfolio uses.

## Disclaimers

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not booking, publicity, legal, or career
advice, and it does not replace a manager, publicist, or lawyer. **You are
responsible for reviewing and verifying everything in the generated press
kit before sending it anywhere** — including that any photo link you
provide is one you have the right to use. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record — download your generated press kit and
keep your own copy.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

Everything runs in your browser. What you type is never uploaded; there are
no accounts, cookies, or analytics vendors. Anonymous feature events
(`kit_built`, `one_sheet_copied`, `download_clicked`, `example_loaded`,
`draft_cleared`) are counted only in `localStorage`, never tied to what you
typed. Do Not Track and Global Privacy Control are honoured, and a button on
the page turns counting off entirely.

## Development

```sh
node --test *.test.mjs
```

`generator.test.mjs` covers building, validation, the pipe-delimited list
parser, and XSS-safe escaping. `state.test.mjs` covers the autosave
round-trip. `usage.test.mjs` covers the opt-out event counter.
`page.test.mjs` checks the shipped markup: disclaimers, structured data, the
sponsor link, and the sibling docs-page link.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Untested hypothesis —
see kill criteria there.
