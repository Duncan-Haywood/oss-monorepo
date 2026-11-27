// The job's "notary block" setting: some GCs and owners (and public jobs in some states) require the
// pay application to be signed before a notary. With it on, the application summary PDF prints a
// jurat with blanks and a seal box under the signatures (services/export/application-pdf.ts).
import type { ProjectDetailDto } from "@shared/api/types";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ErrorText } from "./error";

export function NotaryBlockSwitch({
  path,
  on,
  onSaved,
}: {
  /** The project's API path. */
  path: string;
  on: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const save = useMutation({
    mutationFn: (notaryBlock: boolean) =>
      api<ProjectDetailDto>(path, { method: "PATCH", body: { notaryBlock } }),
    onSuccess: async () => {
      await onSaved();
    },
  });
  return (
    <div>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        Notary block on the application PDF
      </label>{" "}
      <span className="text-xs text-slate-500">
        {on
          ? "The summary page prints a notary's jurat and seal box under your signature: sign it in front of the notary."
          : "Turn on when the GC or owner wants the application notarized."}
      </span>
      <ErrorText error={save.error} />
    </div>
  );
}
