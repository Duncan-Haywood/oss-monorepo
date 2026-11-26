// OWNER: interview UI agent — start an interview, browse past ones, upload human-run transcripts.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@client/components/ui";
import { api, formatDate, orgApi } from "@client/lib/api";
import type { InterviewDto, ListResponse, ProjectDto } from "@shared/api/types";
import type { InterviewKind } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Building2, FolderKanban, SearchCheck, Upload } from "lucide-react";
import { useId, useState } from "react";
import {
  type FactsSummary,
  factsSummaryKey,
  type InterviewDetail,
  interviewKeys,
  KIND_LABELS,
  projectsKey,
  START_ERRORS,
  STATUS_LABELS,
  STATUS_TONES,
  topicLabel,
} from "./shared";
import { TranscriptUploadDialog } from "./transcript-upload-dialog";

type StartVars = { kind: InterviewKind; focusProjectId?: string };

export function InterviewsPage() {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);

  const interviews = useQuery({
    queryKey: interviewKeys.all(orgId),
    queryFn: () => api<ListResponse<InterviewDto>>(orgApi(orgId, "/interviews")),
  });

  const start = useMutation({
    mutationFn: (vars: StartVars) =>
      api<InterviewDetail>(orgApi(orgId, "/interviews"), {
        method: "POST",
        body: { ...vars, mode: "ai_chat" },
      }),
    onSuccess: (created) => {
      qc.setQueryData(interviewKeys.detail(orgId, created.id), created);
      void qc.invalidateQueries({ queryKey: interviewKeys.all(orgId), exact: true });
      void navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: created.id },
      });
    },
  });
  const pendingKind = start.isPending ? start.variables?.kind : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Interviews"
        description="Short guided conversations capture what your documents don't say. Answers become proposed facts that you review — nothing is used or submitted without a person confirming it."
        actions={
          <Button variant="secondary" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden />
            Upload a transcript
          </Button>
        }
      />

      <section aria-labelledby="start-heading" className="mb-10">
        <h2 id="start-heading" className="mb-3 text-lg font-semibold text-neutral-900">
          Start an interview
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <StartCard
            icon={<Building2 className="h-5 w-5" aria-hidden />}
            title="Onboarding"
            subtitle="Tell us about your organization"
            description="Mission, history, programs, the people you serve, outcomes and finances. About 15 minutes."
            action={
              <Button
                className="w-full"
                onClick={() => start.mutate({ kind: "onboarding" })}
                loading={pendingKind === "onboarding"}
                disabled={start.isPending}
              >
                Start onboarding interview
              </Button>
            }
          />
          <FollowUpCard
            orgId={orgId}
            pending={pendingKind === "follow_up"}
            disabled={start.isPending}
            onStart={() => start.mutate({ kind: "follow_up" })}
          />
          <ProjectCard
            orgId={orgId}
            pending={pendingKind === "project"}
            disabled={start.isPending}
            onStart={(projectId) => start.mutate({ kind: "project", focusProjectId: projectId })}
          />
        </div>
        {start.isError && (
          <div className="mt-4">
            <ApiErrorAlert
              error={start.error}
              title="Couldn't start the interview"
              messages={START_ERRORS}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="past-heading">
        <h2 id="past-heading" className="mb-3 text-lg font-semibold text-neutral-900">
          Past interviews
        </h2>
        {interviews.isPending ? (
          <Spinner label="Loading interviews" />
        ) : interviews.isError ? (
          <ApiErrorAlert error={interviews.error} title="Couldn't load interviews" />
        ) : interviews.data.items.length === 0 ? (
          <EmptyState
            title="No interviews yet"
            description="Start with the onboarding interview — it's the fastest way to build your fact base. You can also upload a transcript of a conversation you already had."
          />
        ) : (
          <Table>
            <thead className="bg-neutral-50">
              <tr>
                <Th>Interview</Th>
                <Th>Kind</Th>
                <Th>Status</Th>
                <Th className="text-right">Facts extracted</Th>
                <Th>Date</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {interviews.data.items.map((iv) => (
                <tr key={iv.id}>
                  <Td className="font-medium text-neutral-900">{iv.title}</Td>
                  <Td>{KIND_LABELS[iv.kind] ?? iv.kind}</Td>
                  <Td>
                    <Badge tone={STATUS_TONES[iv.status] ?? "neutral"}>
                      {STATUS_LABELS[iv.status] ?? iv.status}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {iv.status === "completed" ? iv.factCount : "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(iv.completedAt ?? iv.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <Link
                      to="/orgs/$orgId/interviews/$interviewId"
                      params={{ orgId, interviewId: iv.id }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {iv.status === "active" ? "Resume" : "View"}
                      <span className="sr-only"> {iv.title}</span>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <TranscriptUploadDialog
        orgId={orgId}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
      />
    </div>
  );
}

function StartCard({
  icon,
  title,
  subtitle,
  description,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            {icon}
          </span>
          <div>
            <h3 className="font-semibold text-neutral-900">{title}</h3>
            <p className="text-sm text-neutral-600">{subtitle}</p>
          </div>
        </div>
        {description && <p className="text-sm text-neutral-500">{description}</p>}
        <div className="flex-1">{children}</div>
        {action}
      </CardBody>
    </Card>
  );
}

function FollowUpCard({
  orgId,
  pending,
  disabled,
  onStart,
}: {
  orgId: string;
  pending: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  const summary = useQuery({
    queryKey: factsSummaryKey(orgId),
    queryFn: () => api<FactsSummary>(orgApi(orgId, "/facts/summary")),
  });
  const gaps = (summary.data?.coverage ?? []).filter((c) => c.status !== "good");
  const missing = gaps.filter((c) => c.status === "missing");
  const thin = gaps.filter((c) => c.status === "thin");

  return (
    <StartCard
      icon={<SearchCheck className="h-5 w-5" aria-hidden />}
      title="Follow-up"
      subtitle="Fill gaps in your fact base"
      action={
        <Button
          className="w-full"
          variant={gaps.length > 0 ? "primary" : "secondary"}
          onClick={onStart}
          loading={pending}
          disabled={disabled}
        >
          Start follow-up interview
        </Button>
      }
    >
      {summary.isPending ? (
        <Spinner label="Checking your fact base" />
      ) : summary.isError ? (
        <p className="text-sm text-neutral-500">
          We couldn't check your fact base right now. The interview will still ask about what's
          missing.
        </p>
      ) : gaps.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Every core topic has facts. A follow-up can still add depth and newer numbers.
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-neutral-500">
            We'll focus on the topics with little or no information:
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Topics to fill">
            {missing.map((c) => (
              <li key={c.topic}>
                <Badge tone="danger">
                  {c.label ?? topicLabel(c.topic)}
                  <span className="sr-only"> (missing)</span>
                </Badge>
              </li>
            ))}
            {thin.map((c) => (
              <li key={c.topic}>
                <Badge tone="warning">
                  {c.label ?? topicLabel(c.topic)}
                  <span className="sr-only"> (thin, {c.factCount} facts)</span>
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-xs text-neutral-500">
            <span className="text-danger-700">Red</span> = missing ·{" "}
            <span className="text-warning-700">amber</span> = thin
          </p>
        </div>
      )}
    </StartCard>
  );
}

function ProjectCard({
  orgId,
  pending,
  disabled,
  onStart,
}: {
  orgId: string;
  pending: boolean;
  disabled: boolean;
  onStart: (projectId: string) => void;
}) {
  const selectId = useId();
  const [projectId, setProjectId] = useState("");
  const projects = useQuery({
    queryKey: projectsKey(orgId),
    queryFn: () => api<ListResponse<ProjectDto>>(orgApi(orgId, "/projects")),
  });
  const items = (projects.data?.items ?? []).filter((p) => p.status !== "archived");

  return (
    <StartCard
      icon={<FolderKanban className="h-5 w-5" aria-hidden />}
      title="Project"
      subtitle="Go deep on one project"
      description="Problem, approach, budget, timeline and expected outcomes — what funders ask about."
      action={
        <Button
          className="w-full"
          onClick={() => projectId && onStart(projectId)}
          loading={pending}
          disabled={disabled || !projectId}
        >
          Start project interview
        </Button>
      }
    >
      {projects.isPending ? (
        <Spinner label="Loading projects" />
      ) : projects.isError ? (
        <ApiErrorAlert error={projects.error} title="Couldn't load projects" />
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No projects yet.{" "}
          <Link
            to="/orgs/$orgId/projects"
            params={{ orgId }}
            className="font-medium text-brand-700 hover:underline"
          >
            Create a project
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="space-y-1">
          <label htmlFor={selectId} className="block text-sm font-medium text-neutral-700">
            Project
          </label>
          <Select id={selectId} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Choose a project…</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>
      )}
    </StartCard>
  );
}
