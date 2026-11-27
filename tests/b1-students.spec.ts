import { expect, test, type Page } from "@playwright/test";
import { csv, enterCode, signInAdmin, wesley } from "./helpers";

const HEADER = "matric_number,surname,first_name,other_names,programme_code,level,study_centre,email,phone";

test("W-18 → W-19 → import: a bad centre and a duplicate are reported, nothing saved until confirmed", async ({ page }) => {
  await signInAdmin(page);
  await page.goto(wesley("/staff/students/import"));
  await expect(page.getByRole("heading", { name: "Import admitted students" })).toBeVisible();
  await page.getByLabel("Choose the portal CSV file").setInputFiles(
    csv("portal_export.csv", [
      HEADER,
      "WU/ODL/26/0001,Adeyemi,Kunle,,BSC-CSC-ODL,100,AKR,kunle.adeyemi@gmail.com,0803 111 2222",
      "WU/ODL/26/0002,Musa,Ibrahim,,BSC-CSC-ODL,100,Ikeja,ibrahim.musa@gmail.com,",
      "WU/ODL/26/0003,Eze,Ngozi,,BSC-IFT-ODL,100,Akure,,",
      "WU/ODL/26/0003,Eze,Ngozi,,BSC-IFT-ODL,100,Akure,,",
    ]),
  );
  await expect(page.getByRole("heading", { name: "Check before importing" })).toBeVisible();
  await expect(page.getByText('Study centre "Ikeja" not found. Did you mean "Lagos (Ikeja)"?').first()).toBeVisible();
  await expect(page.getByText("Matric number appears twice in this file (rows 4 and 5)").first()).toBeVisible();
  // Nothing saved yet.
  expect((await page.request.get(wesley("/api/v1/students?q=Kunle"))).ok()).toBeTruthy();
  expect((await (await page.request.get(wesley("/api/v1/students?q=Kunle"))).json()).total).toBe(0);
  await page.getByRole("button", { name: "Import 1 valid row" }).click();
  await expect(page.getByRole("heading", { name: "Students imported" })).toBeVisible();
  await page.getByRole("link", { name: "See students" }).click();
  await page.getByLabel("Search students").fill("Kunle");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByRole("button", { name: "Kunle Adeyemi" }).first()).toBeVisible();
});

test("W-20: test send, send to everyone with progress, W-20c delivery report", async ({ page }) => {
  test.setTimeout(60_000);
  await signInAdmin(page);
  await page.goto(wesley("/staff/students/welcome"));
  await expect(page.getByRole("heading", { name: "Send welcome messages" })).toBeVisible();
  await page.getByRole("button", { name: "Send a test to me" }).click();
  await expect(page.getByText(/Sent a test to ngozi\.adebayo@/)).toBeVisible();
  await page.getByRole("button", { name: /^Send to \d+ students?$/ }).click();
  await page.getByRole("button", { name: "Send now" }).click();
  const report = page.getByRole("dialog", { name: "Welcome messages sent" });
  await expect(report).toBeVisible({ timeout: 20_000 });
  await expect(report.getByText(/emails delivered/)).toBeVisible();
  await expect(report.getByText(/^\d+ students? did not get the welcome$/)).toBeVisible();
  await expect(report.getByRole("link", { name: "Download the failed list" })).toBeVisible();
});

