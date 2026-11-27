import { describe, expect, it } from "vitest";
import {
  firstOfJoined,
  parseAuthenticationResults,
  TRUSTED_AUTHSERV_ID,
  verifySenders,
} from "./sender-auth";

describe("parseAuthenticationResults", () => {
  it("reads Cloudflare's documented example", () => {
    expect(
      parseAuthenticationResults("mx.cloudflare.net; spf=pass; dkim=pass; dmarc=pass"),
    ).toEqual({
      authservId: TRUSTED_AUTHSERV_ID,
      results: [
        { method: "spf", result: "pass", props: {} },
        { method: "dkim", result: "pass", props: {} },
        { method: "dmarc", result: "pass", props: {} },
      ],
    });
  });

  it("reads properties, comments, versions, quoted values and folding", () => {
    const ar = parseAuthenticationResults(
      'MX.Cloudflare.net 1;\r\n dkim=pass (2048-bit key) header.d=Acme.com header.s=s1 header.b="Ab Cd";\r\n spf=softfail (domain of\r\n x@y does not designate) smtp.mailfrom=bounce@Lists.test;\r\n dmarc=fail (p=REJECT sp=REJECT) header.from=acme.com; arc/1=none',
    );
    expect(ar?.authservId).toBe("mx.cloudflare.net");
    expect(ar?.results).toEqual([
      {
        method: "dkim",
        result: "pass",
        props: { "header.d": "acme.com", "header.s": "s1", "header.b": "ab cd" },
      },
      { method: "spf", result: "softfail", props: { "smtp.mailfrom": "bounce@lists.test" } },
      { method: "dmarc", result: "fail", props: { "header.from": "acme.com" } },
      { method: "arc", result: "none", props: {} },
    ]);
  });

  it("reads 'none' as no results, skips what it cannot read, and refuses an empty id", () => {
    expect(parseAuthenticationResults("mx.cloudflare.net; none")).toEqual({
      authservId: "mx.cloudflare.net",
      results: [],
    });
    expect(parseAuthenticationResults("mx.cloudflare.net; garbage; dmarc=pass")?.results).toEqual([
      { method: "dmarc", result: "pass", props: {} },
    ]);
    expect(parseAuthenticationResults("; dmarc=pass")).toBeNull();
    expect(parseAuthenticationResults(null)).toBeNull();
  });

  it("does not let a comment smuggle in a result", () => {
    const ar = parseAuthenticationResults("mx.cloudflare.net; dmarc=fail (; dmarc=pass)");
    expect(ar?.results).toEqual([{ method: "dmarc", result: "fail", props: {} }]);
  });
});

describe("firstOfJoined", () => {
  it("keeps the first header of a Headers.get() join", () => {
    expect(
      firstOfJoined(
        "mx.cloudflare.net; spf=fail; dmarc=fail, mx.cloudflare.net; dmarc=pass header.from=acme.com",
      ),
    ).toBe("mx.cloudflare.net; spf=fail; dmarc=fail");
    expect(firstOfJoined("mx.cloudflare.net; dmarc=pass")).toBe("mx.cloudflare.net; dmarc=pass");
    expect(firstOfJoined(null)).toBeNull();
  });
});

describe("verifySenders", () => {
  const cfHeader = (rest: string) => `mx.cloudflare.net; ${rest}`;

  it("vouches for the From header on DMARC pass and the envelope on SPF pass", () => {
    const v = verifySenders(
      cfHeader(
        "spf=pass smtp.mailfrom=bounce@lists.test; dkim=pass header.d=acme.com; dmarc=pass header.from=acme.com",
      ),
      "bounce@lists.test",
      "buyer@acme.com",
    );
    expect(v).toEqual({
      checked: true,
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
      envelopeVerified: true,
      fromVerified: true,
    });
  });

  it("vouches for nothing without Cloudflare's header", () => {
    for (const h of [
      null,
      "evil.test; dmarc=pass; spf=pass",
      "mx.cloudflare.net.evil.test; dmarc=pass",
    ]) {
      const v = verifySenders(h, "a@acme.com", "a@acme.com");
      expect(v).toMatchObject({ checked: false, envelopeVerified: false, fromVerified: false });
    }
  });

  it("does not take a pass that names another domain", () => {
    const v = verifySenders(
      cfHeader("spf=pass smtp.mailfrom=other.test; dmarc=pass header.from=other.test"),
      "x@acme.com",
      "x@acme.com",
    );
    expect(v).toMatchObject({ envelopeVerified: false, fromVerified: false });
  });

  it("accepts an aligned DKIM pass when the From domain publishes no DMARC policy", () => {
    expect(
      verifySenders(
        cfHeader("dkim=pass header.d=mail.acme.com; dmarc=none"),
        null,
        "buyer@acme.com",
      ),
    ).toMatchObject({ fromVerified: true, dmarc: "none" });
    // A third party's signature (the list server's) does not vouch for the From.
    expect(
      verifySenders(cfHeader("dkim=pass header.d=lists.test; dmarc=none"), null, "buyer@acme.com"),
    ).toMatchObject({ fromVerified: false });
    // Any passing signature counts among several.
    expect(
      verifySenders(
        cfHeader("dkim=fail header.d=acme.com; dkim=pass header.d=acme.com; dmarc=none"),
        null,
        "buyer@acme.com",
      ),
    ).toMatchObject({ fromVerified: true, dkim: "pass" });
  });

  it("fails what failed", () => {
    expect(
      verifySenders(cfHeader("spf=softfail; dkim=none; dmarc=fail"), "a@acme.com", "a@acme.com"),
    ).toEqual({
      checked: true,
      spf: "softfail",
      dkim: "none",
      dmarc: "fail",
      envelopeVerified: false,
      fromVerified: false,
    });
  });
});
