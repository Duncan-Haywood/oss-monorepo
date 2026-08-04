/**
 * The development process for Quick pick, as data rather than prose.
 *
 * It lives in the repo, in TypeScript, for the same reason the survey
 * content does: a document that can be imported and asserted against is a
 * document that cannot quietly rot. `developmentProcess.test.ts` checks its
 * invariants on every run, and `developmentprocess.tsx` renders it.
 *
 * The narrative versions live in `docs/`. This is the canonical structure;
 * where the two disagree, this file wins.
 */

export type Priority = "P0" | "P1" | "P2" | "P3";

export const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

/** What each priority actually commits you to. Vague levels get ignored. */
export const PRIORITY_MEANING: Record<Priority, string> = {
  P0: "The data or the people in it are at risk. Nothing else ships until this does.",
  P1: "It will mislead someone or break under ordinary use. Fix before the next round of real users.",
  P2: "A promise the app makes but does not keep yet.",
  P3: "Polish. Real, but nobody is harmed by waiting.",
};

export type Goal = {
  id: string;
  /** Stated in terms of what a couple gets, never in terms of a feature. */
  statement: string;
  /** How you would know it is being met. */
  signal: string;
};

/**
 * The point of the app. Everything below is downstream of these — a change
 * that serves none of them is a change that needs justifying.
 */
export const GOALS: Goal[] = [
  {
    id: "measure-honestly",
    statement:
      "Measure what someone actually prefers, including trade-offs they could not state if asked directly.",
    signal:
      "Rankings come with real confidence intervals, and the intervals narrow as answers accumulate rather than being asserted.",
  },
  {
    id: "each-persons-own",
    statement: "Keep each person's answers unambiguously their own.",
    signal:
      "No path exists by which one person's answer moves another person's ranking, or by which two perspectives merge into one.",
  },
  {
    id: "couples-payoff",
    statement:
      "Give a couple something usable about each other that they did not already know — not a score, a thing to do or talk about.",
    signal:
      "The couple screen leads with actions and shared ground, and blind spots are drawn from the guess-vs-reality comparison.",
  },
  {
    id: "worth-continuing",
    statement: "Make it worth answering the next question.",
    signal:
      "Something new is unlocked on a schedule the person can feel, and progress survives a refresh, a new device, and a mode switch.",
  },
  {
    id: "safe-to-hand-over",
    statement: "Be safe to hand to someone you love.",
    signal:
      "No personal data in the client bundle or the repo, consent stated before anything is collected, and nothing indexable.",
  },
  {
    id: "broad-topic-scope",
    statement:
      "Cover a broad range of personal and relational topics—including professions and standard & non-standard hobbies—using multi-dimensional pairwise measurement to derive couple insights.",
    signal:
      "Users can choose specific topics via /topics, and questions measure diverse relational and personal traits without restricting measurement to a single metric.",
  },
];

export type Principle = {
  id: string;
  title: string;
  /** The reasoning, not the rule. A rule without its reason gets misapplied. */
  why: string;
};

