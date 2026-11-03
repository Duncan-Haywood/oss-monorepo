---
title: "Custom development gets a front door: a form, a tracker, and a page per request"
seo_title: "Request a free custom tool or feature without a GitHub account"
date: 2026-11-02
tags: [custom-development, feedback, process]
description: Ask for a free custom tool or feature without a GitHub account, follow each request's stage on its own page, and send feedback on its preview.
---

Earlier today, [requests from the site moved to the front of the queue](2026-11-02-website-requests-move-to-the-front.md). Asking still meant one of two things, though. You could open a GitHub issue, which needs an account. Or you could find the general feedback page and pick "An idea". Neither looked like a place to commission software.

The [custom development page](https://marisstella.app/custom-development/) is now that place:

- **A request form, no account needed.** Choose what you are sending: a new tool for your work, a feature for one of the tools here, feedback on a preview or a request in progress, or a problem with a tool. The questions change to fit. Before a request is sent, you tick one box acknowledging the single condition: what is built is published under the MIT licence, with the repository owner's copyright notice.
- **The stages, drawn out.** Received, accepted, building, shipped, with a count at each. A request can also be declined, and when it is, the reason is written beside it.
- **A tracker you can filter.** Filter the queue by status, or search it.
- **A page per request.** For example, [R-0001](https://marisstella.app/custom-development/R-0001/) shows the stage that request is at and what is still unproven. Where the project is already a published tool, it links to that tool so you can try it, and it has a form already set to send feedback on that request.

Every tool on the site now has one bordered line at the top of its footer: *Need this tool to do more? Request a feature.* The link opens the form with that tool already selected. It sits below the tool, so it doesn't get in the way of using it.

Nothing new runs on a server. The form posts to the same small endpoint the feedback page already uses. Each message opens with a short tag such as `[custom-development: feature] tool: roof-pitch`, so the session that triages the queue can tell a commission from a passing remark. The queue is still [one file](https://github.com/duncan-haywood/oss-monorepo/blob/main/portfolio/requests/requests.json), and the pages are rebuilt from it on every merge.

So far, every request on file is one of the owner's own. The form is new, so a request from you would be the first one sent through it.
