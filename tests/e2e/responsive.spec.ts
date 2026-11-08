import { expect, test } from "@playwright/test";
import { login, resetDemo, USERS } from "./fixtures";

test.beforeAll(resetDemo);

test("mobile: menu opens, navigates and closes; no horizontal scroll", async ({ page }) => {
  await login(page, USERS.clientA);
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Documents" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");

  for (const path of ["/dashboard", "/projects", "/documents", "/messages"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
