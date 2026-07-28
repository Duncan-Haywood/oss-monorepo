import { describe, expect, it } from "vitest";
import {
  PENDING_OPERATION_ANNOUNCEMENT_MESSAGE,
  pendingOperationAnnouncementText,
} from "./pending-operation-announcement";

describe("pendingOperationAnnouncementText", () => {
  it("returns the announcement message while a transition is pending", () => {
    expect(pendingOperationAnnouncementText(true)).toBe(PENDING_OPERATION_ANNOUNCEMENT_MESSAGE);
  });

  it("returns an empty string when idle, so the live region has nothing stale to re-announce", () => {
    expect(pendingOperationAnnouncementText(false)).toBe("");
  });
});
