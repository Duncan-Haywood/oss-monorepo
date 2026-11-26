// Pure logic of the integrations module: Slack request signing, webhook URL validation (incl. SSRF),
// encryption at rest, and message formatting (no content leaks).
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashLinkCode,
  newLinkCode,
  normalizeLinkCode,
  signSlackRequest,
  verifySlackSignature,
} from "./crypto";
import { classifyStatus } from "./deliver";
import { deadlineReminderEvent, eventFromNotification, weeklyDigestEvent } from "./events";
import { cleanText, renderSlackMessage, renderTeamsMessage } from "./format";
import {
  redactWebhookUrl,
  validateSlackResponseUrl,
  validateSlackWebhookUrl,
  validateTeamsWebhookUrl,
  WebhookUrlError,
} from "./urls";
// Built at runtime so no Slack-webhook-shaped literal is committed (GitHub push protection).
const FAKE_SLACK_SECRET = "X".repeat(24);

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const BODY =
  "token=x&team_id=T0001&team_domain=acme&user_id=U2147483697&command=%2Fgrants&text=update+We+served+120+families";

describe("Slack request signature (v0)", () => {
  const nowSec = 1_763_500_000;
  const now = new Date(nowSec * 1000);

  it("accepts a valid signature computed over the raw body", async () => {
    const h = await signSlackRequest(SECRET, BODY, nowSec);
    expect(h["X-Slack-Signature"]).toMatch(/^v0=[0-9a-f]{64}$/);
    await expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestamp: h["X-Slack-Request-Timestamp"],
        signature: h["X-Slack-Signature"],
        rawBody: BODY,
        now,
      }),
    ).resolves.toBe("ok");
  });

  it("matches Slack's documented example", async () => {
    // From Slack's "Verifying requests from Slack" guide (secret, timestamp and body as published).
    const body =
      "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c";
    const verdict = await verifySlackSignature({
      signingSecret: "8f742231b10e8888abcd99yyyzzz85a5",
      timestamp: "1531420618",
      signature: "v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
      rawBody: body,
      now: new Date(1531420618 * 1000),
    });
    expect(verdict).toBe("ok");
  });

  it("rejects a tampered body, a tampered signature and the wrong secret", async () => {
    const h = await signSlackRequest(SECRET, BODY, nowSec);
    const base = {
      signingSecret: SECRET,
      timestamp: h["X-Slack-Request-Timestamp"],
      signature: h["X-Slack-Signature"],
      rawBody: BODY,
      now,
    };
    await expect(
      verifySlackSignature({ ...base, rawBody: BODY.replace("T0001", "T9999") }),
    ).resolves.toBe("invalid");
    const flipped = `${base.signature.slice(0, -1)}${base.signature.endsWith("0") ? "1" : "0"}`;
    await expect(verifySlackSignature({ ...base, signature: flipped })).resolves.toBe("invalid");
    await expect(verifySlackSignature({ ...base, signingSecret: "other-secret" })).resolves.toBe(
      "invalid",
    );
    // The signature is bound to the timestamp: re-stamping an old request breaks it.
    await expect(verifySlackSignature({ ...base, timestamp: String(nowSec + 1) })).resolves.toBe(
      "invalid",
    );
  });

  it("rejects replays outside the 5-minute window and missing headers", async () => {
    const old = await signSlackRequest(SECRET, BODY, nowSec - 301);
    await expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestamp: old["X-Slack-Request-Timestamp"],
        signature: old["X-Slack-Signature"],
        rawBody: BODY,
        now,
      }),
    ).resolves.toBe("stale");
    const future = await signSlackRequest(SECRET, BODY, nowSec + 301);
    await expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestamp: future["X-Slack-Request-Timestamp"],
        signature: future["X-Slack-Signature"],
        rawBody: BODY,
        now,
      }),
    ).resolves.toBe("stale");
    const edge = await signSlackRequest(SECRET, BODY, nowSec - 299);
    await expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestamp: edge["X-Slack-Request-Timestamp"],
        signature: edge["X-Slack-Signature"],
        rawBody: BODY,
        now,
      }),
    ).resolves.toBe("ok");
    for (const [timestamp, signature] of [
      [undefined, "v0=abc"],
      [String(nowSec), undefined],
      ["", ""],
    ] as const) {
      await expect(
        verifySlackSignature({ signingSecret: SECRET, timestamp, signature, rawBody: BODY, now }),
      ).resolves.toBe("missing");
    }
    await expect(
      verifySlackSignature({
        signingSecret: SECRET,
        timestamp: "12e9",
        signature: "v0=00",
        rawBody: BODY,
        now,
      }),
    ).resolves.toBe("invalid");
  });
});

