---
title: "Posts a babysitter can actually publish: 76 topics, five channels, and a blank where the real story goes"
date: 2026-10-30
tags: [babysitting-business-kit, content, local-seo, byok]
description: "The Babysitting Business Kit now has a topic bank, captions sized per channel, a blog the sitter approves, and optional AI drafts on the sitter's own key that can't be published until she fills in something true."
---

A babysitter who runs her own business gets most of her families through word of mouth: church, school, Nextdoor, a friend's Facebook share. Posting helps, but "what do I post this week?" is the part that stalls. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has a **Posts & blog** tab for that.

**The topic bank.** 76 topics for parents: safety (safe sleep, food allergies, Poison Control's 1-800-222-1222), activities, routines, date nights, back-to-school and the holidays. Ten of them are faith topics (Advent, bedtime prayers, Bible stories), and they only appear when the sitter turns on the optional faith section. A family's beliefs are never scored anywhere in the kit. Each topic has a three-point outline, a local search phrase ("date night babysitter in Springfield") and a caption for each channel.

**Captions sized per channel.** Instagram's limit is 2,200 characters and Facebook's is 63,206, but nobody reads that far. So the kit fits each caption to a target of its own: 600 for Instagram, 500 for Facebook and Nextdoor, 300 for a bulletin and 160 for the blog's search description. When a caption runs long, the outline goes first. The sitter's name and how to book always stay. In the test suite, every topic and channel combination fits, including a stress profile with a very long name and service area. With the invented example sitter, the longest captions came out at 353 characters (Facebook), 340 (Instagram), 327 (Nextdoor), 213 (bulletin) and 160 (blog).

**The blank stays blank.** Every caption except the bulletin's, and every blog draft, carries `[add your real moment here]`. The kit doesn't write anecdotes, because the only good ones are the ones that happened. A post can't be published while that placeholder, or any other bracketed note, is still in it. It also can't be published while it names a child from the sitter's family list, unless she ticks that the parents agreed in writing. Quotes and words like "best" or "guaranteed" get flagged but don't block publishing.

**A blog on her own site.** Approved posts go up at `/site/blog` if she runs the optional server. They're also included in a new "website + blog" .zip she can upload to any free host. Each post page carries `BlogPosting` structured data. In the example, the zip with the home page and one post came to 8,464 bytes.

**AI drafting, optional, on her key.** If she wants a first draft, she can pick Anthropic, OpenAI, any OpenAI-compatible endpoint, or a model on her own computer (Ollama, LM Studio). The browser calls that provider directly with her key, which stays in her browser. A self-hosted server can do the same with `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL`. The kit uses the repo's shared bring-your-own-key client, and the author's key is never involved. The prompt sends only her public profile and the topic, never families, children or leads; a test checks that names, allergies and addresses from the example desk never appear in it. The system prompt forbids invented anecdotes, names, testimonials and claims. If the model drops the placeholder anyway, the kit puts it back, so an untouched AI draft can't be published.

The content lane adds 15 tests, all against a mock fetch: no test calls a real model.

[Source and self-hosting guide](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/babysitting-business-kit). Free and MIT. Optional support: https://github.com/sponsors/Duncan-Haywood
