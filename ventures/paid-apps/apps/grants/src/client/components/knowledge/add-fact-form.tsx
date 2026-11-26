// "Add a fact" form -> POST /facts (user_entered facts are auto-confirmed by the API).
import { friendlyError } from "@client/components/grants/api-errors";
import { Alert, Button, Field, Input, Select, Textarea, toast } from "@client/components/ui";
import { FACT_CATEGORIES, type FactCategory } from "@shared/enums";
import { useId, useState } from "react";
import { FACT_CATEGORY_LABELS } from "./labels";
import { useFactActions } from "./queries";

export function AddFactForm({
  orgId,
  projectId,
  defaultCategory = "program",
  onDone,
}: {
  orgId: string;
  projectId?: string;
  defaultCategory?: FactCategory;
  onDone?: () => void;
}) {
  const uid = useId();
  const { create } = useFactActions(orgId);
  const [category, setCategory] = useState<FactCategory>(defaultCategory);
  const [statement, setStatement] = useState("");
  const [asOf, setAsOf] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (statement.trim().length < 5) {
      setError("Write the fact as a full sentence.");
      return;
    }
    setError(null);
    create.mutate(
      {
        category,
        statement: statement.trim(),
        ...(asOf.trim() ? { asOf: asOf.trim() } : {}),
        ...(projectId ? { projectId } : {}),
      },
      {
        onSuccess: () => {
          toast.success("Fact added", "Facts you enter are confirmed automatically.");
          setStatement("");
          setAsOf("");
          onDone?.();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-label="Add a fact">
      <Field
        label="Statement"
        htmlFor={`${uid}-statement`}
        error={error ?? undefined}
        hint="One checkable statement, e.g. “Our trades program graduated 42 students in 2025.”"
      >
        <Textarea
          id={`${uid}-statement`}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          className="min-h-16"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor={`${uid}-category`}>
          <Select
            id={`${uid}-category`}
            value={category}
            onChange={(e) => setCategory(e.target.value as FactCategory)}
          >
            {FACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FACT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="As of (optional)" htmlFor={`${uid}-asof`} hint="e.g. 2025 or 2026-06-30">
          <Input id={`${uid}-asof`} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
      </div>
      {create.isError && (
        <Alert tone="danger" title="Could not add fact">
          {friendlyError(create.error)}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={create.isPending}>
          Add fact
        </Button>
      </div>
    </form>
  );
}
