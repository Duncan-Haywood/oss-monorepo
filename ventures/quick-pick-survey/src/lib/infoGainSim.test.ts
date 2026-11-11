import { describe, expect, it } from "vitest";
import { selectNextPair } from "@/lib/pairing";
import { simulate } from "@/lib/infoGainSim";

describe("simulate truthFor (shared-truth surveys, scripts/anchor-weight-sweep.ts)", () => {
  it("an identity truthFor leaves the seed's run unchanged", () => {
    const plain = simulate(selectNextPair, 8, 40, 123);
    const same = simulate(selectNextPair, 8, 40, 123, 0, 0, 0, false, undefined, 0, undefined, (_i, drawn) => drawn);
    expect([...same.truth]).toEqual([...plain.truth]);
    expect(same.history).toEqual(plain.history);
    expect(same.rankAccuracy).toBe(plain.rankAccuracy);
  });

  it("replaces each item's truth and the answers follow it", () => {
    // Item 0 far above everything else: an honest respondent always picks it.
    const res = simulate(selectNextPair, 6, 60, 7, 0, 0, 0, false, undefined, 0, undefined, (i) => (i === 0 ? 50 : 0));
    expect(res.truth.get("item-000")).toBe(50);
    const withTop = res.history.filter((a) => a.picked === "item-000" || a.other === "item-000");
    expect(withTop.length).toBeGreaterThan(0);
    expect(withTop.every((a) => a.picked === "item-000")).toBe(true);
    expect(res.states.get("item-000")!.rating).toBeGreaterThan(1500);
  });
});
