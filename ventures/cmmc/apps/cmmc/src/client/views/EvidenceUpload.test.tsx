// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Evidence } from "../lib/types";
import { uploadType } from "./EvidenceUpload";
import { DocumentField } from "./Providers";

const stored: Evidence = {
  id: "evd_new",
  controlId: null,
  title: "Acme IT customer responsibility matrix",
  fileName: "crm.csv",
  contentType: "text/csv",
  sizeBytes: 20,
  sha256: "abcdef0123456789",
  createdAt: "2026-11-26T00:00:00.000Z",
};

function setup(presetFile: File | null = null) {
  const sent: FormData[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/evidence");
      expect(init.method).toBe("POST");
      sent.push(init.body as FormData);
      return new Response(JSON.stringify(stored), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const onEvidence = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocumentField
        orgId="org_1"
        label="Customer responsibility matrix"
        uploadTitle="Acme IT customer responsibility matrix"
        presetFile={presetFile}
        files={[]}
        evidenceId={null}
        reference=""
        onEvidence={onEvidence}
        onReference={() => {}}
      />
    </QueryClientProvider>,
  );
  return { sent, onEvidence };
}

afterEach(() => vi.unstubAllGlobals());

describe("uploadType", () => {
  it("keeps a type the server takes and fixes the ones browsers mislabel", () => {
    expect(uploadType("sd.pdf", "application/pdf")).toBe("application/pdf");
    expect(uploadType("crm.csv", "application/vnd.ms-excel")).toBe("text/csv");
    expect(uploadType("CRM.XLSX", "")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(uploadType("notes.txt", "text/plain;charset=utf-8")).toBe("text/plain");
    // Unknown stays as the browser said, so the server's refusal names the problem.
    expect(uploadType("diagram.vsdx", "application/vnd.visio")).toBe("application/vnd.visio");
  });
});

describe("DocumentField upload", () => {
  it("uploads with the no-CUI attestation, no requirement, and picks the stored file", async () => {
    const { sent, onEvidence } = setup();
    const button = screen.getByRole("button", { name: "Upload and use this file" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Customer responsibility matrix: file to upload"), {
      target: {
        files: [new File(["3.1.1,Shared\n"], "crm.csv", { type: "application/vnd.ms-excel" })],
      },
    });
    expect(button).toBeDisabled(); // not until the person confirms no CUI
    fireEvent.click(screen.getByRole("checkbox", { name: /contains no Controlled Unclassified/ }));
    fireEvent.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("Uploaded crm.csv");
    expect(onEvidence).toHaveBeenCalledWith("evd_new");
    const fd = sent[0];
    if (!fd) throw new Error("nothing was uploaded");
    expect(fd.get("noCui")).toBe("true");
    expect(fd.get("controlId")).toBeNull();
    expect(fd.get("title")).toBe("Acme IT customer responsibility matrix");
    expect((fd.get("file") as File).type).toBe("text/csv");
  });

  it("offers the matrix read by Fill from the matrix without choosing it again", async () => {
    const matrix = new File(["3.1.1,Shared\n"], "gcc-high-crm.csv", { type: "text/csv" });
    const { sent, onEvidence } = setup(matrix);
    expect(screen.getByText("Keep the matrix you read as this file")).toBeVisible();
    expect(screen.getByText("gcc-high-crm.csv")).toBeVisible();
    fireEvent.change(
      screen.getByLabelText("Customer responsibility matrix: title of the uploaded file"),
      { target: { value: "GCC High CRM, Nov 2026" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /contains no Controlled Unclassified/ }));
    fireEvent.click(screen.getByRole("button", { name: "Upload and use this file" }));
    await vi.waitFor(() => expect(onEvidence).toHaveBeenCalledWith("evd_new"));
    const fd = sent[0];
    if (!fd) throw new Error("nothing was uploaded");
    expect((fd.get("file") as File).name).toBe("gcc-high-crm.csv");
    expect(fd.get("title")).toBe("GCC High CRM, Nov 2026");
  });
});
