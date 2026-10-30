---
title: "Publishing to 18 platforms from one tool: what their APIs allow in 2026"
seo_title: "Publishing to 18 platforms from one tool"
date: 2026-10-20
description: "We built one publisher for 18 platforms. Four allow free automated posting, eight only get drafts, and nothing can rank until visits are counted."
tags: [distribution, social-media, automation, open-source, ai-agents]
---

# Publishing to 18 platforms from one tool: what their APIs allow in 2026

This repository ships about 1,300 free tools and a stream of research
write-ups. A dry run on 20 October 2026 found 189 new items in its seven-day
window: 184 tools and 5 posts. The owner asked for one tool that publishes to
every platform where people's attention goes and measures which platforms
work. This post covers what that tool does, what each platform actually
permits, and what is still unknown.

**Who did this.** AI coding agents (Claude) working under the owner's
direction, in one session. Nothing below has been posted to a live account
yet, and no performance numbers exist. The interesting part is what the
platforms permit.

## One item, eighteen shapes

[`platform/distribution/hub.mjs`](../../platform/distribution/hub.mjs) takes
each new tool or post and writes one version per platform. Each version fits
the platform's limits:

- 280 characters on X, 300 graphemes on Bluesky and 500 on Threads;
- a caption without a clickable link on Instagram;
- a 30-second script on TikTok and YouTube Shorts;
- a "Show HN" title on Hacker News;
- a weekly digest by email.

Every version uses only the item's own title and description, so it cannot
claim anything the page does not. Each version links back with a per-platform
tag (`?ref=threads`, `?ref=x`, ...). The site's counter adds one per platform
per day when someone follows that link, and records nothing about who it was.

## What the platforms permit

We sorted the 18 platforms by one rule from the repository's distribution
spec: automate only what is **free** and **within the platform's terms**.

| Mode | Count | Platforms |
|---|---:|---|
| Publish automatically (off until the owner switches it on) | 4 | Threads, Facebook Page, Instagram, email newsletter |
| Already automated by existing scripts | 4 | Bluesky, Mastodon, dev.to, Hashnode |
| Drafts for a person to post | 8 | X, LinkedIn, Substack, Medium, TikTok, YouTube, Reddit, Hacker News |
| Nothing to post (they find the site) | 2 | Search engines, AI assistants |

The eight draft-only platforms are drafts for different reasons:

- **X** made pay-per-use the default for its API on 6 February 2026 and
  closed the free tier to new developers. Third-party trackers put a post
  containing a link at about $0.20 each. Our rule is that distribution costs
  nothing, so X gets drafts.
- **TikTok** limits unaudited apps to private posts (`SELF_ONLY`) from private
  accounts, and every post needs a video.
- **YouTube** also needs a video for every post, and uploads from unverified
  API projects stay private.
- **Substack** has no publishing API. Its 2026 developer API looks up
  profiles. The unofficial endpoints some tools use may break its terms.
- **Medium** no longer issues integration tokens. Its "Import a story" keeps
  the canonical link, so a person can still cross-post.
- **LinkedIn** lets a member post by API. Reading those posts back, which we
  need in order to avoid posting twice, requires partner-only access.
- **Reddit and Hacker News** forbid automated submissions.

Social media now splits into platforms you can automate cheaply (Meta's
Threads, Facebook and Instagram APIs, Bluesky, Mastodon) and platforms where
automation costs money or an audit. For a free project, the second group is
where a person still has to post by hand.

## Measuring what works, honestly

The scoreboard (`hub.mjs score`) combines two kinds of evidence and keeps
them apart:

1. **Engagement per post**, where the platform reports it:
   - Bluesky and Mastodon expose likes, reposts and replies publicly;
   - Threads has an insights API with views;
   - Facebook and Instagram return reactions and comments;
   - dev.to returns page views.
2. **Arrivals**: page loads on our site that came through each platform's
   tagged link. This is the only number that shows a post sent someone to a
   tool.

Two safeguards keep early numbers from misleading:

- **Shrinkage.** A platform's rate per post is pulled toward the average by
  five pseudo-posts, so two lucky posts cannot outrank fifty steady ones.
- **A floor.** Nothing with fewer than five posts is ranked.

Short posts also rotate between a few honest wordings ("New free tool: …",
"Free and open source: …"). The pick is a hash of the item and the platform,
so a re-run writes the same text. Each wording starts with a fixed marker, so
the scoreboard can tell which one a post used and compare them within each
platform.

**Current state:** no readings. Nothing has posted yet, and the site's
counter is not deployed, so every arrival count reads "unmeasured", never zero.

## The same idea, for anyone building a brand

The second tool, [Interview Content Studio](../../ventures/interview-content-studio/),
does this for a person or a business rather than for this repository:

1. It interviews you about your brand or topic. You can keep several interviews.
2. It sizes a posting plan for 14 platforms to the hours you actually have.
3. It lays the plan out as a four-week calendar.
4. It drafts every slot in that platform's format.

Without an API key, drafts are assembled only from your own answers. With your
own key (Anthropic, OpenAI, Gemini, or a model on your own computer), drafts
are rewritten by AI and then checked: a draft that introduces a number not in
your interview is thrown away. It exports CSV for a scheduler and posts
nothing itself. Its posting amounts are starting assumptions, and the page
says so.

## Limits

- No adapter has been exercised against a live account; the request shapes
  come from public documentation read on 20 October 2026.
- No engagement or arrival numbers exist yet, so this post makes no claim
  about which platform works best. That is the next post, once there is data.
- Platform rules change quickly. The tool records the date each fact was
  checked (`checked:` in
  [`hub/platforms.mjs`](../../platform/distribution/hub/platforms.mjs)).

The full report and the next steps are in
[`portfolio/distribution/hub-report-2026-10-20.md`](../../portfolio/distribution/hub-report-2026-10-20.md).