describe("webhook URL validation", () => {
  const slack = `https://hooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`;
  const teamsNew =
    "https://default0a1b2c3d4e5f.d1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/4f0c1a2b3c4d/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=AbCdEf123";
  const teamsLegacy =
    "https://prod-12.westus.logic.azure.com:443/workflows/4f0c1a2b3c4d/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=AbCdEf123";

  it("accepts real-shaped Slack and Teams Workflows URLs", () => {
    expect(validateSlackWebhookUrl(slack).hostname).toBe("hooks.slack.com");
    expect(validateTeamsWebhookUrl(teamsNew).port).toBe(""); // :443 normalizes away
    expect(validateTeamsWebhookUrl(teamsLegacy).hostname).toBe("prod-12.westus.logic.azure.com");
  });

  it("rejects other hosts, look-alikes, schemes, ports, credentials and internal targets", () => {
    const badSlack = [
      `http://hooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`,
      `https://hooks.slack.com.evil.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`,
      `https://evilhooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`,
      `https://hooks.slack.com:8443/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`,
      `https://user:pw@hooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`,
      "https://hooks.slack.com/workflows/T00000000/A0/1/x",
      `https://hooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}?x=1`,
      "https://hooks.slack.com/services/../../api/x",
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      "https://[::1]/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "",
    ];
    for (const u of badSlack) expect(() => validateSlackWebhookUrl(u), u).toThrow(WebhookUrlError);

    const badTeams = [
      "https://contoso.webhook.office.com/webhookb2/abc/IncomingWebhook/def/ghi",
      "https://outlook.office.com/webhook/abc",
      "https://powerplatform.com/workflows/x/triggers/manual?sig=1", // bare suffix, no subdomain
      "https://evil-powerplatform.com/workflows/x/triggers/manual?sig=1",
      "https://prod-12.westus.logic.azure.com.evil.net/workflows/x/triggers/manual?sig=1",
      "https://prod-12.westus.logic.azure.com/workflows/x/triggers/manual", // no sig
      "https://prod-12.westus.logic.azure.com/other/path?sig=1",
      "https://prod-12.westus.logic.azure.com:444/workflows/x/triggers/manual?sig=1",
      "http://prod-12.westus.logic.azure.com/workflows/x/triggers/manual?sig=1",
      "https://10.0.0.5/workflows/x/triggers/manual?sig=1",
      "https://localhost/workflows/x/triggers/manual?sig=1",
      "https://127.0.0.1.nip.io/workflows/x/triggers/manual?sig=1",
      `https://hooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`,
    ];
    for (const u of badTeams) expect(() => validateTeamsWebhookUrl(u), u).toThrow(WebhookUrlError);
  });

  it("explains retired Office 365 connector URLs", () => {
    try {
      validateTeamsWebhookUrl("https://contoso.webhook.office.com/webhookb2/abc");
      expect.unreachable();
    } catch (e) {
      expect((e as WebhookUrlError).reason).toBe("retired_connector");
    }
  });

  it("redacts the secret parts in the display hint", () => {
    const hint = redactWebhookUrl(validateSlackWebhookUrl(slack));
    expect(hint).not.toContain("XXXXXXXXXXXXXXXXXXXX");
    expect(hint).not.toContain("B00000000");
    const tHint = redactWebhookUrl(validateTeamsWebhookUrl(teamsNew));
    expect(tHint).not.toContain("AbCdEf123");
    expect(tHint).not.toContain("4f0c1a2b3c4d");
  });

  it("only accepts hooks.slack.com/commands/ as a response_url", () => {
    expect(validateSlackResponseUrl("https://hooks.slack.com/commands/T1/397/96rG")).not.toBeNull();
    expect(validateSlackResponseUrl("https://evil.com/commands/T1/397/96rG")).toBeNull();
    expect(validateSlackResponseUrl("https://hooks.slack.com/services/T1/B1/x")).toBeNull();
    expect(validateSlackResponseUrl("http://hooks.slack.com/commands/T1/1/x")).toBeNull();
    expect(validateSlackResponseUrl(null)).toBeNull();
  });
});

