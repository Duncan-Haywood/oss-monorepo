import { describe, expect, it } from "vitest";
import { mergeInquiriesForInbox, sortInquiriesNewestFirst } from "./merge";
import type { ClientInquiry } from "./types";

function inquiry(partial: Partial<ClientInquiry> & Pick<ClientInquiry, "id" | "createdAt">): ClientInquiry {
  return {
    id: partial.id,
    leadSlug: partial.leadSlug ?? "cafe",
    businessName: partial.businessName ?? "Cafe",
    message: partial.message ?? "Hi",
    status: partial.status ?? "new",
    createdAt: partial.createdAt,
    updatedAt: partial.updatedAt ?? partial.createdAt,
  };
}

describe("sortInquiriesNewestFirst", () => {
  it("orders by createdAt descending", () => {
    const older = inquiry({ id: "inq_1", createdAt: "2026-07-01T00:00:00.000Z" });
    const newer = inquiry({ id: "inq_2", createdAt: "2026-07-05T00:00:00.000Z" });
    expect(sortInquiriesNewestFirst([older, newer]).map((i) => i.id)).toEqual([
      "inq_2",
      "inq_1",
    ]);
  });
});

describe("mergeInquiriesForInbox", () => {
  it("dedupes an inquiry present in more than one source list by id", () => {
    const unreplied = inquiry({
      id: "inq_shared",
      status: "read",
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    // Same inquiry appears in both the recent-N page and the uncapped
    // unreplied feed — a raw concat would double-count/duplicate-render it.
    const merged = mergeInquiriesForInbox([unreplied], [unreplied]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("inq_shared");
  });

  it("keeps an unreplied inquiry older than the capped recent-N page", () => {
    // Simulates listClientInquiries(50)'s recent page having rotated an old
    // unreplied inquiry out once 50+ newer inquiries (any status) exist —
    // listUnrepliedInquiries() (uncapped) still carries it and must not be
    // silently dropped, or the dashboard's Website inquiries panel loses the
    // one row the operator most needs to act on (inquiries-inbox-uncapped-
    // unreplied-merge).
    const staleUnreplied = inquiry({
      id: "inq_old_unreplied",
      status: "new",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    const recentReplied = inquiry({
      id: "inq_recent_replied",
      status: "replied",
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    const merged = mergeInquiriesForInbox([recentReplied], [staleUnreplied]);
    expect(merged.map((i) => i.id)).toEqual(["inq_recent_replied", "inq_old_unreplied"]);
  });

  it("unions distinct inquiries across sources and sorts newest-first", () => {
    const a = inquiry({ id: "inq_a", createdAt: "2026-07-01T00:00:00.000Z" });
    const b = inquiry({ id: "inq_b", createdAt: "2026-07-03T00:00:00.000Z" });
    const c = inquiry({ id: "inq_c", createdAt: "2026-07-02T00:00:00.000Z" });
    const merged = mergeInquiriesForInbox([a], [b, c]);
    expect(merged.map((i) => i.id)).toEqual(["inq_b", "inq_c", "inq_a"]);
  });

  it("returns an empty array when every source is empty", () => {
    expect(mergeInquiriesForInbox([], [])).toEqual([]);
  });
});
