// "Read the stamp" in a submittal's edit form (src/shared/submittal-stamp.ts, docs/SUBMITTALS.md):
// reads the reviewer's action and date from the stamped copy, in the browser, and offers to fill the
// form's "Returned" and "GC's action" with them. Nothing is saved until the user presses Save, and
// the words each value came from are shown so the user can check them against the file.

import { readStamp, type StampReading } from "@shared/submittal-stamp";
import { SUBMITTAL_ACTION_LABELS, type SubmittalAction } from "@shared/submittals";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "../lib/api";

interface FileRow {
  id: string;
  fileName: string;
  contentType: string;
  category: string;
}

/** The stamped copy first ("signed": the returned copy), then other PDFs, newest first as listed. */
export function stampCandidates(items: readonly FileRow[]): FileRow[] {
  const pdfs = items.filter((f) => f.contentType === "application/pdf");
  return [
    ...pdfs.filter((f) => f.category === "signed"),
    ...pdfs.filter((f) => f.category !== "signed"),
  ];
}

export function StampReader(props: {
  /** The submittal's API path (`.../submittals/{id}`). */
  base: string;
  today: string;
  submittedOn: string | null;
  onUse: (v: { action: SubmittalAction | null; returnedOn: string | null }) => void;
}) {
  const files = useQuery({
    queryKey: ["attachments", props.base],
    queryFn: () => api<{ items: FileRow[] }>(`${props.base}/attachments`),
  });
  const [reading, setReading] = useState<{ name: string; r: StampReading } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const candidates = stampCandidates(files.data?.items ?? []);

  const read = async (name: string, bytes: () => Promise<ArrayBuffer>) => {
    setBusy(true);
    setError("");
    setReading(null);
    try {
      const r = await readStamp(new Uint8Array(await bytes()), {
        today: props.today,
        submittedOn: props.submittedOn,
      });
      setReading({ name, r });
    } catch (e) {
      setError(`${name} could not be read: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const fromAttachment = (f: FileRow) =>
    read(f.fileName, async () => {
      const res = await fetch(`${props.base}/attachments/${encodeURIComponent(f.id)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`the download failed (${res.status})`);
      return res.arrayBuffer();
    });

  const r = reading?.r;
  return (
    <div className="rounded border border-slate-200 bg-white p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Read the stamp:</span>
        {candidates.slice(0, 3).map((f) => (
          <button
            key={f.id}
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => fromAttachment(f)}
          >
            {f.fileName}
          </button>
        ))}
        <button
          type="button"
          className="underline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {candidates.length ? "another PDF" : "choose the returned PDF"}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          aria-label="Returned PDF to read the stamp from"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void read(f.name, () => f.arrayBuffer());
          }}
        />
        {busy && <span className="text-slate-500">Reading…</span>}
      </div>
      {error && <p className="mt-1 text-red-700">{error}</p>}
      {reading && r && (
        <div className="mt-2 space-y-1" aria-live="polite">
          <p>
            {reading.name}:{" "}
            {r.action ? (
              <strong>{SUBMITTAL_ACTION_LABELS[r.action]}</strong>
            ) : (
              "no action filled in"
            )}
            {r.returnedOn && (
              <>
                , returned <strong>{r.returnedOn}</strong>
              </>
            )}
            .
          </p>
          {r.hits.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-slate-600">
              {r.hits.slice(0, 8).map((h) => (
                <li key={`${h.page}-${h.from}-${h.phrase}-${h.mark}`}>
                  “{h.phrase}” on page {h.page}
                  {h.from === "stamp" ? " (stamp)" : ""}
                  {h.mark === "marked" ? ", ticked" : h.mark === "empty" ? ", box empty" : ""}
                </li>
              ))}
              {r.dateSource && (
                <li>
                  Date from {r.dateSource.placed ? r.dateSource.text : `“${r.dateSource.text}”`} on
                  page {r.dateSource.page}
                </li>
              )}
            </ul>
          )}
          {r.problem && <p className="text-amber-800">{r.problem}</p>}
          {(r.action || r.returnedOn) && (
            <button
              type="button"
              className="btn"
              onClick={() => props.onUse({ action: r.action, returnedOn: r.returnedOn })}
            >
              Fill in{" "}
              {[r.action && "the action", r.returnedOn && "the date"].filter(Boolean).join(" and ")}
            </button>
          )}
          <p className="text-xs text-slate-500">
            Check it against the stamp before you save: PayApps reads the stamp's words, not its
            handwriting or drawn ticks.
          </p>
        </div>
      )}
    </div>
  );
}