describe("encryption at rest (AES-GCM)", () => {
  const env = { AUTH_SECRET: "auth-secret-auth-secret-0123456789" };
  const url = `https://hooks.slack.com/services/T00000000/B00000000/${FAKE_SLACK_SECRET}`;

  it("round-trips and never contains the plaintext", async () => {
    const c = await encryptSecret(env, url, "dest:org_1:itg_1");
    expect(c.startsWith("as1.")).toBe(true);
    expect(c).not.toContain("hooks.slack.com");
    await expect(decryptSecret(env, c, "dest:org_1:itg_1")).resolves.toBe(url);
    // Fresh IV every time.
    expect(await encryptSecret(env, url, "dest:org_1:itg_1")).not.toBe(c);
  });

  it("fails for another org/row (AAD), a tampered ciphertext or the wrong key", async () => {
    const c = await encryptSecret(env, url, "dest:org_1:itg_1");
    await expect(decryptSecret(env, c, "dest:org_2:itg_1")).rejects.toThrow();
    const [k, iv, ct = ""] = c.split(".");
    // Swap the second-to-last character for a different one. (Checking the last
    // character instead left the text unchanged whenever the swapped one was
    // already "A": 1 run in 64 failed.)
    const swapped = ct.at(-2) === "A" ? "B" : "A";
    const tampered = `${k}.${iv}.${ct.slice(0, -2)}${swapped}${ct.slice(-1)}`;
    expect(tampered).not.toBe(c);
    await expect(decryptSecret(env, tampered, "dest:org_1:itg_1")).rejects.toThrow();
    await expect(
      decryptSecret({ AUTH_SECRET: "another-secret-another-secret-01" }, c, "dest:org_1:itg_1"),
    ).rejects.toThrow();
    await expect(decryptSecret(env, "garbage", "x")).rejects.toThrow();
  });

  it("prefers INTEGRATIONS_KEY and still reads rows written with AUTH_SECRET", async () => {
    const before = await encryptSecret(env, url, "a");
    const both = { ...env, INTEGRATIONS_KEY: "integrations-key-integrations-key-01" };
    const after = await encryptSecret(both, url, "a");
    expect(after.startsWith("ik1.")).toBe(true);
    await expect(decryptSecret(both, before, "a")).resolves.toBe(url);
    await expect(decryptSecret(both, after, "a")).resolves.toBe(url);
    await expect(decryptSecret(env, after, "a")).rejects.toThrow(); // key not configured
    await expect(encryptSecret({}, url, "a")).rejects.toThrow();
  });
});

