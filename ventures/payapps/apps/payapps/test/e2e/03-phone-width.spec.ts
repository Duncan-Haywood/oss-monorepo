// Subcontractors check a pay app from the truck. At a 390 px phone width, no page on the first-pay-app
// path may scroll sideways as a whole (wide tables scroll inside their own box, which is fine).
import { expect, type Page, test } from "@playwright/test";
import { addSovLines, createJob, signUpWithCompany } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function expectNoSidewaysScroll(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const { scroll, client, culprits } = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    // The outermost elements that stick out past the window while their parent fits: what to fix.
    const culprits = [...document.querySelectorAll("main *")]
      .filter((el) => {
        const parent = el.parentElement?.getBoundingClientRect();
        return (
          el.getBoundingClientRect().right > client + 1 && parent && parent.right <= client + 1
        );
      })
      .map(
        (el) =>
          `<${el.tagName.toLowerCase()} class="${el.className}"> "${(el.textContent ?? "").trim().slice(0, 50)}"`,
      );
    return { scroll: document.documentElement.scrollWidth, client, culprits };
  });
  expect(
    scroll,
    `${label}: page is ${scroll}px wide in a ${client}px window; sticking out:\n${culprits.join("\n")}`,
  ).toBeLessThanOrEqual(client);
}

test("the first-pay-app path fits a phone", async ({ page }) => {
  await page.goto("/?signup");
  await expectNoSidewaysScroll(page, "sign-up");
  const { orgPath } = await signUpWithCompany(page, { tag: "phone", company: "Phone Framing Co" });
  await expectNoSidewaysScroll(page, "company page");
  await createJob(page, {
    name: "Oak Street Duplex",
    number: "P-1",
    gc: "Northline",
    owner: "Oak LLC",
    contractSum: "60,000",
  });
  await addSovLines(page, [
    ["1", "Walls", "40,000"],
    ["2", "Roof framing", "20,000"],
  ]);
  await expectNoSidewaysScroll(page, "job page");
  await page.getByRole("button", { name: "New pay application" }).click();
  await page.waitForURL(/\/pay-apps\/[^/]+$/);
  await expectNoSidewaysScroll(page, "pay application");
  // The job's own logs: the submittal log's "Transmittals ask the GC" select once pushed it to 417px.
  const jobPath = new URL(page.url()).pathname.replace(/\/pay-apps\/[^/]+$/, "");
  for (const sub of [
    "submittals",
    "daily-reports",
    "tm-tickets",
    "job-cost",
    "certified-payroll",
    "sworn-statement",
  ]) {
    await page.goto(`${jobPath}/${sub}`);
    await expectNoSidewaysScroll(page, sub);
  }
  for (const sub of [
    "cash",
    "billing",
    "team",
    "quickbooks",
    "insurance",
    "documents",
    "estimates",
    "price-list",
    "crews",
    "timesheets",
    "wip",
  ]) {
    await page.goto(`${orgPath}/${sub}`);
    await expectNoSidewaysScroll(page, sub);
  }
});
