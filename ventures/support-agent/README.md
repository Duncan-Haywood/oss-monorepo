# Support Agent

After using this, you can now **let a chat on your site answer the customer questions your help articles already answer, with the source linked, and hand everything else to a person**, instead of paying an AI help-desk add-on per resolution or letting a model improvise your refund policy.

**Live tool:** https://duncan-haywood.github.io/oss-monorepo/support-agent/

Three parts, all free and MIT:

- **`index.html`**: paste your articles, ask questions, then paste test questions with known answers and see how often the agent would be right, wrong or hand off, and which confidence bar to use. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Chat API, an embeddable chat bubble (`/widget.js`), handoff to your inbox, and an admin page with the gap list.
- **`cli.mjs`**: `ask` and `eval` from the terminal, for CI on your help center.

## Why someone would use this

| Today | Cost / catch | Support Agent |
|---|---|---|
| The AI agents in Intercom, Zendesk, Help Scout, Gorgias | Billed per resolution or per seat on top of the help desk; you can't see why it answered | Your server; every decision says why; no fee per answer |
| A chatbot on a general model with your docs pasted in | Sounds sure when wrong; invents policies, prices and dates | Answers are copied from your article, or a model's wording is rejected unless the article backs every number, link and promise |
| A search box on the help center | Customers don't search; nobody hears about what was missing | A chat that answers, offers articles when unsure, hands off with the transcript, and lists what no article answered |

Honest limits: keyword search with synonyms and typo tolerance, not embeddings, so it misses questions phrased very differently from your articles unless you add past questions. English only for now. No live chat with a person (handoffs go to your inbox). Without past questions the built-in confidence bar is cautious: it offers articles more often than it states answers.

## How it decides

Each question goes through four steps, and the reply says which one fired:

1. **Handoff rules**, before any search: the customer asks for a person, asks for money to move (a refund, money back, a double or unauthorised charge; asking *how* refunds work is fine), mentions legal action or a chargeback, an injury or safety problem, a hacked account, a data deletion or export request, sounds upset (swearing, "scam", capitals), or pastes a card number (Luhn-checked; never echoed) or a social security number.
2. **Search**: BM25 over article passages (split at `##` headings, each passage keeping its heading), with common words dropped, synonyms folded together (a built-in list for support desks plus your own), typos matched, and email addresses and long numbers left out. **Past questions** (`question,label` with label an article slug or `handoff`) vote by similarity: a question like ones an article answered is pointed at that article; one like past questions that needed a person loses confidence.
3. **Confidence**: a logistic model over ten signals (how much of the question the best article covers, the margin over the next one, its share of the score, how many words the knowledge base has never seen, the past-question votes, ...) gives the chance the best article is right. Built-in weights are fitted on BANKING77 training questions; **refit them on your own test questions** (admin page, 30+ questions).
4. **Act**: at or over the **answer bar**, answer: the best passage copied verbatim, with the article cited. Between the **suggest bar** and the answer bar, offer the two best articles with "talk to a person" one click away. Under it, hand off. A one-word question that matches several articles gets a question back.

A model is optional and never decides. With `ANTHROPIC_API_KEY` (or OpenAI, Gemini, any OpenAI-compatible endpoint, or `LLM_PROVIDER=ollama` / `lmstudio` / `llamacpp` on your own machine), the model rewrites an answer the agent already chose, from that article's passages only, and **its text is thrown away** if it cites no passage, or contains a number, link, email address or promise word (refund, credit, guarantee, free of charge, ...) the passages do not. Then the copied answer is sent and the log says why.

## Measured on BANKING77

BANKING77 (PolyAI, CC BY 4.0) is 13,083 real online-banking customer questions labelled with 77 intents. We wrote 22 help articles for a made-up money app (`fixtures/banking77/kb.md`), covering 34 intents; 20 intents that need someone to look at the account (lost cards, double charges, refunds, unrecognised payments, failed transfers) are left uncovered and should be handed off. Everything (the confidence model, the bar, the synonym list) was fitted or tuned on the training split; the table is the dataset's **held-out test split**, 2,160 questions, 1,360 of them answerable.

| Past questions per topic | Answer bar | Answered right | Answered wrong (share of answers) | Offered articles (one right) | Handed off rightly | Handed off, an article had it |
|---|---|---|---|---|---|---|
| none | 0.923 | 65 (3.0%) | 0 (0%) | 1,172 (851) | 565 | 358 |
| 10 | 0.865 | 786 (36.4%) | 39 (4.7%) | 431 (314) | 721 | 183 |
| 40 | 0.787 | 1,007 (46.6%) | 66 (6.2%) | 211 (156) | 742 | 134 |

