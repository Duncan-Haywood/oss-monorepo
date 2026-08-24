import { afterEach, describe, expect, it } from "vitest";
import { assessMarketingSchedulingGate, isMarketingSchedulingAllowed } from "./buffer-gate";

const ORIGINAL_ALLOW = process.env.ALLOW_MARKETING_SCHEDULING;
const ORIGINAL_TOKEN = process.env.BUFFER_ACCESS_TOKEN;

afterEach(() => {
  if (ORIGINAL_ALLOW === undefined) {
    delete process.env.ALLOW_MARKETING_SCHEDULING;
  } else {
    process.env.ALLOW_MARKETING_SCHEDULING = ORIGINAL_ALLOW;
  }
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.BUFFER_ACCESS_TOKEN;
  } else {
    process.env.BUFFER_ACCESS_TOKEN = ORIGINAL_TOKEN;
  }
});

describe("isMarketingSchedulingAllowed", () => {
  it("is true only when ALLOW_MARKETING_SCHEDULING is exactly 1", () => {
    expect(isMarketingSchedulingAllowed({ ALLOW_MARKETING_SCHEDULING: "1" })).toBe(true);
    expect(isMarketingSchedulingAllowed({ ALLOW_MARKETING_SCHEDULING: "true" })).toBe(false);
    expect(isMarketingSchedulingAllowed({ ALLOW_MARKETING_SCHEDULING: "0" })).toBe(false);
    expect(isMarketingSchedulingAllowed({})).toBe(false);
    expect(isMarketingSchedulingAllowed({ ALLOW_MARKETING_SCHEDULING: " 1 " })).toBe(false);
  });
});

describe("assessMarketingSchedulingGate", () => {
  it("returns 403 when the opt-in flag is unset", () => {
    const gate = assessMarketingSchedulingGate({ BUFFER_ACCESS_TOKEN: "tok_x" });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
    expect(gate.error).toMatch(/disabled/i);
  });

  it("returns 403 when the flag is not exactly 1", () => {
    const gate = assessMarketingSchedulingGate({
      ALLOW_MARKETING_SCHEDULING: "true",
      BUFFER_ACCESS_TOKEN: "tok_x",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
  });

  it("returns 501 when the flag is set but BUFFER_ACCESS_TOKEN is missing", () => {
    const gate = assessMarketingSchedulingGate({ ALLOW_MARKETING_SCHEDULING: "1" });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(501);
    expect(gate.error).toMatch(/not configured/i);
  });

  it("treats whitespace-only BUFFER_ACCESS_TOKEN as missing", () => {
    const gate = assessMarketingSchedulingGate({
      ALLOW_MARKETING_SCHEDULING: "1",
      BUFFER_ACCESS_TOKEN: "   ",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(501);
  });

  it("returns ok with the trimmed token when flag is 1 and token is set", () => {
    expect(
      assessMarketingSchedulingGate({
        ALLOW_MARKETING_SCHEDULING: "1",
        BUFFER_ACCESS_TOKEN: "tok_x",
      }),
    ).toEqual({ ok: true, accessToken: "tok_x" });
  });

  it("reads process.env when no env arg is passed", () => {
    process.env.ALLOW_MARKETING_SCHEDULING = "1";
    process.env.BUFFER_ACCESS_TOKEN = "tok_live";
    expect(assessMarketingSchedulingGate()).toEqual({ ok: true, accessToken: "tok_live" });

    delete process.env.ALLOW_MARKETING_SCHEDULING;
    const gate = assessMarketingSchedulingGate();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
  });
});
