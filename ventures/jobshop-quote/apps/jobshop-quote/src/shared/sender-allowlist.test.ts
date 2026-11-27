import { describe, expect, it } from "vitest";
import { entryCovers, parseSenderEntry, parseSenderList, senderAllowed } from "./sender-allowlist";

describe("parseSenderEntry", () => {
  it("normalises addresses and domains", () => {
    expect(parseSenderEntry("  Buyer@Acme.example ")).toBe("buyer@acme.example");
    expect(parseSenderEntry("<buyer@acme.example>")).toBe("buyer@acme.example");
    expect(parseSenderEntry("@acme.example")).toBe("@acme.example");
    expect(parseSenderEntry("acme.example")).toBe("@acme.example");
    expect(parseSenderEntry("*.acme.co.uk")).toBe("@acme.co.uk");
    expect(parseSenderEntry("first.last+rfq@mail.acme.example")).toBe(
      "first.last+rfq@mail.acme.example",
    );
  });

  it("refuses what is not an address or a domain", () => {
    for (const bad of [
      "",
      "acme",
      "@",
      "buyer@",
      "a@b",
      "a..b@acme.example",
      ".a@acme.example",
      "a@-x.com",
      "a@acme.c0m",
      "a b@acme.example",
      "a@acme..com",
    ]) {
      expect(parseSenderEntry(bad), bad).toBeNull();
    }
  });
});

describe("parseSenderList", () => {
  it("splits on lines, commas, semicolons and spaces, de-duplicates and reports the rest", () => {
    const r = parseSenderList(
      "buyer@acme.example\n@Acme.example, acme.example; nope\n\n BUYER@acme.example  x@y",
    );
    expect(r.entries).toEqual(["buyer@acme.example", "@acme.example"]);
    expect(r.invalid).toEqual(["nope", "x@y"]);
  });
});

describe("entryCovers", () => {
  it("matches a whole address exactly and a domain with its subdomains", () => {
    expect(entryCovers("buyer@acme.example", "Buyer@acme.example")).toBe(true);
    expect(entryCovers("buyer@acme.example", "other@acme.example")).toBe(false);
    expect(entryCovers("@acme.example", "x@acme.example")).toBe(true);
    expect(entryCovers("@acme.example", "x@mail.acme.example")).toBe(true);
    expect(entryCovers("@acme.example", "x@notacme.example")).toBe(false);
    expect(entryCovers("@acme.example", "x@acme.example.evil.test")).toBe(false);
    expect(entryCovers("@acme.example", "acme.example")).toBe(false);
  });
});

describe("senderAllowed", () => {
  it("lets everyone in while the list is empty", () => {
    expect(senderAllowed([], ["x@anywhere.test"])).toBe(true);
    expect(senderAllowed([], [null])).toBe(true);
  });

  it("needs the envelope sender or the From header on the list", () => {
    const list = ["@acme.example", "dana@example-robotics.test"];
    expect(senderAllowed(list, ["bounce@lists.test", "dana@example-robotics.test"])).toBe(true);
    expect(senderAllowed(list, ["estimator@acme.example", "customer@else.test"])).toBe(true);
    expect(senderAllowed(list, ["spam@else.test", "spam@else.test"])).toBe(false);
    expect(senderAllowed(list, [null, null])).toBe(false);
  });
});
