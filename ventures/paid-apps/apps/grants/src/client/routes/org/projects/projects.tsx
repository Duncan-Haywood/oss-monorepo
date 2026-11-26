// OWNER: knowledge UI agent — projects list + create.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { GuideNextStep } from "@client/components/guide/getting-started";
import { ProjectStatusBadge } from "@client/components/knowledge/badges";
import { ProjectForm, type ProjectInput } from "@client/components/knowledge/project-form";
import { kbKeys, useOrgId, useProjects } from "@client/components/knowledge/queries";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Spinner,
  toast,
} from "@client/components/ui";
import { api, formatCents, orgApi } from "@client/lib/api";
import type { ProjectDto } from "@shared/api/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { MapPin, Plus, Users } from "lucide-react";
import { useState } from "react";

export function ProjectsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const projects = useProjects(orgId);

  const create = useMutation({
    mutationFn: (p: ProjectInput) =>
      api<ProjectDto>(orgApi(orgId, "/projects"), { method: "POST", body: { ...p } }),
    onSuccess: (p) => {
      toast.success("Project created");
      void qc.invalidateQueries({ queryKey: kbKeys.projects(orgId) });
      void qc.invalidateQueries({ queryKey: kbKeys.facts(orgId) });
      void navigate({ to: "/orgs/$orgId/projects/$projectId", params: { orgId, projectId: p.id } });
    },
  });

  const items = [...(projects.data?.items ?? [])].sort(
    (a, b) =>
      Number(a.status === "archived") - Number(b.status === "archived") || a.priority - b.priority,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="The work you want funded. Autopilot matches grants to projects and drafts around them."
        actions={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New project
            </Button>
          )
        }
      />

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">
              Rough is fine — you can fill in details later or capture them in an interview.
            </p>
          </CardHeader>
          <CardBody>
            <ProjectForm
              submitLabel="Create project"
              onSubmit={(p) => create.mutate(p)}
              onCancel={() => setCreating(false)}
              pending={create.isPending}
              error={create.error}
            />
          </CardBody>
        </Card>
      )}

      {projects.isPending ? (
        <Spinner label="Loading projects" />
      ) : projects.isError ? (
        <ApiErrorAlert error={projects.error} title="Couldn't load projects" />
      ) : items.length === 0 ? (
        !creating && (
          <EmptyState
            title="No projects yet"
            description="Add the program or initiative you most want to fund — e.g. a new trades cohort or a facility upgrade."
            action={
              <>
                <Button onClick={() => setCreating(true)}>Create your first project</Button>
                <GuideNextStep orgId={orgId} except="project" className="basis-full" />
              </>
            }
          />
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to="/orgs/$orgId/projects/$projectId"
                params={{ orgId, projectId: p.id }}
                className="block h-full rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow focus-visible:outline-2 focus-visible:outline-focus"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-neutral-900">{p.title}</h2>
                  <ProjectStatusBadge status={p.status} />
                </div>
                {p.summary && (
                  <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{p.summary}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                  <span>Priority {p.priority}</span>
                  {p.factCount != null && (
                    <span>
                      {p.factCount} {p.factCount === 1 ? "fact" : "facts"}
                    </span>
                  )}
                  {p.budgetNeededCents != null && (
                    <span>Needs {formatCents(p.budgetNeededCents)}</span>
                  )}
                  {p.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden /> {p.location}
                    </span>
                  )}
                  {p.populationServed && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" aria-hidden /> {p.populationServed}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
