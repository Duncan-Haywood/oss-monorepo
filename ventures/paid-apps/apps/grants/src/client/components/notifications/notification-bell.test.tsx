// @vitest-environment happy-dom
import type { NotificationDto } from "@shared/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bellLabel, NOTIFICATION_POLL_MS, NotificationBell } from "./notification-bell";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const ORG = "org_1";

interface Call {
  method: string;
  path: string;
}

function mockApi(state: { unread: number; items: NotificationDto[] }) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(`/api/orgs/${ORG}`, "");
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, path });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (method === "GET" && path === "/notifications/count") return json({ unread: state.unread });
    if (method === "GET" && path.startsWith("/notifications?"))
      return json({ items: state.items, nextCursor: null });
    if (method === "POST" && path === "/notifications/read-all") {
      const updated = state.unread;
      state.unread = 0;
      state.items = state.items.map((n) => ({ ...n, readAt: n.readAt ?? "2026-11-19T12:00:00Z" }));
      return json({ updated });
    }
    const m = /^\/notifications\/([^/]+)\/read$/.exec(path);
    if (method === "POST" && m) {
      const n = state.items.find((i) => i.id === decodeURIComponent(m[1] ?? ""));
      if (!n) return json({ error: { code: "not_found", message: "Notification not found" } }, 404);
      if (!n.readAt) state.unread -= 1;
      n.readAt = n.readAt ?? "2026-11-19T12:00:00Z";
      return json(n);
    }
    return json({ error: { code: "not_found", message: "no mock" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, to: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key) };
}

function renderBell(props: { poll?: boolean } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationBell orgId={ORG} {...props} />
    </QueryClientProvider>,
  );
}

const make = (over: Partial<NotificationDto>): NotificationDto => ({
  id: "ntf_1",
  kind: "application.ready_for_review",
  title: "Ready for review: Youth STEM",
  body: "Check the draft and approve it in one click.",
  link: `/orgs/${ORG}/applications/app_1`,
  severity: "action",
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  navigate.mockReset();
});

describe("NotificationBell", () => {
  it("labels the button with the unread count and shows a badge only when unread", async () => {
    expect(bellLabel(0)).toBe("Notifications, 0 unread");
    expect(bellLabel(1)).toBe("Notifications, 1 unread");
    mockApi({ unread: 3, items: [] });
    renderBell();
    const bell = await screen.findByRole("button", { name: "Notifications, 3 unread" });
    expect(within(bell).getByTestId("notification-badge")).toHaveTextContent("3");
  });

  it("caps the badge at 99+ and hides it at zero", async () => {
    mockApi({ unread: 250, items: [] });
    const { unmount } = renderBell();
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("99+");
    expect(screen.getByRole("button", { name: "Notifications, 250 unread" })).toBeInTheDocument();
    unmount();
    mockApi({ unread: 0, items: [] });
    renderBell();
    expect(
      await screen.findByRole("button", { name: "Notifications, 0 unread" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("notification-badge")).toBeNull();
  });

  it("polls the unread count every 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = { unread: 1, items: [] };
    const api = mockApi(state);
    renderBell();
    await screen.findByRole("button", { name: "Notifications, 1 unread" });
    expect(api.to("GET /notifications/count")).toHaveLength(1);

    state.unread = 4;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS);
    });
    await screen.findByRole("button", { name: "Notifications, 4 unread" });
    expect(api.to("GET /notifications/count")).toHaveLength(2);
  });

  it("does not poll when poll is off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockApi({ unread: 1, items: [] });
    renderBell({ poll: false });
    await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS * 3);
    });
    expect(api.to("GET /notifications/count")).toHaveLength(1);
  });

  it("lists notifications, navigates client-side on click and marks the item read", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      unread: 1,
      items: [
        make({}),
        make({
          id: "ntf_2",
          kind: "submission.sent",
          title: "Submitted: Arts grant",
          severity: "success",
          readAt: "2026-11-18T00:00:00Z",
          link: `/orgs/${ORG}/applications/app_2`,
        }),
      ],
    });
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    const list = await within(panel).findByRole("list", { name: "Latest notifications" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Unread:", { exact: false })).toBeInTheDocument();
    expect(within(list).getAllByText("5m ago")).toHaveLength(2);

    const link = within(list).getByRole("link", { name: /Ready for review: Youth STEM/ });
    expect(link).toHaveAttribute("href", `/orgs/${ORG}/applications/app_1`);
    await user.click(link);

    expect(navigate).toHaveBeenCalledWith({ href: `/orgs/${ORG}/applications/app_1` });
    await waitFor(() => expect(api.to("POST /notifications/ntf_1/read")).toHaveLength(1));
    // A read notification is not marked again; the dropdown closed on navigation.
    expect(api.to("POST /notifications/ntf_2/read")).toHaveLength(0);
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Notifications, 0 unread" }),
    ).toBeInTheDocument();
  });

  it("marks a single item read from its button, and all read from the header", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      unread: 2,
      items: [make({}), make({ id: "ntf_2", title: "Needs your input: Arts grant" })],
    });
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    await user.click(
      await screen.findByRole("button", { name: "Mark as read: Needs your input: Arts grant" }),
    );
    await waitFor(() => expect(api.to("POST /notifications/ntf_2/read")).toHaveLength(1));
    expect(navigate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Mark as read: Needs your input: Arts grant" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect(api.to("POST /notifications/read-all")).toHaveLength(1));
    expect(
      await screen.findByRole("button", { name: "Notifications, 0 unread" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Mark as read/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Mark all read/ })).toBeDisabled();
  });

  it("never renders an unsafe link and shows an empty state", async () => {
    const user = userEvent.setup();
    mockApi({
      unread: 1,
      items: [make({ link: "//evil.example/phish", title: "Odd link" })],
    });
    const { unmount } = renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const list = await screen.findByRole("list", { name: "Latest notifications" });
    expect(within(list).getByText("Odd link")).toBeInTheDocument();
    expect(within(list).queryByRole("link")).toBeNull();
    unmount();

    mockApi({ unread: 0, items: [] });
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 0 unread" }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });
});
