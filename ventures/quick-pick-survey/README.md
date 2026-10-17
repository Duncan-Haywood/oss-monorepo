# Quick pick

A pairwise-comparison preference engine. You're shown two options and pick one;
after enough picks it knows your preference ordering — including trade-offs you
couldn't state directly if asked.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/quick-pick-survey/

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
- [docs/DATA-COLLECTION.md](docs/DATA-COLLECTION.md) — everything stored about a person, and what a partner can see
- [docs/SCREENS.md](docs/SCREENS.md) — every screen, what it fetches, and what it does when that fails
- [docs/QUALITY-BAR.md](docs/QUALITY-BAR.md) — the gates and the definition of done
- [docs/CONVERGENCE.md](docs/CONVERGENCE.md) — how many answers a usable result actually costs
- [docs/POOLING.md](docs/POOLING.md) — the largest available precision win, measured, and why it is not taken
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
