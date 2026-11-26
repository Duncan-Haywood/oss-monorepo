// Create / edit a project. Budget is entered in dollars and sent as integer cents.
import { friendlyError } from "@client/components/grants/api-errors";
import { Alert, Button, Field, Input, Select, Textarea } from "@client/components/ui";
import type { ProjectDto } from "@shared/api/types";
import { PROJECT_STATUSES, type ProjectStatus } from "@shared/enums";
import { useId, useState } from "react";
import {
  centsToDollarInput,
  PRIORITY_LABELS,
  PROJECT_STATUS_INFO,
  parseDollarsToCents,
} from "./labels";

export interface ProjectInput {
  title: string;
  summary: string;
  problem: string;
  approach: string;
  populationServed: string;
  location: string;
  budgetNeededCents: number | null;
  timelineStart: string | null;
  timelineEnd: string | null;
  status: ProjectStatus;
  priority: number;
}

export function ProjectForm({
  initial,
  submitLabel = "Save project",
  onSubmit,
  onCancel,
  pending = false,
  error,
}: {
  initial?: Partial<ProjectDto>;
  submitLabel?: string;
  onSubmit: (p: ProjectInput) => void;
  onCancel?: () => void;
  pending?: boolean;
  error?: unknown;
}) {
  const uid = useId();
  const [v, setV] = useState({
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    problem: initial?.problem ?? "",
    approach: initial?.approach ?? "",
    populationServed: initial?.populationServed ?? "",
    location: initial?.location ?? "",
    budget: centsToDollarInput(initial?.budgetNeededCents),
    timelineStart: initial?.timelineStart ?? "",
    timelineEnd: initial?.timelineEnd ?? "",
    status: (initial?.status ?? "idea") as ProjectStatus,
    priority: initial?.priority ?? 3,
  });
  const [errors, setErrors] = useState<{ title?: string; budget?: string }>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const id = (k: string) => `${uid}-${k}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!v.title.trim()) errs.title = "Give the project a name.";
    const cents = parseDollarsToCents(v.budget);
    if (cents != null && Number.isNaN(cents)) errs.budget = "Enter a dollar amount, e.g. 150,000.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({
      title: v.title.trim(),
      summary: v.summary.trim(),
      problem: v.problem.trim(),
      approach: v.approach.trim(),
      populationServed: v.populationServed.trim(),
      location: v.location.trim(),
      budgetNeededCents: cents,
      timelineStart: v.timelineStart.trim() || null,
      timelineEnd: v.timelineEnd.trim() || null,
      status: v.status,
      priority: Number(v.priority),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Project details">
      <Field label="Project name" htmlFor={id("title")} error={errors.title}>
        <Input
          id={id("title")}
          value={v.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Gallup construction trades apprenticeship"
          aria-invalid={!!errors.title}
        />
      </Field>
      <Field label="Summary" htmlFor={id("summary")} hint="One or two sentences.">
        <Textarea
          id={id("summary")}
          value={v.summary}
          onChange={(e) => set("summary", e.target.value)}
          className="min-h-16"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Problem it addresses" htmlFor={id("problem")}>
          <Textarea
            id={id("problem")}
            value={v.problem}
            onChange={(e) => set("problem", e.target.value)}
          />
        </Field>
        <Field label="Approach" htmlFor={id("approach")}>
          <Textarea
            id={id("approach")}
            value={v.approach}
            onChange={(e) => set("approach", e.target.value)}
          />
        </Field>
        <Field label="Population served" htmlFor={id("population")}>
          <Input
            id={id("population")}
            value={v.populationServed}
            onChange={(e) => set("populationServed", e.target.value)}
            placeholder="e.g. Navajo young adults aged 18–30"
          />
        </Field>
        <Field label="Location" htmlFor={id("location")}>
          <Input
            id={id("location")}
            value={v.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Gallup, NM and surrounding chapters"
          />
        </Field>
        <Field label="Budget needed ($)" htmlFor={id("budget")} error={errors.budget}>
          <Input
            id={id("budget")}
            inputMode="decimal"
            value={v.budget}
            onChange={(e) => set("budget", e.target.value)}
            placeholder="150,000"
            aria-invalid={!!errors.budget}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor={id("start")} hint="Date or e.g. “Fall 2027”">
            <Input
              id={id("start")}
              value={v.timelineStart}
              onChange={(e) => set("timelineStart", e.target.value)}
            />
          </Field>
          <Field label="Ends" htmlFor={id("end")}>
            <Input
              id={id("end")}
              value={v.timelineEnd}
              onChange={(e) => set("timelineEnd", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Status" htmlFor={id("status")}>
          <Select
            id={id("status")}
            value={v.status}
            onChange={(e) => set("status", e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_INFO[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor={id("priority")}>
          <Select
            id={id("priority")}
            value={String(v.priority)}
            onChange={(e) => set("priority", Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error != null && (
        <Alert tone="danger" title="Could not save">
          {friendlyError(error)}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
