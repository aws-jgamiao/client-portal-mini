import { expect, type Page } from "@playwright/test";
import { resetDemo, USERS, PASSWORD } from "../integration/helpers";

export { resetDemo, USERS, PASSWORD };

export const IDS = {
  orgA: "a0000000-0000-4000-8000-00000000000a",
  orgB: "b0000000-0000-4000-8000-00000000000b",
  projectA1: "a0000000-0000-4000-8000-000000000101",
  projectB1: "b0000000-0000-4000-8000-000000000201",
  docB1: "b0000000-0000-4000-8000-000000000401",
};

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
