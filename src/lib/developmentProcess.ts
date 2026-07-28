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

/** `npm run verify` runs all of these. CI runs the same command. */
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
    id: "data-integrity",
    title: "Per-person, per-perspective data integrity",
    priority: "P0",
    status: "in-progress",
    goal: "each-persons-own",
    note:
      "Ratings are per participant and the perspectives no longer collapse into each other. Remaining: rate limiting on anonymous session creation, and origin checks on the mutating routes.",
  },
  {
    id: "privacy",
    title: "Nothing personal in the repo or the bundle",
    priority: "P0",
    status: "in-progress",
    goal: "safe-to-hand-over",
    note:
      "Prefill removed and noindex set app-wide. Remaining: the intro form asks for sex, age and ethnicity with no consent line and no privacy link anywhere a signed-out person would see it.",
  },
  {
    id: "resilience",
    title: "Survive a phone on bad signal",
    priority: "P1",
    status: "in-progress",
    goal: "worth-continuing",
    note:
      "Retry affordance and 409-as-success are in. Remaining: the runner's bootstrap still mirrors storage into state inside an effect.",
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
    id: "couples-output",
    title: "The couple screen earns the second person's time",
    priority: "P2",
    status: "in-progress",
    goal: "couples-payoff",
    note:
      "Fit, mirror, blind spots, shared ground and asymmetries all render. Blind spots only has data now that PARTNER_GUESS is recorded, so it needs a real look with real answers.",
  },
  {
    id: "observability",
    title: "Know when it breaks",
    priority: "P2",
    status: "next",
    goal: "measure-honestly",
    note:
      "Error boundaries exist; the remaining routes need consistent try/catch and one structured log line per failure. A silent failure is indistinguishable from a number that is simply wrong.",
  },
  {
    id: "accessibility",
    title: "Usable with a screen reader and without motion",
    priority: "P3",
    status: "later",
    goal: "worth-continuing",
    note:
      "Progress bars need roles and values, errors need aria-live, the Persian copy needs lang/dir, and the flying cards need a prefers-reduced-motion opt-out.",
  },
];
