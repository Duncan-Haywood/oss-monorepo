// The automatic-renewal notice (services/billing/renewal-notices.ts): the daily run mails a shop's
// owner and admins once, 26 to 39 days before a yearly renewal (or a monthly plan's twelve-month
// mark), with the price, the cycle and the one-step cancel; nothing for a plan set to cancel, a comp
// grant or a lapsed one; editors and viewers get nothing; a second run sends nothing more.
import { env } from "cloudflare:workers";
import { createAppContext, testFakes } from "@worker/context";
import { member, renewalNotices, subscriptions } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { billedPrice, sendRenewalNotices } from "@worker/services/billing/renewal-notices";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestUser, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const runAt = (iso: string) =>
  sendRenewalNotices(
    createAppContext(env as unknown as Env, { now: () => new Date(`${iso}T14:00:00Z`) }),
  );
const mailTo = (address: string) => testFakes.email.sent.filter((m) => m.to.includes(address));
const day = (iso: string) => new Date(`${iso}T08:00:00Z`);

async function paid(
  t: Tenant,
  over: Partial<typeof subscriptions.$inferInsert> & { periodEnd: string },
) {
  const { periodEnd, ...rest } = over;
  const values = {
    planKey: "side",
    status: "active" as const,
    provider: "fake",
    providerCustomerId: `ctm_${t.orgId}`,
    providerSubscriptionId: `sub_${t.orgId}`,
    currentPeriodStart: day("2026-01-15"),
    currentPeriodEnd: day(periodEnd),
    priceAmountMinor: 15_000,
    priceCurrency: "USD",
    billingInterval: "year",
    billingFrequency: 1,
    priceQuantity: 1,
    priceDiscounted: false,
    firstPaidAt: day("2026-01-15"),
    ...rest,
  };
  await testDb()
    .insert(subscriptions)
    .values({ orgId: t.orgId, ...values })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: values });
}

async function addMember(t: Tenant, role: "viewer" | "editor" | "admin") {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: t.orgId, userId: u.id, role });
  return u;
}

const noticeRows = (t: Tenant) =>
  testDb().select().from(renewalNotices).where(eq(renewalNotices.orgId, t.orgId)).all();

describe("automatic-renewal notice", () => {
  it("a yearly plan: one notice 39 days ahead to the owner and admins, with price and cancel", async () => {
    const t = await setupTenant("owner", null);
    await paid(t, { periodEnd: "2027-01-15" });
    const admin = await addMember(t, "admin");
    const editor = await addMember(t, "editor");
    const viewer = await addMember(t, "viewer");

    await runAt("2026-12-06"); // 40 days: too early for Colorado's window
    expect(mailTo(t.email)).toHaveLength(0);

    await runAt("2026-12-07"); // 39 days
    const [mail] = mailTo(t.email);
    expect(mail?.subject).toBe("Your Seller Books plan renews on January 15, 2027");
    expect(mail?.text).toContain(
      "The Side hustle plan for Test Shop renews automatically for another year on January 15, 2027, at $150.00 plus any sales tax, unless you cancel before then.",
    );
    expect(mail?.text).toContain(`/o/${t.orgId}/billing`);
    expect(mail?.text).toContain('choose "Cancel subscription"');
    expect(mail?.text).toContain("/legal/refunds");
    expect(mail?.html).toContain("Open the Billing page");
    // A notice the law asks for: no unsubscribe header, and no shop name in the subject.
    expect(mail?.headers?.["List-Unsubscribe"]).toBeUndefined();
    expect(mailTo(admin.email)).toHaveLength(1);
    expect(mailTo(editor.email)).toHaveLength(0);
    expect(mailTo(viewer.email)).toHaveLength(0);

    const rows = await noticeRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ renewsOn: "2027-01-15", recipients: 2, late: false });

    // The next days in the window, and a second run the same day, send nothing more.
    await runAt("2026-12-07");
    await runAt("2026-12-15");
    expect(mailTo(t.email)).toHaveLength(1);
  });

  it("a monthly plan: once a year, before the twelve-month mark, naming the next charge", async () => {
    const t = await setupTenant("owner", null);
    await paid(t, {
      periodEnd: "2026-12-15",
      currentPeriodStart: day("2026-11-15"),
      billingInterval: "month",
      priceAmountMinor: 1_500,
    });
    await runAt("2026-06-01");
    expect(mailTo(t.email)).toHaveLength(0);
    await runAt("2026-12-07");
    const [mail] = mailTo(t.email);
    expect(mail?.subject).toBe("Your Seller Books plan keeps renewing monthly: yearly reminder");
    expect(mail?.text).toContain("renews automatically every month at $15.00 plus any sales tax");
    expect(mail?.text).toContain("on January 15, 2027 it starts its second year");
    expect(mail?.text).toContain("the next monthly charge is on December 15, 2026");
    expect((await noticeRows(t))[0]?.renewsOn).toBe("2027-01-15");
  });

  it("nothing for a plan set to cancel, a comp grant, or a canceled one", async () => {
    const canceling = await setupTenant("owner", null);
    await paid(canceling, { periodEnd: "2027-01-15", cancelAtPeriodEnd: true });
    const comp = await setupTenant("owner", null);
    await paid(comp, { periodEnd: "2027-01-15", planKey: "comp", status: "comp" });
    const canceled = await setupTenant("owner", null);
    await paid(canceled, { periodEnd: "2027-01-15", status: "canceled" });
    await runAt("2026-12-10");
    for (const t of [canceling, comp, canceled]) {
      expect(mailTo(t.email)).toHaveLength(0);
      expect(await noticeRows(t)).toHaveLength(0);
    }
  });

  it("a discounted or unreported price is not guessed", async () => {
    const t = await setupTenant("owner", null);
    await paid(t, { periodEnd: "2027-01-15", priceDiscounted: true });
    await runAt("2026-12-10");
    expect(mailTo(t.email)[0]?.text).toContain("at the price on your last receipt from Paddle");
    expect(
      billedPrice({
        priceAmountMinor: null,
        priceCurrency: "USD",
        priceQuantity: 1,
        priceDiscounted: false,
      }),
    ).toBeNull();
    expect(
      billedPrice({
        priceAmountMinor: 6_900,
        priceCurrency: "USD",
        priceQuantity: 2,
        priceDiscounted: false,
      }),
    ).toBe("$138.00");
  });

  it("a renewal first seen inside 25 days still gets a notice, marked late", async () => {
    const t = await setupTenant("owner", null);
    await paid(t, { periodEnd: "2027-01-15" });
    await runAt("2027-01-05");
    expect(mailTo(t.email)).toHaveLength(1);
    expect((await noticeRows(t))[0]?.late).toBe(true);
  });

  it("a failed send is released and retried on the next run", async () => {
    const t = await setupTenant("owner", null);
    await paid(t, { periodEnd: "2027-01-15" });
    const ctx = createAppContext(env as unknown as Env, {
      now: () => new Date("2026-12-08T14:00:00Z"),
      email: {
        delivers: true,
        send: async () => {
          throw new Error("mail down");
        },
      },
    });
    const run = await sendRenewalNotices(ctx);
    expect(run.failed).toBeGreaterThanOrEqual(1);
    expect(await noticeRows(t)).toHaveLength(0);
    await runAt("2026-12-09");
    expect(mailTo(t.email)).toHaveLength(1);
    expect(await noticeRows(t)).toHaveLength(1);
  });
});
