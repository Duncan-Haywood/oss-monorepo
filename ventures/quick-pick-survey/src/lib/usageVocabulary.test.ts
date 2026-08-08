import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { USAGE_EVENTS } from "@/lib/usage";

/**
 * usageVocabulary.test.ts — holds the telemetry vocabulary to telemetry that
 * is actually emitted.
 *
 * On 2026-08-06 seven of the twenty-one names in `USAGE_EVENTS` had no emitter
 * anywhere in the application: `insight_view`, `couple_invite_created`,
 * `couple_joined`, `card_shared`, `insight_shared`, `streak_milestone` and
 * `retention_return_visit`. The server accepted all seven, `usage.test.ts`
 * asserted under the title "accepts viral and retention telemetry events" that
 * it did, and no row of any of them had ever been written, because nothing
 * called `recordUsage` with them.
 *
 * Two consequences, and the second is why this file exists rather than a
 * comment. `insight_view` is a step in the operator dashboard's funnel
 * (`src/app/api/admin/overview/route.ts`) and the far end of its
 * `answer_save -> insight_view` transition, so the dashboard drew a funnel
 * whose last step was structurally zero and a median time-to-insight over
 * n = 0 — an operator reading a real number where there was no measurement.
 * And the referral loop the couples tier is built on — invite created, invite
 * joined, card shared — had no denominator at all, which is the input a
 * pricing decision on that tier needs.
 *
 * The rule enforced here, in both directions:
 *
 *  1. every name in the vocabulary is emitted somewhere in the application, or
 *     is registered below with an owner, a reason, an expiry, and a *predicate*
 *     — a fact about the source that must still hold for the reason to be true;
 *  2. a registered name that has since gained an emitter fails, because a
 *     stale registration is a hole rather than a no-op;
 *  3. every event the operator dashboard consumes has an emitter, so no funnel
 *     step or transition can be displayed that nothing is able to populate.
 *
 * The predicate is the part worth keeping. A prose reason goes false silently
 * (see the register drift in `docs/EXCEPTION-REGISTER.md`); a predicate that
 * reads the source goes red.
 *
 * Modelled on `src/lib/pricingClaims.test.ts`, which enforces the same
 * registered-and-still-true shape over the pricing page's capability claims.
 */

const VENTURE = process.cwd();
const SRC = join(VENTURE, "src");

function isApplicationSource(path: string): boolean {
  if (!/\.tsx?$/.test(path)) return false;
  if (/\.test\.tsx?$/.test(path)) return false;
  return !relative(SRC, path).startsWith("test/");
}

function applicationSources(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return applicationSources(full);
    return isApplicationSource(full) ? [full] : [];
  });
}

const SOURCES = applicationSources();

/** event name -> the files that call `recordUsage` with it. */
const EMITTERS: Map<string, string[]> = (() => {
  const found = new Map<string, string[]>();
  for (const file of SOURCES) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/recordUsage\(\s*"([a-z_]+)"/g)) {
      const rows = found.get(match[1]) ?? [];
      rows.push(relative(VENTURE, file));
      found.set(match[1], rows);
    }
  }
  return found;
})();

type Unemitted = {
  owner: string;
  reason: string;
  /** ISO date. An expired registration fails; it does not lapse into silence. */
  expires: string;
  /**
   * The fact the reason rests on. It is checked against the source on every
   * run, so the registration cannot outlive the situation that justified it.
   */
  predicate: () => boolean;
};

function sourceOf(relativePath: string): string {
  return readFileSync(join(VENTURE, relativePath), "utf8");
}

/**
 * Names the vocabulary carries that nothing emits, each with the reason it is
 * not emitted rather than a plan to emit it. Both are cases where emitting
 * would mean inventing a meaning or widening collection, and neither is a
 * decision to take without an owner.
 */
const UNEMITTED: Record<string, Unemitted> = {
  streak_milestone: {
    owner: "duncan",
    expires: "2026-11-30",
    reason:
      "There is no user-facing streak. The only `streak` in the product is " +
      "`streakRemaining` in UnifiedRunner, an internal counter that rotates the " +
      "topic after a random number of answers and is never shown or named to " +
      "anyone. Binding a milestone event to it would report a product fact that " +
      "does not exist. The level milestone on the insights screen is real and " +
      "user-facing, but it is a level, not a streak, and naming it this would " +
      "make the funnel read as something it is not.",
    // Anchor: outside the vocabulary that declares the name, every occurrence
    // of "streak" in the application is one of the internal counter's own
    // identifiers. A streak someone can see would break this.
    predicate: () =>
      SOURCES.filter((file) => relative(VENTURE, file) !== join("src", "lib", "usage.ts")).every((file) =>
        [...readFileSync(file, "utf8").matchAll(/[A-Za-z]*streak[A-Za-z]*/gi)].every((match) =>
          ["streakRemaining", "randomStreakTarget"].includes(match[0]),
        ),
      ),
  },
  retention_return_visit: {
    owner: "duncan",
    expires: "2026-11-30",
    reason:
      "A return visit can only be recognised across sessions, and the client " +
      "deliberately holds its usage identifier in `sessionStorage` alone. The " +
      "privacy page discloses 'a random browser-session identifier' and nothing " +
      "that outlives the session, so emitting this would require widening " +
      "collection past what people have been told — an owner decision with a " +
      "disclosure change attached, not an instrumentation gap. Returning " +
      "*account holders* are already measurable server-side from `lastSeenAt`.",
    // Anchor: the client keeps no cross-session identifier. If one appears,
    // this registration is no longer describing the code and must be revisited
    // together with the privacy disclosure.
    predicate: () => {
      const client = sourceOf("src/lib/usageClient.ts");
      return !/localStorage|document\.cookie|indexedDB/.test(client);
    },
  },
};

