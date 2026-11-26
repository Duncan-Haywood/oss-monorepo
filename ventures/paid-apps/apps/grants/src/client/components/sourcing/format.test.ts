import { ApiError } from "@client/lib/api";
import { describe, expect, it } from "vitest";
import {
  dateInputToIso,
  displayUrl,
  filterProspects,
  formatCompactCents,
  funderOf,
  isOverdue,
  isoToDateInput,
  isPlatformSource,
  isReadOnlySource,
  normalizeHttpUrl,
  sortProspectsByFit,
  sourceName,
  sourcingErrorMessage,
} from "./format";
import { makeProspect, makeSource } from "./test-helpers";

describe("sourcing format helpers", () => {
  it("normalizes http(s) URLs and rejects everything else", () => {
    expect(normalizeHttpUrl("foundation.org/grants")).toBe("https://foundation.org/grants");
    expect(normalizeHttpUrl(" http://a.org ")).toBe("http://a.org/");
    expect(normalizeHttpUrl("")).toBeNull();
    expect(normalizeHttpUrl("localhost")).toBeNull();
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("ftp://files.org/x")).toBeNull();
  });

  it("names sources by label, funder, then URL", () => {
    expect(sourceName(makeSource({ label: " ", funderName: "Fund" }))).toBe("Fund");
    expect(
      sourceName(makeSource({ label: null, funderName: null, url: "https://www.x.org/grants/" })),
    ).toBe("x.org/grants");
    expect(displayUrl("not a url")).toBe("not a url");
  });

  it("treats orgId:null or readOnly sources as platform sources", () => {
    expect(isPlatformSource(makeSource({ orgId: null }))).toBe(true);
    expect(isPlatformSource(makeSource({ scope: "platform" }))).toBe(true);
    expect(isPlatformSource(makeSource())).toBe(false);
    // The server's readOnly wins (platform admins may edit platform sources).
    expect(isReadOnlySource(makeSource({ orgId: null, readOnly: false }))).toBe(false);
    expect(isReadOnlySource(makeSource({ orgId: null }))).toBe(true);
    expect(isReadOnlySource(makeSource({ readOnly: false }))).toBe(false);
  });

  it("reads the funder profile nested or flat", () => {
    const nested = makeProspect();
    expect(funderOf(nested).name).toBe("High Desert Community Trust");
    const { funder, ...rest } = nested;
    expect(funderOf({ ...rest, profile: funder }).name).toBe("High Desert Community Trust");
    const flat = funderOf({ ...rest, name: "Flat Fund", totalGivingCents: 5 });
    expect(flat).toMatchObject({ name: "Flat Fund", totalGivingCents: 5, city: null });
    expect(funderOf(rest).name).toBe("EIN 85-0123456");
  });

  it("sorts by fit, then giving, without mutating; filters by status", () => {
    const f = makeProspect().funder;
    const a = makeProspect({ id: "a", fitScore: 50 });
    const b = makeProspect({ id: "b", fitScore: 90, status: "declined" });
    const c = makeProspect({
      id: "c",
      fitScore: 50,
      funder: f && { ...f, totalGivingCents: 9e12 },
    });
    const input = [a, b, c];
    expect(sortProspectsByFit(input).map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(input.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(filterProspects(input, "active").map((p) => p.id)).toEqual(["a", "c"]);
    expect(filterProspects(input, "declined").map((p) => p.id)).toEqual(["b"]);
    expect(filterProspects(input, "all")).toHaveLength(3);
  });

  it("formats money compactly for large amounts", () => {
    expect(formatCompactCents(null)).toBe("—");
    expect(formatCompactCents(1_250_000)).toBe("$12,500");
    expect(formatCompactCents(425_000_000)).toBe("$4.3M");
  });

  it("round-trips date inputs through noon-UTC timestamps", () => {
    expect(dateInputToIso("")).toBeNull();
    expect(dateInputToIso("12/01/2026")).toBeUndefined();
    const iso = dateInputToIso("2026-12-01");
    expect(iso).toBe("2026-12-01T12:00:00.000Z");
    expect(isoToDateInput(iso)).toBe("2026-12-01");
    expect(isoToDateInput(null)).toBe("");
    expect(isoToDateInput("garbage")).toBe("");
    const now = new Date("2026-11-19T12:00:00");
    expect(isOverdue("2026-11-18T12:00:00.000Z", now)).toBe(true);
    expect(isOverdue("2026-11-19T12:00:00.000Z", now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });

  it("maps API errors to friendly messages", () => {
    expect(sourcingErrorMessage(new ApiError(422, "robots_disallowed", "x"))).toMatch(
      /robots\.txt/,
    );
    expect(sourcingErrorMessage(new ApiError(429, "http_error", "Too Many"))).toMatch(
      /wait a little/,
    );
    expect(sourcingErrorMessage(new ApiError(429, "rate_limited", "Once per hour."))).toBe(
      "Once per hour.",
    );
    expect(
      sourcingErrorMessage(new ApiError(409, "conflict", "This page is already on your watchlist")),
    ).toBe("This page is already on your watchlist");
    expect(sourcingErrorMessage(new ApiError(422, "too_many_sources", "x"))).toMatch(
      /watchlist is full/,
    );
    expect(sourcingErrorMessage(new ApiError(422, "something_new", "Server says why"))).toBe(
      "Server says why",
    );
    expect(sourcingErrorMessage(new ApiError(503, "http_error", "x"))).toMatch(/our side/);
    expect(sourcingErrorMessage(new TypeError("Failed to fetch"))).toMatch(/connection/);
  });
});
