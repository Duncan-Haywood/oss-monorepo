// Two subcontractors in two browsers: neither can read or change the other's job, pay application or
// downloads, by the page or by the API, even with the exact URLs.
import { expect, test } from "@playwright/test";
import { addSovLines, createJob, signUpWithCompany } from "./helpers";

test("one company's job, pay app and PDF are closed to another company", async ({ browser }) => {
  const a = await browser.newPage();
  const { orgId } = await signUpWithCompany(a, { tag: "tenant-a", company: "Alpha Electric" });
  await createJob(a, {
    name: "Harbor Lofts",
    number: "A-77",
    gc: "Keystone GC",
    owner: "Harbor LLC",
    contractSum: "80,000",
  });
  const projectPath = new URL(a.url()).pathname;
  const projectId = projectPath.split("/").at(-1) as string;
  await addSovLines(a, [["1", "Rough-in", "80,000"]]);
  await a.getByRole("button", { name: "New pay application" }).click();
  await a.waitForURL(/\/pay-apps\/[^/]+$/);
  const payAppPath = new URL(a.url()).pathname;
  const payAppId = payAppPath.split("/").at(-1) as string;
  const pdfHref = await a.getByRole("link", { name: "PDF", exact: true }).getAttribute("href");
  expect(pdfHref).toBeTruthy();

  const b = await (await browser.newContext()).newPage();
  await signUpWithCompany(b, { tag: "tenant-b", company: "Bravo Mechanical" });

  // The pages: nothing of Alpha's job shows.
  await b.goto(payAppPath);
  await expect(b.getByRole("heading", { level: 1, name: /Pay application #1/ })).toHaveCount(0);
  await expect(b.getByText("Harbor Lofts")).toHaveCount(0);
  await b.goto(projectPath);
  await expect(b.getByRole("heading", { level: 1, name: /Harbor Lofts/ })).toHaveCount(0);

  // The API, with B's session cookie: reads, writes and the PDF are refused.
  const base = `/api/orgs/${orgId}`;
  for (const path of [
    `${base}/projects`,
    `${base}/projects/${projectId}`,
    `${base}/projects/${projectId}/pay-apps/${payAppId}`,
    pdfHref as string,
  ]) {
    const res = await b.request.get(path);
    expect([403, 404], `${path} answered ${res.status()}`).toContain(res.status());
  }
  const write = await b.request.post(`${base}/projects`, {
    data: { name: "Planted", gcName: "x", originalContractSumCents: 100, retainagePctBps: 1000 },
  });
  expect([403, 404]).toContain(write.status());
  const del = await b.request.delete(`${base}/projects/${projectId}/pay-apps/${payAppId}`);
  expect([403, 404]).toContain(del.status());

  // Alpha still has its draft, untouched.
  await a.reload();
  await expect(
    a.getByRole("heading", { level: 1, name: "Pay application #1 draft" }),
  ).toBeVisible();
});
