// The GC's contacts on a job. The billing contact handles pay applications (accounts payable or the
// project accountant): the follow-up drafts on the cash page are addressed to them
// (src/shared/follow-up-email.ts). The project manager gets change order requests: the request PDF
// is marked for them and the change order email drafts go to them (src/shared/change-order-email.ts).
// Nothing is ever sent from PayApps.
import type { ProjectDetailDto } from "@shared/api/types";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const KINDS = {
  billing: {
    label: "GC billing contact",
    nameKey: "gcBillingName",
    emailKey: "gcBillingEmail",
    namePlaceholder: "e.g. Accounts Payable",
    emailPlaceholder: "ap@builder.com",
    hint: "Who at the GC processes your pay applications. The follow-up emails on the Cash and retainage page are addressed to them; PayApps never sends them itself. Blank clears it.",
  },
  pm: {
    label: "GC project manager",
    nameKey: "gcPmName",
    emailKey: "gcPmEmail",
    namePlaceholder: "e.g. Dana Ruiz",
    emailPlaceholder: "pm@builder.com",
    hint: "Who at the GC approves change orders on this job. Change order request PDFs are marked for them and the change order email drafts are addressed to them; PayApps never sends them itself. Blank clears it.",
  },
} as const;

export function GcBillingContact(props: Omit<Parameters<typeof GcContact>[0], "kind">) {
  return <GcContact kind="billing" {...props} />;
}

export function GcContact({
  kind,
  path,
  name,
  email,
  canEdit = true,
  onSaved,
}: {
  kind: keyof typeof KINDS;
  /** The project's API path. */
  path: string;
  name: string | null;
  email: string | null;
  /** Show the change button (the API still refuses a viewer). */
  canEdit?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const k = KINDS[kind];
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState(name ?? "");
  const [e, setE] = useState(email ?? "");
  const save = useMutation({
    mutationFn: () =>
      api<ProjectDetailDto>(path, {
        method: "PATCH",
        body: { [k.nameKey]: n.trim() || null, [k.emailKey]: e.trim() || null },
      }),
    onSuccess: async () => {
      setEditing(false);
      await onSaved();
    },
  });
  const set = Boolean(name || email);
  if (!editing) {
    return (
      <span>
        {k.label}: {set ? [name, email ? `<${email}>` : null].filter(Boolean).join(" ") : "not set"}{" "}
        {canEdit && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              setN(name ?? "");
              setE(email ?? "");
              setEditing(true);
            }}
          >
            {set ? "change" : "add"}
          </button>
        )}
      </span>
    );
  }
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        save.mutate();
      }}
    >
      <label className="text-sm" htmlFor={`gc-${kind}-name`}>
        Name
      </label>
      <input
        id={`gc-${kind}-name`}
        className="input w-48"
        placeholder={k.namePlaceholder}
        maxLength={200}
        value={n}
        onChange={(ev) => setN(ev.target.value)}
      />
      <label className="text-sm" htmlFor={`gc-${kind}-email`}>
        Email
      </label>
      <input
        id={`gc-${kind}-email`}
        className="input w-64"
        type="email"
        placeholder={k.emailPlaceholder}
        maxLength={254}
        value={e}
        onChange={(ev) => setE(ev.target.value)}
      />
      <button className="btn" type="submit" disabled={save.isPending}>
        Save
      </button>
      <button type="button" className="underline text-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <span className="w-full text-xs text-slate-500">{k.hint}</span>
      <ErrorText error={save.error} />
    </form>
  );
}
