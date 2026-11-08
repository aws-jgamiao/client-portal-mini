import { expect, test } from "@playwright/test";
import { IDS, login, resetDemo, USERS } from "./fixtures";

test.beforeEach(resetDemo);

test("Client A runs the isolation check and every attempt is blocked", async ({ page }) => {
  await login(page, USERS.clientA);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Isolation check" }).click();
  await page.getByRole("button", { name: "Run the isolation check" }).click();
  await expect(page.getByText(/All 7 attempts against Harbour Physio \(Client B\) were blocked/)).toBeVisible();
  await expect(page.getByText("Exposed")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /42501/ })).toBeVisible();
});

test("Client B runs the check against Client A", async ({ page }) => {
  await login(page, USERS.clientB);
  await page.goto("/isolation-check");
  await page.getByRole("button", { name: "Run the isolation check" }).click();
  await expect(page.getByText(/All 7 attempts against Northwind Bakery \(Client A\) were blocked/)).toBeVisible();
});

test("editing the URL to another client's project returns a 404", async ({ page }) => {
  await login(page, USERS.clientA);
  const response = await page.goto(`/projects/${IDS.projectB1}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

  // Same response as an id that doesn't exist.
  const missing = await page.goto("/projects/00000000-0000-4000-8000-000000000000");
  expect(missing?.status()).toBe(404);
});

test("another client's document download returns the same 404 as a missing one", async ({ page }) => {
  await login(page, USERS.clientA);
  const other = await page.request.get(`/documents/${IDS.docB1}/download`, { maxRedirects: 0 });
  const missing = await page.request.get("/documents/00000000-0000-4000-8000-000000000000/download", { maxRedirects: 0 });
  expect(other.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await other.text()).toBe(await missing.text());
});

test("admin-only pages are not available to clients", async ({ page }) => {
  await login(page, USERS.clientA);
  for (const path of ["/clients", `/clients/${IDS.orgA}`, "/activity", "/projects/new"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("a client's org filter in the URL is ignored", async ({ page }) => {
  await login(page, USERS.clientA);
  await page.goto(`/messages?org=${IDS.orgB}`);
  await expect(page.getByRole("heading", { name: "Northwind Bakery" })).toBeVisible();
  await expect(page.getByText("Staff training went well")).toHaveCount(0);
});
