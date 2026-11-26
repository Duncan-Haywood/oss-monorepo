// SigV4 against known-good signatures:
// - AWS's published SigV4 test suite vector `get-vanilla` and the derived-key example from the
//   "Create a signed AWS API request" guide (secret wJalr..., 20150830, us-east-1, iam);
// - two requests signed by botocore 1.44 (SigV4Auth.add_auth with a fixed clock), shaped exactly
//   like the ones the app sends: a Claude Platform on AWS Messages call with temporary
//   credentials, and an SES v2 SendEmail call.
import { describe, expect, it } from "vitest";
import {
  amzDate,
  assertAwsRegion,
  createSigV4Fetch,
  signingKey,
  signRequest,
  uriEncode,
} from "./aws-sigv4";

const EXAMPLE = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const toHex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("aws-sigv4", () => {
  it("derives the signing key from AWS's documented example", async () => {
    const key = await signingKey(EXAMPLE.secretAccessKey, "20150830", "us-east-1", "iam");
    expect(toHex(key)).toBe("c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9");
  });

  it("matches the AWS test suite vector get-vanilla", async () => {
    const h = await signRequest({
      method: "GET",
      url: "https://example.amazonaws.com/",
      service: "service",
      region: "us-east-1",
      credentials: EXAMPLE,
      date: new Date("2015-08-30T12:36:00Z"),
    });
    expect(h.get("x-amz-date")).toBe("20150830T123600Z");
    expect(h.get("authorization")).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("matches botocore for a Claude Platform on AWS request with a session token", async () => {
    const body =
      '{"model":"claude-opus-5-5","max_tokens":16,"messages":[{"role":"user","content":"Hi é"}]}';
    const h = await signRequest({
      method: "POST",
      url: "https://aws-external-anthropic.us-west-2.api.aws/v1/messages?beta=true",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "anthropic-workspace-id": "wrkspc_test123",
        // Not signed (a runtime may rewrite them), so they do not change the signature.
        "user-agent": "Anthropic/JS 1.10.0",
        "accept-encoding": "gzip",
        "x-api-key": "must-not-leak",
      },
      body,
      service: "aws-external-anthropic",
      region: "us-west-2",
      credentials: { ...EXAMPLE, sessionToken: "FQoGZXIvYXdzEXAMPLETOKEN" },
      date: new Date("2026-11-24T09:15:30Z"),
    });
    expect(h.get("authorization")).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261124/us-west-2/aws-external-anthropic/aws4_request, SignedHeaders=anthropic-beta;anthropic-version;anthropic-workspace-id;content-type;host;x-amz-date;x-amz-security-token, Signature=14277b5085b6c8b8b00c437ddc7b829399cc229c59984db2c8eb1dad79c35feb",
    );
    expect(h.get("x-amz-security-token")).toBe("FQoGZXIvYXdzEXAMPLETOKEN");
    expect(h.get("x-api-key")).toBeNull();
    expect(h.get("host")).toBeNull();
  });

  it("matches botocore for an SES v2 SendEmail request", async () => {
    const body =
      '{"FromEmailAddress":"no-reply@example.org","Destination":{"ToAddresses":["a@example.org"]},"Content":{"Simple":{"Subject":{"Data":"Hello","Charset":"UTF-8"},"Body":{"Text":{"Data":"Hi","Charset":"UTF-8"}}}}}';
    const h = await signRequest({
      method: "POST",
      url: "https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(body),
      service: "ses",
      region: "eu-west-1",
      credentials: EXAMPLE,
      date: new Date("2026-11-24T09:15:30Z"),
    });
    expect(h.get("authorization")).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261124/eu-west-1/ses/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=d8613bd953abf0eb7fbec8c5bb4ae50ab57110df1a5654537f7aeacbfa41b6a4",
    );
  });

  it("encodes per RFC 3986 and formats the date", () => {
    expect(uriEncode("a b/c~d*é")).toBe("a%20b%2Fc~d%2A%C3%A9");
    expect(uriEncode("/v1/a b", true)).toBe("/v1/a%20b");
    expect(amzDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });

  it("accepts real region names only (they end up in a hostname)", () => {
    expect(assertAwsRegion("us-east-1")).toBe("us-east-1");
    expect(assertAwsRegion("us-gov-west-1")).toBe("us-gov-west-1");
    for (const bad of ["", "evil.com/x", "us-east-1.evil.com", "US-EAST-1"]) {
      expect(() => assertAwsRegion(bad)).toThrow(/Invalid AWS region/);
    }
  });

  it("createSigV4Fetch signs each call and passes the body through unchanged", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const f = createSigV4Fetch({
      service: "ses",
      region: "eu-west-1",
      credentials: EXAMPLE,
      now: () => new Date("2026-11-24T09:15:30Z"),
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), init });
        return new Response("{}");
      },
    });
    const body =
      '{"FromEmailAddress":"no-reply@example.org","Destination":{"ToAddresses":["a@example.org"]},"Content":{"Simple":{"Subject":{"Data":"Hello","Charset":"UTF-8"},"Body":{"Text":{"Data":"Hi","Charset":"UTF-8"}}}}}';
    await f("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const call = seen[0];
    expect(call?.init?.body).toBe(body);
    const headers = new Headers(call?.init?.headers);
    expect(headers.get("authorization")).toContain(
      "Signature=d8613bd953abf0eb7fbec8c5bb4ae50ab57110df1a5654537f7aeacbfa41b6a4",
    );
  });

  it("refuses bodies it cannot hash", async () => {
    const f = createSigV4Fetch({
      service: "ses",
      region: "eu-west-1",
      credentials: EXAMPLE,
      fetchImpl: async () => new Response("{}"),
    });
    await expect(
      f("https://email.eu-west-1.amazonaws.com/x", { method: "POST", body: new FormData() }),
    ).rejects.toThrow(/string or byte body/);
  });
});
