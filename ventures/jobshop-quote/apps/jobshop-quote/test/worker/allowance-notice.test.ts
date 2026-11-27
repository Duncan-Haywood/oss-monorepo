// "You have used 80% of this month's RFQs" emails (services/allowance-notice.ts, docs/BILLING.md).
import type { RfqDetailDto } from "@shared/api";
import { catalog, FREE_PLAN, type Plan } from "@shared/plans";
import { testFakes } from "@worker/context";
import { allowanceNotices, rfqCounts, rfqs, subscriptions, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import {
  allowanceEmail,
  nextPlanUp,
  reachedThreshold,
  thresholdCount,
} from "@worker/services/allowance-notice";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { addMember, api, json, setupTenant, testDb } from "./helpers";

afterEach(() => {
  testFakes.llmHandlers.clear();
});

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const RFQ_TEXT = `From: buyer@example.com
Company: Example Robotics LLC
Please quote part number BRK-1001 Rev B, material 6061-T6 aluminum, qty 10.`;

async function newRfq(t: Tenant) {
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), {
      method: "POST",
      as: t.userId,
      json: { subject: "RFQ", bodyText: RFQ_TEXT },
    }),
    201,
  );
}
const extract = async (t: Tenant) => {
  const rfq = await newRfq(t);
  return api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId });
};

async function useAllowance(orgId: string, userId: string, n: number) {
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const id = newId("rfq");
    await testDb()
      .insert(rfqs)
      .values({ id, orgId, bodyText: "x", createdBy: userId, countedAt: now });
    await testDb()
      .insert(rfqCounts)
      .values({ id: newId("rfc"), orgId, rfqId: id, units: 1, pages: 0, countedAt: now });
  }
}

async function emailOf(userId: string) {
  const row = await testDb()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  return row?.email ?? "";
}
const mailTo = (address: string, since: number) =>
  testFakes.email.sent.slice(since).filter((m) => m.to.includes(address));

describe("thresholds", () => {
  it("80% rounds up to a whole RFQ; 100% is the allowance", () => {
    expect(thresholdCount(40, 80)).toBe(32);
    expect(thresholdCount(125, 80)).toBe(100);
    expect(thresholdCount(300, 80)).toBe(240);
    expect(reachedThreshold(31, 40)).toBeNull();
    expect(reachedThreshold(32, 40)).toBe(80);
    expect(reachedThreshold(39, 40)).toBe(80);
    expect(reachedThreshold(40, 40)).toBe(100);
    expect(reachedThreshold(43, 40)).toBe(100);
    expect(reachedThreshold(0, 0)).toBeNull();
  });

  it("the next plan up is the cheapest one on sale with a bigger allowance", () => {
    expect(nextPlanUp(FREE_PLAN)?.key).toBe("shop");
    expect(nextPlanUp(catalog.get("shop") as Plan)?.key).toBe("shop_plus");
    expect(nextPlanUp(catalog.get("shop_plus") as Plan)).toBeNull();
    expect(nextPlanUp(catalog.get("comp") as Plan)).toBeNull();
  });
});

describe("allowanceEmail", () => {
  const facts = {
    shopName: "Acme Machine",
    orgId: "org_1",
    plan: FREE_PLAN,
    threshold: 80 as const,
    used: 32,
    resetsOn: "2026-12-01",
    checkoutOn: true,
  };

  it("80%: the counts, the reset date, the next plan from the catalog and the billing link", () => {
    const m = allowanceEmail("https://app.example/", facts);
    expect(m.subject).toBe("Acme Machine: 80% of this month's RFQs used");
    expect(m.text).toContain(
      "has used 32 of this month's 40 RFQs on the Early access plan (80%); 8 are left.",
    );
    expect(m.text).toContain("starts again on 2026-12-01 (UTC)");
    const shop = catalog.get("shop") as Plan;
    expect(m.text).toContain(
      `The Shop plan includes ${shop.rfqsPerMonth} RFQs a month for $${shop.priceCents / 100} a month.`,
    );
    expect(m.text).toContain("https://app.example/app/org_1/billing");
  });

  it("100%: says what still works", () => {
    const m = allowanceEmail("https://app.example", { ...facts, threshold: 100, used: 40 });
    expect(m.subject).toBe("Acme Machine: this month's RFQ allowance is used");
    expect(m.text).toContain("has used all 40 RFQs");
    expect(m.text).toContain("you can still enter parts by hand, price them and send quotes");
  });

  it("while checkout is dark, says paid plans are not on sale and names no price", () => {
    const m = allowanceEmail("https://app.example", { ...facts, checkoutOn: false });
    expect(m.text).toContain("Paid plans are not on sale yet");
    expect(m.text).not.toMatch(/\$\d/);
    expect(m.text).not.toContain("/billing");
  });

  it("a shop name cannot carry a link", () => {
    const m = allowanceEmail("https://app.example", {
      ...facts,
      shopName: "Evil https://x.example",
    });
    expect(m.text).not.toContain("https://x.example");
    expect(m.subject).not.toContain("x.example");
  });
});

