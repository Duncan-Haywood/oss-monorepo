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

describe("objective results decide MET (32 CFR 170.24(b)(2))", () => {
  const ac311 = LEVEL2_REQUIREMENTS.find((r) => r.nistId === "3.1.1");
  const objIds = ac311?.objectives.map((o) => o.id) ?? [];

  it("3.1.1 has assessment objectives to record against", () => {
    expect(objIds.length).toBeGreaterThan(1);
  });

  it("implemented with one objective not met scores as not met: 110 - 5 = 105, and is flagged", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "implemented",
          objectiveResults: { [objIds[0] as string]: "met", [objIds[1] as string]: "not_met" },
        },
      }),
    );
    expect(s.score).toBe(105);
    expect(s.deductions).toEqual([
      expect.objectContaining({ nistId: "3.1.1", points: 5, status: "implemented" }),
    ]);
    expect(s.objectiveConflicts).toEqual([
      { id: id("3.1.1"), nistId: "3.1.1", status: "implemented", objectives: [objIds[1]] },
    ]);
  });

  it("a requirement already scored not met is not listed as a conflict", () => {
    // The conflict list is for a status that says met while an objective says not; a
    // not-implemented requirement with a not-met objective is consistent and only loses its points.
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "not_implemented",
          objectiveResults: { [objIds[0] as string]: "not_met" },
        },
        "3.1.2": {
          status: "partially_implemented",
          objectiveResults: { "3.1.2[a]": "not_met" },
        },
      }),
    );
    expect(s.score).toBe(100);
    expect(s.objectiveConflicts).toEqual([]);
  });

  it("objectives all met or not applicable leave the requirement met", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "implemented",
          objectiveResults: {
            [objIds[0] as string]: "met",
            [objIds[1] as string]: "not_applicable",
          },
        },
      }),
    );
    expect(s.score).toBe(110);
    expect(s.objectiveConflicts).toEqual([]);
  });

  it("a not-met objective on the SSP requirement blocks the score", () => {
    const ssp = LEVEL2_REQUIREMENTS.find((r) => r.nistId === "3.12.4");
    const o = ssp?.objectives[0]?.id as string;
    const s = scoreLevel2(
      states({ "3.12.4": { status: "implemented", objectiveResults: { [o]: "not_met" } } }),
    );
    expect(s.score).toBeNull();
    expect(s.sspImplemented).toBe(false);
  });

  it("a 1-point requirement implemented with an objective not met becomes a POA&M item, not met", () => {
    const one = LEVEL2_REQUIREMENTS.find((r) => r.nistId === "3.1.8");
    const o = one?.objectives[0]?.id as string;
    const m = states({ "3.1.8": { status: "implemented", objectiveResults: { [o]: "not_met" } } });
    const r = conditionalReadiness(m);
    expect(r.score).toBe(109);
    expect(r.allMet).toBe(false);
    expect(r.meetsPoamRules).toBe(true);
  });

  it("Level 1: implemented with an objective not met is not met", () => {
    const m = new Map<string, ControlState>(
      LEVEL1_REQUIREMENTS.map((r) => [r.id, { status: "implemented" }]),
    );
    const first = LEVEL1_REQUIREMENTS[0];
    const o = first?.objectives[0]?.id as string;
    m.set(first?.id as string, { status: "implemented", objectiveResults: { [o]: "not_met" } });
    const r = scoreLevel1(m);
    expect(r).toMatchObject({ met: 14, allMet: false, notMet: [first?.id] });
    expect(r.objectiveConflicts).toHaveLength(1);
  });
});

