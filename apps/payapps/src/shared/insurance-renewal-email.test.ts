import { describe, expect, it } from "vitest";
import { mailtoHref } from "./follow-up-email";
import {
  holdersAfterSend,
  type RenewalEmailCertificate,
  type RenewalEmailJob,
  renewalEmails,
  renewedCertificate,
} from "./insurance-renewal-email";

const cert = (over: Partial<RenewalEmailCertificate> = {}): RenewalEmailCertificate => ({
  id: "new",
  kind: "general_liability",
  label: null,
  carrier: "Acme Mutual",
  policyNumber: "GL-2027-1",
  effectiveOn: "2026-12-01",
  expiresOn: "2027-12-01",
  archived: false,
  holders: [],
  ...over,
});

const holder = (
  projectId: string,
  projectName: string,
  gcName: string,
  sentOn: string | null = null,
) => ({
  projectId,
  projectName,
  gcName,
  sentOn,
});

const jobs: RenewalEmailJob[] = [
  {
    id: "p1",
    name: "Elm St Clinic",
    number: "2041",
    gcPmName: "Dana Ruiz",
    gcPmEmail: "dana@peakgc.example",
  },
  {
    id: "p2",
    name: "Oak School",
    number: null,
    gcPmName: "Dana Ruiz",
    gcPmEmail: "Dana@PeakGC.example",
  },
  { id: "p3", name: "Main St Lofts", number: "77", gcPmName: null, gcPmEmail: null },
  {
    id: "p4",
    name: "Harbor Office",
    number: null,
    gcPmName: "Lee",
    gcPmEmail: "lee@sierra.example",
  },
];
const from = { name: "Sam Ortiz", company: "Ortiz Electric" };
const today = "2026-11-26";

const old = cert({
  id: "old",
  carrier: "Acme Mutual",
  policyNumber: "GL-2026-1",
  effectiveOn: "2025-12-01",
  expiresOn: "2026-12-01",
  archived: true,
  holders: [
    holder("p1", "Elm St Clinic", "Peak GC", "2025-12-03"),
    holder("p2", "Oak School", "Peak GC"),
    holder("p3", "Main St Lofts", "Sierra Builders"),
    holder("p4", "Harbor Office", "Sierra Builders"),
  ],
});

describe("renewedCertificate", () => {
  it("is the latest earlier certificate of the same coverage that has holders, archived or not", () => {
    const older = cert({
      id: "older",
      expiresOn: "2025-12-01",
      archived: true,
      holders: old.holders,
    });
    const noHolders = cert({ id: "nh", expiresOn: "2026-12-15", archived: true });
    const otherKind = cert({
      id: "auto",
      kind: "auto",
      expiresOn: "2026-12-20",
      holders: old.holders,
    });
    const active = { ...old, archived: false };
    expect(renewedCertificate(cert(), [cert(), older, noHolders, otherKind, active])?.id).toBe(
      "old",
    );
    expect(renewedCertificate(cert(), [cert(), otherKind, noHolders])).toBeNull();
    // A later certificate is never the one this renews.
    expect(renewedCertificate(old, [old, cert({ holders: old.holders })])).toBeNull();
  });
});