describe("usage vocabulary", () => {
  it("emits every event it declares, or registers why it does not", () => {
    const unaccounted = USAGE_EVENTS.filter(
      (event) => !EMITTERS.has(event) && !(event in UNEMITTED),
    );
    expect(
      unaccounted,
      "These event names are accepted by /api/usage and stored, but nothing in " +
        "the application ever sends them, so every count over them is zero for " +
        "a reason no reader can see. Emit them at the action they name, or " +
        "register them in UNEMITTED with an owner, reason, expiry and predicate.",
    ).toEqual([]);
  });

  it("fails a registration that has since gained an emitter", () => {
    const stale = Object.keys(UNEMITTED).filter((event) => EMITTERS.has(event));
    expect(
      stale,
      "A registered-as-unemitted event is now emitted. Delete the registration " +
        "— left in place it exempts a name that no longer needs exempting, and " +
        "the next reader takes the stated reason as current.",
    ).toEqual([]);
  });

  it("registers only events the vocabulary actually has", () => {
    const unknown = Object.keys(UNEMITTED).filter(
      (event) => !(USAGE_EVENTS as readonly string[]).includes(event),
    );
    expect(unknown, "UNEMITTED names an event that is not in USAGE_EVENTS.").toEqual([]);
  });

  it("holds every registration to a reason that is still true", () => {
    for (const [event, entry] of Object.entries(UNEMITTED)) {
      expect(entry.owner.length, `${event} has no owner`).toBeGreaterThan(0);
      expect(entry.reason.length, `${event} has no reason`).toBeGreaterThan(80);
      expect(
        entry.predicate(),
        `The fact ${event}'s registration rests on no longer holds in the ` +
          `source. Re-decide it: either emit the event, or write the ` +
          `registration the code now needs. Stated reason: ${entry.reason}`,
      ).toBe(true);
    }
  });

  it("expires registrations rather than letting them stand forever", () => {
    for (const [event, entry] of Object.entries(UNEMITTED)) {
      expect(entry.expires, `${event} has a malformed expiry`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const expired = new Date(`${entry.expires}T23:59:59Z`).getTime() < Date.now();
      expect(
        expired,
        `${event}'s registration expired on ${entry.expires}. Re-decide it ` +
          `rather than extending the date to make this green.`,
      ).toBe(false);
    }
  });
});

/**
 * The operator dashboard's funnel is read as a measurement of people. A step
 * naming an event nothing emits is a zero that reads as a fact about them, so
 * the two lists are checked against the emitters rather than against the
 * vocabulary alone.
 */
describe("operator funnel", () => {
  const OVERVIEW = "src/app/api/admin/overview/route.ts";

  /** Extracts the quoted names inside a named array literal, failing loudly if it moves. */
  function eventsInLiteral(name: string): string[] {
    const text = sourceOf(OVERVIEW);
    const start = text.indexOf(`const ${name} = [`);
    if (start === -1) {
      throw new Error(
        `${OVERVIEW} no longer declares \`${name}\`. This check reads it by name; ` +
          `point it at the new shape rather than deleting the check.`,
      );
    }
    const end = text.indexOf("];", start);
    if (end === -1) throw new Error(`Could not find the end of \`${name}\` in ${OVERVIEW}.`);
    const names = [...text.slice(start, end).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    if (names.length === 0) throw new Error(`\`${name}\` in ${OVERVIEW} parsed as empty.`);
    return names;
  }

  const consumed = [...new Set([...eventsInLiteral("funnelEvents"), ...eventsInLiteral("transitionPairs")])];

  it("consumes only events the vocabulary defines", () => {
    const unknown = consumed.filter((event) => !(USAGE_EVENTS as readonly string[]).includes(event));
    expect(
      unknown,
      "The dashboard counts an event /api/usage would reject, so its count is " +
        "permanently zero.",
    ).toEqual([]);
  });

  it("displays no step the application cannot populate", () => {
    const dead = consumed.filter((event) => !EMITTERS.has(event));
    expect(
      dead,
      "The dashboard shows a funnel step or transition for an event nothing " +
        "emits. Zero here reads to an operator as 'nobody did this', not as " +
        "'this was never measured'.",
    ).toEqual([]);
  });
});
