// In-app notification bell (OWNER: notifications): unread badge polled every 30 s, a dropdown with the
// latest notifications, mark read / mark all read, and links that navigate client-side.
import { HrefLink } from "@client/components/layout/href-link";
import { Popover, Spinner, type Tone, toneDotClass } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import {
  isSafeAppLink,
  type NotificationCountDto,
  type NotificationDto,
  type NotificationListDto,
  type NotificationSeverity,
} from "@shared/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck } from "lucide-react";
import * as React from "react";

export const NOTIFICATION_POLL_MS = 30_000;
const PAGE_SIZE = 20;

export const notificationKeys = {
  all: (orgId: string) => ["orgs", orgId, "notifications"] as const,
  count: (orgId: string) => ["orgs", orgId, "notifications", "count"] as const,
  list: (orgId: string) => ["orgs", orgId, "notifications", "list"] as const,
};

const SEVERITY_TONE: Record<NotificationSeverity, Tone> = {
  info: "info",
  success: "success",
  warning: "warning",
  action: "brand",
};

/** Accessible name for the bell button; always includes the unread count. */
export function bellLabel(unread: number): string {
  return unread === 1 ? "Notifications, 1 unread" : `Notifications, ${unread} unread`;
}

/** "just now", "5m ago", "3h ago", "2d ago", else a date. */
function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}

export function NotificationBell({
  orgId,
  poll = true,
  className,
}: {
  orgId: string;
  /**
   * Poll the unread count every 30 s. Turn off for a second bell on the same page (e.g. the mobile
   * top bar next to an always-mounted sidebar bell): both read the same query cache.
   */
  poll?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();

  const count = useQuery({
    queryKey: notificationKeys.count(orgId),
    queryFn: () => api<NotificationCountDto>(orgApi(orgId, "/notifications/count")),
    refetchInterval: poll ? NOTIFICATION_POLL_MS : false,
    refetchIntervalInBackground: false,
    enabled: !!orgId,
  });
  const list = useQuery({
    queryKey: notificationKeys.list(orgId),
    queryFn: () => api<NotificationListDto>(orgApi(orgId, `/notifications?limit=${PAGE_SIZE}`)),
    enabled: open && !!orgId,
    staleTime: 0,
    refetchInterval: open ? NOTIFICATION_POLL_MS : false,
  });
  const unread = count.data?.unread ?? 0;

  const refresh = () => void qc.invalidateQueries({ queryKey: notificationKeys.all(orgId) });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      api<NotificationDto>(orgApi(orgId, `/notifications/${encodeURIComponent(id)}/read`), {
        method: "POST",
      }),
    onSuccess: (row) => {
      qc.setQueryData<NotificationListDto>(notificationKeys.list(orgId), (old) =>
        old ? { ...old, items: old.items.map((n) => (n.id === row.id ? row : n)) } : old,
      );
      refresh();
    },
  });
  const markAll = useMutation({
    mutationFn: () =>
      api<{ updated: number }>(orgApi(orgId, "/notifications/read-all"), { method: "POST" }),
    onSuccess: () => {
      const at = new Date().toISOString();
      qc.setQueryData<NotificationListDto>(notificationKeys.list(orgId), (old) =>
        old ? { ...old, items: old.items.map((n) => ({ ...n, readAt: n.readAt ?? at })) } : old,
      );
      qc.setQueryData<NotificationCountDto>(notificationKeys.count(orgId), { unread: 0 });
      refresh();
    },
  });

  const onOpenItem = (n: NotificationDto) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      label="Notifications"
      className="w-96 p-0"
      trigger={
        <button
          type="button"
          aria-label={bellLabel(unread)}
          className={cn(
            "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            className,
          )}
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              data-testid="notification-badge"
              className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">Notifications</h2>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={unread === 0 || markAll.isPending}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-50"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          Mark all read
        </button>
      </div>
      <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
        {list.isPending ? (
          <Spinner className="px-4 py-6" label="Loading notifications" />
        ) : list.isError ? (
          <div role="alert" className="px-4 py-6 text-sm text-neutral-600">
            We couldn't load your notifications.{" "}
            <button
              type="button"
              onClick={() => void list.refetch()}
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : list.data.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">You're all caught up.</p>
        ) : (
          <ul aria-label="Latest notifications" className="divide-y divide-neutral-100">
            {list.data.items.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                onOpen={() => onOpenItem(n)}
                onMarkRead={() => markRead.mutate(n.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </Popover>
  );
}

function NotificationItem({
  n,
  onOpen,
  onMarkRead,
}: {
  n: NotificationDto;
  onOpen: () => void;
  onMarkRead: () => void;
}) {
  const isUnread = !n.readAt;
  const content = (
    <>
      <span className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            isUnread ? toneDotClass[SEVERITY_TONE[n.severity]] : "bg-transparent",
          )}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm",
              isUnread ? "font-semibold text-neutral-900" : "text-neutral-700",
            )}
          >
            {isUnread && <span className="sr-only">Unread: </span>}
            {n.title}
          </span>
          {n.body && <span className="mt-0.5 block text-xs text-neutral-600">{n.body}</span>}
          <time dateTime={n.createdAt} className="mt-1 block text-xs text-neutral-400">
            {timeAgo(n.createdAt)}
          </time>
        </span>
      </span>
    </>
  );
  const link = isSafeAppLink(n.link) ? n.link : null;
  return (
    <li className={cn("flex items-start gap-1 pr-2", isUnread && "bg-brand-50/40")}>
      {link ? (
        <HrefLink
          href={link}
          onClick={onOpen}
          className="min-w-0 flex-1 px-4 py-3 outline-none hover:bg-neutral-50 focus-visible:bg-neutral-100"
        >
          {content}
        </HrefLink>
      ) : (
        <div className="min-w-0 flex-1 px-4 py-3">{content}</div>
      )}
      {isUnread && (
        <button
          type="button"
          onClick={onMarkRead}
          aria-label={`Mark as read: ${n.title}`}
          className="mt-2.5 rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
