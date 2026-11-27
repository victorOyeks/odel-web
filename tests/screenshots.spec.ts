import { test, type Page } from "@playwright/test";
import { consoleHost, enterCode, signInAs, wesley } from "./helpers";

// Visual review shots (not assertions). Run with: SCREENSHOTS=1 bunx playwright test screenshots
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to take review screenshots");

const PHONE = { width: 360, height: 740 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/${name}.jpg`, type: "jpeg", quality: 70, fullPage });
}

test("staff screens", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto(wesley("/staff/sign-in"));
  await shot(page, "w01-sign-in-desktop");
  await page.setViewportSize(PHONE);
  await shot(page, "w01-sign-in-phone");
  await page.goto(wesley("/staff/sign-in?error=wrong_domain&email=f.bello%40gmail.com"));
  await shot(page, "w02-not-linked-phone");

  await page.setViewportSize(DESKTOP);
  await signInAs(page, wesley("/staff/sign-in"), /^First ODeL admin, first sign-in/);
  await page.getByRole("img", { name: /QR code/ }).waitFor();
  await shot(page, "w04-2fa-setup-desktop");
  await enterCode(page, "123456");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await page.getByRole("heading", { name: "Save your backup codes" }).waitFor();
  await shot(page, "w05-backup-codes-desktop");
  await page.getByRole("button", { name: /I’ve saved them/ }).click();
  await page.waitForURL(/\/staff\/setup$/);
  await shot(page, "w10-setup-empty-desktop");
  await page.setViewportSize(TABLET);
  await shot(page, "w10-setup-empty-tablet");
  await page.setViewportSize(PHONE);
  await shot(page, "w10-setup-empty-phone", true);
  await page.getByRole("button", { name: "Open menu" }).click();
  await shot(page, "staff-drawer-phone");
});

test("roles, idle, sign out", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.clock.install();
  await signInAs(page, wesley("/staff/sign-in"), /^Admin with three roles/);
  await shot(page, "w03-2fa-code-desktop");
  await enterCode(page, "123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByRole("heading", { name: "Which role are you working in?" }).waitFor();
  await shot(page, "w06-choose-role-desktop");
  await page.getByRole("button", { name: /Continue as/ }).click();
  await page.waitForURL(/\/staff\/setup$/);
  await page.getByRole("button", { name: /Switch role/ }).click();
  await shot(page, "s03-role-switcher-desktop");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sign out" }).click();
  await shot(page, "s04-sign-out-desktop");
  await page.keyboard.press("Escape");
  await page.clock.fastForward("28:05");
  await page.getByRole("alertdialog").waitFor();
  await shot(page, "s01-still-there-desktop");
  await page.goto(wesley("/staff/sign-in?reason=idle"));
  await shot(page, "s02-signed-out-desktop");
});

test("console screens", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await signInAs(page, consoleHost("/sign-in"), /^Chuka Obi, platform admin/);
  await enterCode(page, "123456");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByRole("heading", { name: "Universities on the platform" }).waitFor();
  await shot(page, "sa01-universities-desktop");
  await page.setViewportSize(PHONE);
  await shot(page, "sa01-universities-phone");
  await page.setViewportSize(DESKTOP);
  await page.getByRole("link", { name: "Add a university" }).click();
  await shot(page, "sa02c-new-empty-desktop");
  await page.getByLabel("Full name").fill("Crestfield University, Ibadan");
  await page.getByLabel("Web address").fill("odel.wesleyuni.edu.ng");
  await page.getByLabel(/First admin’s name/).fill("Dr Yemi Adeoye");
  await page.getByLabel("Staff Google domain").fill("crestfield.edu.ng");
  await page.getByLabel(/First admin’s email/).fill("yemi.adeoye@crestfield.edu.ng");
  await page.getByLabel("Short address").fill("crestfield-ib");
  await page.getByRole("button", { name: "Next: branding" }).click();
  await page.getByText("That web address is taken").waitFor();
  await shot(page, "sa02b-address-taken-desktop");
  await page.getByLabel("Web address").fill("odl.crestfield-ibadan.edu.ng");
  await page.getByRole("button", { name: "Next: branding" }).click();
  await page.locator("#f-primary").fill("#0F6E6E");
  await page.locator("#f-accent").fill("#E07A2E");
  await shot(page, "sa03-branding-desktop");
  await page.locator("#f-primary").fill("#F5C542");
  await shot(page, "sa03b-contrast-desktop");
  await page.setViewportSize(PHONE);
  await shot(page, "sa03b-contrast-phone", true);
  await page.setViewportSize(DESKTOP);
  await page.getByRole("button", { name: /^Use #/ }).click();
  await page.getByRole("button", { name: "Next: rules and payments" }).click();
  await page.getByRole("button", { name: "Next: review" }).click();
  await shot(page, "sa05-review-desktop");
  await page.getByRole("button", { name: "Create the university" }).click();
  await page.getByRole("heading", { name: /is set up$/ }).waitFor();
  await shot(page, "sa05b-created-desktop");
  await page.getByRole("link", { name: "Open the university page" }).click();
  await page.getByRole("button", { name: "Resend invitation" }).waitFor();
  await shot(page, "sa01b-university-desktop");
  await page.getByRole("link", { name: "Audit trail" }).click();
  await shot(page, "sa09-audit-desktop");
});

test("student", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto(wesley("/"));
  await shot(page, "student-home-phone");
  await page.goto(wesley("/dev/states"));
  await shot(page, "states-phone");
  await page.setViewportSize({ width: 1366, height: 768 });
  await shot(page, "states-desktop");
  await page.goto(`http://crestfield.localhost:${process.env.PORT ?? 3100}/staff/sign-in`);
  await shot(page, "w01-crestfield-desktop");
});
