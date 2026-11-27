// E2E part 2: the rate-card spreadsheet import (paste from Excel, preview, save, re-import as an
// update), then an invited estimator: joins by the link, can quote, cannot change the rate card or
// the team, and the API refuses the same writes the page hides.
import { expect, test } from "@playwright/test";
import { api, card, field, RFQ_EMAIL, signUpWithShop, uniqueEmail } from "./helpers";

test("rate-card import, then an invited estimator's role limits", async ({
  page,
  browser,
  baseURL,
}) => {
  const { orgPath, orgId } = await signUpWithShop(page, { tag: "team", shop: "E2E Team Shop" });

  // Paste two machines with a header row, as copied from a spreadsheet.
  const importCard = card(page, "Import from a spreadsheet");
  await importCard.getByRole("button", { name: "Import…" }).click();
  await expect(field(importCard, "What the sheet holds")).toHaveValue("machines");
  const paste = field(
    importCard,
    "…or paste the rows, header included, from Excel or Google Sheets",
  );
  await paste.fill(
    "Machine\tKind\tHourly rate\nHaas VF-2\t3-axis mill\t$95\nOkuma LB3000\tlathe\t$110",
  );
  const plan = importCard.locator("table tbody tr");
  await expect(plan).toHaveCount(2);
  await expect(plan.nth(0)).toContainText("Haas VF-2");
  await expect(plan.nth(0)).toContainText("new");
  await expect(plan.nth(1)).toContainText("Okuma LB3000");
  await importCard.getByRole("button", { name: "Save 2 rows" }).click();
  await expect(importCard.getByText("Saved: 2 added, 0 updated.")).toBeVisible();
  const machines = card(page, "Machines and work centers");
  await expect(machines.getByRole("cell", { name: "Haas VF-2" })).toBeVisible();
  await expect(machines.getByRole("cell", { name: "Okuma LB3000" })).toBeVisible();

  // The same sheet with one rate changed updates that row; the unchanged one says so.
  await paste.fill(
    "Machine\tKind\tHourly rate\nHaas VF-2\t3-axis mill\t$105\nOkuma LB3000\tlathe\t$110",
  );
  await expect(plan.nth(0)).toContainText(/updates /);
  await expect(plan.nth(1)).toContainText("no change");
  await importCard.getByRole("button", { name: "Save 2 rows" }).click();
  await expect(importCard.getByText("Saved: 0 added, 1 updated.")).toBeVisible();
  await expect(machines.getByRole("row", { name: /Haas VF-2/ })).toContainText("105");

  // Invite an estimator; the link is shown once.
  await page.getByRole("link", { name: "Team" }).click();
  const invite = card(page, "Invite");
  const estimatorEmail = uniqueEmail("estimator");
  await field(invite, "Email").fill(estimatorEmail);
  await field(invite, "Role").selectOption("estimator");
  await invite.getByRole("button", { name: "Create invitation link" }).click();
  const link = ((await invite.locator("code").textContent()) ?? "").trim();
  expect(link).toMatch(/\/invite\/[^/]+$/);
  await expect(invite.getByText(estimatorEmail)).toBeVisible();

  // The estimator, in a browser of their own, signs up from the link and accepts.
  const ctx = await browser.newContext({ baseURL });
  const est = await ctx.newPage();
  await est.goto(new URL(link).pathname);
  await expect(est.getByRole("heading", { name: "You're invited" })).toBeVisible();
  await est.getByRole("link", { name: "Create account" }).click();
  await field(est, "Name").fill("Invited Estimator");
  await field(est, "Email").fill(estimatorEmail);
  await field(est, "Password").fill("e2e-password-only");
  await est.getByRole("button", { name: "Create account" }).click();
  await expect(est.getByRole("heading", { name: "Join the shop" })).toBeVisible();
  await est.getByRole("button", { name: "Accept invitation" }).click();
  await est.waitForURL(new RegExp(`${orgPath}$`));
  const agree = est.getByRole("button", { name: "I agree" });
  if (await agree.isVisible().catch(() => false)) await agree.click();

  // Rate card: read only, no import, no add buttons.
  await est.goto(`${orgPath}/rate-card`);
  await expect(est.getByText("Only owners and admins can change the rate card.")).toBeVisible();
  const estMachines = card(est, "Machines and work centers");
  await expect(estMachines.getByRole("cell", { name: "Haas VF-2" })).toBeVisible();
  await expect(estMachines.getByRole("button", { name: "Add machine" })).toHaveCount(0);
  await expect(card(est, "Import from a spreadsheet")).toHaveCount(0);

  // Team: sees members, cannot invite or change roles.
  await est.goto(`${orgPath}/team`);
  await expect(card(est, "Members").getByText(estimatorEmail)).toBeVisible();
  await expect(card(est, "Invite")).toHaveCount(0);
  await expect(est.getByRole("combobox", { name: /^Role of / })).toHaveCount(0);

  // The API refuses the writes the page hides. The same request style is allowed for a quote, so
  // the 403s are the role check, not the Origin check.
  const write = (method: string, path: string, data: unknown) =>
    est.request.fetch(path, { method, data, headers: { Origin: baseURL ?? "" } });
  expect(
    (await write("POST", `/api/orgs/${orgId}/quotes`, { customerCompany: "Control Co" })).status(),
  ).toBe(201);
  const refused = async (method: string, path: string, data: unknown) => {
    expect((await write(method, path, data)).status(), `${method} ${path}`).toBe(403);
  };
  await refused("POST", `/api/orgs/${orgId}/rate-card/machines`, {
    name: "Sneaky mill",
    kind: "mill_3axis",
    hourlyRateCents: 100,
  });
  await refused("POST", `/api/orgs/${orgId}/members/invitations`, {
    email: uniqueEmail("x"),
    role: "admin",
  });

  // But an estimator quotes: an RFQ goes in and is read.
  await est.goto(`${orgPath}/rfqs`);
  const newRfq = card(est, "New RFQ");
  await field(newRfq, "Subject").fill("RFQ from the estimator");
  await field(newRfq, "Paste the RFQ email").fill(RFQ_EMAIL);
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await est.waitForURL(/\/rfqs\/[^/]+$/);
  await expect(card(est, /^BRK-1001/)).toBeVisible();

  // Back as the owner: the estimator is a member with that role, and the RFQ is in the shop's list.
  const members = await api<{ items: { email: string; role: string }[] }>(
    page.request,
    baseURL ?? "",
    "GET",
    `/api/orgs/${orgId}/members`,
  );
  expect(members.items.find((m) => m.email === estimatorEmail)?.role).toBe("estimator");
  await page.goto(`${orgPath}/rfqs`);
  await expect(page.getByText("RFQ from the estimator")).toBeVisible();
  await ctx.close();
});
