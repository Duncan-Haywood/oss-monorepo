// OWNER: interview UI agent — record speech, transcribe it server-side, hand the text back.
// Usage: <DictationButton orgId={orgId} onTranscript={(t) => setText((cur) => appendTranscript(cur, t))} />
import { friendlyError } from "@client/components/grants/api-errors";
import { Button } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useMutation } from "@tanstack/react-query";
import { Mic, RotateCcw, Square, X } from "lucide-react";
import { useState } from "react";
import { formatDuration, type RecordingResult, useRecorder } from "./use-recorder";

export const PRIVACY_NOTE =
  "Audio is transcribed and not stored unless your org enables recordings.";

const EXTENSIONS: [string, string][] = [
  ["webm", "webm"],
  ["ogg", "ogg"],
  ["mp4", "m4a"],
  ["mpeg", "mp3"],
  ["wav", "wav"],
];

export function audioFileName(mimeType: string): string {
  const ext = EXTENSIONS.find(([needle]) => mimeType.includes(needle))?.[1] ?? "webm";
  return `dictation.${ext}`;
}

/** `audioKey` is present only when the org keeps voice recordings; pass it to POST /answer. */
export interface TranscribeResponse {
  text: string;
  audioKey?: string | null;
}

/** POST multipart `audio` to /api/orgs/:orgId/transcribe -> { text, audioKey? } */
export function transcribeAudio(orgId: string, blob: Blob, mimeType = blob.type) {
  const form = new FormData();
  const name = audioFileName(mimeType);
  const type = mimeType || blob.type || "audio/webm";
  form.append("audio", typeof File === "function" ? new File([blob], name, { type }) : blob, name);
  return api<TranscribeResponse>(orgApi(orgId, "/transcribe"), { method: "POST", body: form });
}

/** POST /transcribe error codes (413 too_large, 415 unsupported_media_type, 502 transcription_failed). */
const TRANSCRIBE_ERRORS = {
  too_large: "that recording is too long (max 20 MB). Record a shorter answer.",
  unsupported_media_type: "your browser recorded in a format we can't read. Try another browser.",
  transcription_failed: "the speech service didn't respond. Please try again.",
  forbidden: "you need editor access to dictate answers.",
};

export function transcriptionErrorMessage(err: unknown): string {
  const msg = friendlyError(err, TRANSCRIBE_ERRORS);
  return /[.!?]$/.test(msg) ? msg : `${msg}.`;
}

/** Append dictated text to whatever the user already typed, with sensible spacing. */
export function appendTranscript(current: string, addition: string): string {
  const add = addition.trim();
  if (!add) return current;
  if (!current.trim()) return add;
  return /\s$/.test(current) ? `${current}${add}` : `${current} ${add}`;
}

export interface DictationButtonProps {
  orgId: string;
  /** Receives the transcript; append it to an editable field so the user can fix it. */
  onTranscript: (text: string, meta: { audioKey: string | null }) => void;
  disabled?: boolean;
  /** Defaults to 5 minutes. */
  maxDurationMs?: number;
  /** Show the "audio is not stored" note under the button (default true). */
  showPrivacyNote?: boolean;
  label?: string;
  className?: string;
}

/** Renders nothing when the browser can't record audio. */
export function DictationButton({
  orgId,
  onTranscript,
  disabled = false,
  maxDurationMs,
  showPrivacyNote = true,
  label = "Dictate",
  className,
}: DictationButtonProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const transcribe = useMutation({
    mutationFn: (rec: RecordingResult) => transcribeAudio(orgId, rec.blob, rec.mimeType),
    onSuccess: (res) => {
      const text = res?.text?.trim() ?? "";
      if (text) {
        onTranscript(text, { audioKey: res.audioKey ?? null });
        setNotice("Transcript added — review and edit it before sending.");
      } else {
        setNotice(
          "We couldn't make out any words in that recording. Try again a little closer to the mic.",
        );
      }
    },
  });
  const recorder = useRecorder({
    maxDurationMs,
    onComplete: (rec) => transcribe.mutate(rec),
  });

  if (!recorder.supported) return null;

  const busy = transcribe.isPending || recorder.state === "stopping";
  const startRecording = () => {
    setNotice(null);
    transcribe.reset();
    void recorder.start();
  };
  const error =
    recorder.error ??
    (transcribe.isError
      ? `Transcription failed: ${transcriptionErrorMessage(transcribe.error)}`
      : null);

  const status = recorder.isRecording
    ? "Recording. Press stop when you're done."
    : recorder.state === "requesting"
      ? "Waiting for microphone permission…"
      : busy
        ? "Transcribing your recording…"
        : recorder.hitLimit && !error
          ? `Recording stopped at the ${formatDuration(recorder.maxDurationMs)} limit.`
          : (notice ?? "");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {recorder.isRecording ? (
          <>
            <Button variant="danger" size="sm" onClick={recorder.stop} aria-label="Stop recording">
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
              Stop
            </Button>
            <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-neutral-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger-600" aria-hidden />
              <span
                role="timer"
                aria-label={`Recording time ${formatDuration(recorder.elapsedMs)} of ${formatDuration(recorder.maxDurationMs)}`}
              >
                {formatDuration(recorder.elapsedMs)}
              </span>
              <span className="text-neutral-500">/ {formatDuration(recorder.maxDurationMs)}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={recorder.cancel}
              aria-label="Discard recording"
            >
              <X className="h-4 w-4" aria-hidden />
              Discard
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={startRecording}
            disabled={disabled}
            loading={busy || recorder.state === "requesting"}
            aria-label={busy ? "Transcribing" : "Start dictation"}
          >
            {!busy && recorder.state !== "requesting" && <Mic className="h-4 w-4" aria-hidden />}
            {busy ? "Transcribing…" : recorder.state === "requesting" ? "Allow microphone…" : label}
          </Button>
        )}
        {transcribe.isError && transcribe.variables && !recorder.isRecording && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => transcribe.variables && transcribe.mutate(transcribe.variables)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Retry transcription
          </Button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {error ? (
        <p className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      ) : status && !recorder.isRecording ? (
        <p className="text-xs text-neutral-600" aria-hidden>
          {status}
        </p>
      ) : null}
      {showPrivacyNote && <p className="text-xs text-neutral-500">{PRIVACY_NOTE}</p>}
    </div>
  );
}
