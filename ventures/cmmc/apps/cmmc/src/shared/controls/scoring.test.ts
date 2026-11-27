// Worked examples for the DoD Assessment Methodology v1.2.1 / 32 CFR 170.24 scoring and the
// 32 CFR 170.21 POA&M rules. Each example states the arithmetic so a reviewer can check it by hand.
import { describe, expect, it } from "vitest";
import {
  type ControlState,
  conditionalReadiness,
  LEVEL1_REQUIREMENTS,
  LEVEL2_REQUIREMENTS,
  poamCloseoutDeadline,
  poamEligibility,
  scoreLevel1,
  scoreLevel2,
} from "./index";

const id = (nistId: string) => {
  const r = LEVEL2_REQUIREMENTS.find((x) => x.nistId === nistId);
  if (!r) throw new Error(nistId);
  return r.id;
};

/** Everything implemented, then apply overrides keyed by NIST number. */
function states(overrides: Record<string, ControlState> = {}): Map<string, ControlState> {
  const m = new Map<string, ControlState>(
    LEVEL2_REQUIREMENTS.map((r) => [r.id, { status: "implemented" }]),
  );
  for (const [n, s] of Object.entries(overrides)) m.set(id(n), s);
  return m;
}

describe("scoreLevel2 — worked examples", () => {
  it("all 110 implemented: 110", () => {
    const s = scoreLevel2(states());
    expect(s.score).toBe(110);
    expect(s.deductions).toEqual([]);
  });

  it("nothing implemented except the SSP: 110 - 313 = -203 (the methodology minimum)", () => {
    const m = new Map<string, ControlState>(
      LEVEL2_REQUIREMENTS.map((r) => [r.id, { status: "not_implemented" }]),
    );
    m.set(id("3.12.4"), { status: "implemented" });
    expect(scoreLevel2(m).score).toBe(-203);
  });

  it("no SSP: no score can be produced (provisional arithmetic still shown)", () => {
    const s = scoreLevel2(states({ "3.12.4": { status: "not_implemented" } }));
    expect(s.score).toBeNull();
    expect(s.sspImplemented).toBe(false);
    expect(s.provisionalScore).toBe(110);
  });

  it("one 5-point, one 3-point and two 1-point gaps: 110 - 5 - 3 - 1 - 1 = 100", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": { status: "not_implemented" }, // 5
        "3.1.5": { status: "partially_implemented" }, // 3 (partial = not implemented)
        "3.1.8": { status: "not_implemented" }, // 1
        "3.10.6": { status: "not_assessed" }, // 1 (unassessed scored as not implemented)
      }),
    );
    expect(s.score).toBe(100);
    expect(s.unassessed).toBe(1);
  });

  it("not applicable counts as met", () => {
    expect(scoreLevel2(states({ "3.1.16": { status: "not_applicable" } })).score).toBe(110);
  });

  it("3.5.3 MFA only for remote and privileged users: subtract 3, not 5 → 107", () => {
    const s = scoreLevel2(
      states({
        "3.5.3": {
          status: "partially_implemented",
          partialCredit: "mfa_remote_and_privileged_only",
        },
      }),
    );
    expect(s.score).toBe(107);
  });

  it("3.5.3 with no MFA: subtract 5 → 105", () => {
    expect(scoreLevel2(states({ "3.5.3": { status: "not_implemented" } })).score).toBe(105);
  });

  it("3.13.11 encryption but not FIPS-validated: subtract 3 → 107; no encryption: 105", () => {
    expect(
      scoreLevel2(
        states({
          "3.13.11": { status: "partially_implemented", partialCredit: "encryption_not_fips" },
        }),
      ).score,
    ).toBe(107);
    expect(scoreLevel2(states({ "3.13.11": { status: "not_implemented" } })).score).toBe(105);
  });

  it("a partial-credit key only applies to its own requirement", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": { status: "partially_implemented", partialCredit: "encryption_not_fips" },
      }),
    );
    expect(s.score).toBe(105);
  });
});

describe("POA&M rules (32 CFR 170.21)", () => {
  it("allows 1-point requirements and 3.13.11 not-FIPS; rejects higher weights and the excluded six", () => {
    expect(poamEligibility("3.1.8", { status: "not_implemented" }).eligible).toBe(true);
    expect(poamEligibility("3.1.1", { status: "not_implemented" }).eligible).toBe(false);
    expect(
      poamEligibility("3.13.11", {
        status: "partially_implemented",
        partialCredit: "encryption_not_fips",
      }).eligible,
    ).toBe(true);
    expect(poamEligibility("3.13.11", { status: "not_implemented" }).eligible).toBe(false);
    for (const n of ["3.1.20", "3.1.22", "3.12.4", "3.10.3", "3.10.4", "3.10.5"]) {
      expect(poamEligibility(n, { status: "not_implemented" }).eligible).toBe(false);
    }
  });

  it("score 100 with only 1-point gaps meets the POA&M rules", () => {
    const gaps: Record<string, ControlState> = {};
    for (const n of [
      "3.1.3",
      "3.1.4",
      "3.1.6",
      "3.1.7",
      "3.1.8",
      "3.1.9",
      "3.1.10",
      "3.1.11",
      "3.1.14",
      "3.1.15",
    ]) {
      gaps[n] = { status: "not_implemented" };
    }
    const r = conditionalReadiness(states(gaps));
    expect(r.score).toBe(100);
    expect(r.meetsPoamRules).toBe(true);
  });

  it("score 87 fails the 88 threshold even with only 1-point gaps", () => {
    const ones = LEVEL2_REQUIREMENTS.filter(
      (r) =>
        r.weight === 1 && !["3.1.20", "3.1.22", "3.10.3", "3.10.4", "3.10.5"].includes(r.nistId),
    ).slice(0, 23);
    const m = states();
    for (const r of ones) m.set(r.id, { status: "not_implemented" });
    const res = conditionalReadiness(m);
    expect(res.score).toBe(87);
    expect(res.meetsPoamRules).toBe(false);
  });

  it("a single 5-point gap blocks conditional status despite a score of 105", () => {
    const r = conditionalReadiness(states({ "3.1.1": { status: "not_implemented" } }));
    expect(r.score).toBe(105);
    expect(r.meetsPoamRules).toBe(false);
    expect(r.blockers[0]?.nistId).toBe("3.1.1");
  });

  it("closeout deadline is 180 days after the conditional status date", () => {
    expect(poamCloseoutDeadline("2026-01-01")).toBe("2026-06-30");
  });
});

describe("scoreLevel1", () => {
  it("is pass/fail across the 15 requirements", () => {
    const m = new Map<string, ControlState>(
      LEVEL1_REQUIREMENTS.map((r) => [r.id, { status: "implemented" }]),
    );
    expect(scoreLevel1(m)).toMatchObject({ total: 15, met: 15, allMet: true });
    m.set("PE.L1-b.1.ix", { status: "partially_implemented" });
    expect(scoreLevel1(m)).toMatchObject({ met: 14, allMet: false, notMet: ["PE.L1-b.1.ix"] });
  });
});
