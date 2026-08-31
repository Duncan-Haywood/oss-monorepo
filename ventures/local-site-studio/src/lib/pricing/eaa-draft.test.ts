import { describe, expect, it } from "vitest";
import { readChecklistDraft, writeChecklistDraft } from "./eaa-draft";

describe("EAA checklist draft", () => {
  it("round trips checked item ids", () => {
    expect(readChecklistDraft(writeChecklistDraft(["scope", "keyboard"]))).toEqual(["scope", "keyboard"]);
  });

  it("restores the legacy raw-array format already stored in browsers", () => {
    expect(readChecklistDraft(JSON.stringify(["scope", "forms"]))).toEqual(["scope", "forms"]);
  });

  it("rejects malformed or incompatible drafts", () => {
    expect(readChecklistDraft("not json")).toEqual([]);
    expect(readChecklistDraft(JSON.stringify({ version: 2, checked: ["scope"] }))).toEqual([]);
    expect(readChecklistDraft(JSON.stringify({ version: 1, checked: ["scope", 4, null] }))).toEqual(["scope"]);
  });
});
