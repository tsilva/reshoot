import { expect, it } from "vitest";
import { POST } from "../app/api/account/demo-checkouts/route";
it("retires direct simulated credit grants", async () => {
  const response = await POST();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ error: { code: "checkout_replaced" } });
});
