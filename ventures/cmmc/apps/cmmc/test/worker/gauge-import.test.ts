// Gauge list import: preview without writing, apply with last calibrations as records only when their
// result and who did it are known, ids already listed left alone (so the register's own export reads
// back as no change), the plan gate, roles, audit and tenants.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const monthsOn = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

interface Preview {
  changes: {
    tag: string;
    kind: string;
    status: string;
    intervalMonths: number | null;
    calibration: {
      calibratedOn: string;
      asFound: string;
      dueOn: string | null;
      resultSource: string;
    } | null;
  }[];
  alreadyListed: number;
  needResult: number;
  needPerformer: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  applied: boolean;
}
interface GaugeList {
  items: {
    id: string;
    tag: string;
    status: string;
    state: string;
    dueOn: string | null;
    lastCalibratedOn: string | null;
    serial: string;
  }[];
}

const send = (t: Tenant, body: Record<string, unknown>, as = t.userId) =>
  api(path(t, "/gauges/import"), { method: "POST", as, json: body });
const list = (t: Tenant) => json<GaugeList>(api(path(t, "/gauges"), { as: t.userId }));

const recent = daysAgo(40);
const old = daysAgo(500);
const LIST = [
  "Gage #,Description,S/N,Interval (months),Last Cal Date,Next Cal Due,Calibrated by,Result,Status",
  `C-001,0-6 in digital caliper,A123,12,${recent},${monthsOn(recent, 12)},Acme Cal Lab,Pass,Active`,
  `M-002,0-1 in OD mic,,6,${old},,In-house,,Active`,
  `H-003,12 in height gage,,12,${recent},,,,Active`,
  "R-004,Granite surface plate,,,,,,,Reference only",
].join("\n");

describe("gauge list import", () => {
  it("previews without writing, then adds gauges with the calibrations it can vouch for", async () => {
    const t = await setupTenant();
    const p = await json<Preview>(send(t, { csv: LIST }));
    expect(p.applied).toBe(false);
    expect(p.changes.map((c) => [c.tag, c.kind, c.status, c.calibration?.asFound ?? null])).toEqual(
      [
        ["C-001", "caliper", "active", "in_tolerance"],
        ["M-002", "micrometer", "active", null],
        ["H-003", "height_gauge", "active", null],
        ["R-004", "surface_plate", "reference_only", null],
      ],
    );
    expect(p).toMatchObject({ needResult: 2, needPerformer: 1 });
    expect((await list(t)).items).toHaveLength(0);

    // The person states the results and who calibrated the rest.
    const applied = await json<Preview>(
      send(t, { csv: LIST, apply: true, lastCalPassed: true, performerDefault: "external" }),
    );
    expect(applied.applied).toBe(true);
    expect(
      applied.changes.filter((c) => c.calibration).map((c) => c.calibration?.resultSource),
    ).toEqual(["file", "statement", "statement"]);
    const l = await list(t);
    const by = Object.fromEntries(l.items.map((g) => [g.tag, g]));
    expect(by["C-001"]).toMatchObject({
      state: "current",
      serial: "A123",
      dueOn: monthsOn(recent, 12),
    });
    expect(by["M-002"]?.state).toBe("overdue");
    expect(by["H-003"]?.state).toBe("current");
    expect(by["R-004"]?.state).toBe("not_in_use");

    const hist = await json<{ items: { performer: string; readings: string }[] }>(
      api(path(t, `/gauges/${by["H-003"]?.id}/calibrations`), { as: t.userId }),
    );
    expect(hist.items[0]?.performer).toBe("external");
    expect(hist.items[0]?.readings).toContain("stated");

    // The same file again, and the register's own export, change nothing.
    const again = await json<Preview>(send(t, { csv: LIST, apply: true, lastCalPassed: true }));
    expect(again).toMatchObject({ alreadyListed: 4, applied: false });
    const exported = await api(path(t, "/gauges/export.csv"), { as: t.userId });
    const round = await json<Preview>(send(t, { csv: await exported.text() }));
    expect(round.changes).toHaveLength(0);
    expect(round.alreadyListed).toBe(4);

    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.filter((e) => e.action === "gauge.import")).toHaveLength(1);
  });

  it("without the statement, a gauge comes in as never calibrated", async () => {
    const t = await setupTenant();
    await json(send(t, { csv: LIST, apply: true }));
    const by = Object.fromEntries((await list(t)).items.map((g) => [g.tag, g.state]));
    expect(by).toMatchObject({ "C-001": "current", "M-002": "never", "H-003": "never" });
  });

  it("previews on every plan; adding needs Level 2 + Quality", async () => {
    for (const plan of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", plan);
      const p = await json<Preview>(send(t, { csv: LIST }));
      expect(p.changes).toHaveLength(4);
      const res = await send(t, { csv: LIST, apply: true });
      expect(res.status).toBe(402);
      expect((await list(t)).items).toEqual([]);
    }
  });

  it("keeps viewers out and tenants apart", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await send(t, { csv: LIST }, viewer.id)).status).toBe(403);
    const other = await setupTenant("owner", "Other shop");
    expect((await send(t, { csv: LIST }, other.userId)).status).toBe(404);
    await json<Preview>(send(t, { csv: LIST, apply: true }));
    expect((await list(other)).items).toEqual([]);
  });
});
