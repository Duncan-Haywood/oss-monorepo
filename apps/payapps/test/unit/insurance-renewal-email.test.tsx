// @vitest-environment happy-dom
// "Email GCs" on an insurance certificate: one draft a GC, copy or open, then record it as sent.
import type { InsuranceCertificateDto, ProjectDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RenewalEmailsPanel } from "../../src/client/components/insurance-renewal-email";
import { canEmail } from "../../src/client/pages/insurance";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cert = (over: Partial<InsuranceCertificateDto> = {}): InsuranceCertificateDto => ({
  id: "new",
  kind: "general_liability",
  label: null,
  carrier: "Acme Mutual",
  policyNumber: "GL-2",
  effectiveOn: "2026-12-01",
  expiresOn: "2027-12-01",
  notes: null,
  archived: false,
  name: "General liability (Acme Mutual)",
  status: "current",
  daysLeft: 370,
  updatedAt: "2026-11-01T00:00:00.000Z",
  files: [],
  holders: [],
  eachOccurrenceCents: null,
  aggregateCents: null,
  additionalInsured: false,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
  ...over,
});

const old = cert({
  id: "old",
  policyNumber: "GL-1",
  effectiveOn: "2025-12-01",
  expiresOn: "2026-12-01",
  archived: true,
  holders: [
    { projectId: "p1", projectName: "School", gcName: "Peak GC", sentOn: "2025-12-02" },
    { projectId: "p2", projectName: "Clinic TI", gcName: "Sierra Builders", sentOn: null },
  ],
});

const project = (id: string, name: string, gcName: string, pmEmail: string | null) =>
  ({ id, name, number: null, gcName, gcPmName: null, gcPmEmail: pmEmail }) as unknown as ProjectDto;

function mountPanel(c: InsuranceCertificateDto, all: InsuranceCertificateDto[], canEdit = true) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/holders")) return Response.json({ holders: [] });
      return Response.json({
        items: [
          project("p1", "School", "Peak GC", "pm@peakgc.example"),
          project("p2", "Clinic TI", "Sierra Builders", null),
        ],
      });
    }),
  );
  const saved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RenewalEmailsPanel
        orgId="org_1"
        cert={c}
        all={all}
        from={{ name: "Sam", company: "Ortiz Electric" }}
        today="2026-11-26"
        canEdit={canEdit}
        onSaved={saved}
      />
    </QueryClientProvider>,
  );
  return { calls, saved };
}

it("drafts one email a GC of the renewed certificate, addressed from the job's PM", async () => {
  const c = cert();
  mountPanel(c, [c, old]);
  const drafts = await screen.findAllByTestId("renewal-email");
  expect(drafts.map((d) => d.querySelector("h3")?.textContent)).toEqual([
    "Peak GC",
    "Sierra Builders",
  ]);
  const to = screen.getAllByLabelText("To") as HTMLInputElement[];
  expect(to.map((i) => i.value)).toEqual(["pm@peakgc.example", ""]);
  const body = (screen.getAllByLabelText("Message")[0] as HTMLTextAreaElement).value;
  expect(body).toContain("Our General liability (Acme Mutual) policy has renewed.");
  expect(body).toContain("Policy number: GL-2");
  const link = screen.getAllByRole("link", { name: "Open in my email" })[0] as HTMLAnchorElement;
  expect(link.getAttribute("href")).toMatch(
    /^mailto:pm@peakgc\.com\?subject=Renewed%20certificate/,
  );
});

it("records the GC's jobs as sent today on this certificate after the draft is used", async () => {
  const c = cert();
  const { calls, saved } = mountPanel(c, [c, old]);
  const link = (await screen.findAllByRole("link", { name: "Open in my email" }))[1] as HTMLElement;
  link.addEventListener("click", (e) => e.preventDefault());
  fireEvent.click(link);
  fireEvent.click(screen.getByRole("button", { name: "Record as sent today" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const put = calls.find((x) => x.url.endsWith("/holders"));
  expect(put?.url).toBe("/api/orgs/org_1/insurance/new/holders");
  expect(put?.init?.method).toBe("PUT");
  expect(JSON.parse(String(put?.init?.body))).toEqual({
    holders: [{ projectId: "p2", sentOn: "2026-11-26" }],
  });
});

it("does not offer recording to a viewer", async () => {
  const c = cert();
  mountPanel(c, [c, old], false);
  const link = (await screen.findAllByRole("link", { name: "Open in my email" }))[0] as HTMLElement;
  link.addEventListener("click", (e) => e.preventDefault());
  fireEvent.click(link);
  expect(screen.queryByRole("button", { name: "Record as sent today" })).toBeNull();
});

it("offers Email GCs only on an unexpired active certificate someone holds or that renews one", () => {
  const c = cert();
  expect(canEmail(c, [c, old])).toBe(true);
  expect(canEmail(c, [c])).toBe(false);
  expect(canEmail(cert({ holders: old.holders }), [])).toBe(true);
  expect(canEmail(cert({ status: "expired", holders: old.holders }), [])).toBe(false);
  expect(canEmail(old, [old])).toBe(false);
});
