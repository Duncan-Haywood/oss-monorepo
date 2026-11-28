// The free Level 1 self-assessment page (ventures/machine-shop-guides) and this app keep their own
// copies of the 15 FAR 52.204-21(b)(1) requirements and their 59 SP 800-171A objectives. Both were
// checked against the official text; this test keeps the two copies equal so a correction to one
// cannot leave the other behind (quality audit 2026-11-26-cmmc.json, defect 6).
import { describe, expect, it } from "vitest";
// @ts-expect-error: plain .mjs data module without type declarations
import { L1_OBJECTIVES, L1_REQUIREMENTS } from "../../../../../../machine-shop-guides/l1-data.mjs";
import { LEVEL1_REQUIREMENTS } from "./level1";

type PageReq = { id: string; far: string; nist: string[]; text: string };
type PageObj = { id: string; text: string };

describe("Level 1 library matches the free page's l1-data.mjs", () => {
  const page = L1_REQUIREMENTS as PageReq[];
  const objs = L1_OBJECTIVES as Record<string, PageObj[]>;

  it("same 15 requirements, ids, NIST mapping and FAR text", () => {
    expect(LEVEL1_REQUIREMENTS.map((r) => r.id)).toEqual(page.map((r) => r.id));
    for (const r of LEVEL1_REQUIREMENTS) {
      const p = page.find((x) => x.id === r.id);
      expect(p?.text, r.id).toBe(r.text);
      expect([...(p?.nist ?? [])], r.id).toEqual([...r.nistIds]);
    }
  });

  // The one known difference in ids: where SP 800-171A gives a requirement a single objective (3.10.4,
  // 3.14.4), the free page keeps the bare number and this app letters it "[a]", as the CMMC
  // assessment guides do. The text is the same. Recorded in quality audit
  // 2026-11-28-cmmc-reaudit.json; the test pins that this is the only difference.
  const appId = (pageId: string) => (pageId.includes("[") ? pageId : `${pageId}[a]`);

  it("same 59 objectives, word for word", () => {
    let n = 0;
    for (const r of LEVEL1_REQUIREMENTS) {
      expect(
        r.objectives.map((o) => [o.id, o.text]),
        r.id,
      ).toEqual((objs[r.id] ?? []).map((o) => [appId(o.id), o.text]));
      n += r.objectives.length;
    }
    expect(n).toBe(59);
  });
});
