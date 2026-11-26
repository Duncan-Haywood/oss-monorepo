// Inbound RFQ email: the shop's address, the email handler's service (receiveEmail) and what the
// estimator sees: one RFQ per message, readable attachments stored, the rest noted, no AI read.
import { env } from "cloudflare:workers";
import type { InboundEmailDto, RfqDetailDto, RfqDto } from "@shared/api";
import { createAppContext, testFakes } from "@worker/context";
import { member, rfqs, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import {
  DAILY_LIMIT,
  getInboundEmail,
  REFUSED_NOT_LISTED,
  REFUSED_UNVERIFIED,
  receiveEmail,
  rotateInboundEmail,
  tokenFromRecipient,
} from "@worker/services/inbound";
import { arrivalEmail, defang } from "@worker/services/inbound/notify";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DRAWING_TEXT, RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, createTestUser, json, setupTenant, testDb } from "./helpers";

const DOMAIN = "rfq.example.test";
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

function rfqMessage(
  opts: {
    messageId?: string;
    extra?: string[];
    headers?: string[];
    from?: string;
    auth?: string[];
  } = {},
) {
  const lines = [
    // Authentication-Results headers, first as Cloudflare prepends its own.
    ...(opts.auth ?? []).map((a) => `Authentication-Results: ${a}`),
    `From: ${opts.from ?? "Dana Ortiz <dana.ortiz@example-robotics.test>"}`,
    "To: shop",
    "Subject: RFQ - brackets and spacers",
    ...(opts.messageId ? [`Message-ID: ${opts.messageId}`] : []),
    ...(opts.headers ?? []),
    'Content-Type: multipart/mixed; boundary="b"',
    "",
    "--b",
    "Content-Type: text/plain; charset=utf-8",
    "",
    RFQ_EMAIL,
    "--b",
    'Content-Type: application/pdf; name="BRK-1001.pdf"',
    'Content-Disposition: attachment; filename="BRK-1001.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(DRAWING_TEXT),
    "--b",
    'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="terms.docx"',
    "Content-Disposition: attachment",
    "Content-Transfer-Encoding: base64",
    "",
    b64("PK fake docx"),
    "--b",
    "Content-Type: image/png",
    "Content-Disposition: inline",
    "Content-ID: <logo@x>",
    "Content-Transfer-Encoding: base64",
    "",
    b64("tiny logo"),
    ...(opts.extra ?? []),
    "--b--",
  ];
  return new TextEncoder().encode(lines.join("\r\n"));
}

const ctx = () => createAppContext(env);

async function send(
  to: string,
  raw: Uint8Array,
  from = "dana.ortiz@example-robotics.test",
  authenticationResults?: string,
) {
  return receiveEmail(ctx(), { from, to, rawSize: raw.byteLength, raw, authenticationResults });
}

/** Cloudflare Email Routing's header (shared/sender-auth.ts). */
const cfHeader = (rest: string) => `mx.cloudflare.net; ${rest}`;
/** Dana's own mail, as Cloudflare would mark it on arrival. */
const DANA_PASSES = cfHeader(
  "spf=pass smtp.mailfrom=dana.ortiz@example-robotics.test; dkim=pass header.d=example-robotics.test; dmarc=pass header.from=example-robotics.test",
);

async function turnOn(t: Awaited<ReturnType<typeof setupTenant>>) {
  const dto = await json<InboundEmailDto>(
    api(t.path("/inbound-email/rotate"), { method: "POST", as: t.userId }),
  );
  if (!dto.address) throw new Error("no address");
  return dto.address;
}

