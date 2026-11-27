import { expect, type Page } from "@playwright/test";

export const PORT = Number(process.env.PORT ?? 3100);
export const wesley = (path = "/") => `http://wesley.localhost:${PORT}${path}`;
export const consoleHost = (path = "/") => `http://console.localhost:${PORT}${path}`;

/** Fill the six OTP boxes by typing into the first one (it spreads across). */
export async function enterCode(page: Page, code: string) {
  await page.getByLabel("Digit 1 of 6").first().click();
  await page.keyboard.type(code);
}

/** W-01 → mock Google → chosen persona. */
export async function signInAs(page: Page, startUrl: string, persona: RegExp) {
  await page.goto(startUrl);
  await page.getByRole("link", { name: "Continue with university Google account" }).click();
  await expect(page.getByRole("heading", { name: "Mock Google sign-in" })).toBeVisible();
  await page.getByRole("link", { name: persona }).first().click();
}
