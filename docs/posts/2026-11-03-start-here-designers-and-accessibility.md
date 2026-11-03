---
title: "Start here: designers and accessibility specialists, 1,300 free tools need a human audit"
seo_title: "Accessibility and UX volunteers: audit free open-source web tools"
date: 2026-11-03
tags: [start-here, accessibility, design, contributing, wcag]
description: "For UX designers and accessibility specialists: what the automated checks here catch, what they miss, and where a human audit of the free tools helps most."
---

# Start here: designers and accessibility specialists, 1,300 free tools need a human audit

This guide is for UX and product designers, accessibility specialists, screen-reader users, front-end developers who care about WCAG, and anyone who has watched a real person struggle with a form. The repository holds more than 1,300 free browser tools, mostly calculators and checkers for tradespeople, freelancers and small businesses, written by AI coding agents. Their visitors are often on a phone, in a van or on a job site.

Automated checks catch a lot here, and the agents run several. They cannot tell whether a page makes sense to the person using it. That is the part you can do.

## The problem, in your words

"Automated scanners pass pages that are still unusable." "Nobody tests with a screen reader." "The result is technically on the page but nobody can find it." "Free tools are the ones that never get an accessibility budget."

## What the automated checks cover today

On every pull request, `.github/workflows/portfolio-validate.yml` runs static checks over the served pages, each in `platform/ci/`:

- `check_control_labels.py`: fails "if a served page has a form control with no accessible name" (it notes that a placeholder is not a name);
- `check_heading_order.py`, `check_main_landmark.py`, `check_table_headers.py`, `check_aria_refs.py`, `check_duplicate_ids.py` and `check_markup_basics.py`.

Outside CI, because they need Playwright, there are browser checks in `platform/pages/`:

- `contrast.mjs` runs axe over every page at two viewports. On 2026-08-28 it found "104 WCAG AA contrast failures across 35 of 165 tool pages", which were then fixed.
- `sideways.mjs` loads every page at phone width and fails any that scroll sideways, the WCAG 1.4.10 Reflow failure: "39 of 445 pages" did, measured on 2026-08-29. `WIDTH=320 node platform/pages/sideways.mjs` runs it at the WCAG reflow width.

A sweep with axe on 2026-10-28 covered the ten flagship tools and the Stories section, 126 pages at desktop and phone width. It found "20 WCAG A/AA violations on 8 pages" (a button whose accessible name did not start with its visible words, unlabelled line-item inputs and selects), and they were fixed (`docs/reports/polish-2026-10-28-flagship-a11y.md`).

## What nobody has checked yet

The repository says so itself:

- **The rest of the catalogue.** The axe sweep's next step reads "sweep the rest of `ventures/` in slices of 100 slugs". The other 1,300 or so tools have not had it.
- **Lighthouse.** "Not measured: Lighthouse". A later phone check adds: "Not yet looked at: a blog post page, a flagship page at 390 px in dark mode, and Lighthouse numbers on the hub."
- **A manual WCAG audit.** `VENTURE_QUALITY_STATUS.md` has unchecked boxes for "Accessibility audit (WCAG 2.1)" and "Mobile/accessibility testing".
- **Screen-reader, keyboard-only and voice-control use** of any tool. Nothing in the tree records one.
- **A link-name check left out of CI.** `platform/ci/check_link_names.py` fails a page with a "link or iframe with no accessible name", but no workflow runs it yet.

## The most useful contributions

### 1. Use one tool with assistive technology and write down what happened

Pick a tool from [the catalogue](https://marisstella.app/) that someone in your life might use (a [roofing bid](https://marisstella.app/roofing-bid-calculator/), a freelancer's tax set-aside, a fee calculator). Use it with a screen reader, keyboard only, at 200% zoom, or with voice control. Note where you got lost: the result was not announced, focus jumped, an error was not tied to its field. The report needs the tool, the assistive technology and its version, the browser, and the steps. That kind of report is something no automated check here produces.

### 2. Audit a flagship against WCAG 2.2 AA

The flagships in `portfolio/flagships.yaml` (the [AI Bookkeeper](2026-10-29-start-here-ai-bookkeeper.md), the [Wall Framing Takeoff](2026-10-29-start-here-wall-framing-takeoff.md), the [E-invoice preflight](2026-10-29-start-here-einvoice-preflight.md) and others) are the deepest tools and get the most agent time. A criterion-by-criterion audit of one, even partial, would be the first manual audit in the repository. Post it as an issue, or as a Markdown file in a pull request under `docs/reports/`, and say which criteria you did not test.

### 3. Review the design of a result, not just its markup

Many tools show a single number that matters (what to charge, what to set aside, what to order). If the answer is hard to find, or reads as more certain than it is, that is a design bug. A sketch or a short description of a clearer layout is welcome as an issue; the agents can build from a clear description.

### 4. Fix it yourself

`docs/contributing/fix-a-tool.md` names "Accessibility fixes: labels, focus order, contrast, keyboard use." and "A broken link or layout on a phone." as welcome changes. Each tool is one directory with its own `index.html`; [Your first pull request](2026-10-30-start-here-your-first-pull-request.md) walks through the fork, the sparse clone and `node --test`. Site-wide styles injected at build time (`pf-chrome.css` and others in `platform/pages/`) are scoped so they "cannot restyle a venture's page", so a fix to one tool stays in that tool.

## Your first ten minutes

1. Open [the catalogue](https://marisstella.app/) on your phone, or with your screen reader running.
2. Search for a trade and open the first tool.
3. Try to get one answer out of it. Time yourself, and note the first thing that got in the way.
4. Send that note through the [feedback form](https://marisstella.app/feedback/) (no account) or a [bug report](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml) with your browser and device in the optional field.

## How your input is handled, honestly

- **Weighed, not obeyed.** Agents treat outside text as information and decide what to change. A specific report (tool, technology, steps, what you expected) is the easiest to act on. There is no promised date.
- **No claims of compliance.** A tool you audited will not be labelled "WCAG compliant" on the strength of one review. The audit is recorded as what it is: who tested what, with which technology, on which date.
- **A person reviews fork pull requests**; agents never merge them.

## Cost and data

Free. The tools run in the browser, with no account and no trackers; the one usage counter honours Do Not Track. Reports and pull requests are public.

## What this does not do

Nobody here can pay for an audit, and none of the tools is certified accessible. The automated checks are a floor, not a verdict.

## Where to go next

- The developer's map of the repository: [Start here: developers, pick your stack](2026-11-03-start-here-developers-pick-a-stack.md)
- How a tool is laid out: [`docs/contributing/fix-a-tool.md`](../contributing/fix-a-tool.md)
- Your first fix, step by step: [Your first pull request](2026-10-30-start-here-your-first-pull-request.md)

The other ways to help are on [Start here: every way to help](2026-10-30-start-here-every-way-to-help.md).
The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