describe("the shop's inbound address", () => {
  it("is off until an admin turns it on; members see it, only admins change it", async () => {
    const t = await setupTenant();
    const off = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(off).toMatchObject({
      available: true,
      address: null,
      last24h: 0,
      dailyLimit: DAILY_LIMIT,
    });

    const address = await turnOn(t);
    expect(address).toMatch(/^rfq\+[0-9a-z]{16}@rfq\.example\.test$/);

    const viewer = await addMember(t.orgId, "viewer");
    const seen = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: viewer }));
    expect(seen.address).toBe(address);
    const estimator = await addMember(t.orgId, "estimator");
    for (const as of [viewer, estimator]) {
      expect((await api(t.path("/inbound-email/rotate"), { method: "POST", as })).status).toBe(403);
      expect((await api(t.path("/inbound-email"), { method: "DELETE", as })).status).toBe(403);
    }
  });

  it("is not visible to another shop", async () => {
    const a = await setupTenant();
    await turnOn(a);
    const stranger = await createTestUser();
    expect((await api(a.path("/inbound-email"), { as: stranger.id })).status).toBe(404);
  });

  it("reads tokens from rfq+<token>[+tag]@ and the older rfq-<token>[+tag]@ on our domain only", () => {
    expect(tokenFromRecipient("rfq+0123456789abcdef@rfq.example.test", DOMAIN)).toBe(
      "0123456789abcdef",
    );
    expect(tokenFromRecipient("RFQ+0123456789abcdef+acme@rfq.example.test", DOMAIN)).toBe(
      "0123456789abcdef",
    );
    expect(tokenFromRecipient("rfq+0123456789abcdef@evil.test", DOMAIN)).toBeNull();
    expect(tokenFromRecipient("rfq+short@rfq.example.test", DOMAIN)).toBeNull();
    expect(tokenFromRecipient("rfq@rfq.example.test", DOMAIN)).toBeNull();
    expect(tokenFromRecipient("RFQ-0123456789abcdef@RFQ.example.test", DOMAIN)).toBe(
      "0123456789abcdef",
    );
    expect(tokenFromRecipient("rfq-0123456789abcdef+acme@rfq.example.test", DOMAIN)).toBe(
      "0123456789abcdef",
    );
    expect(tokenFromRecipient("rfq-0123456789abcdef@evil.test", DOMAIN)).toBeNull();
    expect(tokenFromRecipient("rfq-short@rfq.example.test", DOMAIN)).toBeNull();
    expect(tokenFromRecipient("sales@rfq.example.test", DOMAIN)).toBeNull();
  });
});

