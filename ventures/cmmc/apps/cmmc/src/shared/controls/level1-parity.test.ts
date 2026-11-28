// The free Level 1 self-assessment page (ventures/machine-shop-guides) and this app keep their own
// copies of the 15 FAR 52.204-21(b)(1) requirements and their 59 SP 800-171A objectives. Both were
// checked against the official text; this test keeps the two copies equal so a correction to one
// cannot leave the other behind (quality audit 2026-11-26-cmmc.json, defect 6).
//
// The free page lives in another venture, so this is the one test here that reads outside
// ventures/cmmc. cmmc CI checks that venture out and runs it on every change to either copy; the
// production deploy (priv-cmmc-deploy.yml) checks out ventures/cmmc alone, and a static import
// failed every deploy from 2026-11-28 06:28 to the fix (ERR_MODULE_NOT_FOUND). So the file is
// loaded only when present, and its absence inside cmmc CI is itself a failure: the check never
// goes quiet where it is meant to run.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEVEL1_REQUIREMENTS } from "./level1";

type PageReq = { id: string; far: string; nist: string[]; text: string };
type PageObj = { id: string; text: string };

const pageData = new URL("../../../../../../machine-shop-guides/l1-data.mjs", import.meta.url);
const present = existsSync(fileURLToPath(pageData));
const data: { L1_REQUIREMENTS: PageReq[]; L1_OBJECTIVES: Record<string, PageObj[]> } | null =
  present ? await import(/* @vite-ignore */ pageData.href) : null;

it("the free page's l1-data.mjs is checked out wherever cmmc CI runs", () => {
  if (process.env.GITHUB_WORKFLOW === "cmmc CI") expect(present).toBe(true);
});

describe.skipIf(!data)("Level 1 library matches the free page's l1-data.mjs", () => {
  const page = data?.L1_REQUIREMENTS ?? [];
  const objs = data?.L1_OBJECTIVES ?? {};

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
