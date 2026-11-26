// The opportunity triage inbox: new matches, highest expected value first, in a list/detail split.
// Keyboard: j/k move, s shortlist, d dismiss (reason picker), o open, x select, Esc clear, ? help.
// Every shortcut has a button (with aria-keyshortcuts), results are announced in a polite live
// region, and focus moves to the next grant after triage (or to "Inbox zero" when none are left).
import {
  Alert,
  Button,
  buttonClass,
  Checkbox,
  getOpenDialogCount,
  Spinner,
} from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { DismissReason, InboxItemDto } from "@shared/match-triage";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
  Keyboard,
  PartyPopper,
  X,
} from "lucide-react";
import * as React from "react";
import { ApiErrorAlert } from "../api-error-alert";
import { friendlyError } from "../api-errors";
import { InboxDetail, KeyHint, RowSignals } from "./inbox-item";
import {
  actionForKey,
  moveIndex,
  nextActiveAfterRemoval,
  plural,
  shortcutOf,
  type TriageAction,
} from "./model";
import { useInbox, useTriageMatches } from "./queries";
import { DismissDialog, ShortcutsDialog } from "./triage-dialogs";

const quote = (s: string) => `“${s.length > 80 ? `${s.slice(0, 79)}…` : s}”`;
const aria = (a: TriageAction) => shortcutOf(a).aria;

interface PendingFocus {
  /** "row": move focus to the active row; "keep": only if focus was lost (or the inbox emptied). */
  mode: "row" | "keep";
  removed: ReadonlySet<string>;
}

