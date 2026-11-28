// ISO 9001 gauge calibration (7.1.5): the list, a calibration and its due date, an out-of-tolerance
// result and its impact record, the CSV, the plan gate, roles and tenants.
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

interface Gauge {
  id: string;
  tag: string;
  status: string;
  intervalMonths: number | null;
}
interface GaugeList {
  items: (Gauge & {
    state: string;
    dueOn: string | null;
    lastCalibratedOn: string | null;
    issues: { kind: string; text: string }[];
  })[];
  check: {
    total: number;
    inUse: number;
    overdue: number;
    never: number;
    openOutOfTolerance: number;
  };
  due: { tag: string; state: string }[];
  kinds: { key: string }[];
}
interface Cal {
  id: string;
  calibratedOn: string;
  asFound: string;
  dueOn: string | null;
  impact: string;
  fileName: string | null;
}

const caliper = (over: Record<string, unknown> = {}) => ({
  tag: "CAL-014",
  description: "0-6 in digital caliper",
  kind: "caliper",
  intervalMonths: 12,
  ...over,
});
const labCal = (over: Record<string, unknown> = {}) => ({
  calibratedOn: daysAgo(400),
  performer: "external",
  performedBy: "Acme Calibration Lab",
  asFound: "in_tolerance",
  asLeft: "returned",
  certificateNo: "C-88121",
  traceability: "ISO/IEC 17025 accredited, cert 1234.01",
  ...over,
});
const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/gauges"), { method: "POST", as, json: body });
const calibrate = (t: Tenant, id: string, body: unknown, as = t.userId) =>
  api(path(t, `/gauges/${id}/calibrations`), { method: "POST", as, json: body });
const list = (t: Tenant, as = t.userId) => json<GaugeList>(api(path(t, "/gauges"), { as }));

