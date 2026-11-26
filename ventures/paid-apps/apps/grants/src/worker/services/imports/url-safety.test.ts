import { describe, expect, it } from "vitest";
import { assertSafeUrl, isBlockedIpv6, isSafeUrl, parseIpv6, UnsafeUrlError } from "./url-safety";

const reason = (u: string) => {
  try {
    assertSafeUrl(u);
    return "ok";
  } catch (e) {
    return e instanceof UnsafeUrlError ? e.reason : "other";
  }
};

describe("assertSafeUrl", () => {
  it("allows ordinary public http(s) URLs", () => {
    for (const u of [
      "https://www.swif.org/about",
      "http://grants.example.org/rfp?id=1",
      "https://www.grants.gov:443/search",
      "http://8.8.8.8/",
      "https://[2606:4700:4700::1111]/",
    ]) {
      expect(reason(u), u).toBe("ok");
    }
  });

  it("rejects non-http schemes and garbage", () => {
    expect(reason("ftp://example.org/x")).toBe("scheme");
    expect(reason("file:///etc/passwd")).toBe("scheme");
    expect(reason("javascript:alert(1)")).toBe("scheme");
    expect(reason("gopher://example.org")).toBe("scheme");
    expect(reason("not a url")).toBe("invalid");
  });

  it("rejects credentials and non-standard ports", () => {
    expect(reason("https://user:pw@example.org/")).toBe("credentials");
    expect(reason("http://example.org:8080/")).toBe("port");
    expect(reason("https://example.org:22/")).toBe("port");
  });

  it("rejects private, loopback, link-local and reserved IPv4 (incl. obfuscated forms)", () => {
    for (const u of [
      "http://127.0.0.1/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://0177.0.0.1/",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://172.31.255.255/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://0.0.0.0/",
      "http://224.0.0.1/",
      "http://255.255.255.255/",
    ]) {
      expect(reason(u), u).toBe("private_ip");
    }
    expect(reason("http://172.32.0.1/")).toBe("ok");
  });

  it("rejects private / loopback / mapped IPv6", () => {
    for (const u of [
      "http://[::1]/",
      "http://[::]/",
      "http://[fe80::1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[ff02::1]/",
      "http://[::ffff:0:7f00:1]/",
      "http://[64:ff9b::a00:1]/",
      "http://[64:ff9b:1::1]/",
      "http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/",
      "http://[100::1]/",
    ]) {
      expect(reason(u), u).toBe("private_ip");
    }
  });

  it("rejects localhost and internal-only host names", () => {
    for (const u of [
      "http://localhost/",
      "http://LOCALHOST./",
      "http://app.localhost/",
      "http://printer.local/",
      "http://db.internal/",
      "http://metadata.google.internal/",
      "http://intranet/",
      "http://router.home.arpa/",
      "http://127.0.0.1.nip.io/",
      "http://10.0.0.1.sslip.io/admin",
      "http://anything.localtest.me/",
      "http://lvh.me/",
    ]) {
      expect(reason(u), u).toBe("internal_host");
    }
  });

  it("isSafeUrl mirrors assertSafeUrl", () => {
    expect(isSafeUrl("https://example.org")).toBe(true);
    expect(isSafeUrl("http://localhost")).toBe(false);
  });
});

describe("IPv6 helpers", () => {
  it("expands compressed forms", () => {
    expect(parseIpv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIpv6("2001:db8::8:800:200c:417a")).toEqual([
      0x2001, 0xdb8, 0, 0, 0x8, 0x800, 0x200c, 0x417a,
    ]);
    expect(parseIpv6("1::2::3")).toBeNull();
  });
  it("blocks unparseable literals", () => {
    expect(isBlockedIpv6("zzzz::1")).toBe(true);
    expect(isBlockedIpv6("2606:4700:4700::1111")).toBe(false);
  });
});
