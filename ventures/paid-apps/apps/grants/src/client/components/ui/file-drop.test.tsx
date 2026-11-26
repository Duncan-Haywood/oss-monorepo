// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDrop, fileMatchesAccept, formatBytes, validateFiles } from "./file-drop";

afterEach(cleanup);

const file = (name: string, size: number, type = "application/pdf") =>
  new File([new Uint8Array(size)], name, { type });

describe("validateFiles", () => {
  it("rejects files over maxSize and wrong types", () => {
    const { accepted, rejected } = validateFiles(
      [file("ok.pdf", 10), file("big.pdf", 2048), file("x.exe", 5, "application/x-msdownload")],
      { accept: ".pdf,.docx", maxSize: 1024 },
    );
    expect(accepted.map((f) => f.name)).toEqual(["ok.pdf"]);
    expect(rejected.map((r) => [r.file.name, r.reason])).toEqual([
      ["big.pdf", "too_large"],
      ["x.exe", "wrong_type"],
    ]);
  });

  it("matches accept tokens like <input accept>", () => {
    expect(fileMatchesAccept(file("a.PDF", 1), ".pdf")).toBe(true);
    expect(fileMatchesAccept(file("a.png", 1, "image/png"), "image/*")).toBe(true);
    expect(fileMatchesAccept(file("a.png", 1, "image/png"), "application/pdf")).toBe(false);
    expect(fileMatchesAccept(file("a.png", 1, "image/png"), undefined)).toBe(true);
  });

  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });
});

describe("<FileDrop>", () => {
  it("rejects a too-large file chosen via the picker and reports why", async () => {
    const user = userEvent.setup();
    const onFiles = vi.fn();
    const onReject = vi.fn();
    render(
      <FileDrop
        label="Upload a document"
        accept=".pdf"
        maxSize={1024}
        onFiles={onFiles}
        onReject={onReject}
      />,
    );
    const input = screen.getByLabelText(/Upload a document/) as HTMLInputElement;
    await user.upload(input, file("annual-report.pdf", 4096));

    expect(onFiles).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith([expect.objectContaining({ reason: "too_large" })]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "annual-report.pdf is 4 KB — the limit is 1 KB",
    );
    expect(screen.getByText(/Up to 1 KB/)).toBeInTheDocument();
  });

  it("accepts a valid dropped file and filters out the oversized one", () => {
    const onFiles = vi.fn();
    render(<FileDrop label="Drop here" maxSize={1024} multiple onFiles={onFiles} />);
    const zone = screen.getByText("Drop here").closest("label") as HTMLElement;
    const small = file("small.pdf", 100);
    const big = file("big.pdf", 5000);
    fireEvent.drop(zone, { dataTransfer: { files: [small, big], dropEffect: "copy" } });
    expect(onFiles).toHaveBeenCalledWith([small]);
    expect(screen.getByRole("alert")).toHaveTextContent("big.pdf");
  });

  it("ignores drops while disabled", () => {
    const onFiles = vi.fn();
    render(<FileDrop label="Drop here" disabled onFiles={onFiles} />);
    const zone = screen.getByText("Drop here").closest("label") as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [file("a.pdf", 1)] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
