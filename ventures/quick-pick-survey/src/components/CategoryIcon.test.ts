import { describe, expect, it } from "vitest";
import { describeCardVisual } from "./CategoryIcon";

describe("describeCardVisual", () => {
  it("uses the exact card action before a broad category fallback", () => {
    expect(
      describeCardVisual({
        label: "Puts the phone down and actually listens",
        category: "Behaviour",
      })
    ).toMatchObject({ primary: "📵", supporting: "👂", context: "full attention" });
  });

  it("distinguishes a difficult conversation from generic communication", () => {
    expect(
      describeCardVisual({
        label: "Stays in the room during hard conversations",
        category: "Communication",
      })
    ).toMatchObject({ primary: "💬", supporting: "🕊️", context: "healthy conflict" });
  });

  it("gives every relationship category a meaningful fallback scene", () => {
    expect(
      describeCardVisual({
        label: "A deliberately unmatched card phrase",
        category: "Intimacy",
      })
    ).toMatchObject({ primary: "💞", supporting: "🌙", context: "closeness" });
  });
});
