// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportMenu, exportUrl, filenameFromDisposition } from "./export-menu";

afterEach(() => vi.restoreAllMocks());

describe("export helpers", () => {
  it("builds the export URL", () => {
    expect(exportUrl("org_1", "app_1", { format: "docx", citations: false })).toBe(
      "/api/orgs/org_1/applications/app_1/export?format=docx&citations=0",
    );
    expect(
      exportUrl("org_1", "app/1", { format: "txt", citations: true, versionId: "ver_2" }),
    ).toBe("/api/orgs/org_1/applications/app%2F1/export?format=txt&citations=1&versionId=ver_2");
  });

  it("reads the filename from Content-Disposition", () => {
    expect(filenameFromDisposition('attachment; filename="red-mesa-v2.docx"', "x")).toBe(
      "red-mesa-v2.docx",
    );
    expect(filenameFromDisposition(null, "application.docx")).toBe("application.docx");
  });
});

describe("<ExportMenu />", () => {
  it("downloads Word with the citations toggle applied", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["PK"]), {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="a-v1.docx"' },
      }),
    );
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    render(<ExportMenu orgId="org_1" applicationId="app_1" />);

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /include citations/i }));
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(screen.getByRole("menuitemradio", { name: /citations included/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("menuitem", { name: /word document/i }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/orgs/org_1/applications/app_1/export?format=docx&citations=1",
    );
  });

  it("copies the plain text to the clipboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("1. Need\nANSWER", { status: 200 }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    // userEvent installs its own clipboard stub; replace it with a writeText-only one.
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ExportMenu orgId="org_1" applicationId="app_1" />);
    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(screen.getByRole("menuitem", { name: /copy plain text/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("1. Need\nANSWER"));
  });
});
