// @vitest-environment happy-dom
import { gettingStarted } from "@shared/getting-started";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { GettingStartedView } from "../../src/client/components/getting-started";

it("shows progress, links the next step and marks done steps", async () => {
  const data = gettingStarted({
    jobs: [{ id: "prj_1", name: "Warehouse", sovLineCount: 4, payApps: [] }],
    hasSample: false,
    memberCount: 1,
    pendingInvitationCount: 0,
    quickbooksConnected: false,
    quickbooksOnPlan: true,
  });
  const rootRoute = createRootRoute({
    component: () => <GettingStartedView orgId="org_1" data={data} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router as never} />);
  expect(await screen.findByText("2 of 5 done")).toBeInTheDocument();
  const next = screen.getByRole("link", { name: "Start your first pay application" });
  expect(next.getAttribute("href")).toBe("/orgs/org_1/projects/prj_1");
  expect(screen.getByText("next")).toBeInTheDocument();
  // Done steps are not links.
  expect(screen.queryByRole("link", { name: "Add your first job" })).toBeNull();
  expect(screen.getByText("Warehouse has 4 lines.")).toBeInTheDocument();
});
