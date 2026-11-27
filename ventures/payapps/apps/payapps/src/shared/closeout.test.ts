import { describe, expect, it } from "vitest";
import {
  type CloseoutItemFacts,
  closeoutDateProblem,
  closeoutReadiness,
  closeoutStatus,
  retainageReleaseEmail,
  STANDARD_CLOSEOUT_ITEMS,
  standardItemsToAdd,
  summarizeCloseout,
} from "./closeout";
import { summarizePunchList } from "./punch-list";

const TODAY = "2026-11-26";
const item = (over: Partial<CloseoutItemFacts> = {}): CloseoutItemFacts => ({
  kind: "warranty",
  title: "Warranty letter",
  requiredBy: null,
  dueOn: null,
  sentOn: null,
  acceptedOn: null,
  acceptedBy: null,
  waivedNote: null,
  ...over,
});
const noPunch = summarizePunchList([], TODAY);
const held = { heldCents: 125_000, lastApplication: 7, workComplete: true };
const job = {
  name: "Riverside Clinic",
  number: "24-118",
  gcName: "Harbor Builders",
  gcPmName: "Dana Ruiz",
  gcPmEmail: "dana@harbor.example",
};
const from = { name: "Luis Ortega", company: "Ortega Electric" };

describe("closeout status", () => {
  it("reads accepted, then not required, then sent, then overdue, else to send", () => {
    expect(closeoutStatus(item(), TODAY)).toBe("missing");
    expect(closeoutStatus(item({ dueOn: "2026-11-25" }), TODAY)).toBe("overdue");
    expect(closeoutStatus(item({ dueOn: TODAY }), TODAY)).toBe("missing");
    expect(closeoutStatus(item({ dueOn: "2026-11-01", sentOn: "2026-11-20" }), TODAY)).toBe("sent");
    expect(closeoutStatus(item({ waivedNote: "  " }), TODAY)).toBe("missing");
    expect(closeoutStatus(item({ waivedNote: "Not bonded" }), TODAY)).toBe("waived");
    expect(closeoutStatus(item({ waivedNote: "x", acceptedOn: TODAY }), TODAY)).toBe("accepted");
  });

  it("counts not-required items out of the share delivered", () => {
    const s = summarizeCloseout(
      [item({ sentOn: TODAY }), item({ waivedNote: "n/a" }), item(), item({ acceptedOn: TODAY })],
      TODAY,
    );
    expect(s).toMatchObject({
      total: 4,
      sent: 1,
      accepted: 1,
      waived: 1,
      toSend: 1,
      delivered: false,
    });
    expect(s.deliveredPct).toBe(66);
    expect(summarizeCloseout([item({ waivedNote: "n/a" })], TODAY)).toMatchObject({
      deliveredPct: null,
      delivered: false,
    });
  });

  it("checks dates in order and never in the future", () => {
    expect(closeoutDateProblem({ sentOn: "2026-11-27", acceptedOn: null }, TODAY)).toMatch(
      /future/,
    );
    expect(closeoutDateProblem({ sentOn: "2026-11-20", acceptedOn: "2026-11-19" }, TODAY)).toMatch(
      /before the date sent/,
    );
    expect(closeoutDateProblem({ sentOn: null, acceptedOn: "2026-11-19" }, TODAY)).toBeNull();
  });

  it("adds only the standard kinds a job lacks", () => {
    expect(standardItemsToAdd([])).toHaveLength(STANDARD_CLOSEOUT_ITEMS.length);
    const rest = standardItemsToAdd(["warranty", "other"]);
    expect(rest.map((i) => i.kind)).not.toContain("warranty");
    expect(rest).toHaveLength(STANDARD_CLOSEOUT_ITEMS.length - 1);
  });
});

describe("retainage readiness and the release email", () => {
  it("names every blocker, most important first", () => {
    const punch = summarizePunchList(
      [
        {
          number: 1,
          description: "a",
          location: null,
          source: null,
          listedOn: null,
          dueOn: null,
          completedOn: TODAY,
          completedBy: null,
          acceptedOn: null,
          acceptedBy: null,
          disputeNote: null,
        },
        {
          number: 2,
          description: "b",
          location: null,
          source: null,
          listedOn: null,
          dueOn: null,
          completedOn: null,
          completedBy: null,
          acceptedOn: null,
          acceptedBy: null,
          disputeNote: null,
        },
      ],
      TODAY,
    );
    const r = closeoutReadiness(summarizeCloseout([item({ dueOn: "2026-11-01" })], TODAY), punch, {
      heldCents: 50_000,
      lastApplication: 3,
      workComplete: false,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers).toEqual([
      "The latest pay application sent (#3) does not bill the whole contract yet: bill the remaining work first.",
      "2 punch list items are not accepted yet (1 to fix, 1 awaiting the GC's back-check).",
      "1 close-out document is still to send (1 overdue).",
    ]);
    expect(
      closeoutReadiness(summarizeCloseout([], TODAY), noPunch, {
        heldCents: 0,
        lastApplication: null,
        workComplete: false,
      }).blockers,
    ).toHaveLength(2);
  });

  it("drafts the request only when nothing stands in the way, stating only what was entered", () => {
    const items = [
      item({
        title: "O&M manuals",
        sentOn: "2026-11-20",
        acceptedOn: "2026-11-24",
        acceptedBy: "Dana Ruiz",
      }),
      item({ kind: "as_builts", title: "As-built drawings", sentOn: "2026-11-21" }),
      item({
        kind: "consent_of_surety",
        title: "Consent of surety",
        waivedNote: "Job is not bonded",
      }),
    ];
    expect(retainageReleaseEmail(job, [item()], noPunch, held, from, TODAY)).toBeNull();
    expect(
      retainageReleaseEmail(job, items, noPunch, { ...held, workComplete: false }, from, TODAY),
    ).toBeNull();
    const email = retainageReleaseEmail(job, items, noPunch, held, from, TODAY);
    expect(email?.to).toBe("dana@harbor.example");
    expect(email?.subject).toBe(
      "Retainage release request: $1,250.00 (Riverside Clinic (job 24-118))",
    );
    expect(email?.body).toContain("Hello Dana Ruiz,");
    expect(email?.body).toContain("$1,250.00 as held on pay application #7");
    expect(email?.body).toContain(
      "- O&M manuals (sent 2026-11-20, accepted 2026-11-24 by Dana Ruiz)",
    );
    expect(email?.body).toContain("- As-built drawings (sent 2026-11-21)");
    expect(email?.body).toContain("- Consent of surety: Job is not bonded");
    expect(email?.body).not.toContain("punch list");
    expect(email?.body).toContain("Luis Ortega\nOrtega Electric");
  });
});
