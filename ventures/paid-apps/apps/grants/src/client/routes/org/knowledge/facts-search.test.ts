import { router } from "@client/router";
import { describe, expect, it } from "vitest";
import { parseStatusParam, validateFactsSearch } from "./facts";

describe("validateFactsSearch (facts route ?status= & ?factId=)", () => {
  it("keeps string status and factId", () => {
    expect(validateFactsSearch({ status: "proposed", factId: "fct_1" })).toEqual({
      status: "proposed",
      factId: "fct_1",
    });
    expect(validateFactsSearch({ status: "confirmed,rejected" })).toEqual({
      status: "confirmed,rejected",
    });
  });

  it("drops missing, empty and non-string values (and unknown keys)", () => {
    expect(validateFactsSearch({})).toEqual({});
    expect(validateFactsSearch({ status: "", factId: "  " })).toEqual({});
    expect(validateFactsSearch({ status: ["a"], factId: { id: 1 }, tab: "x" })).toEqual({});
  });

  it("stringifies numbers the router JSON-parsed", () => {
    expect(validateFactsSearch({ factId: 123 })).toEqual({ factId: "123" });
  });

  it("is the facts route's validateSearch, and its output feeds parseStatusParam", () => {
    const route = router.routesById["/orgs/$orgId/knowledge/facts"];
    expect(route.options.validateSearch).toBe(validateFactsSearch);
    expect(parseStatusParam(validateFactsSearch({}).status)).toBe("proposed");
    expect(parseStatusParam(validateFactsSearch({ status: "all" }).status)).toBe("");
  });
});