describe("gauge calibration", () => {
  it("runs a gauge from no record to overdue to current, then out of tolerance and its impact", async () => {
    const t = await setupTenant();
    const g = await json<Gauge>(add(t, caliper()), 201);
    let l = await list(t);
    expect(l.items[0]).toMatchObject({ state: "never", dueOn: null });
    expect(l.check).toMatchObject({ total: 1, inUse: 1, never: 1 });
    expect(l.kinds.length).toBeGreaterThan(10);

    // A certificate 400 days old on a 12-month interval: overdue.
    await json(calibrate(t, g.id, labCal()), 201);
    l = await list(t);
    expect(l.items[0]?.state).toBe("overdue");
    expect(l.due.map((d) => d.tag)).toEqual(["CAL-014"]);

    // Calibrated again, found out of tolerance and adjusted: current, but the impact is open.
    const r = await json<{ history: Cal[] }>(
      calibrate(
        t,
        g.id,
        labCal({ calibratedOn: daysAgo(3), asFound: "out_of_tolerance", asLeft: "adjusted" }),
      ),
      201,
    );
    expect(r.history).toHaveLength(2);
    expect(r.history[0]?.dueOn).not.toBeNull();
    l = await list(t);
    expect(l.items[0]?.state).toBe("current");
    expect(l.check.openOutOfTolerance).toBe(1);
    const gap = l.items[0]?.issues.find((i) => i.kind === "gap");
    expect(gap?.text).toContain(`since ${daysAgo(400)}`);

    // An in-tolerance result cannot take an impact record; the out-of-tolerance one can.
    const inTol = r.history[1] as Cal;
    const wrong = await api(path(t, `/gauges/${g.id}/calibrations/${inTol.id}/impact`), {
      method: "PUT",
      as: t.userId,
      json: { impact: "n/a" },
    });
    expect(wrong.status).toBe(409);
    const out = r.history[0] as Cal;
    const after = await json<{ items: Cal[] }>(
      api(path(t, `/gauges/${g.id}/calibrations/${out.id}/impact`), {
        method: "PUT",
        as: t.userId,
        json: {
          impact: "Lots 4411-4419 re-measured on the CMM: all in tolerance.",
          correctiveActionRef: "CA-0007",
        },
      }),
    );
    expect(after.items[0]?.impact).toContain("Lots 4411");
    l = await list(t);
    expect(l.check.openOutOfTolerance).toBe(0);
    expect(l.items[0]?.issues).toEqual([]);

    // Kept: a gauge with calibrations is retired, not deleted.
    const del = await api(path(t, `/gauges/${g.id}`), { method: "DELETE", as: t.userId });
    expect(del.status).toBe(409);
  });

  it("takes a gauge removed at calibration out of service, and back after a repair", async () => {
    const t = await setupTenant();
    const g = await json<Gauge>(add(t, caliper({ tag: "MIC-1", kind: "micrometer" })), 201);
    const r = await json<{ gauge: Gauge }>(
      calibrate(
        t,
        g.id,
        labCal({ calibratedOn: daysAgo(5), asFound: "out_of_tolerance", asLeft: "removed" }),
      ),
      201,
    );
    expect(r.gauge.status).toBe("out_of_service");
    const back = await json<{ gauge: Gauge }>(
      calibrate(t, g.id, labCal({ calibratedOn: daysAgo(1), asLeft: "adjusted" })),
      201,
    );
    expect(back.gauge.status).toBe("active");
    // An older certificate found later does not change the status.
    const old = await json<{ gauge: Gauge }>(
      calibrate(t, g.id, labCal({ calibratedOn: daysAgo(900), asLeft: "removed" })),
      201,
    );
    expect(old.gauge.status).toBe("active");
  });

  it("links the certificate file the org holds and refuses another org's", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const g = await json<Gauge>(add(t, caliper()), 201);
    const form = new FormData();
    form.set("title", "CAL-014 certificate");
    form.set("noCui", "true");
    form.set("file", new File(["%PDF-1.4 cert"], "cal-014.pdf", { type: "application/pdf" }));
    const ev = await json<{ id: string }>(
      api(path(other, "/evidence"), { method: "POST", as: other.userId, body: form }),
      201,
    );
    const refused = await calibrate(t, g.id, labCal({ evidenceId: ev.id }));
    expect(refused.status).toBe(400);
    const form2 = new FormData();
    form2.set("title", "CAL-014 certificate");
    form2.set("noCui", "true");
    form2.set("file", new File(["%PDF-1.4 cert"], "cal-014.pdf", { type: "application/pdf" }));
    const mine = await json<{ id: string }>(
      api(path(t, "/evidence"), { method: "POST", as: t.userId, body: form2 }),
      201,
    );
    const r = await json<{ history: Cal[] }>(
      calibrate(t, g.id, labCal({ evidenceId: mine.id })),
      201,
    );
    expect(r.history[0]?.fileName).toBe("cal-014.pdf");
  });

  it("checks the fields: interval for a gauge in use, unique ids, no future dates", async () => {
    const t = await setupTenant();
    expect((await add(t, caliper({ intervalMonths: null }))).status).toBe(400);
    await json(
      add(t, caliper({ tag: "REF-1", status: "reference_only", intervalMonths: null })),
      201,
    );
    await json(add(t, caliper()), 201);
    expect((await add(t, caliper())).status).toBe(409);
    const g = (await list(t)).items.find((i) => i.tag === "CAL-014") as Gauge;
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await calibrate(t, g.id, labCal({ calibratedOn: tomorrow }))).status).toBe(400);
    // Reference only is not in use: nothing due.
    const l = await list(t);
    expect(l.items.find((i) => i.tag === "REF-1")?.state).toBe("not_in_use");
  });

  it("downloads the list as CSV", async () => {
    const t = await setupTenant();
    const g = await json<Gauge>(add(t, caliper()), 201);
    await json(calibrate(t, g.id, labCal({ calibratedOn: daysAgo(10) })), 201);
    const res = await api(path(t, "/gauges/export.csv"), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("CAL-014");
    expect(lines[1]).toContain("C-88121");
    expect(lines[1]).toMatch(/Current$/);
  });

  it("puts due dates in the calendar file and the subscribable link as counts, no gauge ids", async () => {
    const t = await setupTenant();
    const a = await json<Gauge>(add(t, caliper()), 201);
    const b = await json<Gauge>(add(t, caliper({ tag: "MIC-2", description: "1-2 in mic" })), 201);
    await json(add(t, caliper({ tag: "NEW-3", description: "Never calibrated" })), 201);
    await json(calibrate(t, a.id, labCal({ calibratedOn: daysAgo(10) })), 201);
    await json(calibrate(t, b.id, labCal({ calibratedOn: daysAgo(10) })), 201);
    const due = (await list(t)).items.find((i) => i.tag === "CAL-014")?.dueOn ?? "";
    expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const day = due.replace(/-/g, "");
    const file = await (await api(path(t, "/affirmations/calendar.ics"), { as: t.userId })).text();
    expect(file).toContain(`UID:cmmc-${t.orgId}-calibration-${day}@cmmc-workspace`);
    expect(file).toContain("SUMMARY:Calibration due: 2 gauges");
    for (const secret of ["CAL-014", "MIC-2", "NEW-3", "caliper", "Acme Calibration Lab"])
      expect(file).not.toContain(secret);

    const feed = await json<{ url: string }>(
      api(path(t, "/affirmations/calendar-feed"), { method: "POST", as: t.userId }),
      201,
    );
    const link = await api(new URL(feed.url).pathname);
    expect(link.status).toBe(200);
    const linked = await link.text();
    expect(linked).toContain("SUMMARY:Calibration due: 2 gauges");
    expect(linked).not.toContain("CAL-014");

    // Another org's calendar carries none of these dates.
    const other = await setupTenant();
    const theirs = await (
      await api(`/api/orgs/${other.orgId}/affirmations/calendar.ics`, { as: other.userId })
    ).text();
    expect(theirs).not.toContain("Calibration due");
  });

  it("is readable on every plan; recording needs Level 2 + Quality", async () => {
    for (const plan of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", plan);
      await json(api(path(t, "/gauges"), { as: t.userId }));
      const res = await add(t, caliper());
      expect(res.status).toBe(402);
      expect(await res.text()).toContain("needs the Level 2 + Quality plan");
    }
  });

  it("lets viewers read but not write, and keeps tenants apart", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    const g = await json<Gauge>(add(t, caliper()), 201);
    await json(api(path(t, "/gauges"), { as: viewer.id }));
    expect((await add(t, caliper({ tag: "X" }), viewer.id)).status).toBe(403);
    expect((await calibrate(t, g.id, labCal(), viewer.id)).status).toBe(403);

    const other = await setupTenant();
    expect((await list(other)).items).toEqual([]);
    const cross = await api(`/api/orgs/${other.orgId}/gauges/${g.id}/calibrations`, {
      method: "POST",
      as: other.userId,
      json: labCal(),
    });
    expect(cross.status).toBe(404);
    const peek = await api(`/api/orgs/${t.orgId}/gauges`, { as: other.userId });
    expect(peek.status).toBe(404);
  });
});
