// OWNER: knowledge UI agent — project detail: view/edit, linked facts, capture-by-interview.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { AddFactForm } from "@client/components/knowledge/add-fact-form";
import { ProjectStatusBadge } from "@client/components/knowledge/badges";
import { FactList } from "@client/components/knowledge/fact-list";
import { PRIORITY_LABELS } from "@client/components/knowledge/labels";
import { ProjectForm, type ProjectInput } from "@client/components/knowledge/project-form";
import {
  kbKeys,
  type ProjectDetail,
  useDocuments,
  useInvalidateKnowledge,
  useOrgId,
  useProject,
  useStartInterview,
} from "@client/components/knowledge/queries";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  PageHeader,
  Spinner,
  toast,
} from "@client/components/ui";
import { api, formatCents, orgApi } from "@client/lib/api";
import type { ProjectDto } from "@shared/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export function ProjectDetailPage() {
  const orgId = useOrgId();
  const { projectId = "" } = useParams({ strict: false }) as { projectId?: string };
  const project = useProject(orgId, projectId);
  const docs = useDocuments(orgId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const start = useStartInterview(orgId);
  const invalidate = useInvalidateKnowledge();
  const [editing, setEditing] = useState(false);
  const [addingFact, setAddingFact] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titles = useMemo(
    () => new Map((docs.data?.items ?? []).map((d) => [d.id, d.title] as const)),
    [docs.data],
  );

  const update = useMutation({
    mutationFn: (p: ProjectInput) =>
      api<ProjectDto>(orgApi(orgId, `/projects/${encodeURIComponent(projectId)}`), {
        method: "PATCH",
        body: { ...p },
      }),
    onSuccess: (p) => {
      qc.setQueryData<ProjectDetail>(kbKeys.project(orgId, projectId), (old) =>
        old ? { ...old, ...p } : old,
      );
      // Project fields are mirrored as facts server-side, so refresh facts + this project's detail.
      void invalidate(orgId);
      toast.success("Project saved");
      setEditing(false);
    },
  });
  const del = useMutation({
    mutationFn: () =>
      api<void>(orgApi(orgId, `/projects/${encodeURIComponent(projectId)}`), { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Project deleted");
      setConfirmDelete(false);
      qc.removeQueries({ queryKey: kbKeys.project(orgId, projectId) });
      await invalidate(orgId);
      void navigate({ to: "/orgs/$orgId/projects", params: { orgId } });
    },
  });

  const back = (
    <Link
      to="/orgs/$orgId/projects"
      params={{ orgId }}
      className="mb-4 inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
    </Link>
  );

  if (project.isPending)
    return (
      <div>
        {back}
        <Spinner label="Loading project" />
      </div>
    );
  if (project.isError)
    return (
      <div>
        {back}
        <ApiErrorAlert
          error={project.error}
          title="Couldn't load this project"
          messages={{ not_found: "This project doesn't exist or was deleted." }}
        />
      </div>
    );

  const p = project.data;
  const timeline =
    p.timelineStart || p.timelineEnd
      ? `${p.timelineStart ?? "?"} – ${p.timelineEnd ?? "ongoing"}`
      : null;

  return (
    <div className="space-y-6">
      <div>
        {back}
        <PageHeader
          title={p.title}
          description={p.summary || undefined}
          actions={
            <>
              <Button
                onClick={() => start.mutate({ kind: "project", focusProjectId: p.id })}
                loading={start.isPending}
              >
                {!start.isPending && <MessageSquarePlus className="h-4 w-4" aria-hidden />}
                Capture details with an interview
              </Button>
              {!editing && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden /> Edit
                </Button>
              )}
              <Button
                variant="ghost"
                aria-label="Delete project"
                loading={del.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                {!del.isPending && <Trash2 className="h-4 w-4" aria-hidden />}
              </Button>
            </>
          }
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate()}
        loading={del.isPending}
        tone="danger"
        title="Delete project?"
        description={`“${p.title}” will be deleted. Facts linked to it stay in your fact base.`}
        confirmLabel="Delete"
      />
      <ApiErrorAlert error={start.error} title="Couldn't start the interview" />
      <ApiErrorAlert error={del.error} title="Couldn't delete the project" />

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit project</CardTitle>
          </CardHeader>
          <CardBody>
            <ProjectForm
              initial={p}
              onSubmit={(input) => update.mutate(input)}
              onCancel={() => setEditing(false)}
              pending={update.isPending}
              error={update.error}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Meta label="Status">
                <ProjectStatusBadge status={p.status} />
              </Meta>
              <Meta label="Priority">{PRIORITY_LABELS[p.priority] ?? p.priority}</Meta>
              <Meta label="Budget needed">{formatCents(p.budgetNeededCents)}</Meta>
              <Meta label="Location">{p.location || "—"}</Meta>
              <Meta label="Population served">{p.populationServed || "—"}</Meta>
              <Meta label="Timeline">{timeline ?? "—"}</Meta>
            </dl>
            <div className="grid gap-4 md:grid-cols-2">
              <Prose label="Problem" text={p.problem} />
              <Prose label="Approach" text={p.approach} />
            </div>
            {!p.problem && !p.approach && (
              <p className="text-sm text-neutral-500">
                No problem or approach written yet. An interview is the fastest way to capture them
                — answers become facts you can confirm.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="project-facts-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="project-facts-heading" className="text-lg font-semibold text-neutral-900">
              Facts about this project
            </h2>
            <p className="text-sm text-neutral-500">
              Drafts for this project can only state these facts and your organization's facts.
            </p>
          </div>
          {!addingFact && (
            <Button variant="secondary" size="sm" onClick={() => setAddingFact(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Add a fact
            </Button>
          )}
        </div>
        {addingFact && (
          <Card>
            <CardBody>
              <AddFactForm
                orgId={orgId}
                projectId={p.id}
                defaultCategory="project"
                onDone={() => setAddingFact(false)}
              />
            </CardBody>
          </Card>
        )}
        <FactList
          orgId={orgId}
          facts={p.facts ?? []}
          documentTitles={titles}
          emptyTitle="No facts linked yet"
          emptyDescription="Run a project interview or add facts yourself."
        />
      </section>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-neutral-800">{children}</dd>
    </div>
  );
}

function Prose({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</h2>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{text}</p>
    </div>
  );
}
