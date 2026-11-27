// @vitest-environment happy-dom
import type { ReminderSettingDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReminderSwitch } from "../../src/client/components/getting-started";

afterEach(() => vi.unstubAllGlobals());

function mount(first: ReminderSettingDto, afterSave: ReminderSettingDto) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(init?.method === "PUT" ? afterSave : first),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ReminderSwitch orgId="org_1" />
    </QueryClientProvider>,
  );
  return { fetchMock, view };
}

it("shows an owner the switch on, and switching it off sends on: false", async () => {
  const { fetchMock } = mount({ sentToRole: true, on: true }, { sentToRole: true, on: false });
  const box = await screen.findByLabelText("Email me a reminder about the next step");
  expect(box).toBeChecked();
  fireEvent.click(box);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/getting-started/reminders");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(String(init.body))).toEqual({ on: false });
  await waitFor(() => expect(box).not.toBeChecked());
});

it("shows nothing to a member who is sent no reminders", async () => {
  const { fetchMock, view } = mount(
    { sentToRole: false, on: true },
    { sentToRole: false, on: true },
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(view.container.textContent).toBe("");
});
