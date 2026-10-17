# Survey Keeper

After using this, you can now **run a survey or an NPS check on a server you own**, read the score with a 95% range instead of a bare number, see which words detractors use more than promoters, compare channels, and get a message the moment someone scores you 0 to 6, instead of paying a survey service per response.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/survey-keeper/

Two parts, both free and MIT:

- **`index.html`**: paste scores and comments, see the NPS, its range and the word table. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Public survey pages, admin, results, CSV export, a webhook on every detractor.

## Why someone would use this

| Today | Cost / catch | Survey Keeper |
|---|---|---|
| Typeform, SurveyMonkey, Delighted, Survicate, Refiner | Monthly fee that rises with responses; answers live with them; trend and export sit on higher tiers | Your server, unlimited surveys and responses, no fee per response |
| LimeSurvey, Formbricks | Full platforms: a database, a build, many settings | One Node process and one JSON file |
| A Google Form plus a spreadsheet | No NPS maths, no range, no per-channel score, no alert when a customer is unhappy | NPS with a 95% range, results by source, a webhook on every detractor |

Honest limits: no skip logic or page branching, no email sending (share the link, or embed it), one admin key, no respondent panel or quota control, and the word table is counting, not sentiment analysis. Answers are anonymous by design, so you cannot reply to a detractor unless they typed a way to reach them into a comment. For research-grade surveys use a full platform.

## How it works

1. **Define a survey** at `/admin/new`, one question per line: `type: label | option | option`. Types are `nps` (0 to 10), `rating` (1 to 5), `single`, `multi` and `text`. A star after the type (`nps*`) makes it required.

   ```
   nps*: How likely are you to recommend us to a friend or colleague?
   text: What is the main reason for your score?
   rating: How easy was it to get started?
   single: How often do you use us? | Daily | Weekly | Monthly | Rarely
   multi: Which features matter most to you? | Search | Export | Integrations
   ```

2. **Share the link** `/s/<name>`. Add `?ref=email`, `?ref=app` or `?ref=invoice` to tag the channel; results show a score for each. Or embed it: set `EMBED_ORIGINS` to the origins allowed to frame it, then use the iframe snippet on the results page.
3. **Read the results** at `/admin/s/<id>/results`: the NPS (promoters 9-10, passives 7-8, detractors 0-6) with a 95% range from the variance of the three-point score, the score distribution, a day-by-day table, option shares, rating averages, and for each text question the words people mention and whether detractors or promoters say them more often.
4. **Close the loop.** Set `ALERT_WEBHOOK_URL` (a Slack or Discord incoming-webhook URL, https only) and every response that scores 0 to 6 posts the score, the channel and the first comment.
5. **Take the data with you.** CSV per survey (spreadsheet-formula safe) and a JSON export of everything.

A survey with responses keeps its question types and options fixed so old answers can never be re-mapped to different questions; labels, title and thank-you text stay editable.

## Reading an NPS honestly

With 20 answers a score of +30 has a range of roughly -10 to +70, so do not celebrate or panic over a few points. The results page prints the range beside the score and warns below 30 answers. NPS also depends on who answers: a survey sent only to active users reads higher than one sent to everyone who signed up.

## Run it

```sh
cd ventures/survey-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) node server.mjs
```

Open `http://localhost:8080/admin` (any user name, `ADMIN_KEY` as the password). Settings: `STATE` (JSON file path; keep it on a persistent disk), `PORT`, `PUBLIC_URL` (https, used for links shown in the admin), `TRUST_PROXY=true` behind a proxy so rate limiting sees real client addresses, `ALERT_WEBHOOK_URL`, `EMBED_ORIGINS`, `HIDE_SPONSOR_LINK=true`.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. Nothing runs on the author's accounts. Serve it over HTTPS only (Render does); the admin uses HTTP Basic auth. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`.

## What it stores

Survey definitions and, for each response, the answers, a timestamp and an optional short source tag. No name, email or IP address is stored unless a respondent types one into a comment. IP addresses are kept in memory only for rate limiting (10 submissions a minute per address). A hidden honeypot field quietly drops simple bots.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the survey and are responsible for its questions, your privacy notice and the consent and data-protection rules where you and your respondents live. Scores, ranges and word tables are heuristics and depend on who answers. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
