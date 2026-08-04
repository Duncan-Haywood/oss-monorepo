import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The half of the fail-closed contract that `suppression-read-fail-closed.test.ts`
 * structurally cannot cover.
 *
 * That suite mocks `../db`, because `src/lib/db.ts` imports `server-only` and
 * throws outside a Server Component — no test in this venture imports it. So it
 * pins how `sendEmail` *reacts* to a `ConvexPrimaryReadError` and says nothing
 * about whether `isEmailSuppressed` still *raises* one. Reinstating the SQLite
 * fallback inside `isEmailSuppressed` leaves all four of those tests green while
 * restoring the exact defect: a Convex read failure answering "not suppressed"
 * and the send proceeding.
 *
 * That was measured, not assumed — the mutation was applied and the suite
 * passed. A regression test that survives the regression it was written for is
 * the shape of defect this repository keeps finding in its own controls, so
 * this reads the source instead.
 *
 * It is deliberately narrow: it asserts one thing about one function, and the
 * anti-vacuity test below fails if the function can no longer be located, so
 * renaming or moving `isEmailSuppressed` breaks this loudly rather than
 * silently making it vacuous.
 */

const DB_SOURCE = path.resolve(__dirname, "..", "db.ts");

function isEmailSuppressedBody(): string {
  const source = readFileSync(DB_SOURCE, "utf8");
  const start = source.indexOf("export async function isEmailSuppressed");
  if (start === -1) return "";

  // The next top-level `export ` after it bounds the body. db.ts is a flat
  // module of exported functions, so this is exact rather than approximate.
  const rest = source.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("isEmailSuppressed source contract", () => {
  it("can still find the function it constrains", () => {
    const body = isEmailSuppressedBody();
    expect(body).not.toBe("");
    // Anti-vacuity: if these disappear the assertions below stop meaning
    // anything, so fail here rather than pass silently.
    expect(body).toContain("convexClient");
    expect(body).toContain("api.suppressions.isSuppressed");
  });

  it("throws rather than falling back when the Convex read fails", () => {
    const body = isEmailSuppressedBody();

    expect(
      body,
      "isEmailSuppressed must throw ConvexPrimaryReadError when the Convex query " +
        "fails. suppressEmail is Convex-primary (UNSUBSCRIBE_CONVEX_PRIMARY), so on a " +
        "Convex-configured deploy the local suppression_list table is always empty and " +
        "a fallback read can only answer 'not suppressed'.",
    ).toContain("throw new ConvexPrimaryReadError(");
  });

  it("does not reach the SQLite table from inside the Convex failure path", () => {
    const body = isEmailSuppressedBody();

    const catchStart = body.indexOf("} catch (");
    const throwStart = body.indexOf("throw new ConvexPrimaryReadError(");
    expect(catchStart).toBeGreaterThan(-1);
    expect(throwStart).toBeGreaterThan(catchStart);

    const catchBlock = body.slice(catchStart, throwStart);
    expect(
      catchBlock,
      "the Convex catch block must not read suppression_list before throwing; " +
        "that is the fallback this contract exists to forbid.",
    ).not.toContain("suppression_list");
  });
});