describe("renewalEmails", () => {
  it("drafts one renewal a GC from the old certificate's holders, with only typed facts", () => {
    const c = cert({
      eachOccurrenceCents: 100_000_000,
      aggregateCents: 200_000_000,
      additionalInsured: true,
    });
    const emails = renewalEmails(c, [c, old], jobs, from, today);
    expect(emails.map((e) => [e.gcName, e.kind, e.projectIds, e.to])).toEqual([
      ["Peak GC", "renewal", ["p1", "p2"], "dana@peakgc.example"],
      ["Sierra Builders", "renewal", ["p3", "p4"], "lee@sierra.example"],
    ]);
    const peak = emails[0];
    expect(peak?.subject).toBe(
      "Renewed certificate of insurance: Ortiz Electric, General liability (Acme Mutual), to 2027-12-01",
    );
    expect(peak?.body).toBe(
      [
        "Hello Dana Ruiz,",
        "",
        "Our General liability (Acme Mutual) policy has renewed. The certificate you hold for us expires 2026-12-01; please replace it with the renewed certificate for these jobs:",
        "- Elm St Clinic (#2041)",
        "- Oak School",
        "",
        "Coverage: General liability (Acme Mutual)",
        "Insurer: Acme Mutual",
        "Policy number: GL-2027-1",
        "Policy period: 2026-12-01 to 2027-12-01",
        "Limits shown: each occurrence $1,000,000, general aggregate $2,000,000",
        "The certificate shows: additional insured",
        "",
        "If you need the certificate issued with different wording or a different certificate holder, let me know and I will ask our agent.",
        "",
        "Thank you,",
        "Sam Ortiz",
        "Ortiz Electric",
      ].join("\n"),
    );
    // Never claims an attachment: the contractor attaches the PDF.
    for (const e of emails) expect(e.body.toLowerCase()).not.toContain("attach");
  });

  it("leaves the recipient blank when a GC's jobs name no PM or different ones, and greets the team", () => {
    const j = jobs.map((x) =>
      x.id === "p3" ? { ...x, gcPmName: "Kim", gcPmEmail: "kim@sierra.example" } : x,
    );
    const sierra = renewalEmails(cert(), [cert(), old], j, from, today)[1];
    expect(sierra?.to).toBeNull();
    expect(sierra?.addresses).toEqual(["kim@sierra.example", "lee@sierra.example"]);
    expect(sierra?.body.startsWith("Hello Sierra Builders project team,")).toBe(true);
    const none = renewalEmails(cert(), [cert(), old], [], from, today);
    expect(none.map((e) => [e.to, e.addresses])).toEqual([
      [null, []],
      [null, []],
    ]);
    // Without the job list it still names the jobs from the holders.
    expect(none[0]?.body).toContain("- Elm St Clinic\n- Oak School");
  });

  it("uses the certificate's own holders once recorded, and says 'expired' for a lapsed old one", () => {
    const c = cert({ holders: [holder("p4", "Harbor Office", "Sierra Builders")] });
    const emails = renewalEmails(c, [c, old], jobs, from, "2026-12-05");
    expect(emails.map((e) => e.gcName)).toEqual(["Sierra Builders"]);
    expect(emails[0]?.body).toContain("The certificate you hold for us expired 2026-12-01; please");
    expect(emails[0]?.body).toContain("for this job:\n- Harbor Office\n");
  });

  it("asks a GC to keep a first certificate on file when nothing earlier was held", () => {
    const c = cert({
      kind: "workers_comp",
      carrier: null,
      policyNumber: null,
      effectiveOn: null,
      eachOccurrenceCents: 50_000_000,
      holders: [holder("p1", "Elm St Clinic", "Peak GC")],
    });
    const [e] = renewalEmails(c, [c, old], jobs, { name: "", company: "" }, today);
    expect(e?.kind).toBe("current");
    expect(e?.subject).toBe(
      "Certificate of insurance: [your company], Workers' compensation, to 2027-12-01",
    );
    expect(e?.body).toContain(
      "Please keep our current Workers' compensation certificate of insurance on file for this job:",
    );
    expect(e?.body).toContain(
      "Expires: 2027-12-01\nLimits shown: employer's liability, each accident $500,000\n",
    );
    expect(e?.body).not.toContain("Insurer:");
    expect(e?.body.endsWith("Thank you,\n[your name]\n[your company]")).toBe(true);
  });

  it("drafts nothing for an archived or expired certificate, or one nobody holds", () => {
    expect(renewalEmails(cert({ archived: true }), [old], jobs, from, today)).toEqual([]);
    expect(renewalEmails(cert({ expiresOn: today }), [old], jobs, from, today)).toEqual([]);
    expect(renewalEmails(cert(), [cert()], jobs, from, today)).toEqual([]);
  });

  it("produces a mailto link that cannot add a second recipient", () => {
    const j = jobs.map((x) =>
      x.id === "p4" ? { ...x, gcPmEmail: "lee@sierra.example?bcc=x@y.com" } : x,
    );
    const e = renewalEmails(cert(), [cert(), old], j, from, today)[1];
    expect(e && mailtoHref(e)).toMatch(/^mailto:lee@sierra\.com%3Fbcc%3Dx@y\.com\?subject=/);
  });
});

describe("holdersAfterSend", () => {
  it("keeps the certificate's holders and dates the sent jobs today", () => {
    expect(
      holdersAfterSend(
        [
          { projectId: "p1", sentOn: "2026-01-02" },
          { projectId: "p4", sentOn: null },
        ],
        ["p4", "p3"],
        today,
      ),
    ).toEqual([
      { projectId: "p1", sentOn: "2026-01-02" },
      { projectId: "p4", sentOn: today },
      { projectId: "p3", sentOn: today },
    ]);
  });
});
