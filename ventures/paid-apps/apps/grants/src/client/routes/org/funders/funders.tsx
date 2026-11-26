// Funder relationships: one place per funder (stage, owner, next step), as a board by stage or a
// list. Funders the org shortlists, applies to, wins from or researches appear here on their own.
import { useOrgId } from "@client/components/grants/queries";
import {
  Badge,
  Button,
  buttonClass,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  PageHeader,
  Select,
  SkeletonCard,
  Table,
  Td,
  Textarea,
  Th,
  toast,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import {
  FUNDER_STAGE_LABELS,
  FUNDER_STAGES,
  type FunderRelationSummaryDto,
  type FunderStage,
} from "@shared/api/funders";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Handshake, LayoutGrid, List, Plus, Users } from "lucide-react";
import * as React from "react";
import { fromLocalInput, groupByStage, nextStepUrgency, STAGE_HINT, STAGE_TONE } from "./model";
import { useCreateFunder, useFunders } from "./queries";

type View = "board" | "list";

export function FundersPage({ now = new Date() }: { now?: Date } = {}) {
  const orgId = useOrgId();
  const query = useFunders(orgId);
  const [view, setView] = React.useState<View>("board");
  const [stage, setStage] = React.useState<FunderStage | "all">("all");
  const [adding, setAdding] = React.useState(false);

  const data = query.data;
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const items = (data?.items ?? []).filter((i) => stage === "all" || i.stage === stage);

  return (
    <div>
      <PageHeader
        title="Funders"
        description="Every funder you know, where the relationship stands and what happens next."
        actions={
          data?.canEdit && total > 0 ? (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden /> Add funder
            </Button>
          ) : null
        }
      />
      {query.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : query.isError ? (
        <ErrorMessage error={query.error} title="We couldn't load your funders" />
      ) : total === 0 ? (
        <FundersEmptyState orgId={orgId} canEdit={!!data?.canEdit} onAdd={() => setAdding(true)} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <fieldset className="flex flex-wrap gap-1.5" aria-label="Filter by stage">
              <StageChip
                label="All"
                count={total}
                active={stage === "all"}
                onClick={() => setStage("all")}
              />
              {FUNDER_STAGES.map((s) => (
                <StageChip
                  key={s}
                  label={FUNDER_STAGE_LABELS[s]}
                  count={data?.counts[s] ?? 0}
                  active={stage === s}
                  onClick={() => setStage(s)}
                />
              ))}
            </fieldset>
            <fieldset className="flex gap-1" aria-label="View">
              <Button
                size="sm"
                variant={view === "board" ? "secondary" : "ghost"}
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                <LayoutGrid aria-hidden /> Board
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List aria-hidden /> List
              </Button>
            </fieldset>
          </div>
          {view === "board" ? (
            <Board
              orgId={orgId}
              items={items}
              stages={stage === "all" ? FUNDER_STAGES : [stage]}
              now={now}
            />
          ) : (
            <FunderTable orgId={orgId} items={items} now={now} />
          )}
        </>
      )}
      <AddFunderDialog orgId={orgId} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function StageChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors",
        active
          ? "bg-brand-600 text-white ring-brand-700"
          : "bg-surface text-default ring-line-strong hover:bg-subtle",
      )}
    >
      {label} <span className={active ? "text-white/80" : "text-muted"}>{count}</span>
    </button>
  );
}

export function FundersEmptyState({
  orgId,
  canEdit,
  onAdd,
}: {
  orgId: string;
  canEdit: boolean;
  onAdd: () => void;
}) {
  return (
    <EmptyState
      icon={<Handshake />}
      title="Grants follow relationships"
      description="Most grants to small charities go to organizations the funder already knows. Keep each funder's history, the people you talk to and your next step in one place, so nothing slips when a deadline is months away. Funders you shortlist, apply to, win from or research appear here automatically."
      action={
        <>
          {canEdit && (
            <Button onClick={onAdd}>
              <Plus aria-hidden /> Add a funder
            </Button>
          )}
          <Link
            to="/orgs/$orgId/opportunities"
            params={{ orgId }}
            className={buttonClass({ variant: "secondary" })}
          >
            Find grants
          </Link>
        </>
      }
    />
  );
}

function NextStep({ item, now }: { item: FunderRelationSummaryDto; now: Date }) {
  const urgency = nextStepUrgency(item.nextStepAt, now);
  if (urgency === "none") return <span className="text-xs text-subtle">No next step</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        urgency === "overdue" ? "font-medium text-danger-700" : "text-muted",
      )}
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {urgency === "overdue" ? "Overdue: " : ""}
      {formatDate(item.nextStepAt)}
      {item.nextStepNote ? ` · ${item.nextStepNote}` : ""}
    </span>
  );
}

