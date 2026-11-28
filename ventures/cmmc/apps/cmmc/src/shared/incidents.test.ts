import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applicability,
  INCIDENT_QUOTES,
  INCIDENT_RULE_VERIFICATION,
  type IncidentFacts,
  incidentAttention,
  incidentChecklist,
  incidentClocks,
  incidentHoldDates,
  incidentIssues,
  incidentRecordMarkdown,
  incidentStage,
  incidentsCsv,
  isInstant,
  validateIncident,
} from "./incidents";

const base = (over: Partial<IncidentFacts> = {}): IncidentFacts => ({
  title: "Phished mailbox",
  clause: "yes",
  affects: "cdi",
  role: "prime",
  higherTier: "",
  contractRef: "W56HZV-26-C-0001",
  discoveredAt: "2026-11-02T15:30:00.000Z",
  reportedAt: null,
  reportNumber: "",
  higherTierNotifiedAt: null,
  malware: "unknown",
  cloud: "unknown",
  systems: "",
  summary: "",
  steps: {},
  timeline: [],
  closedOn: null,
  lessons: "",
  ...over,
});
const at = (iso: string) => new Date(iso);

describe("incident quotes", () => {
  it("are pinned: changing one means re-reading DFARS 252.204-7012 and updating readOn", () => {
    // Each quote was checked by script as a verbatim substring of GSA's DITA source (sha256 in the
    // module header) on the readOn date. A new hash here needs that check again.
    const hash = createHash("sha256")
      .update(JSON.stringify(Object.values(INCIDENT_QUOTES)))
      .digest("hex");
    expect(hash).toBe("9686ec420ec63ca4246319d504e519fbb8b7bdd73257cb5c98d47237922a4caf");
    expect(INCIDENT_RULE_VERIFICATION.readOn).toBe("2026-11-28");
  });
});

describe("instants", () => {
  it("accepts toISOString output and minute precision, refuses rollovers and local times", () => {
    expect(isInstant("2026-11-02T15:30:00.000Z")).toBe(true);
    expect(isInstant("2026-11-02T15:30Z")).toBe(true);
    expect(isInstant("2026-02-30T10:00:00.000Z")).toBe(false);
    expect(isInstant("2026-11-02T15:30")).toBe(false);
    expect(isInstant("2026-11-02T24:30:00Z")).toBe(false);
    expect(isInstant(42)).toBe(false);
  });
});

describe("clocks", () => {
  it("report due 72 elapsed hours after discovery, counting down until reported", () => {
    const c = incidentClocks(base(), at("2026-11-04T15:30:00.000Z"));
    expect(c.reportDue).toBe("2026-11-05T15:30:00.000Z");
    expect(c.msLeft).toBe(24 * 3_600_000);
    expect(c.overdue).toBe(false);
    const late = incidentClocks(base(), at("2026-11-05T15:31:00.000Z"));
    expect(late.overdue).toBe(true);
    expect(late.preserveUntil).toBeNull();
  });
  it("exactly 72 hours is on time; one minute more is late", () => {
    const on = incidentClocks(
      base({ reportedAt: "2026-11-05T15:30:00.000Z" }),
      at("2026-11-06T00:00Z"),
    );
    expect(on.reportedLate).toBe(false);
    expect(on.msLeft).toBeNull();
    const off = incidentClocks(
      base({ reportedAt: "2026-11-05T15:31:00.000Z" }),
      at("2026-11-06T00:00Z"),
    );
    expect(off.reportedLate).toBe(true);
  });
  it("keeps images 90 days from the report (plus an hour, so never early across a clock change)", () => {
    const c = incidentClocks(
      base({ reportedAt: "2026-11-03T10:00:00.000Z" }),
      at("2026-11-04T00:00Z"),
    );
    expect(c.preserveUntil).toBe("2027-02-01T11:00:00.000Z");
    expect((c.preserveMsLeft ?? 0) > 0).toBe(true);
  });
});

describe("applicability (paragraph (c))", () => {
  it("is owed with the clause and CDI or critical support; not owed without the clause", () => {
    expect(applicability({ clause: "yes", affects: "cdi" }).required).toBe(true);
    expect(applicability({ clause: "yes", affects: "ocs" }).required).toBe(true);
    expect(applicability({ clause: "no", affects: "cdi" }).required).toBe(false);
    expect(applicability({ clause: "yes", affects: "neither" }).required).toBe(false);
    expect(applicability({ clause: "unsure", affects: "neither" }).required).toBeNull();
    expect(applicability({ clause: "unsure", affects: "cdi" }).required).toBeNull();
  });
});

describe("stage", () => {
  const now = at("2026-11-04T00:00Z");
  it("reads report, not_owed, preserve, open and closed from the row", () => {
    expect(incidentStage(base(), now)).toBe("report");
    expect(incidentStage(base({ clause: "unsure", affects: "unsure" }), now)).toBe("report");
    expect(incidentStage(base({ clause: "no" }), now)).toBe("not_owed");
    const reported = base({ reportedAt: "2026-11-03T10:00:00.000Z" });
    expect(incidentStage(reported, now)).toBe("preserve");
    expect(incidentStage(reported, at("2027-03-01T00:00Z"))).toBe("open");
    expect(incidentStage({ ...reported, closedOn: "2027-03-01" }, now)).toBe("closed");
  });
});

