// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendTranscript, audioFileName, DictationButton, PRIVACY_NOTE } from "./dictation-button";
import { describeMediaError, formatDuration } from "./use-recorder";

type DataHandler = (e: { data: Blob }) => void;

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: DataHandler | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: unknown,
    opts?: { mimeType?: string },
  ) {
    this.mimeType = opts?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["fake-opus-bytes"], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

const trackStop = vi.fn();
const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] }));
const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ text: "We trained 42 apprentices in 2025." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
);

function installMedia() {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(window, "MediaRecorder", {
    value: FakeMediaRecorder,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  trackStop.mockClear();
  getUserMedia.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "MediaRecorder");
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("DictationButton", () => {
  it("renders nothing when MediaRecorder is unavailable", () => {
    Reflect.deleteProperty(window, "MediaRecorder");
    const { container } = renderWithQuery(<DictationButton orgId="org_1" onTranscript={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("records, uploads multipart audio to /transcribe and returns the transcript", async () => {
    installMedia();
    const onTranscript = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<DictationButton orgId="org_1" onTranscript={onTranscript} />);

    expect(screen.getByText(PRIVACY_NOTE)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start dictation" }));

    const stop = await screen.findByRole("button", { name: "Stop recording" });
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe("audio/webm;codecs=opus");

    await user.click(stop);

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith("We trained 42 apprentices in 2025.", {
        audioKey: null,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/orgs/org_1/transcribe");
    expect(init?.method).toBe("POST");
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    const audio = (body as FormData).get("audio");
    expect(audio).toBeInstanceOf(Blob);
    expect((audio as File).name).toBe("dictation.webm");
    expect(trackStop).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Start dictation" })).toBeEnabled();
  });

  it("explains a blocked microphone permission", async () => {
    installMedia();
    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    const user = userEvent.setup();
    renderWithQuery(<DictationButton orgId="org_1" onTranscript={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Start dictation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Microphone access was blocked/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discarding a recording uploads nothing", async () => {
    installMedia();
    const onTranscript = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<DictationButton orgId="org_1" onTranscript={onTranscript} />);

    await user.click(screen.getByRole("button", { name: "Start dictation" }));
    await user.click(await screen.findByRole("button", { name: "Discard recording" }));
    await screen.findByRole("button", { name: "Start dictation" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("auto-stops at the maximum duration and still transcribes", async () => {
    installMedia();
    const onTranscript = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <DictationButton orgId="org_1" onTranscript={onTranscript} maxDurationMs={300} />,
    );

    await user.click(screen.getByRole("button", { name: "Start dictation" }));
    await waitFor(() => expect(onTranscript).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(FakeMediaRecorder.instances[0]?.state).toBe("inactive");
  });

  it("shows transcription errors with a retry", async () => {
    installMedia();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "bad_audio", message: "Audio too short" } }), {
        status: 400,
      }),
    );
    const onTranscript = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(<DictationButton orgId="org_1" onTranscript={onTranscript} />);

    await user.click(screen.getByRole("button", { name: "Start dictation" }));
    await user.click(await screen.findByRole("button", { name: "Stop recording" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Audio too short");

    await user.click(screen.getByRole("button", { name: /Retry transcription/ }));
    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith("We trained 42 apprentices in 2025.", {
        audioKey: null,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("voice helpers", () => {
  it("appends dictated text with sensible spacing", () => {
    expect(appendTranscript("", " Hello ")).toBe("Hello");
    expect(appendTranscript("We serve", "300 families.")).toBe("We serve 300 families.");
    expect(appendTranscript("Line one\n", "Line two")).toBe("Line one\nLine two");
    expect(appendTranscript("Keep", "   ")).toBe("Keep");
  });

  it("formats durations and file names", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75_000)).toBe("1:15");
    expect(formatDuration(300_000)).toBe("5:00");
    expect(audioFileName("audio/webm;codecs=opus")).toBe("dictation.webm");
    expect(audioFileName("audio/mp4")).toBe("dictation.m4a");
    expect(audioFileName("")).toBe("dictation.webm");
  });

  it("maps media errors to clear messages", () => {
    expect(describeMediaError({ name: "NotFoundError" })).toMatch(/No microphone/);
    expect(describeMediaError({ name: "NotReadableError" })).toMatch(/busy/);
    expect(describeMediaError(new Error("x"))).toMatch(/Couldn't start recording/);
  });
});