describe("link codes", () => {
  it("are 10 readable characters and normalize leniently", async () => {
    const code = newLinkCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    const n = normalizeLinkCode(` ${code.toLowerCase()} `);
    expect(n).toBe(code.replace("-", ""));
    expect(normalizeLinkCode("short")).toBeNull();
    expect(normalizeLinkCode("ILOU0-ILOU0")).toBeNull();
    expect(await hashLinkCode(n as string)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("message formatting has no content leaks", () => {
  const appUrl = "https://grants.example.org";
  const json = (v: unknown) => JSON.stringify(v);

  it("drops notify() bodies: only the title and link reach chat", () => {
    const e = eventFromNotification({
      kind: "application.needs_info",
      title: "Needs your input: Youth Fund 2027",
      link: "/orgs/org_1/applications/app_1",
      dedupeKey: "needs_info:app_1:ver_1",
      ...{ body: "FACT: we served 9,999 people per the CONFIDENTIAL budget" },
    });
    if (!e) throw new Error("expected a chat event");
    const out = json(renderSlackMessage(e, appUrl)) + json(renderTeamsMessage(e, appUrl));
    expect(out).not.toContain("CONFIDENTIAL");
    expect(out).not.toContain("9,999");
    expect(out).toContain("Youth Fund 2027");
    expect(out).toContain("https://grants.example.org/orgs/org_1/applications/app_1");
  });

  it("never forwards kinds that are not chat events, or events without a key", () => {
    expect(
      eventFromNotification({
        kind: "export.ready",
        title: "x",
        link: "/orgs/o/privacy",
        dedupeKey: "k",
      }),
    ).toBeNull();
    expect(
      eventFromNotification({
        kind: "match.top",
        title: "x",
        link: "/orgs/o",
        dedupeKey: undefined,
      }),
    ).toBeNull();
  });

  it("weekly digest: counts only, never questions or names of facts", () => {
    const digest = {
      orgId: "org_1",
      week: "2026-W47",
      newTopMatches: [{ title: "Match A" }],
      closingSoon: [],
      pendingReviews: [{ title: "App B" }, { title: "App C" }],
      needsInfo: [{ title: "App D", questions: ["What was your 2025 budget of $1.2M used for?"] }],
      submittedThisWeek: [],
      awardedThisWeek: [],
      factsAwaitingConfirmation: 7,
    };
    const e = weeklyDigestEvent(digest);
    const out = json(renderSlackMessage(e, appUrl)) + json(renderTeamsMessage(e, appUrl));
    expect(out).not.toContain("budget");
    expect(out).not.toContain("App D");
    expect(out).not.toContain("Match A");
    expect(e.counts).toEqual([
      { label: "New top matches", value: 1 },
      { label: "Waiting for review", value: 2 },
      { label: "Needs information", value: 1 },
      { label: "Facts to confirm", value: 7 },
    ]);
    expect(e.dedupeKey).toBe("weekly:2026-W47");
  });

  it("escapes Slack mentions/links and defangs URLs in titles", () => {
    const e = {
      kind: "top_match" as const,
      title: "<!channel> <https://evil.example|click> & win https://evil.example/x\n​new line",
      link: "/orgs/org_1/opportunities/opp_1",
    };
    const s = renderSlackMessage(e, appUrl);
    const text = json(s);
    expect(text).not.toContain("<!channel>");
    expect(text).not.toContain("<https://evil.example");
    expect(text).not.toContain("https://evil.example/x");
    expect(text).toContain("&lt;!channel&gt;");
    // The only real link points into the app.
    expect(text.match(/<https?:\/\/[^|>]+/g)).toEqual([
      "<https://grants.example.org/orgs/org_1/opportunities/opp_1",
    ]);
    const t = json(
      renderTeamsMessage({ ...e, title: "[Approve here](https://evil.example) **now**" }, appUrl),
    );
    expect(t).not.toContain("](https://evil.example)");
    expect(t).not.toContain("https://evil.example");
  });

  it("falls back to the app root for unsafe links and clips long titles", () => {
    const s = json(
      renderSlackMessage(
        { kind: "submitted", title: "x".repeat(500), link: "//evil.example/a" },
        appUrl,
      ),
    );
    expect(s).toContain("<https://grants.example.org/|Open in Grant Autopilot>");
    expect(s).not.toContain("evil.example");
    expect(cleanText("y".repeat(500)).length).toBe(150);
  });

  it("deadline events link to the application and carry only the day count", () => {
    const e = deadlineReminderEvent({
      orgId: "org_1",
      applicationId: "app_1",
      title: "Community Fund",
      daysLeft: 3,
      threshold: 3,
    });
    expect(e.link).toBe("/orgs/org_1/applications/app_1");
    expect(e.title).toBe("Community Fund: due in 3 days");
    expect(e.dedupeKey).toBe("deadline:app_1:3");
  });

  it("retries only on 429 and 5xx", () => {
    expect(classifyStatus(200).kind).toBe("ok");
    expect(classifyStatus(202).kind).toBe("ok");
    expect(classifyStatus(429).kind).toBe("retry");
    expect(classifyStatus(503).kind).toBe("retry");
    expect(classifyStatus(400).kind).toBe("fail");
    expect(classifyStatus(404).kind).toBe("fail");
  });
});