What it says:

- **Past tickets are the lever.** With 40 labelled past questions per topic, 1,007 of the 1,360 answerable questions (74%) were answered right. Without them, keyword matching alone can't separate "contactless isn't working" (an article) from "my card payment was declined" (a person) at a 5% error cap, so the agent mostly offers articles instead of answering.
- **The bar drifts on unseen questions.** It was chosen on training questions to keep wrong answers at or under 5% of answers; on the test split it came out at 4.7% and 6.2%. Re-run your own test questions after every change, and pick a lower cap than you can live with.
- **Questions that need a person are rarely answered.** Of the 800 uncovered questions, 15 (10 past questions per topic) and 22 (40 per topic) got an answer; the rest were handed off (565 to 742) or offered articles. Most wrong answers are the right kind of question sent to the wrong article (24 and 44).

Reproduce it: `node fixtures/banking77/benchmark.mjs`. How the files were built, what was tuned on what, and how many times the test split was scored: [`fixtures/banking77/README.md`](fixtures/banking77/README.md). On the hand-written coffee-shop sample (`fixtures/`, 86 questions written by the author, so a demo, not evidence) the recommended bar answers 32 right with 1 wrong.

## Run it

```sh
cd ventures/support-agent
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) node server.mjs
```

Open `/admin` (any user name, `ADMIN_KEY` as the password), paste your articles (Markdown separated by `=====`, each starting with `# Title` or front matter with `title`, `slug`, `url`; a Help Keeper JSON export works too), add past questions and test questions, and press **Run and use the recommended bar**. Then put the chat on your site:

```html
<script src="https://your-agent.example.com/widget.js" defer></script>
```

Options on the tag: `data-label="Ask us"`, `data-color="#1f5f8b"`, `data-position="left"`. `/` is a full-page chat you can link to.

From the terminal:

```sh
node cli.mjs ask fixtures/sample-kb.md "how do I cancel my subscription"
node cli.mjs eval fixtures/sample-kb.md fixtures/sample-questions.csv --max-wrong 5
```

Environment: `ADMIN_KEY` (required, 12+ characters), `STATE` (JSON file; keep it on a persistent disk), `PORT`, `PUBLIC_URL`, `TRUST_PROXY=true` behind a proxy, `KNOWLEDGE_FILE` (Markdown to start from; otherwise the coffee-shop sample), `KB_SOURCE_URL` (a [Help Keeper](../help-keeper/) site to import from its `/llms.txt`), `HANDOFF_WEBHOOK_URL` (a [Support Desk](../support-desk/) mailbox's `/in/<token>` URL, or any endpoint taking `{from, fromName, subject, text}` JSON; without it handoffs wait on the admin page), `ALLOWED_ORIGINS` (comma-separated sites that may use the chat; default any), `LOG_DAYS` (default 90), and the model settings above.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. Nothing runs on the author's accounts. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`. Serve it over HTTPS only; the admin uses HTTP Basic auth.

## Files

- `agent.mjs`: knowledge parsing, passages, handoff rules, search, confidence, the decision and the extractive answer. Browser-safe.
- `search.mjs`: BM25 with typo tolerance, a byte-identical copy of `ventures/help-keeper/search.mjs` (the test fails on drift).
- `eval.mjs`, `calibrate.mjs`: scoring a question set at every bar, and fitting the confidence model.
- `model.mjs` + `byok.mjs`: the optional checked rewording; `byok.mjs` is a synced copy of `platform/llm/byok.mjs`.
- `server.mjs`, `store.mjs`, `render.mjs`, `widget.mjs`: the self-hosted server, its state, its pages and the chat bubble.
- `fixtures/`: the coffee-shop sample and the BANKING77 benchmark.

## Privacy

The browser page makes no network request; your articles and questions stay in the tab. Anonymous feature counts stay in your browser's storage and can be switched off in the footer. The server you host stores your articles, the questions customers ask (email addresses and long numbers masked first), what the agent did, and for handoffs the email and name the customer typed. It keeps them `LOG_DAYS` days. With a model configured, the question and the chosen article's passages are sent to the provider you picked (nothing leaves the machine with a local model), so cover that in your privacy notice.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, consumer-protection or professional advice, and it does not replace a person on your support team. **You are responsible for reviewing what it tells your customers** and for your support policies. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use. No uptime or delivery guarantee. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
