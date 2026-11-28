// First article list (services/rfq characteristicsCsv): a draft AS9102 Form 3 characteristic list
// from a drawing's text, as CSV; refused for a file with no text, and invisible across shops. Part 2
// (services/rfq getFaiSheet, saveFaiSheet): results saved per drawing, judged, and carried into the CSV.

import type { RfqDetailDto } from "@shared/api";
import type { FaiSheetDto } from "@shared/fai-results";
import { describe, expect, it } from "vitest";
import { addMember, api, json, setupTenant } from "./helpers";

const DRAWING = `DWG NO: BRK-1001 REV B
MATERIAL: 6061-T6 ALUMINUM
UNLESS OTHERWISE SPECIFIED: .XXX ±.005
NOTES:
1. BREAK SHARP EDGES .010 MAX
3.250 ±.005
4X Ø.201 +.003/-.000 THRU
POSITION ⌀.010 A B C`;

async function rfqWith(
  t: Awaited<ReturnType<typeof setupTenant>>,
  name: string,
  body: string,
  type: string,
) {
  const form = new FormData();
  form.set("subject", "RFQ - bracket");
  form.set("bodyText", "Please quote BRK-1001, qty 10.");
  form.append("files", new File([body], name, { type }));
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

describe("first article list", () => {
  it("lists the drawing's characteristics, numbered, as CSV", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const f = rfq.files[0];
    expect(f?.hasText).toBe(true);
    const res = await api(t.path(`/rfqs/${rfq.id}/files/${f?.id}/form3.csv`), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("BRK-1001-form3-draft.csv");
    const csv = (await res.text()).replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), "");
    const rows = csv.trimEnd().split("\r\n");
    expect(rows).toContain("General tolerance,UNLESS OTHERWISE SPECIFIED: .XXX ±.005");
    const head = rows.findIndex((r) => r.startsWith("Char. No.,"));
    expect(rows.slice(head + 1).map((r) => r.split(",")[0])).toEqual([
      "1",
      "2",
      "3",
      "4.1",
      "4.2",
      "4.3",
      "4.4",
      "5",
    ]);
    expect(rows[head + 3]).toBe("3,,,3.250 ±.005,,,,Dimension,3.245,3.255,in,value,6");
  });

  it("refuses a file with no text, and another shop's file", async () => {
    const t = await setupTenant();
    const step = await rfqWith(t, "BRK-1001.step", "ISO-10303-21;", "application/octet-stream");
    const none = await api(t.path(`/rfqs/${step.id}/files/${step.files[0]?.id}/form3.csv`), {
      as: t.userId,
    });
    expect(none.status).toBe(400);

    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const other = await setupTenant();
    const cross = await api(other.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/form3.csv`), {
      as: other.userId,
    });
    expect(cross.status).toBe(404);
  });

  it("saves results, judges them and carries them into the CSV", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const path = t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/first-article`);
    const empty = await json<FaiSheetDto>(api(path, { as: t.userId }));
    expect(empty.rows.map((r) => r.verdict)).toEqual(Array(8).fill("open"));
    expect(empty.updatedAt).toBeNull();

    const saved = await json<FaiSheetDto>(
      api(path, {
        method: "PUT",
        as: t.userId,
        json: {
          entries: {
            "1": { result: "accept", tooling: "mill cert" },
            "3": { result: "3.2560", location: "C4" },
            "4.1": { result: ".2015" },
            "6": { result: "2.001" },
            "99": { result: "ignored: no such row" },
            "5": { result: "  " },
          },
          added: [
            {
              requirement: "[2.000] BASIC",
              lower: 1.995,
              upper: 2.005,
              unit: "in",
              record: "value",
            },
          ],
        },
      }),
    );
    const v = Object.fromEntries(saved.rows.map((r) => [r.no, r.verdict]));
    expect(v).toMatchObject({
      "1": "accept",
      "3": "reject",
      "4.1": "accept",
      "4.2": "open",
      "6": "accept",
    });
    expect(saved.rows.find((r) => r.no === "3")?.reason).toContain("enter a nonconformance number");
    expect(saved.summary).toMatchObject({ total: 9, accepted: 3, rejected: 1, open: 5 });
    expect(saved.rows.find((r) => r.no === "5")?.entry).toEqual({});
    expect(saved.updatedAt).not.toBeNull();

    const res = await api(t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/form3.csv`), {
      as: t.userId,
    });
    expect(res.headers.get("content-disposition")).toContain("BRK-1001-form3.csv");
    const rows = (await res.text()).trimEnd().split("\r\n");
    expect(rows).toContain(
      "3,C4,,3.250 ±.005,3.2560,,,Dimension,3.245,3.255,in,value,6,reject,3.256 is over the upper limit 3.255 in; enter a nonconformance number",
    );
    expect(rows.at(-1)).toBe(
      "6,,,[2.000] BASIC,2.001,,,Added by inspector,1.995,2.005,in,value,,accept,",
    );
  });

  it("lets a viewer read the sheet but not save it, and hides it from another shop", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const path = `/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/first-article`;
    const viewer = await addMember(t.orgId, "viewer");
    expect((await api(t.path(path), { as: viewer })).status).toBe(200);
    const put = await api(t.path(path), {
      method: "PUT",
      as: viewer,
      json: { entries: {}, added: [] },
    });
    expect(put.status).toBe(403);
    const bad = await api(t.path(path), {
      method: "PUT",
      as: t.userId,
      json: { entries: { "1": { verdict: "accept" } }, added: [] },
    });
    expect(bad.status).toBe(400);
    const other = await setupTenant();
    expect((await api(other.path(path), { as: other.userId })).status).toBe(404);
    const cross = await api(other.path(path), {
      method: "PUT",
      as: other.userId,
      json: { entries: {}, added: [] },
    });
    expect(cross.status).toBe(404);
  });
});
