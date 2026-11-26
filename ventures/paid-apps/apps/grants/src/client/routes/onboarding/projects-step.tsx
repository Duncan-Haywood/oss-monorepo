// Onboarding step 4: quick-add projects the org wants funded (POST /projects).
import { Button, ErrorMessage, Input, Textarea } from "@client/components/ui";
import { api, formatCents, orgApi } from "@client/lib/api";
import { parseDollarsToCents } from "@client/routes/org/settings/form-bits";
import type { ListResponse, ProjectDto } from "@shared/api/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

interface Row {
  key: string;
  title: string;
  summary: string;
  budget: string;
  error?: string;
}

const newRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  title: "",
  summary: "",
  budget: "",
});

export function ProjectsStep({
  orgId,
  onNext,
  onBack,
}: {
  orgId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const existing = useQuery({
    queryKey: ["org", orgId, "projects"],
    queryFn: () => api<ListResponse<ProjectDto>>(orgApi(orgId, "/projects")),
  });

  const filled = rows.filter((r) => r.title.trim() || r.summary.trim() || r.budget.trim());
  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r)));

  const saveAndContinue = async () => {
    // Validate first so nothing is half-saved.
    let ok = true;
    const checked = rows.map((r) => {
      const any = r.title.trim() || r.summary.trim() || r.budget.trim();
      if (!any) return r;
      if (!r.title.trim()) {
        ok = false;
        return { ...r, error: "Give this project a short name." };
      }
      if (r.budget.trim() && parseDollarsToCents(r.budget) == null) {
        ok = false;
        return { ...r, error: "Enter the budget as a number, like 25000 or $25k." };
      }
      return r;
    });
    setRows(checked);
    if (!ok) return;
    if (filled.length === 0) return onNext();

    setSaving(true);
    setError(null);
    try {
      const remaining: Row[] = [];
      for (const r of checked) {
        if (!r.title.trim()) continue;
        try {
          await api<ProjectDto>(orgApi(orgId, "/projects"), {
            method: "POST",
            body: {
              title: r.title.trim(),
              summary: r.summary.trim(),
              budgetNeededCents: parseDollarsToCents(r.budget),
            },
          });
        } catch (e) {
          remaining.push(r);
          setError(e);
        }
      }
      await qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
      if (remaining.length === 0) {
        setRows([newRow()]);
        onNext();
      } else {
        setRows(remaining);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-neutral-700">
        What would you do with more funding? A sentence or two is plenty — we'll look for grants
        that fit and ask follow-up questions later.
      </p>

      {existing.data && existing.data.items.length > 0 && (
        <ul className="space-y-2" aria-label="Projects already added">
          {existing.data.items.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 font-medium text-neutral-900">
                <FolderKanban className="h-4 w-4 text-brand-600" aria-hidden />
                {p.title}
              </span>
              <span className="text-neutral-500">
                {p.budgetNeededCents ? formatCents(p.budgetNeededCents) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4">
        {rows.map((r, i) => (
          <ProjectRow
            key={r.key}
            row={r}
            index={i}
            disabled={saving}
            canRemove={rows.length > 1}
            onChange={(patch) => update(r.key, patch)}
            onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
          />
        ))}
        <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
          <Plus className="h-4 w-4" aria-hidden />
          Add another project
        </Button>
      </div>

      {error != null && <ErrorMessage error={error} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onNext} disabled={saving}>
            Skip for now
          </Button>
          <Button onClick={saveAndContinue} loading={saving}>
            {filled.length > 0
              ? `Save ${filled.length} project${filled.length === 1 ? "" : "s"} & continue`
              : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  row,
  index,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  disabled: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <fieldset className="rounded-lg border border-neutral-200 bg-white p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Project {index + 1}
      </legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div>
          <label htmlFor={`${id}-title`} className="text-sm font-medium text-neutral-700">
            Name
          </label>
          <Input
            id={`${id}-title`}
            value={row.title}
            disabled={disabled}
            placeholder="Construction trades training for young adults"
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-budget`} className="text-sm font-medium text-neutral-700">
            Rough budget
          </label>
          <Input
            id={`${id}-budget`}
            value={row.budget}
            disabled={disabled}
            inputMode="decimal"
            placeholder="$50,000"
            onChange={(e) => onChange({ budget: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-summary`} className="text-sm font-medium text-neutral-700">
            In a paragraph: what, who for, and why it matters
          </label>
          <Textarea
            id={`${id}-summary`}
            value={row.summary}
            disabled={disabled}
            rows={3}
            onChange={(e) => onChange({ summary: e.target.value })}
          />
        </div>
      </div>
      {row.error && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {row.error}
        </p>
      )}
      {canRemove && (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={disabled}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Remove
          </Button>
        </div>
      )}
    </fieldset>
  );
}
