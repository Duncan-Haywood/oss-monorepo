import { describe, expect, it } from "vitest";
import { pooledPriorPhi, pooledPriorPhiAsync, type RefitAnswer } from "./btRefit";
import { needsRefresh, poolEligible, POOL_MAX_RESPONDENTS, POOL_MIN_RESPONDENTS, setPriorPhi, surveyPriorPhi, type PoolPerson } from "./surveyPrior";

/** A respondent on `n` items whose answers follow a known order, with one upset per round so the evidence has a finite peak. */
function person(n: number, rounds: number, offset = 0): PoolPerson {
  const ids = Array.from({ length: n }, (_, i) => `p${offset}-i${i}`);
  const answers: RefitAnswer[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i + 1 < n; i++) answers.push({ winner: ids[i], loser: ids[i + 1] });
    answers.push({ winner: ids[n - 1], loser: ids[0] });
  }
  return { ids, answers };
}

describe("poolEligible", () => {
  it("drops respondents with under four answers or over 40 answered items, and keeps the first 40", () => {
    const few = person(3, 1); // 3 answers
    const wide = person(41, 1);
    const ok = Array.from({ length: 45 }, (_, i) => person(5, 1, i));
    const used = poolEligible([few, wide, ...ok]);
    expect(used).toHaveLength(POOL_MAX_RESPONDENTS);
    expect(used[0]).toBe(ok[0]);
    expect(used).not.toContain(few);
    expect(used).not.toContain(wide);
  });
});

describe("surveyPriorPhi", () => {
  it("returns null below the minimum number of respondents", async () => {
    const people = Array.from({ length: POOL_MIN_RESPONDENTS - 1 }, (_, i) => person(6, 2, i));
    expect(await surveyPriorPhi(people)).toBeNull();
  });

  it("is the pooled empirical-Bayes estimate over the eligible respondents", async () => {
    const people = Array.from({ length: POOL_MIN_RESPONDENTS }, (_, i) => person(6, 2, i));
    const est = await surveyPriorPhi([person(2, 1, 99), ...people]);
    expect(est).toEqual({ phi: pooledPriorPhi(people), respondents: POOL_MIN_RESPONDENTS });
  });
});

describe("pooledPriorPhiAsync", () => {
  it("gives exactly the synchronous search's answer", async () => {
    const people = [person(6, 2, 1), person(8, 3, 2), person(5, 1, 3)];
    expect(await pooledPriorPhiAsync(people)).toBe(pooledPriorPhi(people));
    expect(await pooledPriorPhiAsync(people, { evidence: "laplace" })).toBe(pooledPriorPhi(people, { evidence: "laplace" }));
  });
});

describe("needsRefresh", () => {
  const none = { phi: null, respondents: null, answers: null };
  it("waits for enough answers before the first estimate", () => {
    expect(needsRefresh(none, 39)).toBe(false);
    expect(needsRefresh(none, 40)).toBe(true);
  });
  it("refreshes after a quarter more answers and at least 20 new ones", () => {
    const stored = { phi: 1, respondents: 12, answers: 200 };
    expect(needsRefresh(stored, 249)).toBe(false);
    expect(needsRefresh(stored, 250)).toBe(true);
    const small = { phi: 1, respondents: 10, answers: 40 };
    expect(needsRefresh(small, 55)).toBe(false); // 37.5% more, but only 15 new
    expect(needsRefresh(small, 60)).toBe(true);
  });
});

describe("setPriorPhi", () => {
  it("is the person's own estimate when the survey has none or too few respondents behind it", () => {
    expect(setPriorPhi(0.5, { phi: null, respondents: null, answers: null })).toBe(0.5);
    expect(setPriorPhi(0.5, { phi: 1.2, respondents: POOL_MIN_RESPONDENTS - 1, answers: 100 })).toBe(0.5);
  });
  it("is the narrower of own and stored otherwise: the survey can only lengthen the list", () => {
    expect(setPriorPhi(0.5, { phi: 2, respondents: POOL_MIN_RESPONDENTS, answers: 100 })).toBe(0.5);
    expect(setPriorPhi(1.6, { phi: 0.9, respondents: POOL_MIN_RESPONDENTS, answers: 100 })).toBe(0.9);
  });
});