export const PRINCIPLES: Principle[] = [
  {
    id: "correctness-before-surface",
    title: "A wrong number is worse than a missing one",
    why:
      "The app's entire value is that its output can be believed. A confident ranking built on mixed or coerced data does more damage than an empty screen, because nobody goes back and checks.",
  },
  {
    id: "pure-core",
    title: "Keep the maths pure and injectable",
    why:
      "Glicko-2, the conjoint fitter, the pairing chooser and the trade-off generator all take an explicit RNG and no I/O. That is why they can be tested at all; a sign error in the volatility solver is otherwise invisible forever.",
  },
  {
    id: "one-source-per-fact",
    title: "One home per fact",
    why:
      "The three perspectives were declared in three files and drifted; the session bundle was parsed four different ways. Duplication of a definition is a bug with a delay on it.",
  },
  {
    id: "validate-at-the-edge",
    title: "Narrow untrusted input where it enters, once",
    why:
      "Request bodies and localStorage are both attacker-controlled. Coercing an unknown value to a plausible default is how PARTNER_GUESS silently became PARTNER for every session that used it.",
  },
  {
    id: "explain-in-place",
    title: "Comments say why, never what",
    why:
      "The non-obvious decisions here — staged domains, coarse-to-fine pairing, rd thresholds before showing advice — all look arbitrary without their reason, and the next person to touch them will 'simplify' them out.",
  },
  {
    id: "regression-per-bug",
    title: "Every bug fixed leaves a test behind",
    why:
      "The interesting bugs in this codebase are silent: nothing throws, a number is just quietly wrong. A test naming the old behaviour is the only thing that stops it coming back.",
  },
  {
    id: "couples-first",
    title: "Judge features by what they give a couple",
    why:
      "A better ranking of professions is interesting. 'They would rather you took something off their plate than bought them something' is usable tonight. When the two compete, the second wins.",
  },
  {
    id: "never-compare-raw-scales",
    title: "Two people's numbers are not on the same scale",
    why:
      "Glicko ratings are stored per respondent, so their spread tracks how much someone answered, not how much they care. Subtracting one person's rating from another's measured swipe volume and called it a difference in values. Anything crossing between two people goes through a within-person position first.",
  },
  {
    id: "carry-the-error-bars",
    title: "A number that ignores its own error bars is not a measurement",
    why:
      "Every stored rating is an estimate and `rd` is its standard deviation, so any figure computed from ratings inherits that uncertainty whether or not the code mentions it. The couple screen reported a Spearman correlation straight from the ratings, which shrinks it toward zero in exact proportion to the noise: simulated at the deviations this app actually reaches, two people with identical preferences were reported at 0.14 and two with opposite preferences at -0.18, so every couple was shown roughly the same score no matter what was true. Worse, the difference lists sorted by the largest gap, which selects for whichever items had the widest error bars. Anything shown to a couple has to clear its own uncertainty first — and when many items are examined at once, clear a bar raised for the number of chances there were to be fooled.",
  },
  {
    id: "absence-is-a-claim",
    title: "A section that renders nothing still says something",
    why:
      "Gating output on confidence is right, but hiding the gated section is not: the couple screen dropped the four things a couple could act on and read as though they did not exist, so ninety answers bought a screen that looked finished and was half missing. Whenever output is withheld, say that it is being withheld, what it is waiting for, and how far off it is — otherwise the honest threshold reads as an empty promise.",
  },
  {
    id: "gates-need-headroom",
    title: "A gate that only passes on a fast machine has already failed",
    why:
      "The blocking suite failed on the branch everything else is stacked on, because one measurement sweep ran 5.1 seconds against a 5-second default timeout. Nothing was wrong with the code it tested; the gate was simply sized to the machine that happened to write it. A check that sits within a few percent of its own limit reports the load on the box, not the health of the change — and the first person it fails is the one who did nothing wrong, who then learns to re-run it until it passes. Make the work smaller when you can, and leave the margin wide enough that only a real regression closes it.",
  },
  {
    id: "land-the-work",
    title: "Work that does not land does not count",
    why:
      "This repo is worked on mostly by scheduled sessions that cannot see each other. Nine of them once opened nine branches off the same commit, each rediscovering the same lint errors and the same conjoint bug, and none of it merged. Read the open pull requests before starting, and build on what is already there instead of beside it.",
  },
];

export type Stage = {
  id: string;
  title: string;
  /** What actually happens in this stage. */
  work: string;
  /** Conditions that must hold before moving on. */
  exit: string[];
};

