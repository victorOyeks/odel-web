import { expect, type Page } from "@playwright/test";

export const PORT = Number(process.env.PORT ?? 3100);
export const wesley = (path = "/") => `http://wesley.localhost:${PORT}${path}`;
export const crestfield = (path = "/") => `http://crestfield.localhost:${PORT}${path}`;
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

/** Signs in as the returning ODeL admin of Wesley (seeded with the D1 demo data) and lands on W-10. */
export async function signInAdmin(page: Page, host = wesley) {
  await signInAs(page, host("/staff/sign-in"), /^ODeL admin, returning/);
  await enterCode(page, "246810");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/staff\/setup$/);
}

/** A CSV file for a file input. */
export const csv = (name: string, rows: string[]) => ({ name, mimeType: "text/csv", buffer: Buffer.from(rows.join("\n") + "\n") });
