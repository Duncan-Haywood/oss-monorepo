# Quick pick

A pairwise-comparison preference engine. You're shown two options and pick one;
after enough picks it knows your preference ordering — including trade-offs you
couldn't state directly if asked.

**Live page:** https://marisstella.app/quick-pick-survey/

## Deploy your own copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDuncan-Haywood%2Foss-monorepo&root-directory=ventures%2Fquick-pick-survey&env=ADMIN_KEY%2CADMIN_SESSION_SECRET&envDescription=Two%20long%20random%20strings%20you%20make%20up%3A%20ADMIN_KEY%20is%20your%20admin%20password%2C%20ADMIN_SESSION_SECRET%20signs%20admin%20cookies.%20Generate%20each%20with%20%60openssl%20rand%20-hex%2032%60.&envLink=https%3A%2F%2Fgithub.com%2FDuncan-Haywood%2Foss-monorepo%2Ftree%2Fmain%2Fventures%2Fquick-pick-survey%23deploy-your-own-copy&project-name=quick-pick-survey&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)

You run your own copy, in your own Vercel account, with your own database.
Nothing passes through the author, and no hosted instance is promised.

1. **Click the button.** Vercel copies this venture's folder
   (`ventures/quick-pick-survey` of this repository) into a repo in your
   account and asks you to connect a Postgres database (Vercel injects
   `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` for you).
2. **Enter the two secrets.** Make each one up; they never leave your project:

   ```bash
   openssl rand -hex 32   # ADMIN_KEY: your admin password
   openssl rand -hex 32   # ADMIN_SESSION_SECRET: signs admin cookies
   ```

3. **Deploy.** The build runs `prisma migrate deploy` then seeds the surveys,
   so the schema and content are in place before the first request. Both
   steps are idempotent and safe on every deploy.

Not on Vercel? Any host that runs Next.js with a Postgres database works: set
the four variables above, then run the build command in `vercel.json`.

**You become the operator.** You are responsible for your copy's domain,
privacy policy, terms and respondents. See
[docs/DATA-COLLECTION.md](docs/DATA-COLLECTION.md) for what the app stores,
and keep the disclaimer below accurate for your use.

**Disclaimer.** A ranking inferred from a small number of picks is a
statistical estimate, not a fact about a person; don't use it as the sole basis
for a hiring, financial, medical or relationship decision. This software is
provided free and as-is, without warranty of any kind. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use. MIT licensed ([LICENSE](LICENSE)).