/** The loop a single change goes through, start to finish. */
export const STAGES: Stage[] = [
  {
    id: "orient",
    title: "Orient",
    work:
      "List the open pull requests and read what they already do. Sessions here run unattended and in parallel, so the most likely reason a bug is still in main is that three branches already fix it and none of them merged. Extend the strongest branch rather than opening a tenth.",
    exit: [
      "Every open pull request has been read, not just counted.",
      "The change is either new work or an explicit consolidation of existing branches.",
    ],
  },
  {
    id: "frame",
    title: "Frame",
    work:
      "Say which goal the change serves and what would count as it working. If it serves none, say so and stop.",
    exit: [
      "The change names a goal id from GOALS.",
      "The observable difference is written down before any code.",
    ],
  },
  {
    id: "read",
    title: "Read first",
    work:
      "Read the code the change touches and the framework docs for the APIs involved. This project pins a Next.js whose conventions differ from what a model is likely to assume, so the local docs under node_modules/next/dist/docs are the authority.",
    exit: [
      "The existing behaviour is understood well enough to describe it.",
      "Framework APIs used were checked against the pinned version's docs, not recalled.",
    ],
  },
  {
    id: "build",
    title: "Build the smallest honest version",
    work:
      "Change the fewest files that fully solve the stated problem. Match the surrounding style. Leave the reasoning in a comment wherever the code looks arbitrary without it.",
    exit: [
      "No partial fix is left behind a plausible-looking default.",
      "Anything deliberately left undone is written into IMPROVEMENT-PLAN.md, not just omitted.",
    ],
  },
  {
    id: "prove",
    title: "Prove it",
    work:
      "Add the test that would have failed before. For numerical code, prefer a property that must hold over an example that happens to.",
    exit: [
      "A new test fails against the old code.",
      "Every quality gate passes locally.",
    ],
  },
  {
    id: "record",
    title: "Record it",
    work:
      "Commit with a message that says what changed and why it mattered. Update the docs that are now wrong — a stale plan is worse than no plan, because it gets trusted.",
    exit: [
      "IMPROVEMENT-PLAN.md reflects reality, including items this change closed.",
      "README/docs claims still match what the code does.",
    ],
  },
];

export type Gate = {
  id: string;
  command: string;
  /** What it protects against, concretely. */
  catches: string;
  /** True if a failure blocks the change from landing. */
  blocking: boolean;
};

/**
 * `npm run verify` runs the fast gates. Repository-root Pairwise CI also runs
 * the real-database and migration-parity gates; repository runners are
 * allocating, but a completed Pairwise run is still required before claiming
 * this workflow is green. See docs/QUALITY-BAR.md.
 */
export const GATES: Gate[] = [
  {
    id: "typecheck",
    command: "npm run typecheck",
    catches:
      "Shape drift between the Prisma models, the API responses, and the components that read them — the most common way a rename half-lands.",
    blocking: true,
  },
  {
    id: "lint",
    command: "npm run lint",
    catches:
      "React state and effect misuse, and unused code left over from a partial edit. Suppressions are allowed but must carry the reason on the line above.",
    blocking: true,
  },
  {
    id: "test",
    command: "npm test",
    catches:
      "Regressions in the numerical core and in the contracts between the catalogue, the session bundle and the perspectives.",
    blocking: true,
  },
  {
    id: "build",
    command: "npm run build",
    catches:
      "Server/client boundary mistakes and route configuration errors that only appear when the app is actually compiled.",
    blocking: true,
  },
  {
    id: "integration",
    command: "npm run test:integration",
    catches:
      "Everything that is a claim about the database rather than about the handler: the transactional claim on an answer, a resent answer applying twice, one person's ratings leaking into another's, the invite that must be claimable once, and whether a partner's raw answers can cross to the other side. Needs a database — `scripts/test-db.sh start` creates one anywhere the Postgres binaries exist, including an agent sandbox. Required for any change touching a route handler, a query, or the schema.",
    blocking: false,
  },
  {
    id: "migration-parity",
    command: "npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $POSTGRES_URL_NON_POOLING --exit-code",
    catches:
      "A schema edit with no migration behind it, which deploys cleanly and then fails on the first query. Needs a database, so it runs before deploy rather than on every commit.",
    blocking: false,
  },
];

export type DoneCheck = {
  id: string;
  check: string;
  /** Which goal or principle this check is defending. */
  defends: string;
};

