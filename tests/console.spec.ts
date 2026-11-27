import { expect, test } from "@playwright/test";
import { consoleHost, enterCode, signInAs, wesley } from "./helpers";

test("provider adds a university: SA-01 → SA-02b → SA-03b → SA-05 → SA-05b → SA-01b → SA-09", async ({ page }) => {
  await signInAs(page, consoleHost("/sign-in"), /^Chuka Obi, platform admin/);
  await enterCode(page, "123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Universities on the platform" })).toBeVisible();

  await page.getByRole("link", { name: "Add a university" }).click();
  await page.getByRole("button", { name: "Next: branding" }).click();
  await expect(page.getByText("Enter the university’s full name")).toBeVisible();

  await page.getByLabel("Full name").fill("Ajayi College of Education");
  await page.getByLabel("Web address").fill("odel.wesleyuni.edu.ng");
  await page.getByLabel(/First admin’s name/).fill("Tunde Ajayi");
  await page.getByLabel("Staff Google domain").fill("ajayicoe.edu.ng");
  await page.getByLabel(/First admin’s email/).fill("tunde.ajayi@ajayicoe.edu.ng");
  await page.getByRole("button", { name: "Next: branding" }).click();
  await expect(page.getByText("That web address is taken")).toBeVisible();

  await page.getByLabel("Web address").fill("odl.ajayicoe.edu.ng");
  await page.getByRole("button", { name: "Next: branding" }).click();
  await expect(page.getByRole("heading", { name: "Branding for Ajayi College of Education" })).toBeVisible();

  await page.locator("#f-primary").fill("#F5C542");
  await expect(page.getByText("The main colour fails the readability check")).toBeVisible();
  await page.getByRole("button", { name: /^Use #[0-9A-F]{6} instead$/ }).click();
  await expect(page.getByText(/Text on it reads well/)).toBeVisible();

  await page.getByRole("button", { name: "Next: rules and payments" }).click();
  await expect(page.getByText("Defaults for now; the university’s admin sets these")).toBeVisible();
  await page.getByRole("button", { name: "Next: review" }).click();
  await expect(page.getByText("tunde.ajayi@ajayicoe.edu.ng · invitation sent when you create it")).toBeVisible();
  await page.getByRole("button", { name: "Create the university" }).click();

  await expect(page.getByRole("heading", { name: "Ajayi College of Education is set up" })).toBeVisible();
  await page.getByRole("link", { name: "Open the university page" }).click();
  await page.getByRole("button", { name: "Resend invitation" }).click();
  await expect(page.getByText("Invitation emailed to Tunde Ajayi again.")).toBeVisible();

  await page.getByRole("link", { name: "Audit trail" }).click();
  await expect(page.getByText("Created Ajayi College of Education; invited Tunde Ajayi").first()).toBeVisible();
});

test("the console is not reachable from a university address", async ({ page }) => {
  const res = await page.goto(wesley("/console"));
  expect(res?.status()).toBe(404);
});

test("student home and the dev state gallery", async ({ page }) => {
  await page.goto(wesley("/"));
  await expect(page.getByRole("heading", { name: "Student portal opens soon" })).toBeVisible();
  await page.goto(wesley("/dev/states"));
  for (const name of ["No content yet", "Could not load this page", "You do not have access", "You were signed out", "Platform fee not paid"]) {
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
});
