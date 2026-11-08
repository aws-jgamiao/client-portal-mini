import { expect, test } from "@playwright/test";
import { login, resetDemo, USERS } from "./fixtures";

test.beforeAll(resetDemo);

test("signed-out visitors are sent to login and returned afterwards", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects/);
  await page.getByLabel("Email").fill(USERS.clientA);
  await page.getByLabel("Password", { exact: true }).fill("DemoPortal!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
});

test("a wrong password shows a generic error and keeps the email", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.clientA);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toHaveText("Email or password is incorrect.");
  await expect(page.getByLabel("Email")).toHaveValue(USERS.clientA);
});

test("validation errors are announced and linked to their fields", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const email = page.getByLabel("Email");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
});

test("an open redirect in ?next= is ignored", async ({ page }) => {
  await page.goto("/login?next=//evil.example");
  await page.getByLabel("Email").fill(USERS.clientA);
  await page.getByLabel("Password", { exact: true }).fill("DemoPortal!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
});

test("password reset request gives the same response for unknown emails", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists for that email");
});

test("demo sign-in and sign-out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Sign in as Priya Shah/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Priya" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("admin and client see different navigation", async ({ page }) => {
  await login(page, USERS.admin);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Clients" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, USERS.clientA);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Clients" })).toHaveCount(0);
});
