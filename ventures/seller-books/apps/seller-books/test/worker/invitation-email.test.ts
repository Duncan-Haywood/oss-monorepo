// Invitations sent by email: the invited address gets the link, re-inviting replaces the pending
// invitation (no extra seat), members are not re-invited, and each shop is throttled.
import { testFakes } from "@worker/context";
import { invitation, organization } from "@worker/db/schema";
import { INVITE_EMAIL_THROTTLE } from "@worker/routes/org/members";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, createTestUser, json, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

const invite = (t: Tenant, email: string, role = "editor") =>
  api(`/api/orgs/${t.orgId}/members/invitations`, {
    method: "POST",
    as: t.userId,
    json: { email, role },
  });

const mailsTo = (email: string, since: number) =>
  testFakes.email.sent.slice(since).filter((m) => m.to.includes(email));

const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.test`;

describe("invitation email", () => {
  it("emails the invited address the same link the API returns, names escaped in the HTML", async () => {
    const t = await setupTenant();
    await testDb()
      .update(organization)
      .set({ name: `Bo's <b>Thrift</b>` })
      .where(eq(organization.id, t.orgId));
    const email = uniqueEmail("helper");
    const before = testFakes.email.sent.length;
    const res = await invite(t, email.toUpperCase(), "viewer");
    expect(res.status).toBe(201);
    const body = await json<{ url: string; emailSent: boolean }>(res);
    // The fake sender delivers nothing a person reads, so the page says to share the link.
    expect(body.emailSent).toBe(false);
    expect(body.url.startsWith(`${BASE}/invite?token=`)).toBe(true);

    const mails = mailsTo(email, before);
    expect(mails).toHaveLength(1);
    const [mail] = mails;
    expect(mail?.subject).toBe("You're invited to a shop's books on Seller Books");
    expect(mail?.subject).not.toContain("Thrift");
    expect(mail?.text).toContain(body.url);
    expect(mail?.text).toContain("as a viewer");
    expect(mail?.text).toContain("Bo's <b>Thrift</b>");
    expect(mail?.html).toContain("Bo&#39;s &lt;b&gt;Thrift&lt;/b&gt;");
    expect(mail?.html).not.toContain("<b>Thrift");
  });

  it("the emailed link lets the invited person join", async () => {
    const t = await setupTenant();
    const email = uniqueEmail("join");
    const before = testFakes.email.sent.length;
    expect((await invite(t, email)).status).toBe(201);
    const text = mailsTo(email, before)[0]?.text ?? "";
    const token = decodeURIComponent(text.match(/\/invite\?token=([^\s&]+)/)?.[1] ?? "");
    expect(token).not.toBe("");
    const helper = await createTestUser(email);
    const ok = await api("/api/invitations/accept", {
      method: "POST",
      as: helper.id,
      json: { token },
    });
    expect(ok.status).toBe(200);
  });

  it("re-inviting an address replaces its pending invitation and does not take another seat", async () => {
    const t = await setupTenant("owner", "business"); // 4 users: the owner plus 3
    const emails = [uniqueEmail("a"), uniqueEmail("b"), uniqueEmail("c")];
    const first = await json<{ url: string }>(await invite(t, emails[0] ?? ""));
    for (const e of emails.slice(1)) expect((await invite(t, e)).status).toBe(201);
    const again = await invite(t, emails[0] ?? "");
    expect(again.status).toBe(201);
    const second = await json<{ url: string }>(again);
    expect(second.url).not.toBe(first.url);

    const rows = await testDb()
      .select({ status: invitation.status })
      .from(invitation)
      .where(and(eq(invitation.organizationId, t.orgId), eq(invitation.email, emails[0] ?? "")));
    expect(rows.map((r) => r.status).sort()).toEqual(["pending", "revoked"]);
    // The old link no longer works.
    const helper = await createTestUser(emails[0]);
    const oldToken = new URL(first.url).searchParams.get("token");
    expect(
      (
        await api("/api/invitations/accept", {
          method: "POST",
          as: helper.id,
          json: { token: oldToken },
        })
      ).status,
    ).toBe(404);
    // A fourth distinct address is still over the plan.
    expect((await invite(t, uniqueEmail("d"))).status).toBe(402);
  });

  it("a current member is not invited again", async () => {
    const t = await setupTenant();
    const before = testFakes.email.sent.length;
    const res = await invite(t, t.email);
    expect(res.status).toBe(409);
    expect(mailsTo(t.email, before)).toHaveLength(0);
  });

  it("throttles invitation emails per shop, refusing before creating anything", async () => {
    const t = await setupTenant();
    const { limit } = INVITE_EMAIL_THROTTLE;
    for (let i = 0; i < limit; i++)
      expect((await invite(t, uniqueEmail(`t${i}`))).status).toBe(201);
    const over = uniqueEmail("over");
    const before = testFakes.email.sent.length;
    expect((await invite(t, over)).status).toBe(429);
    expect(mailsTo(over, before)).toHaveLength(0);
    const rows = await testDb()
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.email, over));
    expect(rows).toHaveLength(0);
    // Another shop is not affected.
    expect((await invite(await setupTenant(), uniqueEmail("other"))).status).toBe(201);
  });

  it("viewers and editors cannot send invitations", async () => {
    for (const role of ["viewer", "editor"] as const) {
      const t = await setupTenant(role);
      expect((await invite(t, uniqueEmail(role))).status).toBe(403);
    }
  });
});
