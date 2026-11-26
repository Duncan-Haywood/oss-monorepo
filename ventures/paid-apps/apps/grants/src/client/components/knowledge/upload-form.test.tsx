// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildUploadFormData, emptyUploadMeta, UploadForm, validateUpload } from "./upload-form";

afterEach(cleanup);

const file = (name = "annual-report.pdf", size = 1000) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("validateUpload", () => {
  it("requires files, kind and consent", () => {
    expect(validateUpload([], emptyUploadMeta)).toEqual({
      files: expect.any(String),
      kind: expect.any(String),
      consent: expect.any(String),
    });
    expect(
      validateUpload([file()], { ...emptyUploadMeta, kind: "annual_report", consent: true }),
    ).toEqual({});
  });

  it("requires an outcome and checks amount/year for past applications", () => {
    const errs = validateUpload(
      [file()],
      {
        ...emptyUploadMeta,
        kind: "past_application",
        consent: true,
        pastAmount: "abc",
        pastYear: "24",
      },
      new Date("2026-11-19"),
    );
    expect(Object.keys(errs).sort()).toEqual(["pastAmount", "pastOutcome", "pastYear"]);
  });
});

describe("buildUploadFormData", () => {
  it("sends past-application fields with the amount in cents and consent=true", () => {
    const fd = buildUploadFormData(
      file(),
      {
        ...emptyUploadMeta,
        kind: "past_application",
        title: "  DOL 2024 proposal ",
        pastOutcome: "awarded",
        pastFunder: "U.S. Department of Labor",
        pastAmount: "$25,000.50",
        pastYear: "2024",
        consent: true,
      },
      true,
    );
    expect(fd.get("kind")).toBe("past_application");
    expect(fd.get("title")).toBe("DOL 2024 proposal");
    expect(fd.get("pastOutcome")).toBe("awarded");
    expect(fd.get("pastFunder")).toBe("U.S. Department of Labor");
    expect(fd.get("pastAmountCents")).toBe("2500050");
    expect(fd.get("pastYear")).toBe("2024");
    expect(fd.get("consent")).toBe("true");
    expect(fd.get("file")).toBeInstanceOf(File);
  });

  it("omits past-application fields for other kinds", () => {
    const fd = buildUploadFormData(
      file(),
      {
        ...emptyUploadMeta,
        kind: "budget",
        pastOutcome: "awarded",
        pastAmount: "100",
        consent: true,
      },
      false,
    );
    expect(fd.get("pastOutcome")).toBeNull();
    expect(fd.get("pastAmountCents")).toBeNull();
    expect(fd.get("title")).toBeNull();
  });
});

describe("UploadForm", () => {
  it("does not upload until consent is given", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({});
    render(<UploadForm onUpload={onUpload} />);
    await user.upload(screen.getByLabelText("Files to upload"), file());
    await user.selectOptions(screen.getByLabelText(/What kind of document/), "annual_report");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/confirm consent/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /data use policy/i })).toHaveAttribute(
      "href",
      "/legal/data-use",
    );

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/1 document uploaded/)).toBeInTheDocument();
  });

  it("shows past-application fields only for past applications and requires an outcome", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({});
    render(<UploadForm onUpload={onUpload} />);
    expect(screen.queryByLabelText("Outcome")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/What kind of document/), "past_application");
    expect(screen.getByLabelText("Outcome")).toBeInTheDocument();
    expect(screen.getByLabelText("Funder")).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount requested/)).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Files to upload"), file("dol-2024.pdf"));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/how this application turned out/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Outcome"), "declined");
    await user.type(screen.getByLabelText("Funder"), "Kellogg Foundation");
    await user.type(screen.getByLabelText(/Amount requested/), "75,000");
    await user.type(screen.getByLabelText("Year"), "2023");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const fd = onUpload.mock.calls[0]?.[0] as FormData;
    expect(fd.get("pastOutcome")).toBe("declined");
    expect(fd.get("pastFunder")).toBe("Kellogg Foundation");
    expect(fd.get("pastAmountCents")).toBe("7500000");
    expect(fd.get("pastYear")).toBe("2023");

    await user.selectOptions(screen.getByLabelText(/What kind of document/), "budget");
    expect(screen.queryByLabelText("Outcome")).not.toBeInTheDocument();
  });

  it("uploads multiple files one request each and keeps failures for retry", async () => {
    const user = userEvent.setup();
    const onUpload = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Unsupported file type"));
    render(<UploadForm onUpload={onUpload} />);
    await user.upload(screen.getByLabelText("Files to upload"), [file("a.pdf"), file("b.docx")]);
    expect(screen.queryByLabelText(/Title/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/What kind of document/), "other");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload 2 files" }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/1 uploaded, 1 failed/)).toBeInTheDocument();
    expect(screen.getByText("Unsupported file type")).toBeInTheDocument();
    expect(screen.getByText("b.docx")).toBeInTheDocument();
    expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
  });
});
