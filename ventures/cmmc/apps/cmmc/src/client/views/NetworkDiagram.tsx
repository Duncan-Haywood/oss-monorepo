// The network diagram of the assessment scope, on the Assets tab. Table 3 to 32 CFR 170.19(c)(1)
// asks for every in-scope asset to be documented in it; this card links one of the org's evidence
// files (picked from those already uploaded, or uploaded here) and the SSP names it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { Evidence } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

export interface DiagramFile {
  id: string;
  title: string;
  fileName: string;
  sha256: string;
  createdAt: string;
}

export function NetworkDiagramCard({
  orgId,
  diagram,
  quote,
  canLink,
  canUnlink,
}: {
  orgId: string;
  diagram: DiagramFile | null;
  quote: string;
  /** Editors on a Level 2 plan. */
  canLink: boolean;
  /** Any editor: unlinking is allowed on every plan. */
  canUnlink: boolean;
}) {
  const qc = useQueryClient();
  const files = useQuery({
    queryKey: ["evidence", orgId],
    queryFn: () => api<{ items: Evidence[] }>(`/api/orgs/${orgId}/evidence`),
    enabled: canLink,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assets", orgId] });
    qc.invalidateQueries({ queryKey: ["evidence", orgId] });
    qc.invalidateQueries({ queryKey: ["ssp"] });
  };
  const link = useMutation({
    mutationFn: (evidenceId: string | null) =>
      api(`/api/orgs/${orgId}/assets/network-diagram`, { method: "PUT", json: { evidenceId } }),
    onSuccess: refresh,
  });
  const [picked, setPicked] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("Network diagram");
  const [noCui, setNoCui] = useState(false);
  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      fd.set("title", title);
      fd.set("noCui", String(noCui));
      const ev = await api<Evidence>(`/api/orgs/${orgId}/evidence`, { method: "POST", body: fd });
      return api(`/api/orgs/${orgId}/assets/network-diagram`, {
        method: "PUT",
        json: { evidenceId: ev.id },
      });
    },
    onSuccess: () => {
      setFile(null);
      setNoCui(false);
      refresh();
    },
  });
  return (
    <Card title="Network diagram">
      <p className="mb-2 text-sm text-stone-700">
        For CUI, Security Protection, Contractor Risk Managed and Specialized Assets the rule says:{" "}
        <q>{quote}</q> Draw it in any tool (Visio, draw.io, a marked-up photo of a whiteboard) and
        link the file here; the SSP names it under the asset inventory.
      </p>
      {diagram ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <a
            className="underline"
            href={`/api/orgs/${orgId}/evidence/${diagram.id}/download`}
            data-testid="network-diagram-link"
          >
            {diagram.title}
          </a>
          <span className="text-xs text-stone-500">
            {diagram.fileName} · sha256 {diagram.sha256.slice(0, 12)} · uploaded{" "}
            {diagram.createdAt.slice(0, 10)}
          </span>
          {canUnlink && (
            <button
              type="button"
              className="text-xs underline"
              onClick={() => link.mutate(null)}
              disabled={link.isPending}
            >
              Unlink
            </button>
          )}
        </div>
      ) : (
        <p className="mb-3 text-sm text-amber-900">No network diagram is linked yet.</p>
      )}
      <ErrorText error={link.error} />
      {canLink && (
        <div className="grid gap-4 sm:grid-cols-2">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (picked) link.mutate(picked);
            }}
          >
            <Field label="An uploaded evidence file">
              <select
                className={inputCls}
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
              >
                <option value="">Choose…</option>
                {(files.data?.items ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                    {f.title !== f.fileName ? ` (${f.fileName})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className={btnGhostCls} disabled={!picked || link.isPending}>
              Link this file
            </button>
          </form>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              upload.mutate();
            }}
          >
            <Field label="Or upload the diagram">
              <input
                type="file"
                className="block w-full text-sm"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Field label="Title">
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={noCui}
                onChange={(e) => setNoCui(e.target.checked)}
                className="mt-1"
              />
              <span>
                This file contains no Controlled Unclassified Information (CUI). A diagram of hosts,
                networks and boundaries usually does not; leave out anything marked CUI.
              </span>
            </label>
            <ErrorText error={upload.error} />
            <button type="submit" className={btnCls} disabled={!file || !noCui || upload.isPending}>
              Upload and link
            </button>
          </form>
        </div>
      )}
    </Card>
  );
}