If this saves you money or time, you can
[sponsor the creator](https://github.com/sponsors/Duncan-Haywood).

## Running locally

Needs a local Postgres. The quickest way to one, on a laptop or in an agent
sandbox, is the script the integration tests use:

```bash
scripts/test-db.sh start      # initdb, start, migrate, seed — idempotent
scripts/test-db.sh env        # the export lines, if you want them in a shell
scripts/test-db.sh stop
```

It finds the server binaries when only `psql` is on `PATH`, and drops to the
`postgres` system user when run as root. Or do it by hand, with Homebrew's:

```bash
initdb -D ./pgdata -U postgres -A trust
pg_ctl -D ./pgdata -o "-p 5544 -h 127.0.0.1 -c unix_socket_directories=" start
createdb -h 127.0.0.1 -p 5544 -U postgres surveysite
```

Create `.env` (gitignored):

```
POSTGRES_PRISMA_URL="postgresql://postgres@127.0.0.1:5544/surveysite?schema=public"
POSTGRES_URL_NON_POOLING="postgresql://postgres@127.0.0.1:5544/surveysite?schema=public"
ADMIN_KEY="anything-for-local"
ADMIN_SESSION_SECRET="anything-for-local"
```

Then:

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Use `npx prisma db seed` rather than `npx tsx prisma/seed.ts` directly — the
Prisma CLI loads `.env`, plain `tsx` does not, and the seed script fails with
"Environment variable not found: POSTGRES_PRISMA_URL" if it is run bare.

## Before you commit

```bash
npm run verify            # typecheck → lint → test → build; needs nothing running

scripts/test-db.sh start  # and, if the change touches a route or the schema:
npm run test:integration  # the real handlers against a real Postgres
```

`.github/workflows/ci.yml` is configured to run the same four gates plus a
migration-parity check on every push and pull request, but **it has never
actually run**: every run since it was added fails in about three seconds with
no steps and no logs, which is a runner that was never allocated rather than a
gate that failed. Until that is sorted out, the command above is the whole of
the enforcement — see [docs/QUALITY-BAR.md](docs/QUALITY-BAR.md).

## How it works

**Discrete items** (activities, professions) use **Glicko-2** — the chess-style rating system
designed by Mark Glickman. Each item carries a rating plus a rating deviation, so every
ranking comes with a real confidence interval. Ratings are stored **per respondent**:
one person's answers can never move another's ranking.

**Continuous attributes** (income, net worth, upside, hours) don't fit a discrete
rating system, so they use a **Davidson tie-extended Bradley-Terry model** — a
paired-comparison logit with an explicit "too close to call" outcome — fit by
Newton-Raphson with a numerically estimated Hessian for the confidence intervals.
Every financial pair is a guaranteed non-dominated two-attribute trade-off, so no
question is ever "the same but one is just better".

**Question selection** adapts: it favours items the model is least sure about, pairs
items with close ratings (a near-toss-up is the most informative comparison),
balances coverage, avoids recent repeats, and randomises which option lands on top
so screen position can't bias the result. It also runs **coarse-to-fine** — early
questions cross categories to fix the broad shape fast, later ones stay within a
category where the hard discriminations are.

**Perspectives.** The same content is rated under three framings that never share
state: what you want for yourself, what you want in a partner, and what you *think*
your partner wants. Comparing the last two across a linked couple is the sharpest
output — not what you each want, but where you're wrong about each other.

## How this gets built

[developmentprocess.tsx](developmentprocess.tsx) is the front door — goals,
principles, the loop a change goes through, the gates, and what "done" means.
It is typed data guarded by a test, so it cannot drift from what is enforced.

- [docs/PRODUCT-GOALS.md](docs/PRODUCT-GOALS.md) — what the app is for, and what it is not
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the measurement works, and where the risk is
- [docs/DATA-COLLECTION.md](docs/DATA-COLLECTION.md) — everything stored about a person, and what a partner can see
- [docs/SCREENS.md](docs/SCREENS.md) — every screen, what it fetches, and what it does when that fails
- [docs/QUALITY-BAR.md](docs/QUALITY-BAR.md) — the gates and the definition of done
- [docs/CONVERGENCE.md](docs/CONVERGENCE.md) — how many answers a usable result actually costs
- [docs/POOLING.md](docs/POOLING.md) — the largest available precision win, measured, and why it is not taken
- [docs/REAL-RANKINGS.md](docs/REAL-RANKINGS.md) — the survey replayed on real people's published rankings: people, not answers, are the limit; the rank ranges are honest but wide; the insights card's clear pick and "it's between" list are honest on real people too (wrong 5 of 860, set holds 97-100%), but only the staged question order lets the card name a favourite (2026-11-12)
- [docs/TESTING.md](docs/TESTING.md) — what is covered, what is not, how to add
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — what a test enforces, what was only read in the markup, and what nobody has checked
- [docs/decisions/](docs/decisions/) — why an obvious simplification was rejected

## Known gaps

See [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md) — the live backlog, ordered by
priority, with effort estimates and a record of what has already been closed.
The two largest open items both need the account owner rather than more code:
a queue of unmerged pull requests, and GitHub Actions never allocating a
runner. Every API route now has a test; the remaining coverage gap is the page
components, and below that the thing no suite can settle — somebody reading
what two linked accounts actually produce on screen.

## Build your own survey (API)

Signed in as admin, `POST /api/admin/surveys` with `{"title": "...", "items": "one option per line"}`
(or `Category | Option` lines, or an array) creates a survey shared at `/s/<slug>` (3-60 options).
`GET /api/admin/surveys/<slug>/ranking` returns the pooled ranking; add `?format=csv` to download it.
Each item carries a 95% interval from a random-effects pool of the respondents' Glicko-2 ratings
(so disagreement widens it) and a best/worst rank range: items whose intervals overlap share a range
rather than being ordered by noise. Respondents who clicked one screen position regardless
of the options (first-slot share at or beyond 70% either way over 30+ answers; slots are shuffled
per pair) are left out of the pool, and `leftOut` says how many. The response also carries `agreement`: each respondent's
ratings are rank-correlated with everyone else's pool (leave one out), and when 5 or more could
be scored and any fall under 0.2, a note says how many (shown in the builder and the report).
It is a data-quality note, never a weight: careless clicking by something other than the
question (a familiar name, a short label) moves the pool and makes it confidently wrong, but a
group with a genuinely different taste scores just as low, and down-weighting would quiet it
(docs/INFORMATION-GAIN-SELECTOR.md, "Careless patterns that are not random").
Answer times break that tie when they can: the response's `pace` field compares each
respondent's median time per pick (`Trial.msToAnswer`, 10+ timed answers, 5+ respondents)
with the panel's, counts those under half the typical time, and says how many of the
out-of-step respondents were among them. Fast and out of step looks like careless clicking;
out of step at a normal pace looks like a different taste. `?drop=fast` (the builder's "Rank
without the fast answerers" button) returns the ranking without them for comparison; the
default ranking still counts them, because dropping fast people cost up to 0.019 Spearman in
the sweep's widest-spread panels where careless people were no faster than anyone else
(docs/INFORMATION-GAIN-SELECTOR.md, "Answer times: telling a careless block from a camp").
Logic and tests: `src/lib/surveyBuilder.ts`, `src/lib/groupRanking.ts`.

**A person's own results** (`/api/insights`) refit all of that person's answers at once
(`src/lib/btRefit.ts`: Bradley-Terry with a Glicko-scale prior, Laplace posterior) rather than
reporting the stored one-answer-at-a-time Glicko states, whose 95% intervals held for about 90%
of pairs under the staged selector (refit: 95% at the same width). The top and bottom pick are
called clear only when they beat every other item by 1.645 sd of the difference
(`src/lib/clearPick.ts`); the old "ahead by half its rd" rule named the wrong favourite in more
than half of its claims on synthetic respondents. When no pick is clear, the card lists who it
is between: a 95% credible set for the favourite (`src/lib/favouriteSet.ts`), drawn since
2026-11-12 from a second refit whose prior sd is estimated from the person's own answers
(empirical Bayes on importance-sampled evidence, `empiricalPriorPhi`; the Laplace evidence fails
under the staged selector). It holds the true favourite for 93-96% of synthetic respondents shown
the card (90-95% with careless answers), against 88-92% (76-83%) with the fixed prior and 68-74%
for the three highest-rated items, at the cost of longer lists (about 7.5-8.7 names against 5-6).
Since the latest 2026-11-12 change, each survey also stores a prior sd pooled over its 40 most recent
respondents (`src/lib/surveyPrior.ts`, refreshed after the response once answers grow by a quarter),
and the set uses the narrower of the person's and the survey's: in a synthetic survey mixing spreads
and careless answers that held the favourite for 95.4-96.4% (own alone 92.2-94.3%), where the pooled
value alone dropped to 83-92% for people whose likes are close together.
The ratings, intervals and clear-pick rule keep the fixed prior: the estimated one makes pairwise
intervals undercover. The stored states still drive question
selection and the couple screen. Measurements: docs/INFORMATION-GAIN-SELECTOR.md, "Per-person
intervals from a refit", "The clear-top-pick claim", "Who it's between", "An empirical-Bayes
prior" and "A stored survey prior" (2026-11-12).
