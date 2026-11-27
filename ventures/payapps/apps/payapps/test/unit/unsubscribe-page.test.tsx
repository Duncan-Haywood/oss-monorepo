// @vitest-environment happy-dom
// The weekly email's /unsubscribe page: opening the link changes nothing; only the button POSTs.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UnsubscribePage } from "../../src/client/pages/unsubscribe";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function mount() {
  const rootRoute = createRootRoute({ component: UnsubscribePage });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router as never} />);
}

it("reads the link on load and turns the email off only when the button is pressed", async () => {
  window.history.replaceState(null, "", "/unsubscribe?o=org_1&u=usr_1&t=abc");
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const subscribed = method !== "POST";
      return new Response(JSON.stringify({ orgName: "Harbor Electric", subscribed }), {
        status: 200,
      });
    }),
  );
  mount();
  const button = await screen.findByRole("button", { name: "Stop the weekly email" });
  expect(screen.getByText(/Stop the weekly email for Harbor Electric\?/)).toBeInTheDocument();
  expect(calls).toEqual([{ url: "/api/unsubscribe/digest?o=org_1&u=usr_1&t=abc", method: "GET" }]);
  fireEvent.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "You won't get the weekly email for Harbor Electric any more.",
  );
  expect(calls[1]).toEqual({
    url: "/api/unsubscribe/digest?o=org_1&u=usr_1&t=abc",
    method: "POST",
  });
});

it("says when a link is not valid", async () => {
  window.history.replaceState(null, "", "/unsubscribe?o=org_1&u=usr_1&t=forged");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "not_found", message: "x" } }), {
          status: 404,
        }),
    ),
  );
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("This link is not valid.");
  expect(screen.queryByRole("button")).toBeNull();
});

it("stops the getting-started reminders from their own link, through their own endpoint", async () => {
  window.history.replaceState(null, "", "/unsubscribe?list=onboarding&o=org_1&u=usr_1&t=abc");
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      return new Response(
        JSON.stringify({ orgName: "Harbor Electric", subscribed: method !== "POST" }),
        { status: 200 },
      );
    }),
  );
  mount();
  const button = await screen.findByRole("button", { name: "Stop the reminders" });
  expect(screen.getByRole("heading")).toHaveTextContent("Getting-started reminders");
  expect(calls).toEqual([
    { url: "/api/unsubscribe/onboarding?o=org_1&u=usr_1&t=abc", method: "GET" },
  ]);
  fireEvent.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "You won't get any more getting-started reminders for Harbor Electric.",
  );
  expect(calls[1]?.url).toBe("/api/unsubscribe/onboarding?o=org_1&u=usr_1&t=abc");
});
