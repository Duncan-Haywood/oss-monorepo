# Interview Content Studio

A free **content calendar generator that starts from an interview**: answer guided questions about your brand, business or
topic, and get a posting plan sized to the hours you have, a 4-week calendar, and drafts for every platform — X, Threads,
Bluesky, LinkedIn, Instagram (feed, Reels, carousels), Facebook, TikTok, YouTube (long video and Shorts), newsletters and
Substack, blog/SEO articles, Medium, Reddit, Pinterest and podcast clips. For a business building a brand or a person
building a personal brand who wants to repurpose one set of real stories into a month of social media content.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/interview-content-studio/

Runs in your browser, works with no AI key, and never posts anything for you. Optional AI rewriting uses your own key
(Anthropic, OpenAI, Gemini, any OpenAI-compatible endpoint) or a model on your own computer (Ollama, LM Studio, llama.cpp).

## How it works

1. **Interview.** One question at a time (or all at once): who you are, who you serve, their problem in their words, 3-5 real
   stories, opinions, advice you repeat, results you can show, your offer and link, search keywords, voice sliders and a
   writing sample, banned words, platforms, and hours a week. Run several interviews (one per brand, product or topic);
   they are saved in your browser and can be downloaded and imported as JSON.
2. **Plan.** Each format has a floor and an ideal rhythm per four weeks and a rough effort in minutes (`FORMATS` in
   `studio.mjs`). `planCadence` fits them to your hours: one piece of each platform's main format first, then every format to
   its floor, then towards its ideal, cheapest first; anything your time cannot reach is listed, not dropped. These numbers
   are the tool's starting assumptions, not measured benchmarks, and the page says so.
3. **Calendar.** `buildCalendar` spreads each format over 28 days (LinkedIn, newsletter and articles on weekdays only) and gives
   every day one theme from your answers, so the same story is repurposed across that day's platforms. About one piece in
   five carries your offer; Reddit never does.
4. **Drafts.** `templateDraft` builds every piece only from your answers, in the shape each platform wants: X 280 characters
   (links count as 23), Threads 500, Bluesky 300 graphemes, LinkedIn 3,000, Instagram captions 2,200 with "link in bio" (caption
   links are not clickable), Reels/TikTok/Shorts as a hook, beats, on-screen text and call to action with a spoken-length
   estimate, carousels slide by slide, YouTube title (100) + description + outline, newsletter subject + preview + body, blog SEO
   title (~60) + meta description (~160) + slug + Markdown draft, Medium with a canonical-link reminder, Reddit as a value-first
   post with no link, Pinterest title/description/overlay/link, and podcast clip talking points. `fitDraft` enforces the limits
   and flags banned words and [placeholders].
5. **Export.** Copy any draft, or download CSV (`date,platform,format,title,text`, for scheduler import, with a
   formula-injection guard), Markdown or JSON.

## Optional AI on your own key

`ai.mjs` sends your interview and the drafts in batches of five to the provider you choose, straight from your browser, via
the shared client `platform/llm/byok.mjs` (`byok.mjs` here is a synced copy; `ai.test.mjs` fails if they drift). The system
prompt forbids inventing facts, numbers, testimonials or claims and asks for strict JSON per piece. Every reply is checked:
unknown fields are ignored, platform limits are re-applied, a Reddit rewrite that adds a link is dropped, and **any piece that
contains a number not present in your interview is thrown away** and the built-in draft kept. With no key, or on any error,
the built-in drafts stand and the page says why. The key stays in your browser; "remember" is opt-in.

## Posting rules

This tool does not post anywhere. Review every draft, follow each platform's rules, label AI-generated content where a
platform requires it (TikTok, YouTube and Meta ask creators to disclose realistic AI-generated or altered media), and do not
use it for spam, fake accounts or fake reviews.

## CLI

```
node cli.mjs --questions
node cli.mjs studio.json --format plan
node cli.mjs studio.json --start 2026-11-02 --format csv > calendar.csv
node cli.mjs studio.json --interview "Bakery launch" --format md
```

`studio.json` is the file the page's "Download all interviews" button saves. Exit 0 on success, 2 on bad input. Zero
dependencies, Node 18+. The CLI never calls a model.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
marketing, legal or financial advice, and it does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, including every claim in a draft, each platform's rules and any
advertising or disclosure law that applies to you. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without
notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Download your interviews if
you want to keep them.

## Privacy

Everything runs in your browser. Interviews are saved only in your browser's local storage (`interview-content-studio-v1`)
and never uploaded, unless you turn on the optional AI rewrite, in which case your answers and drafts go straight from your
browser to the provider you pick. AI settings and key are stored (`interview-content-studio-ai`) only if you tick
"remember". No accounts, tracking cookies or analytics vendors. Anonymous feature counts (`plan_built`, `draft_copied`,
`export_used`, `ai_rewrite_run`, `import_used`, `interview_added`) live only in local storage; the footer button deletes
them and turns counting off. Do Not Track and Global Privacy Control are honoured.

## Files

`studio.mjs` (interview, platforms, cadence, calendar, template engine, limits, exports), `ai.mjs` + `byok.mjs` (optional
AI), `cli.mjs`, `index.html`, `how-often-to-post-on-each-platform.html` (guide; its tables are checked against the engine),
`usage.mjs`. Tests: `cd ventures/interview-content-studio && node --test`.

MIT licensed. Free; support via [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional.
