# Quick pick

A pairwise-comparison preference engine. You're shown two options and pick one;
after enough picks it knows your preference ordering — including trade-offs you
couldn't state directly if asked.

## Deploying

The repo is at `Duncan-Haywood/quick-pick-survey` (private).

1. **Import the project.** Vercel dashboard → Add New → Project → import
   `Duncan-Haywood/quick-pick-survey`. Framework auto-detects as Next.js; leave the
   build command alone (`vercel.json` sets it).
2. **Attach a database.** In the project → Storage → Create Database → Postgres.
   Vercel injects `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` automatically.
3. **Add the two secrets** from `~/Desktop/quick-pick-secrets.txt` as Environment
   Variables (all environments):
   - `ADMIN_KEY`
   - `ADMIN_SESSION_SECRET`
4. **Redeploy.** The build runs `prisma migrate deploy` then seeds the surveys, so
   the schema and content are in place before the app serves a request. Both steps
   are idempotent and safe on every deploy.

## Running locally

Needs a local Postgres. With Homebrew's:

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
npm run verify   # typecheck → lint → test → build
```

CI runs the same four gates plus a migration-parity check on every push and
pull request.

## How it works

**Discrete items** (activities, professions) use **Glicko-2** — the system chess.com's
ratings are built on. Each item carries a rating plus a rating deviation, so every
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
- [docs/QUALITY-BAR.md](docs/QUALITY-BAR.md) — the gates and the definition of done
- [docs/TESTING.md](docs/TESTING.md) — what is covered, what is not, how to add

## Known gaps

See [IMPROVEMENT-PLAN.md](IMPROVEMENT-PLAN.md) — the live backlog, ordered by
priority, with effort estimates and a record of what has already been closed.
The largest open items are rate limiting on anonymous session creation, a
consent notice on the intro form, and integration tests for the API routes.
