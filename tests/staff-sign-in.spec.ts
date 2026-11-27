import { expect, test } from "@playwright/test";
import { enterCode, signInAs, wesley } from "./helpers";

test("first ODeL admin: W-01 → W-04 → W-05 → empty W-10 → S-04 sign out → S-02", async ({ page }) => {
  await page.goto(wesley("/staff"));
  await expect(page).toHaveURL(/\/staff\/sign-in\?next=%2Fstaff/);
  await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  await expect(page.getByText("Use your @wesleyuni.edu.ng Google account.")).toBeVisible();

  await signInAs(page, wesley("/staff/sign-in"), /^First ODeL admin, first sign-in/);
  await expect(page.getByRole("heading", { name: "Protect your account" })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(page.getByText("JBSW Y3DP EHPK 3PXP")).toBeVisible();

  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.locator("#otp-error, #setup-error")).toContainText("Enter all 6 digits");
  await enterCode(page, "123456");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();

  await expect(page.getByRole("heading", { name: "Save your backup codes" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Backup codes" }).getByRole("listitem")).toHaveCount(8);
  await page.getByRole("button", { name: /I’ve saved them/ }).click();

  await expect(page).toHaveURL(/\/staff\/setup$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Set up \d{4}\/\d{4}$/ })).toBeVisible();
  await expect(page.getByText("0 of 9 steps complete")).toBeVisible();
  await expect(page.getByRole("link", { name: "Setup checklist" })).toHaveAttribute("aria-current", "page");
  const steps = page.getByRole("region", { name: "Setup steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(9);
  await expect(steps.nth(7)).toContainText("Locked");

  // A menu item that is not built yet is an honest empty state, not a broken page.
  await page.getByRole("link", { name: "Payments" }).click();
  await expect(page.getByRole("heading", { name: "Payments is coming in a later phase" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/signedOut=1/);
  await expect(page.getByText("You signed out")).toBeVisible();
});

test("returning admin: W-03 wrong code, then the right code", async ({ page }) => {
  await signInAs(page, wesley("/staff/sign-in"), /^ODeL admin, returning/);
  await expect(page.getByRole("heading", { name: "Enter your 6-digit code" })).toBeVisible();
  await enterCode(page, "000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("#otp-error, #setup-error")).toContainText("You have 2 tries left");
  await enterCode(page, "246810");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/staff\/setup$/);
});

test("backup code route on W-03", async ({ page }) => {
  await signInAs(page, wesley("/staff/sign-in"), /^ODeL admin, returning/);
  await page.getByRole("button", { name: "Use a backup code instead" }).click();
  await page.getByLabel("Backup code").fill("4827-1930");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/staff\/setup$/);
});

test("three roles: W-06 choose role, then S-03 role switcher", async ({ page }) => {
  await signInAs(page, wesley("/staff/sign-in"), /^Admin with three roles/);
  await enterCode(page, "111111");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Which role are you working in?" })).toBeVisible();
  await page.getByText("Centre coordinator", { exact: true }).click();
  await page.getByRole("button", { name: "Continue as Centre coordinator" }).click();
  await expect(page.getByRole("heading", { name: /^Welcome, Ngozi/ })).toBeVisible();

  await page.getByRole("button", { name: /Switch role/ }).click();
  const menu = page.getByRole("menu", { name: "Switch role" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(3);
  await menu.getByRole("menuitemradio", { name: /ODeL admin/ }).click();
  await expect(page).toHaveURL(/\/staff\/setup$/);
});

test("W-02 variants", async ({ page }) => {
  await signInAs(page, wesley("/staff/sign-in"), /^Google account not linked/);
  await expect(page.getByRole("heading", { name: "We could not find your staff record" })).toBeVisible();
  await expect(page.getByText("The Google account you chose is not on the staff list")).toBeVisible();

  await page.goto(wesley("/staff/sign-in?error=wrong_domain&email=f.bello%40gmail.com"));
  await expect(page.getByText("f.bello@gmail.com is not a university account")).toBeVisible();

  await page.goto(wesley("/staff/sign-in?error=no_role"));
  await expect(page.getByText(/Ask the ODeL office to give you a role/)).toBeVisible();
});

test("S-01: idle warning, keep me signed in", async ({ page }) => {
  await page.clock.install();
  await signInAs(page, wesley("/staff/sign-in"), /^Same, with a 2-minute idle timeout/);
  await enterCode(page, "123456");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await page.getByRole("button", { name: /I’ve saved them/ }).click();
  await expect(page).toHaveURL(/\/staff\/setup$/);
  await page.clock.fastForward("01:20");
  const dlg = page.getByRole("alertdialog", { name: "Are you still there?" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Keep me signed in" }).click();
  await expect(dlg).toBeHidden();
});