export function TriageInbox({
  orgId,
  canEdit,
  now,
}: {
  orgId: string;
  /** Editors and above may shortlist / dismiss (the server enforces it too). */
  canEdit: boolean;
  now?: Date;
}) {
  const inbox = useInbox(orgId);
  const triage = useTriageMatches(orgId);
  const navigate = useNavigate();

  const items = React.useMemo(() => inbox.data?.items ?? [], [inbox.data]);
  const ids = React.useMemo(() => items.map((i) => i.id), [items]);
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const total = inbox.data?.total ?? 0;

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [dismissIds, setDismissIds] = React.useState<string[] | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [message, setMessage] = React.useState({ text: "", n: 0 });

  const lastIndex = React.useRef(0);
  const pendingFocus = React.useRef<PendingFocus | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const listRef = React.useRef<HTMLUListElement>(null);
  const zeroRef = React.useRef<HTMLHeadingElement>(null);
  const uid = React.useId();
  const domIds = {
    hint: `${uid}-hint`,
    listHeading: `${uid}-list`,
    detail: `${uid}-detail`,
    detailHeading: `${uid}-detail-heading`,
  };

  // The active item: the chosen one while it's listed, else whatever now sits at its old position.
  const currentId =
    activeId && byId.has(activeId)
      ? activeId
      : (ids[Math.min(lastIndex.current, ids.length - 1)] ?? null);
  const currentIndex = currentId ? ids.indexOf(currentId) : -1;
  const current = currentId ? byId.get(currentId) : undefined;
  React.useEffect(() => {
    if (currentIndex >= 0) lastIndex.current = currentIndex;
  }, [currentIndex]);

  const selectedIds = ids.filter((id) => selected.has(id));
  const announce = React.useCallback(
    (text: string) => setMessage((m) => ({ text, n: m.n + 1 })),
    [],
  );

  // Focus follows triage: the next row, or the "Inbox zero" heading once the last one is gone.
  React.useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    const settled = ![...p.removed].some((id) => byId.has(id));
    const focusLost =
      !document.activeElement ||
      document.activeElement === document.body ||
      !document.activeElement.isConnected;
    if (ids.length === 0 && settled) {
      zeroRef.current?.focus();
      pendingFocus.current = null;
      return;
    }
    if (currentId && (p.mode === "row" || focusLost)) rowRefs.current.get(currentId)?.focus();
    if (settled) pendingFocus.current = null;
  }, [ids, byId, currentId]);

  const focusMode = (): PendingFocus["mode"] => {
    const ae = document.activeElement;
    const inList = !!ae && !!listRef.current?.contains(ae);
    return inList || !ae || ae === document.body ? "row" : "keep";
  };

  const titleOf = (id: string) => byId.get(id)?.opportunity.title ?? "grant";
  const subjectOf = (target: string[]) =>
    target.length === 1 ? quote(titleOf(target[0] as string)) : plural(target.length, "grant");
  const targets = (): string[] =>
    selectedIds.length > 0 ? selectedIds : currentId ? [currentId] : [];

  function triageNow(
    target: string[],
    status: "shortlisted" | "dismissed",
    mode: PendingFocus["mode"],
    dismissal?: { reason: DismissReason; note?: string },
  ) {
    if (target.length === 0) return;
    const removed = new Set(target);
    const subject = subjectOf(target);
    const verb = status === "shortlisted" ? "Shortlisted" : "Dismissed";
    const left = Math.max(0, total - target.length);
    pendingFocus.current = { mode, removed };
    setActiveId(nextActiveAfterRemoval(ids, currentId, removed));
    setSelected((prev) => new Set([...prev].filter((id) => !removed.has(id))));
    announce(
      `${verb} ${subject}. ${left === 0 ? "Inbox zero." : `${plural(left, "grant")} left.`}`,
    );
    triage.mutate(
      {
        ids: target,
        status,
        ...(dismissal ? { dismissReason: dismissal.reason, dismissNote: dismissal.note } : {}),
      },
      {
        onSuccess: (res) => {
          if (res.skipped.length > 0) {
            announce(
              `${plural(res.skipped.length, "grant")} already ${res.skipped.length === 1 ? "has" : "have"} an application and ${res.skipped.length === 1 ? "was" : "were"} left as is.`,
            );
          }
        },
        onError: (err) => {
          pendingFocus.current = null;
          announce(`Couldn't update ${subject}: ${friendlyError(err)}`);
        },
      },
    );
  }

  function run(action: TriageAction) {
    const needsEdit = action === "shortlist" || action === "dismiss" || action === "toggle";
    if (needsEdit && !canEdit) {
      announce("Only editors can shortlist or dismiss grants.");
      return;
    }
    switch (action) {
      case "next":
      case "prev": {
        if (ids.length === 0) return;
        const next = ids[moveIndex(currentIndex, action === "next" ? 1 : -1, ids.length)] ?? null;
        pendingFocus.current = { mode: "row", removed: new Set() };
        setActiveId(next);
        return;
      }
      case "shortlist":
        triageNow(targets(), "shortlisted", focusMode());
        return;
      case "dismiss": {
        const t = targets();
        if (t.length > 0) setDismissIds(t);
        return;
      }
      case "open":
        if (current) {
          void navigate({
            to: "/orgs/$orgId/opportunities/$opportunityId",
            params: { orgId, opportunityId: current.opportunityId },
          });
        }
        return;
      case "toggle": {
        if (!currentId) return;
        const on = !selected.has(currentId);
        const next = new Set(selected);
        if (on) next.add(currentId);
        else next.delete(currentId);
        setSelected(next);
        const count = ids.filter((id) => next.has(id)).length;
        announce(
          `${on ? "Selected" : "Unselected"} ${quote(titleOf(currentId))}. ${count} selected.`,
        );
        return;
      }
      case "clear":
        if (selectedIds.length > 0) {
          setSelected(new Set());
          announce("Selection cleared.");
        }
        return;
      case "help":
        setHelpOpen(true);
        return;
    }
  }

  // Latest `run` for the document listener (bound once).
  const runRef = React.useRef(run);
  runRef.current = run;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || getOpenDialogCount() > 0) return;
      const inList = !!listRef.current && listRef.current.contains(e.target as Node);
      const action = actionForKey(e, { inList });
      if (!action) return;
      e.preventDefault();
      runRef.current(action);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleOne = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const status = (
    <p role="status" aria-live="polite" className="min-h-5 text-sm text-neutral-600">
      {message.text}
      {/* Alternating invisible suffix so repeating the same message is announced again. */}
      {message.n % 2 === 1 ? " " : ""}
    </p>
  );

  const dialogs = (
    <>
      <DismissDialog
        open={dismissIds !== null}
        subject={dismissIds ? subjectOf(dismissIds) : ""}
        onClose={() => setDismissIds(null)}
        onConfirm={(d) => {
          const t = dismissIds ?? [];
          setDismissIds(null);
          triageNow(t, "dismissed", "row", d);
        }}
      />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );

  if (inbox.isPending) return <Spinner label="Loading the inbox" />;
  if (inbox.error)
    return <ApiErrorAlert error={inbox.error} title="Couldn't load the inbox" orgId={orgId} />;

  const helpButton = (
    <Button variant="ghost" size="sm" onClick={() => run("help")} aria-keyshortcuts={aria("help")}>
      <Keyboard aria-hidden />
      Keyboard shortcuts
      <KeyHint>?</KeyHint>
    </Button>
  );

  // The live region stays mounted (first child) across the list and inbox-zero views.
  const topBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {status}
      {helpButton}
    </div>
  );

  if (ids.length === 0) {
    return (
      <div className="space-y-3">
        {topBar}
        <section
          aria-labelledby={`${uid}-zero`}
          className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center"
        >
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-success-50 text-success-700">
            <PartyPopper className="h-5 w-5" aria-hidden />
          </div>
          <h2
            id={`${uid}-zero`}
            ref={zeroRef}
            tabIndex={-1}
            className="text-lg font-semibold text-neutral-900 outline-none"
          >
            Inbox zero
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
            Every new match has been shortlisted or dismissed. New grants are discovered daily and
            land here when they fit your mission.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              to="/orgs/$orgId/opportunities"
              params={{ orgId }}
              className={buttonClass({ variant: "secondary" })}
            >
              Browse all opportunities
            </Link>
          </div>
        </section>
        {dialogs}
      </div>
    );
  }

  const bulk = selectedIds.length > 0;
  const scope = bulk ? `${selectedIds.length} selected` : "";

  return (
    <div className="space-y-3">
      {topBar}
      <p id={domIds.hint} className="sr-only">
        Keyboard shortcuts: j or k to move between grants, s to shortlist, d to dismiss with a
        reason, o to open, x to select for bulk actions, Escape to clear the selection, question
        mark for help.
      </p>
      {!canEdit && (
        <Alert tone="info" title="View only">
          Ask an editor to shortlist or dismiss these grants.
        </Alert>
      )}
      <ApiErrorAlert error={triage.error} title="Couldn't update the grants" orgId={orgId} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section
          aria-labelledby={domIds.listHeading}
          className="min-w-0 rounded-lg border border-neutral-200 bg-white"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-3 py-2">
            {canEdit && (
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <Checkbox
                  ref={selectAllRef}
                  checked={allSelected}
                  onChange={(e) => setSelected(new Set(e.target.checked ? ids : []))}
                  aria-label={allSelected ? "Unselect all" : `Select all ${ids.length}`}
                />
                <span aria-hidden>{scope || "Select"}</span>
              </div>
            )}
            <h2 id={domIds.listHeading} className="sr-only">
              New matches
            </h2>
            <span className="text-sm text-neutral-500">
              {plural(total, "new match", "new matches")}
              {total > ids.length && ` (showing ${ids.length})`}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => run("prev")}
                aria-label="Previous grant"
                aria-keyshortcuts={aria("prev")}
                disabled={currentIndex <= 0}
              >
                <ChevronUp aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => run("next")}
                aria-label="Next grant"
                aria-keyshortcuts={aria("next")}
                disabled={currentIndex >= ids.length - 1}
              >
                <ChevronDown aria-hidden />
              </Button>
            </div>
          </div>

          {bulk && canEdit && (
            <div
              role="toolbar"
              aria-label="Bulk actions"
              className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-brand-50/50 px-3 py-2"
            >
              <span className="text-sm font-medium text-neutral-800">{scope}</span>
              <Button
                size="sm"
                onClick={() => run("shortlist")}
                aria-keyshortcuts={aria("shortlist")}
              >
                <BookmarkCheck aria-hidden />
                Shortlist {selectedIds.length}
                <KeyHint>s</KeyHint>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run("dismiss")}
                aria-keyshortcuts={aria("dismiss")}
              >
                Dismiss {selectedIds.length}…<KeyHint>d</KeyHint>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => run("clear")}
                aria-keyshortcuts={aria("clear")}
              >
                <X aria-hidden />
                Clear selection
                <KeyHint>Esc</KeyHint>
              </Button>
            </div>
          )}

          <ul
            ref={listRef}
            aria-labelledby={domIds.listHeading}
            aria-describedby={domIds.hint}
            className="divide-y divide-neutral-100 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto"
          >
            {items.map((item, i) => (
              <InboxRow
                key={item.id}
                item={item}
                index={i}
                count={ids.length}
                active={item.id === currentId}
                checked={selected.has(item.id)}
                canSelect={canEdit}
                detailId={domIds.detail}
                now={now}
                buttonRef={(el) => {
                  if (el) rowRefs.current.set(item.id, el);
                  else rowRefs.current.delete(item.id);
                }}
                onActivate={() => setActiveId(item.id)}
                onCheck={(on) => toggleOne(item.id, on)}
              />
            ))}
          </ul>
        </section>

        <section
          id={domIds.detail}
          aria-labelledby={current ? domIds.detailHeading : undefined}
          aria-label={current ? undefined : "Grant details"}
          className="min-w-0 self-start rounded-lg border border-neutral-200 bg-white p-5 lg:sticky lg:top-4"
        >
          {current && (
            <InboxDetail
              orgId={orgId}
              item={current}
              headingId={domIds.detailHeading}
              now={now}
              actions={
                <>
                  {canEdit && !bulk && (
                    <>
                      <Button
                        onClick={() => run("shortlist")}
                        aria-keyshortcuts={aria("shortlist")}
                      >
                        <BookmarkCheck aria-hidden />
                        Shortlist
                        <KeyHint>s</KeyHint>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => run("dismiss")}
                        aria-keyshortcuts={aria("dismiss")}
                      >
                        Dismiss…
                        <KeyHint>d</KeyHint>
                      </Button>
                    </>
                  )}
                  <Link
                    to="/orgs/$orgId/opportunities/$opportunityId"
                    params={{ orgId, opportunityId: current.opportunityId }}
                    aria-keyshortcuts={aria("open")}
                    className={buttonClass({ variant: "ghost" })}
                  >
                    <ExternalLink aria-hidden className="h-4 w-4" />
                    Open
                    <KeyHint>o</KeyHint>
                  </Link>
                </>
              }
            />
          )}
        </section>
      </div>

      {dialogs}
    </div>
  );
}

