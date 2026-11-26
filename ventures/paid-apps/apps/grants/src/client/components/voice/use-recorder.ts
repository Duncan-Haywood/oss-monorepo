// OWNER: interview UI agent — microphone recording via MediaRecorder (reusable by any page).
import { useCallback, useEffect, useRef, useState } from "react";

/** Hard cap on a single dictation (the transcribe endpoint is sized for this). */
export const MAX_RECORDING_MS = 5 * 60_000;

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export type RecorderState = "idle" | "requesting" | "recording" | "stopping";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface UseRecorderOptions {
  /** Auto-stop after this many ms (default 5 minutes). */
  maxDurationMs?: number;
  /** Called with the finished recording (not called when cancelled or empty). */
  onComplete?: (result: RecordingResult) => void;
}

/** True when the browser can record audio (MediaRecorder + getUserMedia, secure context). */
export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

/** Best supported container/codec, or undefined to let the browser pick its default. */
export function pickMimeType(): string | undefined {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : undefined;
  if (!MR || typeof MR.isTypeSupported !== "function") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => {
    try {
      return MR.isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** Human-friendly message for getUserMedia / MediaRecorder failures. */
export function describeMediaError(err: unknown): string {
  const name = typeof err === "object" && err !== null && "name" in err ? String(err.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Microphone access was blocked. Allow microphone access for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "No microphone was found. Connect a microphone and try again.";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "Your microphone is busy or unavailable — another app may be using it.";
    default:
      return "Couldn't start recording. Check your microphone and try again.";
  }
}

/** 75_000 -> "1:15" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Records microphone audio. Call start() from a user gesture; stop() delivers the blob to onComplete. */
export function useRecorder({
  maxDurationMs = MAX_RECORDING_MS,
  onComplete,
}: UseRecorderOptions = {}) {
  const [supported] = useState(isRecordingSupported);
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hitLimit, setHitLimit] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const releaseDevices = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setState("stopping");
    try {
      rec.stop();
    } catch {
      releaseDevices();
      setState("idle");
    }
  }, [releaseDevices]);

  /** Stop and throw the audio away. */
  const cancel = useCallback(() => {
    discardRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (!supported || recorderRef.current) return;
    setError(null);
    setHitLimit(false);
    setElapsedMs(0);
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (mountedRef.current) {
        setError(describeMediaError(err));
        setState("idle");
      }
      return;
    }
    if (!mountedRef.current) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      for (const track of stream.getTracks()) track.stop();
      setError(describeMediaError(err));
      setState("idle");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = rec;
    chunksRef.current = [];
    discardRef.current = false;

    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      discardRef.current = true;
      if (mountedRef.current) setError("Recording failed. Please try again.");
      stop();
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const type = rec.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const discard = discardRef.current;
      releaseDevices();
      if (!mountedRef.current) return;
      setState("idle");
      if (discard) return;
      if (blob.size === 0) {
        setError("No audio was captured. Please try again.");
        return;
      }
      onCompleteRef.current?.({ blob, mimeType: type, durationMs });
    };

    startedAtRef.current = Date.now();
    rec.start(1000);
    setState("recording");
    tickRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsedMs(Math.min(ms, maxDurationMs));
      if (ms >= maxDurationMs) {
        setHitLimit(true);
        stop();
      }
    }, 250);
  }, [supported, maxDurationMs, releaseDevices, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // already stopped
        }
      }
      releaseDevices();
    };
  }, [releaseDevices]);

  const clearError = useCallback(() => setError(null), []);

  return {
    supported,
    state,
    isRecording: state === "recording",
    elapsedMs,
    maxDurationMs,
    remainingMs: Math.max(0, maxDurationMs - elapsedMs),
    error,
    hitLimit,
    start,
    stop,
    cancel,
    clearError,
  };
}

export type Recorder = ReturnType<typeof useRecorder>;