test("W-22b: student record, send a reset code, suspend and restore", async ({ page }) => {
  await signInAdmin(page);
  await page.goto(wesley("/staff/students?q=Halima"));
  await page.getByRole("button", { name: "Halima Bello" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Halima Bello" });
  await expect(sheet.getByText(/Accepted the privacy notice/)).toBeVisible();
  await sheet.getByRole("button", { name: "Send code" }).click();
  await expect(sheet.getByText("Emailed a password reset code to halima.bello@gmail.com.").first()).toBeVisible();
  await sheet.getByRole("button", { name: "Suspend this student" }).click();
  const dlg = page.getByRole("dialog", { name: "Suspend Halima Bello?" });
  await dlg.getByLabel("Reason").fill("Fees query");
  await dlg.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Halima Bello is suspended and was signed out.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Restore access" })).toBeVisible();
  await sheet.getByRole("button", { name: "Restore access" }).click();
  await expect(page.getByText("Halima Bello can sign in again.").first()).toBeVisible();
});

async function code(page: Page, digits: string) {
  await enterCode(page, digits);
  await page.getByRole("button", { name: "Verify" }).click();
}

test("student activation: M-02 → wrong code → M-03 → M-04 rules → M-05 consent → M-06 → Home; then reset by code", async ({ page }) => {
  await page.goto(wesley("/"));
  await page.getByRole("link", { name: "Activate my account" }).click();
  await page.getByLabel("Matric number").fill("WU/ODL/24/0195");
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByText("We could not find this number. Check it on your admission letter, or contact your study centre.")).toBeVisible();
  await expect(page.getByText("Just admitted?")).toBeVisible();

  // The welcome email's link pre-fills the matric number.
  await page.goto(wesley("/activate?matric=WU%2FODL%2F24%2F0153"));
  await expect(page.getByLabel("Matric number")).toHaveValue("WU/ODL/24/0153");
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the 6-digit code" })).toBeVisible();
  await expect(page.getByText("a•••••@gmail.com")).toBeVisible();
  await expect(page.getByText(/It expires in 15 minutes/)).toBeVisible();
  await page.getByRole("button", { name: "I can’t access this email" }).click();
  await expect(page.getByRole("dialog", { name: "Can’t access this email?" })).toContainText("Akure Study Centre");
  await page.getByRole("button", { name: "Cancel" }).click();
  await code(page, "000000");
  await expect(page.getByText("That code is not right. 2 tries left before we send a new one.")).toBeVisible();
  await code(page, "472913");

  await expect(page.getByRole("heading", { name: "Create a password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("short");
  await expect(page.getByRole("list", { name: "Password rules" })).toContainText("At least 8 characters (not yet)");
  await page.getByLabel("New password", { exact: true }).fill("Adeola2026");
  await page.getByLabel("Confirm password", { exact: true }).fill("Adeola2026");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "How we use your information" })).toBeVisible();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await expect(page.getByText("Tick the box to accept the privacy notice.")).toBeVisible();
  await page.getByLabel("I have read and accept the privacy notice").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();

  await expect(page.getByRole("heading", { name: "Check your details" })).toBeVisible();
  await expect(page.getByText("WU/ODL/24/0153 · B.Sc. Computer Science · 200L")).toBeVisible();
  await page.getByRole("button", { name: "Save and go to my dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Your courses appear after registration" })).toBeVisible();
  await expect(page.getByText("Akure Study Centre").first()).toBeVisible();

  // E-02: activating again says the account is active.
  await page.context().clearCookies();
  await page.goto(wesley("/activate?matric=WU%2FODL%2F24%2F0153"));
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByText("This account is already active")).toBeVisible();

  // M-09 → M-03R → M-11: reset by emailed code, then signed in.
  await page.goto(wesley("/sign-in"));
  await page.getByLabel("Matric number or email").fill("WU/ODL/24/0153");
  await page.getByLabel("Password", { exact: true }).fill("wrong-pass-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong password. 4 tries left before sign-in pauses for 15 minutes.")).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByLabel("Matric number or email")).toHaveValue("WU/ODL/24/0153");
  await page.getByRole("button", { name: "Continue" }).click();
  await code(page, "246810");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("Adeola2027");
  await page.getByLabel("Confirm password", { exact: true }).fill("Adeola2027");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await expect(page.getByRole("heading", { name: "Your courses appear after registration" })).toBeVisible();
});

test("student sign-in edge cases: E-05 locked after five wrong passwords, E-06 suspended, E-03 no email", async ({ page }) => {
  await page.goto(wesley("/sign-in"));
  await page.getByLabel("Matric number or email").fill("WU/ODL/24/0201");
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Password", { exact: true }).fill(`wrong-${i}a`);
    await page.getByRole("button", { name: "Sign in" }).click();
    if (i < 4) await expect(page.getByText(`Wrong password. ${4 - i} ${4 - i === 1 ? "try" : "tries"} left`)).toBeVisible();
  }
  await expect(page.getByText("Too many attempts")).toBeVisible();
  await expect(page.getByText(/Sign-in is paused for 15 minutes, until/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();

  await page.goto(wesley("/sign-in"));
  await page.getByLabel("Matric number or email").fill("WU/ODL/23/0311");
  await page.getByLabel("Password", { exact: true }).fill("Password1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Your account is suspended")).toBeVisible();
  await expect(page.getByText(/contact the ODeL office at Wesley University to restore access/)).toBeVisible();

  await page.goto(wesley("/activate?matric=WU%2FODL%2F25%2F0042"));
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByText("We have no email address for you", { exact: true })).toBeVisible();
});

test("student pages fit a 360 px phone and stay small", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  let bytes = 0;
  page.on("response", async (r) => {
    const len = Number(r.headers()["content-length"] ?? 0);
    bytes += len || (await r.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(wesley("/sign-in"), { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(bytes).toBeLessThan(500 * 1024);
});
