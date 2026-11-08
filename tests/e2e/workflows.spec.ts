import { expect, test } from "@playwright/test";
import { makePdf } from "../../src/lib/seed-files";
import { login, resetDemo, USERS } from "./fixtures";

test.beforeEach(resetDemo);

test("admin creates a project with a milestone and the client sees it", async ({ page, browser }) => {
  await login(page, USERS.admin);
  await page.goto("/projects/new");
  await page.getByLabel("Client").selectOption({ label: "Northwind Bakery" });
  await page.getByLabel("Project name").fill("Loyalty programme");
  await page.getByLabel("Status").selectOption("in_progress");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Loyalty programme", level: 1 })).toBeVisible();

  await page.getByLabel("Title").fill("Reward tiers agreed");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Reward tiers agreed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Mark done\s*: Reward tiers agreed/ }).click();
  await expect(page.getByText("Milestone \"Reward tiers agreed\" completed")).toBeVisible();

  const clientPage = await (await browser.newContext()).newPage();
  await login(clientPage, USERS.clientA);
  await clientPage.goto("/projects");
  await clientPage.getByRole("link", { name: "Loyalty programme" }).click();
  await expect(clientPage.getByText("1 of 1 complete")).toBeVisible();
  await expect(clientPage.getByRole("button", { name: /Mark done/ })).toHaveCount(0);
});

test("project form validation keeps input and explains the error", async ({ page }) => {
  await login(page, USERS.admin);
  await page.goto("/projects/new");
  await page.getByLabel("Client").selectOption({ label: "Harbour Physio" });
  await page.getByLabel("Project name").fill("Clinic signage");
  await page.getByLabel("Start date").fill("2026-12-10");
  await page.getByLabel("Due date").fill("2026-12-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Due date can't be before the start date.")).toBeVisible();
  await expect(page.getByLabel("Project name")).toHaveValue("Clinic signage");
});

test("client completes an onboarding step", async ({ page }) => {
  await login(page, USERS.clientA);
  await page.goto("/onboarding");
  const step = page.getByRole("checkbox", { name: /Mark as done: Grant domain registrar access/ });
  await step.click();
  await expect(page.getByRole("checkbox", { name: /Mark as not done: Grant domain registrar access/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("3 of 3 · 100%")).toBeVisible();
});

test("client and agency exchange messages", async ({ page, browser }) => {
  await login(page, USERS.clientB);
  await page.goto("/messages");
  await page.getByLabel("Write a message").fill("Can we move go-live to Monday?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Can we move go-live to Monday?")).toBeVisible();
  await expect(page.getByLabel("Write a message")).toHaveValue("");

  const admin = await (await browser.newContext()).newPage();
  await login(admin, USERS.admin);
  await admin.goto("/dashboard");
  await expect(admin.getByText("Can we move go-live to Monday?")).toBeVisible();
});

test("admin uploads a document; the client downloads it; internal files stay hidden", async ({ page, browser }) => {
  await login(page, USERS.admin);
  await page.goto("/documents");
  await page.getByRole("link", { name: "Northwind Bakery" }).click();
  await page.getByLabel("File").setInputFiles({ name: "Launch checklist.pdf", mimeType: "application/pdf", buffer: Buffer.from(makePdf(["Launch checklist"])) });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText('"Launch checklist.pdf" uploaded.')).toBeVisible();

  // A disguised file is rejected with a clear message.
  await page.getByLabel("File").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ not really a pdf") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(/contents don't match its extension/).first()).toBeVisible();

  const client = await (await browser.newContext()).newPage();
  await login(client, USERS.clientA);
  await client.goto("/documents");
  await expect(client.getByText("Internal estimate.csv")).toHaveCount(0);
  const downloadPromise = client.waitForEvent("download");
  await client.getByRole("link", { name: /^Download\s*: Launch checklist\.pdf/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Launch checklist.pdf");
});

test("admin invites a client user who joins the right organization", async ({ page, browser }) => {
  await login(page, USERS.admin);
  await page.goto("/clients");
  await page.getByRole("link", { name: "Harbour Physio" }).click();
  const email = `new-physio-${Date.now()}@example.com`;
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const link = await page.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);

  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(new URL(link).pathname);
  await expect(invitee.getByRole("heading", { name: "Join Harbour Physio" })).toBeVisible();
  await invitee.getByLabel("Your full name").fill("Nadia Physio");
  await invitee.getByLabel("Choose a password").fill("Physio!2026");
  await invitee.getByRole("button", { name: "Accept and continue" }).click();
  await expect(invitee).toHaveURL(/\/dashboard$/);
  await expect(invitee.getByText("Harbour Physio").first()).toBeVisible();

  // The link can't be used twice.
  const reuse = await (await browser.newContext()).newPage();
  await reuse.goto(new URL(link).pathname);
  await expect(reuse.getByRole("heading", { name: "Invitation not available" })).toBeVisible();
});
