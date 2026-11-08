// Captures README screenshots from the running app (synthetic demo data only).
//   npx playwright test -c playwright.screenshots.config.ts
import { test } from "@playwright/test";
import { login, resetDemo, USERS } from "../e2e/fixtures";

const out = (name: string) => `docs/screenshots/${name}.png`;

// Wait until streamed content has replaced the loading skeleton.
async function ready(page: import("@playwright/test").Page) {
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.locator(".animate-pulse").waitFor({ state: "detached" }).catch(() => {});
  await page.waitForLoadState("networkidle");
}

test.beforeAll(resetDemo);

test("capture", async ({ page, browser }) => {
  await page.goto("/");
  await ready(page);
  await page.screenshot({ path: out("01-landing"), fullPage: true });

  await login(page, USERS.clientA);
  await ready(page);
  await page.screenshot({ path: out("02-client-dashboard"), fullPage: true });

  await page.goto("/isolation-check");
  await page.getByRole("button", { name: "Run the isolation check" }).click();
  await page.getByText(/were blocked/).waitFor();
  await ready(page);
  await page.screenshot({ path: out("03-isolation-check"), fullPage: true });

  await page.goto("/onboarding");
  await ready(page);
  await page.screenshot({ path: out("04-onboarding"), fullPage: true });

  const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(admin, USERS.admin);
  await ready(admin);
  await admin.screenshot({ path: out("05-admin-dashboard"), fullPage: true });
  await admin.goto("/documents");
  await ready(admin);
  await admin.screenshot({ path: out("06-admin-documents"), fullPage: true });

  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(mobile, USERS.clientB);
  await ready(mobile);
  await mobile.screenshot({ path: out("07-mobile-dashboard"), fullPage: false });
});
