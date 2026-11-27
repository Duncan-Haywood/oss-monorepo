// Upload one evidence file not tied to a requirement (POST /evidence with no controlId) and hand
// the stored file back, so a form elsewhere (a provider's service description or CRM) can link it
// without a trip to a requirement's page. The same no-CUI attestation the server requires.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Evidence } from "../lib/types";
import { btnGhostCls, ErrorText, inputCls } from "../ui";

/** The server's allowed types, by extension, for files the browser labels oddly. */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/**
 * The type to send: the browser's own when the server takes it, else the one the extension names.
 * Windows labels a .csv "application/vnd.ms-excel" and some systems leave a .xlsx untyped; the
 * server would refuse both with "Upload a PDF, image, text, CSV, DOCX or XLSX file".
 */
export function uploadType(name: string, browserType: string): string {
  const own = browserType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (Object.values(BY_EXTENSION).includes(own)) return own;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return BY_EXTENSION[ext] ?? own;
}

export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx";

export function EvidenceUpload({
  orgId,
  label,
  defaultTitle,
  presetFile,
  onUploaded,
}: {
  orgId: string;
  /** What the file is, for the input's accessible name ("Service description"). */
  label: string;
  defaultTitle: string;
  /** A file already chosen elsewhere on the page (the matrix read by "Fill from the matrix"). */
  presetFile?: File | null;
  onUploaded: (ev: Evidence) => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(presetFile ?? null);
  const [title, setTitle] = useState("");
  const [noCui, setNoCui] = useState(false);
  const [done, setDone] = useState<Evidence | null>(null);
  useEffect(() => {
    if (presetFile) {
      setFile(presetFile);
      setDone(null);
    }
  }, [presetFile]);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first");
      const fd = new FormData();
      const type = uploadType(file.name, file.type);
      fd.set("file", type === file.type ? file : new File([file], file.name, { type }));
      fd.set("title", (title.trim() || defaultTitle.trim() || file.name).slice(0, 200));
      fd.set("noCui", String(noCui));
      return api<Evidence>(`/api/orgs/${orgId}/evidence`, { method: "POST", body: fd });
    },
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ["evidence", orgId] });
      setDone(ev);
      setFile(null);
      setNoCui(false);
      setTitle("");
      onUploaded(ev);
    },
  });
  // Inside another <form> (the provider's), so no nested form: a plain group and a button.
  return (
    <div className="mt-1 space-y-1 rounded border border-stone-200 bg-stone-50 p-2 text-xs">
      {file && presetFile === file ? (
        <p>
          The matrix you read above: <strong>{file.name}</strong>{" "}
          <button type="button" className="underline" onClick={() => setFile(null)}>
            Choose another file
          </button>
        </p>
      ) : (
        <input
          type="file"
          className="block w-full text-xs"
          accept={EVIDENCE_ACCEPT}
          aria-label={`${label}: file to upload`}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setDone(null);
          }}
        />
      )}
      <input
        className={inputCls}
        value={title}
        placeholder={defaultTitle}
        onChange={(e) => setTitle(e.target.value)}
        aria-label={`${label}: title of the uploaded file`}
      />
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={noCui}
          onChange={(e) => setNoCui(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          This file contains no Controlled Unclassified Information (CUI). A provider's service
          description or responsibility matrix usually does not.
        </span>
      </label>
      <ErrorText error={upload.error} />
      <button
        type="button"
        className={btnGhostCls}
        disabled={!file || !noCui || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? "Uploading…" : "Upload and use this file"}
      </button>
      {done && (
        <p role="status" className="text-stone-700">
          Uploaded {done.fileName} (sha256 {done.sha256.slice(0, 12)}) and picked above. Save the
          provider to keep the link.
        </p>
      )}
    </div>
  );
}
