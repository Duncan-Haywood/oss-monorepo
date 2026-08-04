import { describe, expect, it } from "vitest";
import { shareTargetFrom } from "@/lib/shareTarget";

describe("shareTargetFrom", () => {
  it("keeps the origin it is given and splits out the host for display", () => {
    expect(shareTargetFrom("https://pairwise.marisstella.dev")).toEqual({
      url: "https://pairwise.marisstella.dev",
      host: "pairwise.marisstella.dev",
    });
  });

  it("drops any path, query or fragment the caller passed in", () => {
    // `window.location.origin` never carries these, but a caller reading from
    // `href` by mistake would otherwise put the couple's invite code — which is
    // the credential to their comparison — into every shared card.
    expect(shareTargetFrom("https://pairwise.marisstella.dev/couple?code=ABCD-EFGH#x")).toEqual({
      url: "https://pairwise.marisstella.dev",
      host: "pairwise.marisstella.dev",
    });
  });

  it("keeps the port, so a preview deployment shares a link that resolves", () => {
    expect(shareTargetFrom("http://localhost:3000")).toEqual({
      url: "http://localhost:3000",
      host: "localhost:3000",
    });
  });

  it.each([undefined, null, "", "not a url", "quickpick.app", "javascript:alert(1)", "file:///tmp"])(
    "returns null rather than guessing for %p",
    (origin) => {
      expect(shareTargetFrom(origin)).toBeNull();
    },
  );

  it("never invents a host of its own", () => {
    // The defect this module replaced was a literal fallback host. A fallback
    // is the failure, not the safety net: assert there is no input at all for
    // which this returns a host it was not handed.
    for (const origin of ["https://a.test", "http://b.test:8080", "", "x", null]) {
      const target = shareTargetFrom(origin);
      if (target) expect(origin).toContain(target.host);
    }
  });
});
