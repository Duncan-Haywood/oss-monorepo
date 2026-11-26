// @vitest-environment happy-dom
import { POLICY_VERSION } from "@shared/legal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationStep, validateOrganization } from "./organization-step";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function renderStep(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OrganizationStep onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onCreated };
}

describe("OrganizationStep", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) =>
      url === "/api/orgs" ? jsonResponse({ orgId: "org_1" }) : jsonResponse({}),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("blocks submit until the terms are accepted", async () => {
    const user = userEvent.setup();
    const { onCreated } = renderStep();

    await user.type(screen.getByLabelText("Organization name"), "Southwest Indian Foundation");
    // Legal name mirrors the display name until edited.
    expect(screen.getByLabelText("Legal name")).toHaveValue("Southwest Indian Foundation");
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    expect(await screen.findByText(/Please agree to the Terms of Service/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: /I agree to the/ }));
    await user.click(screen.getByRole("button", { name: "Create organization" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("org_1"));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/orgs");
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "Southwest Indian Foundation",
      legalName: "Southwest Indian Foundation",
      orgType: "nonprofit_501c3",
      acceptTerms: true,
      policyVersion: POLICY_VERSION,
    });
  });

  it("links to the legal documents and explains data use in plain words", () => {
    renderStep();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
    expect(screen.getByRole("link", { name: "Data Use Policy" })).toHaveAttribute(
      "href",
      "/legal/data-use",
    );
    expect(screen.getByText(/never used to train AI/)).toBeInTheDocument();
  });

  it("sends focus and service areas with the new organization", async () => {
    const user = userEvent.setup();
    const { onCreated } = renderStep();
    await user.type(screen.getByLabelText("Organization name"), "SWIF");
    await user.type(screen.getByLabelText("What do you work on?"), "Workforce development{Enter}");
    await user.type(screen.getByLabelText("Where do you serve?"), "Gallup, NM{Enter}");
    await user.click(screen.getByRole("checkbox", { name: /I agree to the/ }));
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("org_1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      focusAreas: ["Workforce development"],
      serviceAreas: ["Gallup, NM"],
    });
  });
});

describe("validateOrganization", () => {
  const base = {
    name: "A",
    legalName: "A Inc",
    orgType: "nonprofit_501c3" as const,
    city: "",
    state: "",
    websiteUrl: "",
    focusAreas: [],
    serviceAreas: [],
    acceptTerms: true,
  };
  it("requires acceptance, names and a 2-letter state", () => {
    expect(validateOrganization(base)).toEqual({});
    expect(validateOrganization({ ...base, acceptTerms: false })).toHaveProperty("acceptTerms");
    expect(validateOrganization({ ...base, legalName: " " })).toHaveProperty("legalName");
    expect(validateOrganization({ ...base, state: "New Mexico" })).toHaveProperty("state");
  });
});
