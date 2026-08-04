import { describe, expect, it } from "vitest";
import { parseSessionBundle } from "@/lib/sessionStore";

const good = JSON.stringify({
  firstName: "Sam",
  perspective: "PARTNER_GUESS",
  participants: { activities: "p1", professions: "p2" },
  domains: [
    { slug: "activities", title: "Activities", kind: "ITEMS" },
    { slug: "professions", title: "Professions", kind: "ITEMS" },
  ],
});

describe("parseSessionBundle", () => {
  it("reads a complete bundle", () => {
    const bundle = parseSessionBundle(good);
    expect(bundle?.firstName).toBe("Sam");
    expect(bundle?.perspective).toBe("PARTNER_GUESS");
    expect(bundle?.participants.activities).toBe("p1");
    expect(bundle?.domains).toHaveLength(2);
  });

  it("returns null for anything unusable", () => {
    for (const raw of [null, "", "not json", "[]", '"a string"', "{}"]) {
      expect(parseSessionBundle(raw)).toBeNull();
    }
  });

  /**
   * The failure this guards: a start that half-succeeded leaves domains with
   * no participant id behind them. The runner then has nothing to fetch and
   * sits on "Loading next…" forever, with a hard refresh the only escape.
   */
  it("rejects a bundle whose domains have no participant behind them", () => {
    const orphaned = JSON.stringify({
      firstName: "Sam",
      participants: {},
      domains: [{ slug: "activities", title: "Activities", kind: "ITEMS" }],
    });
    expect(parseSessionBundle(orphaned)).toBeNull();

    const mismatched = JSON.stringify({
      firstName: "Sam",
      participants: { somethingElse: "p1" },
      domains: [{ slug: "activities", title: "Activities", kind: "ITEMS" }],
    });
    expect(parseSessionBundle(mismatched)).toBeNull();
  });

  it("accepts a bundle where only some domains have participants", () => {
    const partial = JSON.stringify({
      firstName: "Sam",
      participants: { activities: "p1" },
      domains: [
        { slug: "activities", title: "Activities", kind: "ITEMS" },
        { slug: "financial", title: "Money", kind: "FINANCIAL" },
      ],
    });
    expect(parseSessionBundle(partial)).not.toBeNull();
  });

  it("drops a perspective it does not recognise rather than trusting it", () => {
    const tampered = JSON.stringify({
      firstName: "Sam",
      perspective: "ADMIN",
      participants: { activities: "p1" },
      domains: [{ slug: "activities", title: "Activities", kind: "ITEMS" }],
    });
    expect(parseSessionBundle(tampered)?.perspective).toBeUndefined();
  });

  it("tolerates a missing first name", () => {
    const noName = JSON.stringify({
      participants: { activities: "p1" },
      domains: [{ slug: "activities", title: "Activities", kind: "ITEMS" }],
    });
    expect(parseSessionBundle(noName)?.firstName).toBe("");
  });
});
