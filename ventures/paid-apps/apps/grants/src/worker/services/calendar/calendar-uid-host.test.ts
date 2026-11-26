import { describe, expect, it } from "vitest";
import { calendarUidHost } from "./index";

describe("calendarUidHost", () => {
  it("keeps the pre-move host for production so event UIDs do not change", () => {
    expect(calendarUidHost("https://marisstella.app/grants")).toBe("grants.marisstella.app");
    expect(calendarUidHost("https://grants.marisstella.app")).toBe("grants.marisstella.app");
  });

  it("uses APP_URL's host everywhere else", () => {
    expect(calendarUidHost("https://grants-demo.marisstella.app")).toBe(
      "grants-demo.marisstella.app",
    );
    expect(calendarUidHost("http://localhost:5173")).toBe("localhost");
  });
});
