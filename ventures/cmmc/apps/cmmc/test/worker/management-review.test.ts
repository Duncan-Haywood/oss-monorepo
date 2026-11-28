// ISO 9001 management review (9.3): a draft whose figures come from the org's records, what blocks
// finalising, the frozen minutes, the next review reading the last one's actions, the plan gate,
// roles and tenants.
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

interface Action {
  id: string;
  text: string;
  owner: string;
  dueOn: string | null;
  doneOn: string | null;
}
interface Review {
  id: string;
  status: string;
  heldOn: string;
  periodFrom: string;
  periodTo: string;
  facts: Record<string, string[]>;
  problems: string[];
  actions: Action[];
  finalisedOn: string | null;
}
interface ReviewList {
  items: Review[];
  attention: { timing: string; nextDueOn: string | null; actionsOpen: number; drafts: number };
  inputs: { key: string }[];
  outputs: { key: string }[];
}

const list = (t: Tenant, as = t.userId) => json<ReviewList>(api(path(t, "/reviews"), { as }));
const create = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/reviews"), { method: "POST", as, json: body });
const patch = (t: Tenant, id: string, body: unknown, as = t.userId) =>
  api(path(t, `/reviews/${id}`), { method: "PATCH", as, json: body });
const finalise = (t: Tenant, id: string, as = t.userId) =>
  api(path(t, `/reviews/${id}/finalise`), { method: "POST", as });

const complete = (keys: { key: string }[], text: string) =>
  Object.fromEntries(keys.map((k) => [k.key, text]));

describe("management review", () => {
  it("fills a draft from the records, refuses incomplete minutes, then freezes them", async () => {
    const t = await setupTenant();
    // A customer complaint logged as a corrective action, inside the period.
    await json(
      api(path(t, "/corrective-actions"), {
        method: "POST",
        as: t.userId,
        json: {
          source: "customer_complaint",
          nonconformity: "Bore 0.002 oversize on lot 4411",
          raisedOn: daysAgo(30),
        },
      }),
      201,
    );
    const r = await json<Review>(create(t, { heldOn: daysAgo(1), attendees: "Dana (owner)" }), 201);
    expect(r).toMatchObject({ status: "draft", periodTo: daysAgo(1) });
    expect(r.facts.customer_feedback?.[0]).toContain("1 customer complaint");
    expect(r.facts.nonconformities?.[0]).toContain("1 corrective action raised in the period");
    expect(r.problems.some((p) => p.startsWith("Quality objectives"))).toBe(true);
    expect(r.problems.some((p) => p.startsWith("Customer satisfaction"))).toBe(false);

    const refused = await finalise(t, r.id);
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("Quality objectives");

    const l = await list(t);
    const saved = await json<Review>(
      patch(t, r.id, {
        inputs: complete(l.inputs, "Discussed; nothing further."),
        outputs: complete(l.outputs, "None."),
        actions: [
          {
            text: "Add a bore gauge check at op 30",
            owner: "Sam",
            dueOn: daysAgo(-60),
            doneOn: null,
          },
        ],
      }),
    );
    expect(saved.problems).toEqual([]);
    const done = await json<Review>(finalise(t, r.id));
    expect(done).toMatchObject({ status: "final", finalisedOn: daysAgo(0) });

    // Frozen: no edits, no delete; a new complaint does not change the kept figures.
    expect((await patch(t, r.id, { attendees: "x" })).status).toBe(409);
    expect(
      (await api(path(t, `/reviews/${r.id}`), { method: "DELETE", as: t.userId })).status,
    ).toBe(409);
    await json(
      api(path(t, "/corrective-actions"), {
        method: "POST",
        as: t.userId,
        json: { source: "customer_return", nonconformity: "Parts returned", raisedOn: daysAgo(2) },
      }),
      201,
    );
    const after = await list(t);
    expect(after.items[0]?.facts.customer_feedback?.[0]).toContain("0 returns or rejections");
    expect(after.attention).toMatchObject({ timing: "current", actionsOpen: 1 });

    // The action can still be marked done.
    const actionId = done.actions[0]?.id as string;
    const marked = await json<Review>(
      api(path(t, `/reviews/${r.id}/actions/${actionId}/done`), {
        method: "PUT",
        as: t.userId,
        json: { doneOn: daysAgo(0) },
      }),
    );
    expect(marked.actions[0]?.doneOn).toBe(daysAgo(0));

    // The minutes download names every heading and the action.
    const minutes = await api(path(t, `/reviews/${r.id}/minutes.md`), { as: t.userId });
    expect(minutes.status).toBe(200);
    const text = await minutes.text();
    expect(text).toContain("# Management review minutes");
    expect(text).toContain("Add a bore gauge check at op 30");
    expect(text).toContain("(9.3.2 c 1)");
  });

  it("starts the next review where the last one's period ended and reads its actions", async () => {
    const t = await setupTenant();
    const l = await list(t);
    const first = await json<Review>(
      create(t, {
        heldOn: daysAgo(400),
        attendees: "Dana",
        inputs: complete(l.inputs, "Nothing to report."),
        outputs: complete(l.outputs, "None."),
        actions: [
          {
            text: "Write a calibration procedure",
            owner: "Sam",
            dueOn: daysAgo(300),
            doneOn: null,
          },
        ],
      }),
      201,
    );
    await json(finalise(t, first.id));
    expect((await list(t)).attention.timing).toBe("overdue");
    const next = await json<Review>(create(t, { heldOn: daysAgo(0) }), 201);
    expect(next.periodFrom).toBe(daysAgo(399));
    expect(next.facts.previous_actions).toEqual([
      `The review of ${daysAgo(400)} set 1 action: 0 done, 1 open, 1 past due.`,
      `Open: Write a calibration procedure (Sam, due ${daysAgo(300)}).`,
    ]);
    // A draft can be deleted.
    await json(api(path(t, `/reviews/${next.id}`), { method: "DELETE", as: t.userId }));
  });

  it("checks dates", async () => {
    const t = await setupTenant();
    const bad = await create(t, {
      heldOn: daysAgo(10),
      periodFrom: daysAgo(5),
      periodTo: daysAgo(8),
    });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("starts after it ends");
  });

  it("is readable on every plan; recording needs Level 2 + Quality", async () => {
    for (const plan of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", plan);
      await json(api(path(t, "/reviews"), { as: t.userId }));
      const res = await create(t, { heldOn: daysAgo(1) });
      expect(res.status).toBe(402);
      expect(await res.text()).toContain("needs the Level 2 + Quality plan");
    }
  });

  it("lets viewers read but not write, and keeps tenants apart", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    const r = await json<Review>(create(t, { heldOn: daysAgo(1) }), 201);
    await json(api(path(t, "/reviews"), { as: viewer.id }));
    expect((await create(t, { heldOn: daysAgo(1) }, viewer.id)).status).toBe(403);
    expect((await finalise(t, r.id, viewer.id)).status).toBe(403);

    const other = await setupTenant();
    expect((await list(other)).items).toEqual([]);
    expect((await patch(other, r.id, { attendees: "x" })).status).toBe(404);
    expect(
      (await api(path(other, `/reviews/${r.id}/minutes.md`), { as: other.userId })).status,
    ).toBe(404);
    const peek = await api(`/api/orgs/${t.orgId}/reviews`, { as: other.userId });
    expect(peek.status).toBe(404);
  });
});