function Board({
  orgId,
  items,
  stages,
  now,
}: {
  orgId: string;
  items: FunderRelationSummaryDto[];
  stages: readonly FunderStage[];
  now: Date;
}) {
  const grouped = groupByStage(items);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((s) => (
        <section
          key={s}
          aria-label={FUNDER_STAGE_LABELS[s]}
          className="w-64 shrink-0 rounded-xl bg-subtle p-2 ring-1 ring-line"
        >
          <header className="mb-2 px-1">
            <div className="flex items-center justify-between">
              <Badge tone={STAGE_TONE[s]} dot>
                {FUNDER_STAGE_LABELS[s]}
              </Badge>
              <span className="text-xs text-muted">{grouped[s].length}</span>
            </div>
            <p className="mt-1 text-xs text-subtle">{STAGE_HINT[s]}</p>
          </header>
          <ul className="space-y-2">
            {grouped[s].map((item) => (
              <li key={item.id}>
                <Link
                  to="/orgs/$orgId/funders/$funderId"
                  params={{ orgId, funderId: item.id }}
                  className="block rounded-lg bg-surface p-3 shadow-card ring-1 ring-line hover:ring-brand-300"
                >
                  <p className="font-medium text-strong">{item.displayName}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {item.ownerName && <span>Owner: {item.ownerName}</span>}
                    {item.contactCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" aria-hidden /> {item.contactCount}
                      </span>
                    )}
                    {item.awardedCents > 0 && <span>{formatCents(item.awardedCents)} won</span>}
                  </div>
                  <div className="mt-2">
                    <NextStep item={item} now={now} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FunderTable({
  orgId,
  items,
  now,
}: {
  orgId: string;
  items: FunderRelationSummaryDto[];
  now: Date;
}) {
  return (
    <Table aria-label="Funders">
      <thead>
        <tr>
          <Th>Funder</Th>
          <Th>Stage</Th>
          <Th>Owner</Th>
          <Th>Next step</Th>
          <Th>Applications</Th>
          <Th>Won</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <th scope="row" className="px-4 py-3 text-left font-medium">
              <Link
                to="/orgs/$orgId/funders/$funderId"
                params={{ orgId, funderId: item.id }}
                className="text-link hover:underline"
              >
                {item.displayName}
              </Link>
            </th>
            <Td>
              <Badge tone={STAGE_TONE[item.stage]}>{FUNDER_STAGE_LABELS[item.stage]}</Badge>
            </Td>
            <Td>{item.ownerName ?? "—"}</Td>
            <Td>
              <NextStep item={item} now={now} />
            </Td>
            <Td>{item.applicationCount}</Td>
            <Td>{item.awardedCents > 0 ? formatCents(item.awardedCents) : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function AddFunderDialog({
  orgId,
  open,
  onClose,
}: {
  orgId: string;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateFunder(orgId);
  const [name, setName] = React.useState("");
  const [stage, setStage] = React.useState<FunderStage>("prospect");
  const [nextAt, setNextAt] = React.useState("");
  const [note, setNote] = React.useState("");
  const id = React.useId();
  React.useEffect(() => {
    if (!open) {
      setName("");
      setStage("prospect");
      setNextAt("");
      setNote("");
      create.reset();
    }
  }, [open, create.reset]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        displayName: name.trim(),
        stage,
        nextStepAt: fromLocalInput(nextAt),
        nextStepNote: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Funder added");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a funder"
      description="A foundation, company or agency you want to build a relationship with."
      dismissible={!create.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} loading={create.isPending}>
            Add funder
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} onSubmit={submit} className="space-y-4">
        <Field label="Funder name" htmlFor={`${id}-name`} required>
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={300}
          />
        </Field>
        <Field label="Stage" htmlFor={`${id}-stage`}>
          <Select
            id={`${id}-stage`}
            value={stage}
            onChange={(e) => setStage(e.target.value as FunderStage)}
          >
            {FUNDER_STAGES.map((s) => (
              <option key={s} value={s}>
                {FUNDER_STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next step date" htmlFor={`${id}-next`} hint="Optional. We'll remind you.">
          <Input
            id={`${id}-next`}
            type="datetime-local"
            value={nextAt}
            onChange={(e) => setNextAt(e.target.value)}
          />
        </Field>
        <Field label="Next step" htmlFor={`${id}-note`}>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </Field>
        {create.error && <ErrorMessage error={create.error} title="Couldn't add the funder" />}
      </form>
    </Dialog>
  );
}