describe("checklist", () => {
  it("drops the higher-tier step for a prime and the malware and cloud steps when answered no", () => {
    const ids = (r: IncidentFacts) => incidentChecklist(r).map((s) => s.id);
    expect(ids(base())).not.toContain("higher");
    expect(ids(base({ role: "sub" }))).toContain("higher");
    expect(ids(base({ malware: "no", cloud: "no" }))).not.toEqual(
      expect.arrayContaining(["malware"]),
    );
    expect(ids(base({ malware: "no", cloud: "no" }))).not.toContain("cloud");
    const done = incidentChecklist(base({ steps: { review: true } }));
    expect(done.find((s) => s.id === "review")?.done).toBe(true);
    expect(done.find((s) => s.id === "report")?.done).toBe(false);
  });
});

describe("issues and attention", () => {
  it("flags an overdue report, but not when the clause does not apply or the incident is closed", () => {
    const now = at("2026-11-06T00:00Z");
    expect(incidentIssues(base(), now).map((i) => i.kind)).toEqual(["report_overdue"]);
    expect(incidentIssues(base({ clause: "no" }), now)).toEqual([]);
  });
  it("flags a late report, a missing number, a sub's higher tier and a close inside the hold", () => {
    const r = base({
      role: "sub",
      higherTier: "Prime Aero",
      reportedAt: "2026-11-06T15:30:00.000Z",
      closedOn: "2026-11-20",
    });
    const kinds = incidentIssues(r, at("2026-11-21T00:00Z")).map((i) => i.kind);
    expect(kinds).toEqual([
      "reported_late",
      "no_report_number",
      "higher_tier",
      "closed_before_hold",
      "steps_open",
    ]);
    expect(incidentIssues(r, at("2026-11-21T00:00Z"))[2]?.message).toContain("Prime Aero");
  });
  it("lists unreported incidents by deadline, and a sub's untold higher tier while the hold runs", () => {
    const now = at("2026-11-03T00:00Z");
    const rows = [
      { ...base({ discoveredAt: "2026-11-02T20:00:00.000Z", title: "B" }), id: "b" },
      { ...base({ title: "A" }), id: "a" },
      { ...base({ title: "C", reportedAt: "2026-11-02T18:00:00.000Z" }), id: "c" },
      {
        ...base({ title: "D", role: "sub", reportedAt: "2026-11-02T18:00:00.000Z" }),
        id: "d",
      },
      { ...base({ title: "E", clause: "no" }), id: "e" },
    ];
    const att = incidentAttention(rows, now);
    expect(att.map((x) => x.incidentId)).toEqual(["a", "b", "d"]);
    expect(att[0]).toMatchObject({ stage: "report", due: "2026-11-05T15:30:00.000Z" });
  });
  it("counts image-hold end days for the calendar, leaving out finished holds", () => {
    const rows = [
      base({ reportedAt: "2026-11-03T10:00:00.000Z" }),
      base({ reportedAt: "2026-11-03T12:00:00.000Z" }),
      base({ reportedAt: "2026-01-01T12:00:00.000Z" }),
      base(),
    ];
    expect(incidentHoldDates(rows, at("2026-11-04T00:00Z"))).toEqual([
      { date: "2027-02-01", count: 2 },
    ]);
  });
});

describe("validation", () => {
  const now = at("2026-11-04T00:00Z");
  const v = (over: Partial<IncidentFacts>) => validateIncident(base(over), now);
  it("accepts a plain record", () => expect(v({})).toEqual([]));
  it("refuses future times, a report before discovery and a higher tier told before the report", () => {
    expect(v({ discoveredAt: "2026-11-05T00:00:00.000Z" })[0]).toContain("future");
    expect(v({ reportedAt: "2026-11-01T00:00:00.000Z" })[0]).toContain("before discovered");
    expect(v({ higherTierNotifiedAt: "2026-11-03T00:00:00.000Z" })[0]).toContain("report first");
    expect(
      v({
        reportedAt: "2026-11-03T00:00:00.000Z",
        higherTierNotifiedAt: "2026-11-02T20:00:00.000Z",
      })[0],
    ).toContain("before the report");
    expect(v({ closedOn: "2026-11-01" })[0]).toContain("Closed");
    expect(v({ steps: { bogus: true } })[0]).toContain("bogus");
    expect(v({ timeline: [{ at: "yesterday", text: "x" }] })[0]).toContain("timeline");
  });
});

describe("exports", () => {
  const now = at("2026-11-04T00:00Z");
  it("writes a formula-safe CSV with the clocks in UTC", () => {
    const csv = incidentsCsv(
      [
        base({
          title: "=HYPERLINK(1)",
          reportedAt: "2026-11-03T10:00:00.000Z",
          reportNumber: "ICF-1",
        }),
      ],
      now,
    );
    const [head, row] = csv.trimEnd().split("\r\n");
    expect(head).toContain("Report due (UTC)");
    expect(row).toContain("'=HYPERLINK(1)");
    expect(row).toContain("2026-11-05 15:30 UTC");
    expect(row).toContain("18.5");
    expect(row).toContain("2027-02-01 11:00 UTC");
  });
  it("writes a Markdown record with the checklist and an escaped timeline", () => {
    const out = incidentRecordMarkdown(
      base({
        role: "sub",
        higherTier: "Prime | Aero",
        steps: { review: true },
        timeline: [{ at: "2026-11-02T16:00:00.000Z", text: "Pulled the laptop off the network" }],
      }),
      { orgName: "Acme Machining", now },
    );
    expect(out).toContain("# Cyber incident record: Phished mailbox");
    expect(out).toContain("| 72-hour report due | 2026-11-05 15:30 UTC |");
    expect(out).toContain("Prime \\| Aero");
    expect(out).toContain("- [x] **Review for evidence that CDI was compromised**");
    expect(out).toContain("| 2026-11-02 16:00 UTC | Pulled the laptop off the network |");
  });
});
