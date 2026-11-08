import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login, resetDemo, USERS } from "./fixtures";

test.beforeAll(resetDemo);

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s) - ${v.help}`)).toEqual([]);
}

test("public pages", async ({ page }) => {
  for (const path of ["/", "/login", "/forgot-password"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
});

test("client pages", async ({ page }) => {
  await login(page, USERS.clientA);
  for (const path of ["/dashboard", "/projects", "/onboarding", "/documents", "/messages", "/profile", "/isolation-check"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
});

test("admin pages", async ({ page }) => {
  await login(page, USERS.admin);
  for (const path of ["/dashboard", "/clients", "/projects/new", "/activity"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
});

test("keyboard: skip link and visible focus", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});