function InboxRow({
  item,
  index,
  count,
  active,
  checked,
  canSelect,
  detailId,
  now,
  buttonRef,
  onActivate,
  onCheck,
}: {
  item: InboxItemDto;
  index: number;
  count: number;
  active: boolean;
  checked: boolean;
  canSelect: boolean;
  detailId: string;
  now?: Date;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onActivate: () => void;
  onCheck: (on: boolean) => void;
}) {
  const uid = React.useId();
  return (
    <li
      data-active={active || undefined}
      className={cn(
        "flex items-start gap-3 px-3 py-3",
        active ? "bg-brand-50/70 ring-2 ring-inset ring-brand-500" : "hover:bg-neutral-50",
      )}
    >
      {canSelect && (
        <Checkbox
          className="mt-1"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={`Select ${item.opportunity.title}`}
          tabIndex={active ? 0 : -1}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        tabIndex={active ? 0 : -1}
        aria-current={active ? "true" : undefined}
        aria-controls={detailId}
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-meta`}
        onClick={onActivate}
        onFocus={onActivate}
        className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span id={`${uid}-title`} className="block font-medium text-neutral-900">
          {item.opportunity.title}
        </span>
        <span id={`${uid}-meta`} className="block">
          <span className="block truncate text-sm text-neutral-500">
            {item.opportunity.funderName}
            <span className="sr-only">
              , grant {index + 1} of {count}
            </span>
          </span>
          <RowSignals item={item} now={now} />
        </span>
      </button>
      {active && <Inbox className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
    </li>
  );
}
