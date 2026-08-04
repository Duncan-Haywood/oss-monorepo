import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source contract, not behaviour.
 *
 * route.test.ts covers the three durable sent-marker sites that exist today.
 * But the defect behind emailWasDelivered is a *shape*, not those three lines:
 * a permanent "we sent it" write gated on `result.success`, which is `true` for
 * a mock send that never left the process. A fourth marker site added later
 * would reintroduce it with every existing test still green — which is exactly
 * how the original survived a 1271-test suite.
 *
 * Reading the file rather than importing it is deliberate: route.test.ts mocks
 * @/lib/email/resend, so an import-based check would be satisfied by the mock
 * rather than by the shipped code.
 */
describe("stripe webhook durable sent-marker contract", () => {
  const routeSource = readFileSync(join(__dirname, "route.ts"), "utf8");

  it("gates every send result on emailWasDelivered, never on bare .success", () => {
    const bareSuccessChecks = routeSource
      .split("\n")
      .map((line, index) => `${index + 1}: ${line.trim()}`)
      .filter((line) => /\bif\s*\(\s*!?\s*sent\.success\s*\)/.test(line));

    expect(
      bareSuccessChecks,
      "a durable sent-marker gated on sent.success records a mock send as delivered — use emailWasDelivered(sent)",
    ).toEqual([]);
  });

  it("consults the delivery predicate at each of the three marker sites", () => {
    const uses = routeSource.match(/emailWasDelivered\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Guards the contract above from going vacuous: if the three sends are ever
   * renamed away from `sent`, the regex would match nothing and pass over a
   * reintroduced `.success` check. Assert the subject it inspects still exists.
   */
  it("still has send results named `sent` for the contract above to inspect", () => {
    const sendResults = routeSource.match(/const sent = await send/g) ?? [];
    expect(sendResults.length).toBeGreaterThanOrEqual(3);
  });
});