describe("receiving an RFQ by email", () => {
  it("creates one RFQ with the body and drawing, notes what it skipped, and does not read it with AI", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const r = await send(address, rfqMessage({ messageId: "<m1@example-robotics.test>" }));
    expect(r).toMatchObject({ ok: true, duplicate: false });
    if (!r.ok) throw new Error("refused");

    const rfq = await json<RfqDetailDto>(api(t.path(`/rfqs/${r.rfqId}`), { as: t.userId }));
    expect(rfq).toMatchObject({
      status: "new",
      source: "email",
      subject: "RFQ - brackets and spacers",
      fromAddress: "dana.ortiz@example-robotics.test",
      extractedAt: null,
      allowance: { counted: 0 },
    });
    expect(rfq.bodyText).toBe(RFQ_EMAIL.trim());
    expect(rfq.files.map((f) => f.fileName)).toEqual(["BRK-1001.pdf"]);
    expect(rfq.files[0]?.hasText).toBe(true);
    expect(rfq.intakeNotes).toEqual([
      "terms.docx was not stored: email PDF drawings, text, images or CAD files.",
    ]);
    const stored = await env.FILES.list({ prefix: `orgs/${t.orgId}/rfqs/${r.rfqId}/` });
    expect(stored.objects).toHaveLength(1);

    // It is an ordinary RFQ from here: the estimator runs the read.
    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${r.rfqId}/extract`), { method: "POST", as: t.userId }),
    );
    expect(ex.status).toBe("extracted");
    expect(ex.parts[0]?.partNumber).toBe("BRK-1001");

    const list = await json<{ items: RfqDto[] }>(api(t.path("/rfqs"), { as: t.userId }));
    expect(list.items.map((i) => i.source)).toEqual(["email"]);
    const dto = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(dto.last24h).toBe(1);
  });

  it("stores the email's thread chain for the quote's reply", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const r = await send(
      address,
      rfqMessage({
        messageId: "<m9@example-robotics.test>",
        headers: [
          "In-Reply-To: <q1@shop.example>",
          "References: <root@shop.example>",
          " <q1@shop.example>",
        ],
      }),
    );
    if (!r.ok) throw new Error("refused");
    const row = await testDb()
      .select({ threadReferences: rfqs.threadReferences })
      .from(rfqs)
      .where(eq(rfqs.id, r.rfqId))
      .get();
    expect(row?.threadReferences).toBe("<root@shop.example> <q1@shop.example>");
  });

  it("treats a redelivery of the same Message-ID as the same RFQ", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const raw = rfqMessage({ messageId: "<same@x.test>" });
    const first = await send(address, raw);
    const again = await send(address, raw);
    expect(again).toEqual({ ok: true, rfqId: first.ok ? first.rfqId : "", duplicate: true });
    const list = await json<{ items: RfqDto[] }>(api(t.path("/rfqs"), { as: t.userId }));
    expect(list.items).toHaveLength(1);
  });

  it("lands only in the addressed shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const addrA = await turnOn(a);
    await turnOn(b);
    const r = await send(addrA, rfqMessage());
    if (!r.ok) throw new Error("refused");
    const listB = await json<{ items: RfqDto[] }>(api(b.path("/rfqs"), { as: b.userId }));
    expect(listB.items).toEqual([]);
    expect((await api(b.path(`/rfqs/${r.rfqId}`), { as: b.userId })).status).toBe(404);
  });

  it("refuses unknown, replaced and turned-off addresses with one answer", async () => {
    const t = await setupTenant();
    const old = await turnOn(t);
    const unknown = { ok: false, reason: "No such RFQ address" };
    expect(await send(`rfq-zzzzzzzzzzzzzzzz@${DOMAIN}`, rfqMessage())).toEqual(unknown);
    expect(await send(old.replace(DOMAIN, "other.test"), rfqMessage())).toEqual(unknown);

    const fresh = await turnOn(t);
    expect(fresh).not.toBe(old);
    expect(await send(old, rfqMessage())).toEqual(unknown);
    expect((await send(fresh, rfqMessage())).ok).toBe(true);

    await json(api(t.path("/inbound-email"), { method: "DELETE", as: t.userId }));
    expect(await send(fresh, rfqMessage())).toEqual(unknown);
  });

  it("refuses empty, oversized and over-the-daily-limit mail", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const empty = new TextEncoder().encode("Subject: hi\r\nContent-Type: text/plain\r\n\r\n  \r\n");
    expect(await send(address, empty)).toEqual({
      ok: false,
      reason: "The email had no text or readable attachments",
    });
    const big = await receiveEmail(ctx(), {
      from: "x@y.test",
      to: address,
      rawSize: 26 * 1024 * 1024,
      raw: new Uint8Array(1),
    });
    expect(big.ok).toBe(false);

    // D1 caps bound variables per statement, so insert in chunks.
    for (let i = 0; i < DAILY_LIMIT; i += 5) {
      await testDb()
        .insert(rfqs)
        .values(
          Array.from({ length: Math.min(5, DAILY_LIMIT - i) }, () => ({
            id: newId("rfq"),
            orgId: t.orgId,
            source: "email" as const,
            bodyText: "x",
          })),
        );
    }
    const limited = await send(address, rfqMessage());
    expect(limited).toEqual({
      ok: false,
      reason: "This shop's RFQ inbox is full for today; try again tomorrow",
    });
  });
});

describe("the shop's sender allowlist", () => {
  const putSenders = (
    t: Awaited<ReturnType<typeof setupTenant>>,
    senders: string[],
    as = t.userId,
  ) => api(t.path("/inbound-email/senders"), { method: "PUT", json: { senders }, as });
  const REFUSED = { ok: false, reason: REFUSED_NOT_LISTED };
  const UNVERIFIED = { ok: false, reason: REFUSED_UNVERIFIED };

  it("is empty by default and accepts anyone", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const dto = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(dto.allowedSenders).toEqual([]);
    expect(dto.refusedSenders).toEqual([]);
    expect((await send(address, rfqMessage(), "anyone@stranger.test")).ok).toBe(true);
  });

  it("admins set it, normalised; other roles cannot; a bad entry saves nothing", async () => {
    const t = await setupTenant();
    await turnOn(t);
    const dto = await json<InboundEmailDto>(
      putSenders(t, [" Dana.Ortiz@Example-Robotics.test", "acme.com", "@acme.com", ""]),
    );
    expect(dto.allowedSenders).toEqual(["dana.ortiz@example-robotics.test", "@acme.com"]);

    const bad = await putSenders(t, ["ok@acme.com", "not an address"]);
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("not an address");
    const after = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(after.allowedSenders).toEqual(["dana.ortiz@example-robotics.test", "@acme.com"]);

    const viewer = await addMember(t.orgId, "viewer");
    const estimator = await addMember(t.orgId, "estimator");
    for (const as of [viewer, estimator]) {
      expect((await putSenders(t, [], as)).status).toBe(403);
      const seen = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as }));
      expect(seen.allowedSenders).toEqual(after.allowedSenders);
    }
    const stranger = await createTestUser();
    expect((await putSenders(t, [], stranger.id)).status).toBe(404);
  });

  it("refuses senders not on it, remembers them, and takes mail from listed ones", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    await json(putSenders(t, ["@acme.com"]));

    // Neither the envelope nor the From header is on the list.
    expect(await send(address, rfqMessage(), "dana.ortiz@example-robotics.test")).toEqual(REFUSED);
    const none = await testDb().select().from(rfqs).where(eq(rfqs.orgId, t.orgId));
    expect(none).toHaveLength(0);

    // The shop's own mailbox forwarding a customer's RFQ: envelope on the list, SPF passed for it.
    const forwarded = rfqMessage({
      messageId: "<f1@x>",
      auth: [cfHeader("spf=pass smtp.mailfrom=est@mail.acme.com; dkim=none; dmarc=none")],
    });
    expect((await send(address, forwarded, "est@mail.acme.com")).ok).toBe(true);
    // A customer at the listed domain, sent through a list server: From header on the list, DMARC passed.
    const direct = await send(
      address,
      rfqMessage({
        messageId: "<f2@x>",
        from: "Buyer <buyer@ACME.com>",
        auth: [
          cfHeader(
            "spf=pass smtp.mailfrom=lists.test; dkim=pass header.d=acme.com; dmarc=pass header.from=acme.com",
          ),
        ],
      }),
      "bounce-123@lists.test",
    );
    expect(direct.ok).toBe(true);

    const dto = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(dto.refusedSenders.map((r) => r.address)).toEqual(["dana.ortiz@example-robotics.test"]);

    // "Allow" adds the refused sender; it leaves the refused list and its mail goes through.
    const allowed = await json<InboundEmailDto>(
      putSenders(t, [...dto.allowedSenders, "dana.ortiz@example-robotics.test"]),
    );
    expect(allowed.refusedSenders).toEqual([]);
    expect((await send(address, rfqMessage({ messageId: "<f3@x>", auth: [DANA_PASSES] }))).ok).toBe(
      true,
    );

    // Emptying the list lets everyone in again.
    await json(putSenders(t, ["@acme.com"]));
    expect(await send(address, rfqMessage({ messageId: "<f4@x>" }))).toEqual(REFUSED);
    const open = await json<InboundEmailDto>(putSenders(t, []));
    expect(open).toMatchObject({ allowedSenders: [], refusedSenders: [] });
    expect((await send(address, rfqMessage({ messageId: "<f4@x>" }))).ok).toBe(true);
  });

  it("takes a listed address only when Cloudflare's SPF/DKIM/DMARC results back it", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    await json(putSenders(t, ["@acme.com"]));
    const buyer = "Buyer <buyer@acme.com>";

    // A forged From and envelope: no results at all, or results that failed.
    expect(await send(address, rfqMessage({ from: buyer }), "buyer@acme.com")).toEqual(UNVERIFIED);
    expect(
      await send(
        address,
        rfqMessage({
          from: buyer,
          auth: [
            cfHeader("spf=fail smtp.mailfrom=acme.com; dkim=none; dmarc=fail header.from=acme.com"),
          ],
        }),
        "buyer@acme.com",
      ),
    ).toEqual(UNVERIFIED);
    // The forger writes their own "pass" headers: not Cloudflare's id, or below Cloudflare's.
    expect(
      await send(
        address,
        rfqMessage({
          from: buyer,
          auth: ["mx.evil.test; spf=pass; dmarc=pass header.from=acme.com"],
        }),
        "buyer@acme.com",
      ),
    ).toEqual(UNVERIFIED);
    expect(
      await send(
        address,
        rfqMessage({
          from: buyer,
          auth: [
            cfHeader("spf=fail; dmarc=fail"),
            cfHeader("spf=pass; dkim=pass header.d=acme.com; dmarc=pass"),
          ],
        }),
        "buyer@acme.com",
      ),
    ).toEqual(UNVERIFIED);
    // Same through the runtime's joined message.headers value.
    expect(
      await send(
        address,
        rfqMessage({ from: buyer }),
        "buyer@acme.com",
        `${cfHeader("spf=fail; dmarc=fail")}, ${cfHeader("spf=pass; dmarc=pass header.from=acme.com")}`,
      ),
    ).toEqual(UNVERIFIED);
    // A stranger's own domain passing DMARC does not make a listed envelope real.
    expect(await send(address, rfqMessage({ auth: [DANA_PASSES] }), "spoof@acme.com")).toEqual(
      UNVERIFIED,
    );
    expect(await testDb().select().from(rfqs).where(eq(rfqs.orgId, t.orgId))).toHaveLength(0);

    // The card says why, and offers no "Allow" for these (the sender is already listed).
    const dto = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(dto.refusedSenders.map((r) => [r.address, r.why])).toEqual([
      ["dana.ortiz@example-robotics.test", "unverified"],
      ["buyer@acme.com", "unverified"],
    ]);

    // The real buyer: Cloudflare's header in message.headers, DMARC passed.
    const real = await send(
      address,
      rfqMessage({ from: buyer, messageId: "<real@acme>" }),
      "bounce@esp.test",
      cfHeader(
        "spf=pass smtp.mailfrom=esp.test; dkim=pass header.d=acme.com; dmarc=pass header.from=acme.com",
      ),
    );
    expect(real.ok).toBe(true);
    // A domain with no DMARC policy, signed by its own DKIM key.
    const noPolicy = await send(
      address,
      rfqMessage({
        from: buyer,
        messageId: "<nopolicy@acme>",
        auth: [cfHeader("spf=none; dkim=pass header.d=acme.com; dmarc=none")],
      }),
      "bounce@esp.test",
    );
    expect(noPolicy.ok).toBe(true);
  });

  it("with no list, keeps mail that failed DMARC but warns the estimator", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const result = await send(
      address,
      rfqMessage({
        auth: [cfHeader("spf=fail; dkim=fail header.d=example-robotics.test; dmarc=fail")],
      }),
    );
    if (!result.ok) throw new Error(result.reason);
    const [row] = await testDb().select().from(rfqs).where(eq(rfqs.id, result.rfqId));
    expect(JSON.stringify(row?.intakeNotes)).toContain("failed its sender domain's DMARC check");

    const passed = await send(address, rfqMessage({ messageId: "<ok@x>", auth: [DANA_PASSES] }));
    if (!passed.ok) throw new Error(passed.reason);
    const [ok] = await testDb().select().from(rfqs).where(eq(rfqs.id, passed.rfqId));
    expect(JSON.stringify(ok?.intakeNotes)).not.toContain("DMARC");
  });

  it("keeps one row per refused sender, newest first, at most ten", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    await json(putSenders(t, ["@acme.com"]));
    for (let i = 0; i < 12; i++) {
      const from = `s${i}@stranger.test`;
      await send(address, rfqMessage({ from }), from);
    }
    await send(address, rfqMessage({ from: "s5@stranger.test" }), "s5@stranger.test");
    const dto = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(dto.refusedSenders.map((r) => r.address)).toEqual([
      "s5@stranger.test",
      "s11@stranger.test",
      "s10@stranger.test",
      "s9@stranger.test",
      "s8@stranger.test",
      "s7@stranger.test",
      "s6@stranger.test",
      "s4@stranger.test",
      "s3@stranger.test",
      "s2@stranger.test",
    ]);
  });

  it("is per shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await turnOn(a);
    const bAddress = await turnOn(b);
    await json(putSenders(a, ["@acme.com"]));
    expect((await send(bAddress, rfqMessage(), "anyone@stranger.test")).ok).toBe(true);
    const bDto = await json<InboundEmailDto>(api(b.path("/inbound-email"), { as: b.userId }));
    expect(bDto.allowedSenders).toEqual([]);
  });
});

describe("without INBOUND_EMAIL_DOMAIN", () => {
  it("reports the feature unavailable and refuses to make an address", async () => {
    const t = await setupTenant();
    const off = createAppContext({ ...env, INBOUND_EMAIL_DOMAIN: "" });
    expect((await getInboundEmail(off, t.orgId)).available).toBe(false);
    await expect(rotateInboundEmail(off, t.orgId)).rejects.toMatchObject({ status: 503 });
    expect(
      await receiveEmail(off, {
        from: "a@b.test",
        to: `rfq-0123456789abcdef@${DOMAIN}`,
        rawSize: 1,
        raw: new Uint8Array(1),
      }),
    ).toEqual({ ok: false, reason: "No such RFQ address" });
  });
});

describe("emailing members when an RFQ arrives", () => {
  const mailTo = (since: number, userEmail: string) =>
    testFakes.email.sent.slice(since).filter((m) => m.to.includes(userEmail));
  const emailOf = async (userId: string) =>
    (await testDb().select().from(user).where(eq(user.id, userId)).get())?.email ?? "";
  const setNotify = (t: Awaited<ReturnType<typeof setupTenant>>, as: string, notify: boolean) =>
    json<InboundEmailDto>(
      api(t.path("/inbound-email/notify"), { method: "PUT", as, json: { notify } }),
    );

  it("is off by default and each member turns on only their own", async () => {
    const t = await setupTenant();
    await turnOn(t);
    const viewer = await addMember(t.orgId, "viewer");
    expect(
      (await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: viewer }))).notifyMe,
    ).toBe(false);
    expect((await setNotify(t, viewer, true)).notifyMe).toBe(true);
    // The owner's own setting is unchanged by the viewer's.
    const mine = await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: t.userId }));
    expect(mine.notifyMe).toBe(false);
    // Rotating the address keeps the setting and answers with the caller's own.
    const rotated = await json<InboundEmailDto>(
      api(t.path("/inbound-email/rotate"), { method: "POST", as: t.userId }),
    );
    expect(rotated.notifyMe).toBe(false);
    expect(
      (await json<InboundEmailDto>(api(t.path("/inbound-email"), { as: viewer }))).notifyMe,
    ).toBe(true);
    const bad = await api(t.path("/inbound-email/notify"), {
      method: "PUT",
      as: viewer,
      json: { notify: true, userId: t.userId },
    });
    expect(bad.status).toBe(400);
  });

  it("sends one notice per opted-in member for a new RFQ, none for a redelivery", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    const estimator = await addMember(t.orgId, "estimator");
    const quiet = await addMember(t.orgId, "estimator");
    await setNotify(t, t.userId, true);
    await setNotify(t, estimator, true);
    const ownerEmail = await emailOf(t.userId);
    const estEmail = await emailOf(estimator);
    const quietEmail = await emailOf(quiet);

    const before = testFakes.email.sent.length;
    const r = await send(address, rfqMessage({ messageId: "<n1@example-robotics.test>" }));
    if (!r.ok) throw new Error("refused");
    expect(mailTo(before, ownerEmail)).toHaveLength(1);
    expect(mailTo(before, estEmail)).toHaveLength(1);
    expect(mailTo(before, quietEmail)).toHaveLength(0);

    const [m] = mailTo(before, estEmail);
    expect(m?.to).toEqual([estEmail]);
    expect(m?.subject).toBe("New RFQ by email: RFQ - brackets and spacers");
    expect(m?.text).toContain(`/app/${t.orgId}/rfqs/${r.rfqId}`);
    expect(m?.text).toContain("dana[.]ortiz@example-robotics[.]test");
    expect(m?.text).toContain("Files: 1 stored (1 intake note on the RFQ)");
    // A notice, not a relay: no body text and no attachments.
    expect(m?.text).not.toContain(RFQ_EMAIL.trim().slice(0, 40));
    expect(m?.attachments).toBeUndefined();

    const mid = testFakes.email.sent.length;
    await send(address, rfqMessage({ messageId: "<n1@example-robotics.test>" }));
    expect(testFakes.email.sent.length).toBe(mid);
  });

  it("mails only current members of the addressed shop", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const addrA = await turnOn(a);
    await turnOn(b);
    await setNotify(b, b.userId, true);
    const leaver = await addMember(a.orgId, "estimator");
    await setNotify(a, leaver, true);
    await testDb().delete(member).where(eq(member.userId, leaver));
    const bEmail = await emailOf(b.userId);
    const leaverEmail = await emailOf(leaver);

    const before = testFakes.email.sent.length;
    expect((await send(addrA, rfqMessage())).ok).toBe(true);
    expect(mailTo(before, bEmail)).toHaveLength(0);
    expect(mailTo(before, leaverEmail)).toHaveLength(0);
  });

  it("keeps the RFQ when a send fails", async () => {
    const t = await setupTenant();
    const address = await turnOn(t);
    await setNotify(t, t.userId, true);
    const failing = createAppContext(env, {
      email: {
        delivers: false,
        send: () => Promise.reject(new Error("provider down for someone@example.test")),
      },
    });
    const raw = rfqMessage();
    const r = await receiveEmail(failing, {
      from: "dana.ortiz@example-robotics.test",
      to: address,
      rawSize: raw.byteLength,
      raw,
    });
    expect(r).toMatchObject({ ok: true, duplicate: false });
  });
});

describe("the arrival notice text", () => {
  it("defangs links and host names from the stranger's subject and keeps one line", () => {
    expect(defang("see https://evil.example/x\r\nBcc: a@b.test", 200)).toBe(
      "see https[:]//evil[.]example/x Bcc: a@b[.]test",
    );
    expect(defang("Rev. B, 2.5 in bore", 200)).toBe("Rev. B, 2.5 in bore");
    expect(defang("x".repeat(300), 120)).toHaveLength(120);
    const mail = arrivalEmail("https://app.example.test/", {
      shopName: "Acme Machine",
      orgId: "org_1",
      rfqId: "rfq_1",
      subject: null,
      fromAddress: null,
      filesStored: 0,
      notes: 0,
    });
    expect(mail.subject).toBe("New RFQ by email: (no subject)");
    expect(mail.text).toContain("Open it: https://app.example.test/app/org_1/rfqs/rfq_1");
    expect(mail.text).toContain("Files: none");
  });
});