/** Read this list before saying a change is finished. */
export const DEFINITION_OF_DONE: DoneCheck[] = [
  {
    id: "gates-green",
    check: "Every blocking gate passes.",
    defends: "correctness-before-surface",
  },
  {
    id: "regression-test",
    check: "A test exists that fails on the old behaviour.",
    defends: "regression-per-bug",
  },
  {
    id: "gates-green-with-margin",
    check:
      "The blocking gates passed on the first run, not the third, and no test finished within a few percent of its own time limit.",
    defends: "gates-need-headroom",
  },
  {
    id: "no-new-pii",
    check: "No personal data was added to the repo, a seed file, or the client bundle.",
    defends: "safe-to-hand-over",
  },
  {
    id: "perspectives-separate",
    check:
      "Nothing merges two perspectives, and no code path lets one person's answer move another person's rating.",
    defends: "each-persons-own",
  },
  {
    id: "input-narrowed",
    check:
      "Any new value read from a request body or from storage is narrowed by a parser that rejects, rather than coerced to a default.",
    defends: "validate-at-the-edge",
  },
  {
    id: "docs-true",
    check: "Every document the change made wrong has been corrected in the same commit.",
    defends: "one-source-per-fact",
  },
  {
    id: "database-claims-tested",
    check:
      "A change to a route handler, a query, or the schema has been run against a real database, and the behaviour that made it worth changing is asserted there.",
    defends: "correctness-before-surface",
  },
  {
    id: "failure-visible",
    check:
      "New failure modes surface to the person as something recoverable — a retry, not a dead end — and to the server log as something searchable.",
    defends: "worth-continuing",
  },
];

export type Workstream = {
  id: string;
  title: string;
  priority: Priority;
  status: "done" | "in-progress" | "next" | "later";
  /** Which goal it moves. */
  goal: string;
  note: string;
};

/**
 * The standing shape of the work. Individual items live in
 * IMPROVEMENT-PLAN.md; this is the map they hang off, so that a plan item
 * can always be traced back to a goal.
 */
