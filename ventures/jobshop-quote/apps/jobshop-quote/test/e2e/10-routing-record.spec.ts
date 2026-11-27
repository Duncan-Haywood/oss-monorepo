// Win/loss by routing, part 4: the quote line shows which saved routing win/loss counts it under,
// and the estimator can take it off. A line built from "Plate" and tuned into something else then
// counts under "No saved routing" once saved (an empty record, never re-matched by operations).
import { expect, test } from "@playwright/test";
import type { QuoteDetailDto, RateCardDto } from "../../src/shared/api";
import { addBasicRateCard, api, signUpWithShop } from "./helpers";

test("a line shows the routing it is counted under, and clearing it is saved", async ({
  page,
  baseURL,
}) => {
  const { orgId, orgPath } = await signUpWithShop(page, {
    tag: "routing-rec",
    shop: "E2E Routings",
  });
  await addBasicRateCard(page);
  const base = baseURL ?? "";
  const call = <T>(method: string, path: string, data?: unknown) =>
    api<T>(page.request, base, method, `/api/orgs/${orgId}${path}`, data);

  const rc = await call<RateCardDto>("GET", "/rate-card");
  const mill = rc.machines[0]?.id as string;
  const op = { machineId: mill, label: "OP10", setupMinutes: 60, cycleMinutesPerPart: 12 };
  const plate = await call<{ id: string }>("POST", "/routings", {
    name: "Plate",
    partFamily: "Plates",
    operations: [op],
    finishing: [],
  });
  const q = await call<QuoteDetailDto>("POST", "/quotes", { customerCompany: "Rec Co" });
  const withLine = await call<QuoteDetailDto>("POST", `/quotes/${q.id}/lines`, {
    partNumber: "PL-7",
    revision: "A",
    inputs: {
      quantities: [10],
      material: {
        materialId: rc.materials[0]?.id as string,
        blank: { shape: "weight", weightLb: 2 },
        partsPerStock: null,
      },
      operations: [op],
    },
  });
  const lineId = withLine.lines[0]?.id as string;
  await call("PATCH", `/quotes/${q.id}/lines/${lineId}`, { routingIds: [plate.id] });

  await page.goto(`${orgPath}/quotes/${q.id}`);
  const record = page.getByTestId("routing-record");
  await expect(record).toContainText("Win/loss counts this line under:");
  await expect(record).toContainText("Plates: Plate");

  await record.getByRole("button", { name: "Stop counting this line under Plate" }).click();
  await expect(record).toContainText('counted under "No saved routing"');
  await expect(page.getByText("unsaved")).toBeVisible();
  await page.getByRole("button", { name: "Save line" }).click();
  await expect(page.getByText("unsaved")).toHaveCount(0);

  const saved = await call<QuoteDetailDto>("GET", `/quotes/${q.id}`);
  expect(saved.lines[0]?.routingIds).toEqual([]);
  // A reload keeps it: the record came from the server, not the editor's state.
  await page.reload();
  await expect(page.getByTestId("routing-record")).toContainText(
    'counted under "No saved routing"',
  );
});
