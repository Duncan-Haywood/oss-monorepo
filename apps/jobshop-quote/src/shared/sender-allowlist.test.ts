import { describe, expect, it } from "vitest";
import { entryCovers, parseSenderEntry, parseSenderList, senderAllowed } from "./sender-allowlist";

describe("parseSenderEntry", () => {
  it("normalises addresses and domains", () => {
    expect(parseSenderEntry("  Buyer@Acme.COM ")).toBe("buyer@acme.com");
    expect(parseSenderEntry("<buyer@acme.com>")).toBe("buyer@acme.com");
    expect(parseSenderEntry("@acme.com")).toBe("@acme.com");
    expect(parseSenderEntry("acme.com")).toBe("@acme.com");
    expect(parseSenderEntry("*.acme.co.uk")).toBe("@acme.co.uk");
    expect(parseSenderEntry("first.last+rfq@mail.acme.com")).toBe("first.last+rfq@mail.acme.com");
  });

  it("refuses what is not an address or a domain", () => {
    for (const bad of [
      "",
      "acme",
      "@",
      "buyer@",
      "a@b",
      "a..b@acme.com",
      ".a@acme.com",
      "a@-x.com",
      "a@acme.c0m",
      "a b@acme.com",
      "a@acme..com",
    ]) {
      expect(parseSenderEntry(bad), bad).toBeNull();
    }
  });
});

describe("parseSenderList", () => {
  it("splits on lines, commas, semicolons and spaces, de-duplicates and reports the rest", () => {
    const r = parseSenderList("buyer@acme.com\n@Acme.com, acme.com; nope\n\n BUYER@acme.com  x@y");
    expect(r.entries).toEqual(["buyer@acme.com", "@acme.com"]);
    expect(r.invalid).toEqual(["nope", "x@y"]);
  });
});

describe("entryCovers", () => {
  it("matches a whole address exactly and a domain with its subdomains", () => {
    expect(entryCovers("buyer@acme.com", "Buyer@acme.com")).toBe(true);
    expect(entryCovers("buyer@acme.com", "other@acme.com")).toBe(false);
    expect(entryCovers("@acme.com", "x@acme.com")).toBe(true);
    expect(entryCovers("@acme.com", "x@mail.acme.com")).toBe(true);
    expect(entryCovers("@acme.com", "x@notacme.com")).toBe(false);
    expect(entryCovers("@acme.com", "x@acme.com.evil.test")).toBe(false);
    expect(entryCovers("@acme.com", "acme.com")).toBe(false);
  });
});

describe("senderAllowed", () => {
  it("lets everyone in while the list is empty", () => {
    expect(senderAllowed([], ["x@anywhere.test"])).toBe(true);
    expect(senderAllowed([], [null])).toBe(true);
  });

  it("needs the envelope sender or the From header on the list", () => {
    const list = ["@acme.com", "dana@example-robotics.test"];
    expect(senderAllowed(list, ["bounce@lists.test", "dana@example-robotics.test"])).toBe(true);
    expect(senderAllowed(list, ["estimator@acme.com", "customer@else.test"])).toBe(true);
    expect(senderAllowed(list, ["spam@else.test", "spam@else.test"])).toBe(false);
    expect(senderAllowed(list, [null, null])).toBe(false);
  });
});