export const WORKSTREAMS: Workstream[] = [
  {
    id: "land-work",
    title: "Get finished work merged",
    priority: "P0",
    status: "in-progress",
    goal: "measure-honestly",
    note:
      "Thirty-seven parallel unattended sessions have opened thirty-seven branches off one commit and none has merged, so each new session re-finds the same bugs. The distinct fixes are consolidated onto one branch and later sessions extend it rather than opening another beside it — which works, and is not the constraint. Only the account owner can merge, so a run that finds the pile unmerged should notify them at the start rather than adding to it. Every disposition is in docs/PULL-REQUEST-BACKLOG.md: one merge, then thirty-odd closes, and none of them loses anything. Closing them is not free either — #35 sat in the queue for hours holding a real unauthenticated read of any account-linked participant's ranking, which no other branch had.",
  },
  {
    id: "data-integrity",
    title: "Per-person, per-perspective data integrity",
    priority: "P0",
    status: "in-progress",
    goal: "each-persons-own",
    note:
      "Ratings are per participant, the perspectives no longer collapse into each other, and every mutating route sits behind an origin check in src/proxy.ts. Every anonymous write is now bounded per IP by one shared limiter — feedback and report were the two that were not, having been recorded in docs/ROUTES.md as account-only when neither has ever required an account. Reading a participant out now requires owning it, unless it is anonymous and the id is all it has. Remaining: the columns still on Participant from the deleted intro form, which only the account owner can decide to drop.",
  },
  {
    id: "privacy",
    title: "Nothing personal in the repo or the bundle",
    priority: "P0",
    status: "in-progress",
    goal: "safe-to-hand-over",
    note:
      "Prefill removed and noindex set app-wide. The intro form that asked for sex, age and ethnicity is gone, and session/start no longer accepts those fields, so there is no longer any route by which special-category data can enter the database. Both remaining collection points — signup, and starting to answer signed out — now say what is stored and link the policy. Every field is inventoried in docs/DATA-COLLECTION.md. Remaining: the columns still exist on Participant holding whatever was written before the form was removed; dropping them is the account owner's call.",
  },
  {
    id: "resilience",
    title: "Survive a phone on bad signal",
    priority: "P1",
    status: "in-progress",
    goal: "worth-continuing",
    note:
      "The runner reads storage through useSyncExternalStore rather than an effect, opens on a domain instead of choosing one mid-fetch (which used to burn a question on every resume), retries a failed or dropped next-question fetch, and treats a 409 on an answer as already recorded. Every screen that loads over the network now recovers the same way, which reading them into one column in docs/SCREENS.md is what found: the admin portal had a 500 path that rendered no error at all and a rejected fetch it never caught, and the couple and insights screens offered a link back to the cards instead of a retry. All four are driven by tests against a stubbed fetch.",
  },
  {
    id: "model-cost",
    title: "Keep the fit from getting slower forever",
    priority: "P1",
    status: "next",
    goal: "measure-honestly",
    note:
      "Refit on a threshold rather than every answer, and use a relative gradient tolerance so convergence stays reachable as N grows.",
  },
  {
    id: "convergence",
    title: "Reach a usable confidence inside a session someone will sit through",
    priority: "P1",
    status: "in-progress",
    goal: "measure-honestly",
    note:
      "Spreading a fixed answer budget evenly over 220 items meant the combined survey had zero items under rd 150 after 300 answers, so every gate on the couple screen was unreachable by construction. Pair selection now deepens a core of 14 before broadening, which gets that to roughly 34 — enough to say something true, and not a ranking of 220 items. Measured by a simulation calibrated against two real accounts; see docs/CONVERGENCE.md. Both ways of asking BETTER questions are now measured and closed: pooling the estimates manufactures the bias the blind-spots screen exists to detect (decisions/0006), and using other perspectives to pick questions moves nothing even when the prior knows the truth exactly (decisions/0007). What remains is asking fewer questions -- shrink the combined survey -- or promising less up front, and both are the account owner's call.",
  },
  {
    id: "couples-output",
    title: "The couple screen earns the second person's time",
    priority: "P2",
    status: "in-progress",
    goal: "couples-payoff",
    note:
      "Cross-person comparisons go through within-person percentile positions, so a partner who answered less can no longer look like they want nothing. The four actionable sections no longer vanish when they are below their confidence floor: they say who is still answering and how far there is to go. Two linked accounts answering through the real routes now show the screen opening at roughly fifty answers each on a 16-item survey, with 'something to do for them' full at thirty — measured, not inferred, in earned.integration.test.ts. Blind spots only has data now that PARTNER_GUESS is recorded, so it still needs a real look with two accounts filled in.",
  },
  {
    id: "observability",
    title: "Know when it breaks",
    priority: "P2",
    status: "done",
    goal: "measure-honestly",
    note:
      "Error boundaries exist, and every API route now catches its own failures and logs them rather than throwing past the handler. A silent failure is indistinguishable from a number that is simply wrong. Every route in docs/ROUTES.md now has a test, most of them against a real Postgres: the swipe loop, session start, the couple link, the financial and conjoined cards, the admin portal, the two free-text writers, and the participant-ownership rule. The screens have caught up: the admin portal, the profile switcher, the couple screen and insights are all driven by tests now, and docs/SCREENS.md is the table that says which of them recovers from what, guarded against drift the way ROUTES.md is. The root-layout boundary also logs the error it had been discarding. What is left is the half a passing suite cannot reach — somebody reading what two real accounts actually produce, in a browser.",
  },
  {
    id: "accessibility",
    title: "Usable with a screen reader and without motion",
    priority: "P3",
    status: "in-progress",
    goal: "worth-continuing",
    note:
      "Progress bars carry roles and values, errors announce, the Persian copy carries lang/dir, decorative emoji are hidden, and the card animations honour prefers-reduced-motion. Contrast is now computed rather than eyeballed: contrastAudit.test.ts reads every class list in the app, resolves each colour against the palette Tailwind actually ships, and fails below the WCAG AA floor. It found seventy-two failures on its first run — thirty of them the same 2.58:1 grey, which is what reading colour by eye does: each label looked fine beside the ones next to it because they were all the same wrong grey. Remaining: a pass with an actual screen reader, and the things no class list can answer — focus visibility, and colour used as the only cue. See docs/ACCESSIBILITY.md.",
  },
  {
    id: "topic-selection-and-range",
    title: "Broad topic selection & non-standard hobbies",
    priority: "P2",
    status: "done",
    goal: "broad-topic-scope",
    note:
      "Added non-standard hobbies (modular synths, urban exploration, falconry, mycology, etc.) to activities and created a dedicated Topic Picker screen (/topics) for selecting specific survey domains.",
  },
];