describe("POA&M rules (32 CFR 170.21)", () => {
  it("rejects 3-point requirements other than 3.13.11 not-FIPS, citing (a)(2)(ii)", () => {
    for (const n of ["3.1.5", "3.8.8"]) {
      expect(LEVEL2_REQUIREMENTS.find((r) => r.nistId === n)?.weight).toBe(3);
      const e = poamEligibility(n, { status: "not_implemented" });
      expect(e.eligible).toBe(false);
      expect(e.reason).toContain("170.21(a)(2)(ii)");
    }
    expect(poamEligibility("3.1.20", { status: "not_implemented" }).reason).toContain(
      "170.21(a)(2)(iii)",
    );
  });

  it("score exactly 88 with only POA&M-eligible gaps meets the rules", () => {
    const ones = LEVEL2_REQUIREMENTS.filter(
      (r) =>
        r.weight === 1 && !["3.1.20", "3.1.22", "3.10.3", "3.10.4", "3.10.5"].includes(r.nistId),
    ).slice(0, 22);
    const m = states();
    for (const r of ones) m.set(r.id, { status: "not_implemented" });
    const res = conditionalReadiness(m);
    expect(res.score).toBe(88);
    expect(res.meetsPoamRules).toBe(true);
    expect(res.allMet).toBe(false);
  });

  it("allMet is true only when every requirement is met", () => {
    expect(conditionalReadiness(states()).allMet).toBe(true);
    expect(conditionalReadiness(states({ "3.1.8": { status: "not_assessed" } })).allMet).toBe(
      false,
    );
  });

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

describe("enduring exceptions and temporary deficiencies — 32 CFR 170.24(b)(1)(i)-(ii)", () => {
  const notMetA = { "3.1.1[a]": "not_met" } as const;

  it("3.1.1 (5 points) implemented, [a] not met, enduring exception described: MET, 110", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "implemented",
          objectiveResults: notMetA,
          metException: "enduring_exception",
          metExceptionDetail:
            "CNC controller runs a vendor-fixed OS; isolated VLAN, no CUI at rest.",
        },
      }),
    );
    expect(s.score).toBe(110);
    expect(s.objectiveConflicts).toEqual([]);
    expect(s.exceptions).toEqual([
      { id: id("3.1.1"), nistId: "3.1.1", kind: "enduring_exception", objectives: ["3.1.1[a]"] },
    ]);
  });

  it("temporary deficiency with an operational plan of action: MET, 110", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "implemented",
          objectiveResults: notMetA,
          metException: "temporary_deficiency",
          metExceptionDetail:
            "OPA-7: account review lapsed after HR change; review weekly, close 2027-01-15.",
        },
      }),
    );
    expect(s.score).toBe(110);
    expect(s.exceptions.map((e) => e.kind)).toEqual(["temporary_deficiency"]);
  });

  it("an exception with a blank description does not count: 110 - 5 = 105, listed as a conflict", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "implemented",
          objectiveResults: notMetA,
          metException: "enduring_exception",
          metExceptionDetail: "   ",
        },
      }),
    );
    expect(s.score).toBe(105);
    expect(s.exceptions).toEqual([]);
    expect(s.objectiveConflicts.map((c) => c.nistId)).toEqual(["3.1.1"]);
  });

  it("an exception does not rescue a requirement that is not implemented: 110 - 5 = 105", () => {
    const s = scoreLevel2(
      states({
        "3.1.1": {
          status: "partially_implemented",
          metException: "enduring_exception",
          metExceptionDetail: "described",
        },
      }),
    );
    expect(s.score).toBe(105);
    expect(s.exceptions).toEqual([]);
  });

  it("an implemented requirement with every objective met and an exception is listed, still 110", () => {
    const s = scoreLevel2(
      states({
        "3.1.8": {
          status: "implemented",
          metException: "enduring_exception",
          metExceptionDetail: "test bench PC",
        },
      }),
    );
    expect(s.score).toBe(110);
    expect(s.exceptions).toEqual([
      { id: id("3.1.8"), nistId: "3.1.8", kind: "enduring_exception", objectives: [] },
    ]);
  });

  it("Level 1 ignores an exception: an objective not met is still not met", () => {
    const r = LEVEL1_REQUIREMENTS[0];
    const obj = r?.objectives[0]?.id;
    if (!r || !obj) throw new Error("empty Level 1 library");
    const m = new Map<string, ControlState>(
      LEVEL1_REQUIREMENTS.map((x) => [x.id, { status: "implemented" }]),
    );
    m.set(r.id, {
      status: "implemented",
      objectiveResults: { [obj]: "not_met" },
      metException: "enduring_exception",
      metExceptionDetail: "described",
    });
    const l1 = scoreLevel1(m);
    expect(l1.notMet).toEqual([r.id]);
    expect(l1.objectiveConflicts.map((c) => c.id)).toEqual([r.id]);
  });
});
