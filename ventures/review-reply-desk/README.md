# Review Reply Desk

Free, browser-only reply writer for local-business reviews. Paste your Google,
Yelp or Facebook reviews and get a ready-to-post reply to each one: matched to
the star rating, specific to what the customer said, signed as you, and checked
for the mistakes that turn one bad review into two. Risky reviews (legal
threats, injury or theft claims, possible fakes, requests for a refund) are
sorted to the top with a plain-English warning. A second card writes the
requests that *get* reviews, within Google's rules.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/review-reply-desk/

Open `index.html`. No build step, no dependencies. `node --test` runs the suite.

- `calc.mjs` - review parser (star lines, names, blank-line blocks), topic and
  sentiment analysis, risk flags, the deterministic reply composer, the reply
  checker (`checkReply`: health-privacy, asks to change a review, accusations,
  public refund offers, stray phone numbers, length), triage, summary, CSV.
- `ai.mjs` + `byok.mjs` - optional polish on the owner's own key (Anthropic,
  OpenAI, Gemini, any OpenAI-compatible endpoint). The model's reply runs through
  `checkReply`; if it fails, the built-in reply is kept and the page says so.
  `byok.mjs` is a synced copy of `platform/llm/byok.mjs` (the test fails on drift).
- `request.mjs` - ask for reviews: builds your review link from a Google Place ID
  or g.page / Yelp / Facebook link, writes a text, email or receipt line per
  customer, and checks each (`checkRequest`) for rewards, review gating, asks for a
  rating, a missing link, and texts with no opt-out or too many parts. Tap-to-send
  `sms:` / `mailto:` links are built in the browser; nothing is sent by the page.
- `how-to-ask-customers-for-google-reviews.html` - guide with scripts the test
  suite recomputes.
- `usage.mjs` - local-only feature counters with an opt-out.
- `how-to-respond-to-a-negative-google-review.html` - guide with worked replies
  that the test suite recomputes.

**Health practices.** Choosing "Dental, medical or therapy practice" makes every
reply general: it confirms nothing about the reviewer's visit or care, and the
checker rejects any reply that does. This is a safeguard, not legal advice.

**No warranty.** Free and as-is; not legal, privacy or reputation-management
advice. Read and edit every reply before you post it.

**Privacy.** Everything runs in your browser; reviews and replies are never
uploaded. With an AI key, only the one review you click Polish on goes from your
browser to the provider you chose. Anonymous feature counts stay in local
storage and can be switched off.

MIT licence, see `LICENSE`.

## Alternatives, and why this one

Paid reputation tools (Birdeye, Podium, Grade.us, NiceJob) bundle review
requests and reply drafting at roughly $100+ a month per location, with accounts
and customer lists stored on their servers. Free generic AI chat can draft a reply
but does not know the traps above and does not check its own output. This tool is
free, needs no account, keeps customer lists in your browser, and checks messages
instead of just writing them. It does not post, monitor, or send for you; a paid
tier built on the deployer's own keys is the natural next step.
