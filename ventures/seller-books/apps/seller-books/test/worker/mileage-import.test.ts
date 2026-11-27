import { describe, expect, it } from "vitest";
import everlanceCsv from "../fixtures/mileage-everlance-style.csv?raw";
import mileiqCsv from "../fixtures/mileage-mileiq-style.csv?raw";
import { api, json, setupTenant } from "./helpers";

interface PreviewRow {
  line: number;
  date: string;
  milesTenths: number;
  purpose: string | null;
  startPlace: string | null;
  endPlace: string | null;
  alreadyInBooks: boolean;
}

const preview = (as: string, orgId: string, csv: string) =>
  api(`/api/orgs/${orgId}/mileage/import/preview`, {
    method: "POST",
    as,
    json: { fileName: "trips.csv", csv },
  });

const save = (as: string, orgId: string, trips: unknown[]) =>
  api(`/api/orgs/${orgId}/mileage/import`, {
    method: "POST",
    as,
    json: { fileName: "trips.csv", trips },
  });

const asTrips = (rows: PreviewRow[], purpose = "Sourcing run") =>
  rows
    .filter((r) => !r.alreadyInBooks)
    .map((r) => ({
      date: r.date,
      purpose: r.purpose ?? purpose,
      startPlace: r.startPlace,
      endPlace: r.endPlace,
      milesTenths: r.milesTenths,
    }));

const log = async (as: string, orgId: string) =>
  json<{ items: { purpose: string; milesTenths: number }[]; totalMiles: number; trips: number }>(
    await api(`/api/orgs/${orgId}/mileage?from=2026-01-01&to=2026-12-31`, { as }),
  );

describe("mileage from a tracker export", () => {
  it("previews without writing, saves the trips, and marks them on a second read", async () => {
    const { userId, orgId } = await setupTenant();
    const res = await preview(userId, orgId, mileiqCsv);
    expect(res.status).toBe(200);
    const p = await json<{ rows: PreviewRow[]; skipped: unknown[] }>(res);
    expect(p.rows).toHaveLength(3);
    expect(p.skipped).toHaveLength(4);
    expect((await log(userId, orgId)).trips).toBe(0);

    const saved = await save(userId, orgId, asTrips(p.rows));
    expect(saved.status).toBe(201);
    expect(await json(saved)).toEqual({ created: 3, duplicatesSkipped: 0, miles: 27.7 });
    const after = await log(userId, orgId);
    expect(after.trips).toBe(3);
    expect(after.totalMiles).toBeCloseTo(27.7, 5);

    const again = await json<{ rows: PreviewRow[] }>(await preview(userId, orgId, mileiqCsv));
    expect(again.rows.every((r) => r.alreadyInBooks)).toBe(true);
    // Sending them anyway adds nothing.
    const dup = await json(await save(userId, orgId, asTrips(p.rows)));
    expect(dup).toMatchObject({ created: 0, duplicatesSkipped: 3 });
    expect((await log(userId, orgId)).trips).toBe(3);
  });

  it("keeps the file's purpose and requires one for every trip", async () => {
    const { userId, orgId } = await setupTenant();
    const p = await json<{ rows: PreviewRow[] }>(await preview(userId, orgId, everlanceCsv));
    expect(p.rows.map((r) => r.purpose)).toEqual([
      "Sourcing: estate sale",
      null,
      "Shipping supplies",
    ]);
    const noPurpose = p.rows.map((r) => ({ ...asTrips([r])[0], purpose: r.purpose ?? "" }));
    expect((await save(userId, orgId, noPurpose)).status).toBe(400);
    expect((await log(userId, orgId)).trips).toBe(0); // all or nothing
    expect((await save(userId, orgId, asTrips(p.rows, "Sourcing: estate sale, home"))).status).toBe(
      201,
    );
    const purposes = (await log(userId, orgId)).items.map((t) => t.purpose).sort();
    expect(purposes).toEqual([
      "Shipping supplies",
      "Sourcing: estate sale",
      "Sourcing: estate sale, home",
    ]);
  });

  it("answers a file it cannot read with the columns it expected", async () => {
    const { userId, orgId } = await setupTenant();
    const res = await preview(userId, orgId, "Date,Purpose\n2026-01-01,Sourcing\n");
    expect(res.status).toBe(400);
    expect(JSON.stringify(await json(res))).toMatch(/distance/i);
  });

  it("refuses viewers and keeps shops apart", async () => {
    const viewer = await setupTenant("viewer");
    expect((await preview(viewer.userId, viewer.orgId, mileiqCsv)).status).toBe(403);
    const trip = { date: "2026-01-06", purpose: "Sourcing", milesTenths: 10 };
    expect((await save(viewer.userId, viewer.orgId, [trip])).status).toBe(403);
    const a = await setupTenant();
    const b = await setupTenant();
    expect((await save(a.userId, b.orgId, [trip])).status).toBe(404);
    expect((await preview(a.userId, b.orgId, mileiqCsv)).status).toBe(404);
  });
});
