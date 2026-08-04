import { describe, expect, it } from "vitest";
import {
  mapClientVoicePackRow,
  parseClientVoiceVariants,
  type SqliteClientVoicePackRow,
} from "./sqlite-row-mapping";

const baseRow: SqliteClientVoicePackRow = {
  id: "cvp_acme",
  leadSlug: "acme",
  variantsJson: JSON.stringify([
    { scriptType: "inbound_greeting", title: "Greeting", body: "Thanks for calling Acme!" },
  ]),
  generatedAt: "2026-01-01T00:00:00.000Z",
  generator: "stub",
};

describe("parseClientVoiceVariants", () => {
  it("round-trips well-formed variants", () => {
    const json = JSON.stringify([
      { scriptType: "hours_faq", title: "Hours", body: "We're open Mon-Fri", cta: "Call now" },
    ]);
    expect(parseClientVoiceVariants(json)).toEqual([
      { scriptType: "hours_faq", title: "Hours", body: "We're open Mon-Fri", cta: "Call now" },
    ]);
  });

  it("degrades malformed JSON to []", () => {
    expect(parseClientVoiceVariants("not json")).toEqual([]);
  });

  it("degrades a non-array JSON value to []", () => {
    expect(parseClientVoiceVariants(JSON.stringify({ scriptType: "hours_faq" }))).toEqual([]);
  });

  it("filters out elements missing scriptType, title, or body", () => {
    const json = JSON.stringify([
      { scriptType: "hours_faq", title: "Hours", body: "valid" },
      { scriptType: "hours_faq", title: "Missing body" },
      "not-an-object",
    ]);
    expect(parseClientVoiceVariants(json)).toEqual([
      { scriptType: "hours_faq", title: "Hours", body: "valid" },
    ]);
  });
});

describe("mapClientVoicePackRow", () => {
  it("maps a well-formed row", () => {
    expect(mapClientVoicePackRow(baseRow)).toEqual({
      id: "cvp_acme",
      leadSlug: "acme",
      variants: [
        { scriptType: "inbound_greeting", title: "Greeting", body: "Thanks for calling Acme!" },
      ],
      generatedAt: "2026-01-01T00:00:00.000Z",
      generator: "stub",
    });
  });

  it("maps generator=anthropic through and defaults an unrecognized generator to stub", () => {
    expect(mapClientVoicePackRow({ ...baseRow, generator: "anthropic" }).generator).toBe(
      "anthropic",
    );
    expect(mapClientVoicePackRow({ ...baseRow, generator: "gpt5" }).generator).toBe("stub");
  });

  it("survives a corrupted variantsJson column without throwing", () => {
    const row: SqliteClientVoicePackRow = { ...baseRow, variantsJson: "{corrupt" };
    expect(() => mapClientVoicePackRow(row)).not.toThrow();
    expect(mapClientVoicePackRow(row).variants).toEqual([]);
  });
});
