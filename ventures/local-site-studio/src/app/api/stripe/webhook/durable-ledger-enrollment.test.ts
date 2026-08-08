import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every write this route makes after Stripe has taken money must refuse an
 * ephemeral store — including the next one somebody adds.
 *
 * The behavioural proof lives in
 * `src/lib/payments/durable-ledger-refusal.test.ts`, against the real
 * `@/lib/db`. What that cannot see is *coverage*: it names the surfaces it
 * tests, so a new fulfillment write added to this route six months from now
 * would go unguarded and every suite would stay green. Mutation-checked and
 * real: dropping `requireDurableLedger` from the constant below, or deleting an
 * `assertDurableLedgerStore` call from `db.ts`, both left the whole 1401-test
 * suite passing before this file existed.
 *
 * So the subject is discovered from the route's own source rather than listed
 * here: every callee that receives `WEBHOOK_CONVEX_PRIMARY` is found, and each
 * one must carry the guard under its own name. A callee this file cannot
 * resolve fails the test rather than being skipped — an unrecognised name is
 * the exact case where a real gap would hide.
 */

const ROUTE = join(__dirname, "route.ts");
const DB = join(__dirname, "../../../../lib/db.ts");

/**
 * Blank out comments and string bodies so prose mentioning a name is not read
 * as a call and stray punctuation cannot unbalance the parentheses.
 *
 * One pass, not a chain of regexes. A chain gets this wrong: running the
 * single-quote rule before the double-quote rule makes the apostrophe in
 * `"the customer's own preview page"` open a bogus string that swallows the
 * rest of the file. That silently reduced the discovered write set from seven
 * to three — a scanner that reports fewer subjects than exist is the failure
 * mode this whole file is guarding against.
 *
 * Characters are replaced with spaces rather than removed so every index still
 * lines up with the original source.
 */
function stripNonCode(source: string): string {
  const out = source.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (two === "//") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\") j += 2;
        else if (source[j] === quote) break;
        else j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * Callees that are not `db.ts` exports, with the write they delegate to.
 *
 * Registered rather than inferred, because the delegation is a fact about
 * another module's body. Each entry must forward its `options` argument
 * unchanged — asserted below, so an entry cannot go quietly false.
 */
const DELEGATES: Record<string, { module: string; delegatesTo: string }> = {
  enqueueProductionHandoff: {
    module: "../../../../lib/deploy/handoff.ts",
    delegatesTo: "insertDeployHandoff",
  },
};

const routeSource = stripNonCode(readFileSync(ROUTE, "utf8"));
const dbSource = readFileSync(DB, "utf8");

const dbExports = new Set(
  [...dbSource.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]),
);

/** Names that could plausibly be the callee at a WEBHOOK_CONVEX_PRIMARY site. */
const candidates = new Set([...dbExports, ...Object.keys(DELEGATES)]);

/**
 * The function whose argument list encloses `at`.
 *
 * Walks backwards balancing parentheses, so a sibling call earlier in the same
 * argument list (`getLeadBySlug(slug)` sits between `recordLeadPayment(` and its
 * options argument) closes itself out instead of being mistaken for the callee.
 * Sound because comments and string bodies are stripped first.
 */
function enclosingCallee(at: number): string | null {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const ch = routeSource[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth === 0) {
        const name = routeSource.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);
        return name ? name[1] : null;
      }
      depth--;
    }
  }
  return null;
}

function calleesReceivingWebhookOptions(): string[] {
  const found: string[] = [];
  const pattern = /WEBHOOK_CONVEX_PRIMARY/g;
  for (const match of routeSource.matchAll(pattern)) {
    const at = match.index ?? 0;
    // Skip the declaration itself.
    if (/WEBHOOK_CONVEX_PRIMARY\s*=/.test(routeSource.slice(at, at + 40))) continue;

    const name = enclosingCallee(at);
    expect(
      name,
      `A WEBHOOK_CONVEX_PRIMARY argument at index ${at} of route.ts has no ` +
        "resolvable callee. If you added a fulfillment write, either export it " +
        "from db.ts with an assertDurableLedgerStore guard, or register it in " +
        "DELEGATES above. Do not delete this assertion.",
    ).not.toBeNull();
    found.push(name!);
  }
  return [...new Set(found)];
}

describe("durable-ledger enrollment for Stripe fulfillment writes", () => {
  it("finds the fulfillment writes to check", () => {
    // A route that suddenly passes the options nowhere would make every other
    // assertion here vacuously true.
    expect(calleesReceivingWebhookOptions().length).toBeGreaterThanOrEqual(7);
  });

  it("the webhook's options constant actually asks for a durable ledger", () => {
    expect(routeSource).toMatch(
      /const WEBHOOK_CONVEX_PRIMARY = \{[^}]*requireDurableLedger:\s*true[^}]*\}/,
    );
  });

  it("every write this route makes with those options carries the guard", () => {
    const unguarded: string[] = [];
    for (const callee of calleesReceivingWebhookOptions()) {
      const target = DELEGATES[callee]?.delegatesTo ?? callee;
      if (!dbSource.includes(`assertDurableLedgerStore("${target}"`)) {
        unguarded.push(`${callee}${target === callee ? "" : ` → ${target}`}`);
      }
    }
    expect(
      unguarded,
      "These writes run after Stripe has taken the money and would fall through " +
        "to instance-local SQLite when Convex is unconfigured. Add " +
        "assertDurableLedgerStore(<name>, convexClient !== null, options) as the " +
        "first statement of each.",
    ).toEqual([]);
  });

  it("each guard names the function it is standing in, so the 500 says which write refused", () => {
    for (const [name] of Object.entries(DELEGATES)) {
      expect(candidates.has(name)).toBe(true);
    }
    for (const surface of [...dbSource.matchAll(/assertDurableLedgerStore\("(\w+)"/g)].map(
      (m) => m[1],
    )) {
      expect(dbExports.has(surface), `${surface} is not an exported db.ts write`).toBe(true);
      // The guard must sit inside the function it names, not a neighbour.
      const fnAt = dbSource.indexOf(`export async function ${surface}(`);
      const guardAt = dbSource.indexOf(`assertDurableLedgerStore("${surface}"`);
      const nextFnAt = dbSource.indexOf("\nexport async function ", fnAt + 1);
      expect(guardAt).toBeGreaterThan(fnAt);
      expect(guardAt).toBeLessThan(nextFnAt === -1 ? dbSource.length : nextFnAt);
    }
  });

  it("registered delegates really do forward their options argument", () => {
    for (const [name, { module, delegatesTo }] of Object.entries(DELEGATES)) {
      const source = stripNonCode(readFileSync(join(__dirname, module), "utf8"));
      expect(source, `${name} must still delegate to ${delegatesTo}`).toContain(
        `${delegatesTo}(`,
      );
      expect(
        new RegExp(`${delegatesTo}\\([^)]*options[^)]*\\)`).test(source),
        `${name} must forward options to ${delegatesTo}, or the guard never sees them`,
      ).toBe(true);
    }
  });
});
