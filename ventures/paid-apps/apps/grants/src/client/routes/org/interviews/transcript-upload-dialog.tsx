// OWNER: interview UI agent — upload a transcript of an interview a human ran (paste or .txt/.md/.vtt/.srt).
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { Alert, Button, Dialog, Field, FileDrop, Input, Textarea } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, FileText } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { type InterviewDetail, interviewKeys, START_ERRORS } from "./shared";

/** Mirrors routes/org/interviews.ts TRANSCRIPT_EXTENSIONS. */
export const TRANSCRIPT_EXTENSIONS = [".txt", ".md", ".markdown", ".vtt", ".srt"];
const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024;
/** POST /interviews/transcript JSON `text` limit (413 too_large beyond it). */
export const MAX_TRANSCRIPT_CHARS = 500_000;

export function isTranscriptFile(name: string): boolean {
  const lower = name.toLowerCase();
  return TRANSCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** "board-call_2026-03.vtt" -> "board-call 2026-03" */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();
}

/** "Ana, Q , " -> ["Ana", "Q"] (max 10, as the API allows). */
export function parseNames(raw: string): string[] {
  return raw
    .split(",")
    .map((n) => n.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
}

export function TranscriptUploadDialog({
  orgId,
  open,
  onClose,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const id = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [interviewers, setInterviewers] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Focus the title once the dialog's focus trap has run (child effects run first).
  useEffect(() => {
    if (open) document.getElementById(`${id}-title`)?.focus();
  }, [open, id]);

  const upload = useMutation({
    mutationFn: (body: { title: string; text: string; interviewerNames?: string[] }) =>
      api<InterviewDetail>(orgApi(orgId, "/interviews/transcript"), { method: "POST", body }),
    onSuccess: (created) => {
      if (created && "turns" in created)
        qc.setQueryData(interviewKeys.detail(orgId, created.id), created);
      void qc.invalidateQueries({ queryKey: interviewKeys.all(orgId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "facts"] });
      // The transcript is also stored as a document in the knowledge base.
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "documents"] });
    },
  });

  const reset = () => {
    setTitle("");
    setText("");
    setInterviewers("");
    setFileName(null);
    setFileError(null);
    upload.reset();
  };
  const close = () => {
    if (upload.isPending) return;
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!isTranscriptFile(file.name)) {
      setFileError("Choose a .txt, .md, .vtt or .srt file.");
      return;
    }
    if (file.size > MAX_TRANSCRIPT_BYTES) {
      setFileError("That file is larger than 5 MB. Split it or paste the relevant part.");
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      if (!title.trim()) setTitle(titleFromFileName(file.name));
    } catch {
      setFileError("Couldn't read that file. Try pasting the text instead.");
    }
  };

  const tooLong = text.length > MAX_TRANSCRIPT_CHARS;
  const canSubmit =
    title.trim().length > 0 && text.trim().length > 0 && !tooLong && !upload.isPending;
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    const interviewerNames = parseNames(interviewers);
    upload.mutate({
      title: title.trim(),
      text,
      ...(interviewerNames.length ? { interviewerNames } : {}),
    });
  };

  const result = upload.data;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      dismissible={!upload.isPending}
      title="Upload an interview transcript"
      description="For interviews a person ran (a board call, a staff conversation). We'll pull out facts for you to review."
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={upload.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={`${id}-form`}
              disabled={!canSubmit}
              loading={upload.isPending}
            >
              {upload.isPending ? "Extracting facts…" : "Upload and extract facts"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3" role="status">
          <p className="flex items-center gap-2 font-semibold text-success-800">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            Transcript saved
          </p>
          {result.factCount > 0 ? (
            <p>
              We extracted {result.factCount} {result.factCount === 1 ? "fact" : "facts"} from “
              {result.title}”. They're marked <strong>proposed</strong> until you confirm them.
            </p>
          ) : (
            <p>
              We're pulling facts out of “{result.title}” now — they'll appear in your fact base in
              a minute, marked <strong>proposed</strong> until you confirm them.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              to="/orgs/$orgId/knowledge/facts"
              params={{ orgId }}
              search={{ status: "proposed" }}
              className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Review proposed facts
            </Link>
            <Link
              to="/orgs/$orgId/interviews/$interviewId"
              params={{ orgId, interviewId: result.id }}
              onClick={() => {
                reset();
                onClose();
              }}
              className="inline-flex h-9 items-center rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            >
              View transcript
            </Link>
          </div>
        </div>
      ) : (
        <form id={`${id}-form`} className="space-y-4" onSubmit={submit}>
          <Field label="Title" htmlFor={`${id}-title`}>
            <Input
              id={`${id}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Workforce program staff interview, March 2026"
              required
            />
          </Field>
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-700">Transcript file (optional)</p>
            <FileDrop
              id={`${id}-file`}
              accept={TRANSCRIPT_EXTENSIONS.join(",")}
              maxSize={MAX_TRANSCRIPT_BYTES}
              disabled={upload.isPending}
              label="Drop a transcript here or click to browse"
              description=".txt, .md, .vtt or .srt — the text loads below so you can check it first"
              onFiles={(files) => void onFile(files[0])}
              onReject={() => setFileError(null)}
              className="[&_label]:py-6"
            />
            {fileError && (
              <p className="text-sm text-danger-600" role="alert">
                {fileError}
              </p>
            )}
          </div>
          {fileName && (
            <p className="flex items-center gap-1 text-xs text-neutral-500">
              <FileText className="h-3.5 w-3.5" aria-hidden /> Loaded {fileName}
            </p>
          )}
          <Field
            label="Transcript text"
            htmlFor={`${id}-text`}
            hint="Speaker labels (e.g. “Interviewer:” / “Maria:”) help us attribute answers."
          >
            <Textarea
              id={`${id}-text`}
              value={text}
              rows={10}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the transcript here…"
              className="font-mono text-xs"
            />
          </Field>
          <Field
            label="Interviewer name(s) (optional)"
            htmlFor={`${id}-interviewers`}
            hint="Comma-separated speaker labels for the person asking questions, so their words aren't treated as your org's facts."
          >
            <Input
              id={`${id}-interviewers`}
              value={interviewers}
              onChange={(e) => setInterviewers(e.target.value)}
              placeholder="e.g. Interviewer, Q, Sam"
            />
          </Field>
          <Alert tone="info">
            Only facts stated in the transcript are extracted, each with a quote. Nothing is used in
            an application until you confirm it.
          </Alert>
          {tooLong && (
            <Alert tone="warning">
              This transcript is longer than {MAX_TRANSCRIPT_CHARS.toLocaleString()} characters.
              Split it into parts and upload each one.
            </Alert>
          )}
          <ApiErrorAlert
            error={upload.error}
            title="Couldn't upload the transcript"
            messages={START_ERRORS}
          />
        </form>
      )}
    </Dialog>
  );
}
