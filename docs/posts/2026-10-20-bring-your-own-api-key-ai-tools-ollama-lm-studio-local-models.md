---
title: "Free tools with AI on your own key, or a local model: how BYOK works here"
seo_title: "Free tools with AI on your own key, or a local model"
date: 2026-10-20
description: "Every AI feature here works with no key, your own Anthropic, OpenAI or Gemini key, or a local model in Ollama, LM Studio or llama.cpp. How, and where."
tags: [byok, local-llm, ollama, open-source]
---

# Free tools with AI on your own key, or a local model

This repository builds free tools, mostly through unattended AI coding agents
with an owner steering a few hours a week. Some of those tools are better with
a language model: drafting a reply to a review, tailoring a CV line to a job
posting, turning call notes into a follow-up email. A free tool cannot pay for
inference on everyone's behalf, and a tool that holds its users' text on a
server it does not need is a privacy problem.

The repository's answer is a rule with three switch positions, and one shared
client that implements it. This post describes both and where they are used.

## The rule: the deterministic path is the product

Section 3 of [`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md), "The API-key
switch", sets the shape. A product must be fully useful with no key at all. A
key unlocks an extra. If the model call fails, the tool falls back to the
deterministic result rather than failing. And the interface says which path
ran, rather than degrading silently. The playbook's suggested wording:

> AI summaries are off. Add your own Anthropic or OpenAI key in Settings, or
> point it at a model running on your own computer (Ollama, LM Studio), to
> turn them on. Nothing is ever sent to us.

On 18 October the owner added local models as a first-class position. The
direction, quoted in [`prompts/goals.md`](../../prompts/goals.md) ("Direction:
local models as an option beside API keys"), reads: "for the majority of
applications, I think the possibility of hosting local and using local ai is
another good way to go for applications. instead of using api keys for llms
and image and video gen." So wherever a key is offered, a model on the user's
own machine is offered beside it: no key, no per-call cost, and the data stays
local.

So the three positions are:

| Position | Who pays | Where the text goes |
|---|---|---|
| No key | Nobody | Nowhere: rules and templates run in the page |
| Your own hosted key | You, to your provider | From your browser or your server straight to that provider |
| A local model | Nobody per call | To a server on your own machine or network |

## The shared client: `platform/llm/byok.mjs`

[`platform/llm/byok.mjs`](../../platform/llm/README.md) is the one model
client the tools share. It is 281 lines, has no dependencies and uses plain
`fetch`, so the same file runs in a static page, a Node server, an edge
function or a phone app wrapper. It speaks to:

| Provider | Needs |
|---|---|
| Anthropic | a key; the model defaults to `claude-opus-5-5` |
| OpenAI | a key and a model |
| Google Gemini | a key and a model |
| Anything speaking `/chat/completions` (OpenRouter, Groq, Together, Mistral) | a base URL and a model; key optional |
| Ollama on this machine | a model; no key (`http://localhost:11434/v1`) |
| LM Studio on this machine | a model; no key (`http://localhost:1234/v1`) |
| llama.cpp `llama-server` on this machine | a model; no key (`http://localhost:8080/v1`) |

Only Anthropic has a default model. For the others the person names it, so the
code never ships a third-party model ID that later goes stale.

The playbook's rule is one function, `withFallback`. You give it the
deterministic function and the model function. It returns a value and a
`source` saying which ran, so the page can say "AI is off" or "drafted by your
model" truthfully.

Three smaller pieces make local models practical. `detectLocal()` probes the
three default ports and lists the models it finds. `listModels()` lists models
for any provider. `isLocal()` is true for localhost and private network
addresses, so a page can say "this stays on your computer" only when it does.

On a server, `LLM_PROVIDER=ollama` plus `LLM_MODEL` is enough.

## Calling localhost from a public web page

The tools are served from GitHub Pages, so "use your local model" means a
public https page asking the visitor's browser to call `http://localhost`. The
README is specific about the three things that decide whether that works,
and pages are meant to say them:

- **CORS.** Ollama accepts only its own local origins by default. Start it
  with `OLLAMA_ORIGINS` set to the origin of the page you are using (its
  scheme and host, such as `https://example.github.io`). LM Studio has a CORS
  switch in its server settings. `llama-server` answers cross-origin requests
  by default.
- **Local network permission.** Recent Chrome versions ask the visitor before
  a public site can reach `localhost` or the local network.
- **Mixed content.** Browsers treat `http://localhost` as secure, so an https
  page may call it. A LAN address over plain http is blocked from an https
  page.

`detectLocal` cannot tell a server that refuses the page's origin from one
that is switched off, so a page that finds nothing should show the setup line
rather than "no local model".

## Keys stay with their owner

In a page, the client is called with `browser: true` and the key lives in the
visitor's own browser storage. For Anthropic that sets the header Anthropic
requires for direct browser calls. On a server, the key comes from the
deployer's environment. Error messages never echo a provider's response body,
because it can reflect the request.

For a server running on a deployer's key, the client can take an
[LLM Spend Guard](../../ventures/llm-spend-guard/) policy. A call that would
cross a budget is refused before it is sent, and actual usage is charged
afterwards. That is what stops one visitor, or one loop, from spending the
month's budget.

## Where it is used

Searching `ventures/` on `main` for the shared client finds nine tools that
carry it. Each keeps a copy of `byok.mjs` in its own directory, and each has
a test that fails if the copy differs from
[`platform/llm/byok.mjs`](../../platform/llm/byok.mjs). When the shared file
changed in a red-team pass on 20 October (PR #8623), the copies fell one line
behind, and those tests are what catch it.

| Tool | What it does without a key | What the model adds |
|---|---|---|
| [`ats-resume-checker`](../../ventures/ats-resume-checker/) | flags ATS-breaking resume formatting, keyword coverage against a posting | rewrites up to five of your existing lines |
| [`proposal-maker`](../../ventures/proposal-maker/) | a starter from the nearest trade template | drafts summary, problem, goals, scope and assumptions; never prices, dates or clauses |
| [`review-reply-desk`](../../ventures/review-reply-desk/) | rating-aware replies, risky reviews flagged first | polish on the owner's own key |
| [`sales-call-notes-desk`](../../ventures/sales-call-notes-desk/) | CRM fields from call notes, each with its source sentence | polish for the follow-up email, rejected if it states a dollar figure not in the notes |
| [`meeting-action-items`](../../ventures/meeting-action-items/) | who committed to what and by when | finds commitments the rules missed; each must quote the notes verbatim or it is dropped |
| [`support-desk`](../../ventures/support-desk/) | a self-hosted shared inbox with saved replies | a reply draft an agent reads, edits and sends |
| [`deal-keeper`](../../ventures/deal-keeper/) | pipeline forecast and hygiene list from your own closed deals | a follow-up note for a deal that needs attention |
| [`icp-lens`](../../ventures/icp-lens/) | ideal-customer-profile scoring from a won/lost CSV | a first-draft outreach note the user edits and sends |
| [`persona-conversation-simulator`](../../ventures/persona-conversation-simulator/) | rules-based, seeded simulation of fictional characters | optional AI voicing |

Six of the nine pages name Ollama in their own HTML; the other three mention
it in their `byok.mjs` copy only.

Most of these come from the sales and marketing direction in
[`portfolio/sales-tools/README.md`](../../portfolio/sales-tools/README.md).
Its definition of done asks for the same shape: the deterministic path
completes a real task with no key and is tested, and the AI path works with at
least Anthropic and one `openai-compatible` endpoint, falls back cleanly and
says so. It adds guardrails for this kind of tool: the user sends and the tool
drafts, AI copy is marked as a draft, and no generated reviews or testimonials
are passed off as real.

## What is not covered

No tool here generates images or video yet. The rule is written for when one
does: offer a local server such as ComfyUI next to any hosted API, and require
neither for the main flow. The client for it will be added when the first
tool needs it.

Nine of roughly thirteen hundred tools use a model at all. Most tools here
are calculators, which need arithmetic, not a model.

What a model drafts can be wrong. Treat it as a first draft to check,
especially for anything legal, financial or medical; nothing here is
professional advice.