describe("on AI reads", () => {
  it("the read that reaches 80% emails owners and admins once, not estimators", async () => {
    const t = await setupTenant();
    const admin = await addMember(t.orgId, "admin");
    const estimator = await addMember(t.orgId, "estimator");
    const [ownerMail, adminMail, estMail] = await Promise.all([
      emailOf(t.userId),
      emailOf(admin),
      emailOf(estimator),
    ]);
    await useAllowance(t.orgId, t.userId, 30);
    const since = testFakes.email.sent.length;

    expect((await extract(t)).status).toBe(200); // 31: below 80%
    expect(mailTo(ownerMail, since)).toHaveLength(0);

    expect((await extract(t)).status).toBe(200); // 32 of 40
    expect(mailTo(ownerMail, since)).toHaveLength(1);
    expect(mailTo(adminMail, since)).toHaveLength(1);
    expect(mailTo(estMail, since)).toHaveLength(0);
    expect(mailTo(ownerMail, since)[0]?.subject).toContain("80% of this month's RFQs used");

    expect((await extract(t)).status).toBe(200); // 33: no second 80% email
    expect(mailTo(ownerMail, since)).toHaveLength(1);

    const row = await testDb()
      .select()
      .from(allowanceNotices)
      .where(eq(allowanceNotices.orgId, t.orgId))
      .get();
    expect(row).toMatchObject({ threshold: 80, used: 32, allowance: 40, sent: 2, failed: 0 });
  });

  it("the read that uses the last RFQ sends the 100% email once", async () => {
    const t = await setupTenant();
    const ownerMail = await emailOf(t.userId);
    await useAllowance(t.orgId, t.userId, 38);
    const since = testFakes.email.sent.length;
    expect((await extract(t)).status).toBe(200); // 39: 80% (passed earlier without a read here)
    expect((await extract(t)).status).toBe(200); // 40
    const mails = mailTo(ownerMail, since);
    expect(mails.map((m) => m.subject)).toEqual([
      "Test Shop: 80% of this month's RFQs used",
      "Test Shop: this month's RFQ allowance is used",
    ]);
    expect((await extract(t)).status).toBe(402);
    expect(mailTo(ownerMail, since)).toHaveLength(2);
  });

  it("re-reading an RFQ already counted sends nothing", async () => {
    const t = await setupTenant();
    const ownerMail = await emailOf(t.userId);
    await useAllowance(t.orgId, t.userId, 32);
    const rfq = await newRfq(t);
    await testDb().delete(allowanceNotices).where(eq(allowanceNotices.orgId, t.orgId));
    const since = testFakes.email.sent.length;
    const read = () => api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId });
    expect((await read()).status).toBe(200); // 33: counted, crosses (already past) 80%
    expect(mailTo(ownerMail, since)).toHaveLength(1);
    await testDb().delete(allowanceNotices).where(eq(allowanceNotices.orgId, t.orgId));
    expect((await read()).status).toBe(200); // free re-read: no count, no email
    expect(mailTo(ownerMail, since)).toHaveLength(1);
  });

  it("the complimentary plan never gets one; another shop's reads never count", async () => {
    const comp = await setupTenant();
    await testDb()
      .insert(subscriptions)
      .values({ orgId: comp.orgId, planKey: "comp", status: "comp" });
    await useAllowance(comp.orgId, comp.userId, 45);
    const other = await setupTenant();
    await useAllowance(other.orgId, other.userId, 10);
    const [compMail, otherMail] = await Promise.all([emailOf(comp.userId), emailOf(other.userId)]);
    const since = testFakes.email.sent.length;
    expect((await extract(comp)).status).toBe(200);
    expect((await extract(other)).status).toBe(200);
    expect(mailTo(compMail, since)).toHaveLength(0);
    expect(mailTo(otherMail, since)).toHaveLength(0);
  });
});
